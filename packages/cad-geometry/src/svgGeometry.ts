import type { Matrix2D, Point2D } from "./types";

/**
 * Matemática usada pela importação de SVG: conversão do arco da notação de extremos do SVG para a
 * notação de centro, imagem de uma elipse por uma transformação afim e aproximação de Béziers.
 */

export type SvgCenterArc = Readonly<{
  center: Point2D;
  radiusX: number;
  radiusY: number;
  // Rotação do eixo X da elipse (radianos).
  rotation: number;
  // Ângulo paramétrico inicial e varredura assinada (positiva = ângulo crescente, sweep-flag 1).
  startParam: number;
  deltaParam: number;
}>;

/**
 * Converte um comando A do SVG (extremos + raios + flags) para a forma de centro, conforme a seção
 * F.6.5 da especificação SVG, inclusive a correção de raios pequenos demais (F.6.6).
 * Devolve null para arcos degenerados (extremos iguais ou raio zero), que o SVG trata como reta.
 */
export function svgArcToCenter(
  from: Point2D,
  to: Point2D,
  radiusX: number,
  radiusY: number,
  rotationDegrees: number,
  largeArc: boolean,
  sweep: boolean
): SvgCenterArc | null {
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);

  if (rx === 0 || ry === 0 || (from.x === to.x && from.y === to.y)) {
    return null;
  }

  const phi = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);

  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxPrime = (factor * rx * y1) / ry;
  const cyPrime = (-factor * ry * x1) / rx;
  const center = {
    x: cos * cxPrime - sin * cyPrime + (from.x + to.x) / 2,
    y: sin * cxPrime + cos * cyPrime + (from.y + to.y) / 2
  };
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const startParam = angle(1, 0, (x1 - cxPrime) / rx, (y1 - cyPrime) / ry);
  let deltaParam = angle((x1 - cxPrime) / rx, (y1 - cyPrime) / ry, (-x1 - cxPrime) / rx, (-y1 - cyPrime) / ry);

  if (!sweep && deltaParam > 0) deltaParam -= Math.PI * 2;
  if (sweep && deltaParam < 0) deltaParam += Math.PI * 2;

  return { center, radiusX: rx, radiusY: ry, rotation: phi, startParam, deltaParam };
}

export type AffineEllipse = Readonly<{ center: Point2D; radiusX: number; radiusY: number; rotation: number }>;

/**
 * Imagem da elipse "centro + L·círculo unitário" pela transformação: os semi-eixos são os valores
 * singulares de L e a rotação é a direção do maior (decomposição SVD 2×2 em forma fechada).
 * L é a parte linear (a, b, c, d) no mesmo formato do Matrix2D (x' = a·x + c·y; y' = b·x + d·y).
 */
export function affineEllipse(center: Point2D, linear: Readonly<{ a: number; b: number; c: number; d: number }>): AffineEllipse {
  const e = (linear.a + linear.d) / 2;
  const f = (linear.a - linear.d) / 2;
  const g = (linear.b + linear.c) / 2;
  const h = (linear.b - linear.c) / 2;
  const q = Math.hypot(e, h);
  const r = Math.hypot(f, g);
  const angle1 = Math.atan2(g, f);
  const angle2 = Math.atan2(h, e);

  return {
    center,
    radiusX: q + r,
    radiusY: Math.abs(q - r),
    rotation: (angle2 + angle1) / 2
  };
}

// Composição da parte linear de um Matrix2D com rotação e escala (L = M·R(φ)·diag(sx, sy)).
export function linearPartTimesRotationScale(
  matrix: Matrix2D,
  rotation: number,
  scaleX: number,
  scaleY: number
): Readonly<{ a: number; b: number; c: number; d: number }> {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  // R(φ)·diag(sx, sy) = [[cos·sx, −sin·sy], [sin·sx, cos·sy]]
  const r11 = cos * scaleX;
  const r21 = sin * scaleX;
  const r12 = -sin * scaleY;
  const r22 = cos * scaleY;

  return {
    a: matrix.a * r11 + matrix.c * r21,
    b: matrix.b * r11 + matrix.d * r21,
    c: matrix.a * r12 + matrix.c * r22,
    d: matrix.b * r12 + matrix.d * r22
  };
}

// Pontos de uma Bézier cúbica (sem o primeiro), em segmentos uniformes no parâmetro.
export function flattenCubicBezier(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, segments = 16): Point2D[] {
  const points: Point2D[] = [];

  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const mt = 1 - t;
    points.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
    });
  }

  return points;
}

// Pontos de uma Bézier quadrática (sem o primeiro).
export function flattenQuadraticBezier(p0: Point2D, p1: Point2D, p2: Point2D, segments = 12): Point2D[] {
  const points: Point2D[] = [];

  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const mt = 1 - t;
    points.push({
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
    });
  }

  return points;
}
