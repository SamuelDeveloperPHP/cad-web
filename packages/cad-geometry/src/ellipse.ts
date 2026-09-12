import { CAD_EPSILON } from "./constants";
import type { BoundingBox, Point2D } from "./types";
import { distance } from "./vector";

const TWO_PI = Math.PI * 2;

/**
 * Geometria de elipse no formato centro/semi-eixos/rotação.
 * radiusX é o semi-eixo ao longo do eixo local X antes da rotação; radiusY ao longo do local Y.
 * rotation é o ângulo (em radianos) do eixo maior em relação ao eixo X do mundo.
 */
export type EllipseGeometry = Readonly<{
  type: "ellipse";
  center: Point2D;
  radiusX: number;
  radiusY: number;
  rotation: number;
}>;

/**
 * Retorna o ponto sobre a elipse no ângulo paramétrico informado (0..2π).
 * O ângulo paramétrico percorre a borda; não é o ângulo geométrico exceto em círculos.
 */
export function ellipsePointAtParam(
  center: Point2D,
  radiusX: number,
  radiusY: number,
  rotation: number,
  param: number
): Point2D {
  const localX = Math.cos(param) * radiusX;
  const localY = Math.sin(param) * radiusY;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return {
    x: center.x + localX * cos - localY * sin,
    y: center.y + localX * sin + localY * cos
  };
}

/**
 * Envoltório justo (tight) de uma elipse rotacionada.
 * As metades da largura/altura vêm da projeção dos semi-eixos nos eixos do mundo.
 */
export function ellipseBoundingBox(
  center: Point2D,
  radiusX: number,
  radiusY: number,
  rotation: number
): BoundingBox {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const halfWidth = Math.hypot(radiusX * cos, radiusY * sin);
  const halfHeight = Math.hypot(radiusX * sin, radiusY * cos);

  return {
    minX: center.x - halfWidth,
    minY: center.y - halfHeight,
    maxX: center.x + halfWidth,
    maxY: center.y + halfHeight
  };
}

/**
 * Distância aproximada de um ponto à borda da elipse.
 * A elipse não tem fórmula fechada simples para a menor distância, então o cálculo amostra
 * a borda em passos uniformes e refina em torno do melhor candidato. A precisão é suficiente
 * para seleção e hit-testing dentro da tolerância usual.
 */
export function distancePointToEllipse(
  point: Point2D,
  ellipse: EllipseGeometry,
  samples = 90
): number {
  const rx = Math.max(ellipse.radiusX, CAD_EPSILON);
  const ry = Math.max(ellipse.radiusY, CAD_EPSILON);
  const steps = Math.max(12, Math.floor(samples));
  const stepSize = TWO_PI / steps;

  let bestParam = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < steps; index += 1) {
    const param = index * stepSize;
    const candidate = ellipsePointAtParam(ellipse.center, rx, ry, ellipse.rotation, param);
    const candidateDistance = distance(point, candidate);

    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestParam = param;
    }
  }

  // O refinamento reduz o intervalo em torno do melhor candidato para melhorar a precisão.
  let low = bestParam - stepSize;
  let high = bestParam + stepSize;

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const mid1 = low + (high - low) / 3;
    const mid2 = high - (high - low) / 3;
    const d1 = distance(point, ellipsePointAtParam(ellipse.center, rx, ry, ellipse.rotation, mid1));
    const d2 = distance(point, ellipsePointAtParam(ellipse.center, rx, ry, ellipse.rotation, mid2));

    if (d1 < d2) {
      high = mid2;
    } else {
      low = mid1;
    }
  }

  const refinedParam = (low + high) / 2;
  const refined = distance(point, ellipsePointAtParam(ellipse.center, rx, ry, ellipse.rotation, refinedParam));

  return Math.min(bestDistance, refined);
}

/**
 * Constrói a geometria da elipse a partir do centro, do fim do eixo maior e de um ponto que
 * define o semi-eixo menor. rotation e radiusX vêm do vetor centro→fim do eixo maior; radiusY é a
 * distância perpendicular do terceiro ponto ao eixo maior.
 */
export function ellipseFromAxisPoints(
  center: Point2D,
  majorAxisEnd: Point2D,
  minorAxisPoint: Point2D
): EllipseGeometry | null {
  const majorVectorX = majorAxisEnd.x - center.x;
  const majorVectorY = majorAxisEnd.y - center.y;
  const radiusX = Math.hypot(majorVectorX, majorVectorY);

  if (radiusX <= CAD_EPSILON) {
    return null;
  }

  const rotation = Math.atan2(majorVectorY, majorVectorX);
  // O semi-eixo menor é a componente do terceiro ponto na direção perpendicular ao eixo maior.
  const minorVectorX = minorAxisPoint.x - center.x;
  const minorVectorY = minorAxisPoint.y - center.y;
  const perpX = -Math.sin(rotation);
  const perpY = Math.cos(rotation);
  const radiusY = Math.abs(minorVectorX * perpX + minorVectorY * perpY);

  if (radiusY <= CAD_EPSILON) {
    return null;
  }

  return { type: "ellipse", center, radiusX, radiusY, rotation };
}
