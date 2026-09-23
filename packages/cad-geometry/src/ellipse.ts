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
  // Quando startAngle e endAngle existem, a geometria é um arco de elipse que varre do ângulo
  // paramétrico inicial ao final no sentido crescente (anti-horário no espaço paramétrico).
  // Ausentes (ou varredura completa), representam a elipse fechada.
  startAngle?: number | undefined;
  endAngle?: number | undefined;
}>;

/**
 * Normaliza a varredura de um arco de elipse: devolve o ângulo inicial e a varredura em (0, 2π].
 * A varredura sempre cresce do início ao fim (sentido paramétrico positivo).
 */
export function normalizeEllipseSweep(startAngle: number, endAngle: number): { start: number; sweep: number } {
  const rawSweep = (endAngle - startAngle) % TWO_PI;
  const sweep = rawSweep <= CAD_EPSILON ? rawSweep + TWO_PI : rawSweep;

  return { start: startAngle, sweep };
}

/**
 * Indica se a geometria representa a elipse completa (sem recorte de arco).
 */
export function isFullEllipse(ellipse: EllipseGeometry): boolean {
  if (ellipse.startAngle === undefined || ellipse.endAngle === undefined) {
    return true;
  }

  const { sweep } = normalizeEllipseSweep(ellipse.startAngle, ellipse.endAngle);

  return Math.abs(sweep - TWO_PI) <= 1e-9;
}

/**
 * Ângulo paramétrico correspondente a um ponto do mundo em relação à elipse.
 * O ponto é levado ao referencial local (des-rotacionado) e o ângulo vem de atan2(yLocal/ry, xLocal/rx).
 */
export function ellipseParamAtPoint(
  center: Point2D,
  radiusX: number,
  radiusY: number,
  rotation: number,
  point: Point2D
): number {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  // Rotação inversa leva o ponto ao referencial local dos eixos da elipse.
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const rx = Math.max(radiusX, CAD_EPSILON);
  const ry = Math.max(radiusY, CAD_EPSILON);

  return Math.atan2(localY / ry, localX / rx);
}

/**
 * Amostra pontos ao longo do arco de elipse, do ângulo inicial ao final no sentido crescente.
 * Quando a geometria é a elipse completa, cobre a volta inteira.
 */
export function ellipseArcPoints(ellipse: EllipseGeometry, samples = 64): ReadonlyArray<Point2D> {
  const steps = Math.max(2, Math.floor(samples));
  const start = ellipse.startAngle ?? 0;
  const sweep = ellipse.startAngle === undefined || ellipse.endAngle === undefined
    ? TWO_PI
    : normalizeEllipseSweep(ellipse.startAngle, ellipse.endAngle).sweep;
  const points: Point2D[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const param = start + (sweep * index) / steps;
    points.push(ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, param));
  }

  return points;
}

/**
 * Envoltório de um arco de elipse. O cálculo inclui as extremidades do arco e os pontos extremos
 * dos semi-eixos (0, π/2, π, 3π/2 no referencial local) que caem dentro da varredura.
 */
export function ellipseArcBoundingBox(ellipse: EllipseGeometry): BoundingBox {
  if (isFullEllipse(ellipse)) {
    return ellipseBoundingBox(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation);
  }

  const start = ellipse.startAngle ?? 0;
  const { sweep } = normalizeEllipseSweep(ellipse.startAngle ?? 0, ellipse.endAngle ?? TWO_PI);
  const candidates: Point2D[] = [
    ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, start),
    ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, start + sweep)
  ];

  // Os extremos dos semi-eixos entram no envoltório apenas quando pertencem à varredura.
  for (const axisParam of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const relative = (axisParam - start + TWO_PI * 2) % TWO_PI;

    if (relative <= sweep + 1e-9) {
      candidates.push(ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, axisParam));
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of candidates) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return { minX, minY, maxX, maxY };
}

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
  // Arco de elipse limita a amostragem ao intervalo varrido; a elipse completa cobre 0..2π.
  const rangeStart = ellipse.startAngle ?? 0;
  const rangeSweep = ellipse.startAngle === undefined || ellipse.endAngle === undefined
    ? TWO_PI
    : normalizeEllipseSweep(ellipse.startAngle, ellipse.endAngle).sweep;
  const stepSize = rangeSweep / steps;

  let bestParam = rangeStart;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index <= steps; index += 1) {
    const param = rangeStart + index * stepSize;
    const candidate = ellipsePointAtParam(ellipse.center, rx, ry, ellipse.rotation, param);
    const candidateDistance = distance(point, candidate);

    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestParam = param;
    }
  }

  // O refinamento reduz o intervalo em torno do melhor candidato para melhorar a precisão,
  // sem sair do intervalo varrido pelo arco.
  let low = Math.max(rangeStart, bestParam - stepSize);
  let high = Math.min(rangeStart + rangeSweep, bestParam + stepSize);

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
 * Ponto da borda da elipse (ou arco) mais próximo de um ponto dado. Usa a mesma amostragem com
 * refinamento por busca ternária do cálculo de distância, respeitando o intervalo varrido do arco.
 */
export function nearestPointOnEllipse(
  point: Point2D,
  ellipse: EllipseGeometry,
  samples = 90
): Point2D {
  const rx = Math.max(ellipse.radiusX, CAD_EPSILON);
  const ry = Math.max(ellipse.radiusY, CAD_EPSILON);
  const steps = Math.max(12, Math.floor(samples));
  const rangeStart = ellipse.startAngle ?? 0;
  const rangeSweep = ellipse.startAngle === undefined || ellipse.endAngle === undefined
    ? TWO_PI
    : normalizeEllipseSweep(ellipse.startAngle, ellipse.endAngle).sweep;
  const stepSize = rangeSweep / steps;

  let bestParam = rangeStart;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index <= steps; index += 1) {
    const param = rangeStart + index * stepSize;
    const candidateDistance = distance(point, ellipsePointAtParam(ellipse.center, rx, ry, ellipse.rotation, param));

    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestParam = param;
    }
  }

  let low = Math.max(rangeStart, bestParam - stepSize);
  let high = Math.min(rangeStart + rangeSweep, bestParam + stepSize);

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

  return ellipsePointAtParam(ellipse.center, rx, ry, ellipse.rotation, (low + high) / 2);
}

/**
 * Pontos de quadrante da elipse: extremidades dos semi-eixos local (params 0, π/2, π, 3π/2).
 * Para um arco, retorna apenas os quadrantes que caem dentro da varredura.
 */
export function ellipseQuadrantPoints(ellipse: EllipseGeometry): ReadonlyArray<Point2D> {
  const full = isFullEllipse(ellipse);
  const start = ellipse.startAngle ?? 0;
  const sweep = full
    ? TWO_PI
    : normalizeEllipseSweep(ellipse.startAngle ?? 0, ellipse.endAngle ?? TWO_PI).sweep;
  const points: Point2D[] = [];

  for (const axisParam of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    if (!full) {
      const relative = (axisParam - start + TWO_PI * 2) % TWO_PI;
      if (relative > sweep + 1e-9) {
        continue;
      }
    }

    points.push(ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, axisParam));
  }

  return points;
}

/**
 * Extremidades (pontos inicial e final) de um arco de elipse. Vazio para a elipse completa.
 */
export function ellipseArcEndpoints(ellipse: EllipseGeometry): ReadonlyArray<Point2D> {
  if (ellipse.startAngle === undefined || ellipse.endAngle === undefined || isFullEllipse(ellipse)) {
    return [];
  }

  const { sweep } = normalizeEllipseSweep(ellipse.startAngle, ellipse.endAngle);

  return [
    ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, ellipse.startAngle),
    ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, ellipse.startAngle + sweep)
  ];
}

/**
 * Ponto médio do arco de elipse (metade da varredura). Nulo para a elipse completa.
 */
export function ellipseArcMidpoint(ellipse: EllipseGeometry): Point2D | null {
  if (ellipse.startAngle === undefined || ellipse.endAngle === undefined || isFullEllipse(ellipse)) {
    return null;
  }

  const { sweep } = normalizeEllipseSweep(ellipse.startAngle, ellipse.endAngle);

  return ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, ellipse.startAngle + sweep / 2);
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

  // Como no AutoCAD, o primeiro eixo guardado é sempre o maior (o segundo ponto pode ter dado o maior eixo).
  return normalizeEllipseAxes<EllipseGeometry>({ type: "ellipse", center, radiusX, radiusY, rotation });
}

type EllipseAxesLike = Readonly<{
  radiusX: number;
  radiusY: number;
  rotation: number;
  startAngle?: number | undefined;
  endAngle?: number | undefined;
}>;

/**
 * Garante radiusX ≥ radiusY (eixo maior no eixo local X, como o AutoCAD guarda a elipse), sem mudar a
 * forma: se o eixo Y é o maior, troca os raios, soma 90° à rotação e desloca os parâmetros do arco em −90°,
 * pois o ponto (rx·cos t, ry·sin t) no referencial antigo é o ponto de parâmetro t − π/2 no novo.
 */
export function normalizeEllipseAxes<T extends EllipseAxesLike>(ellipse: T): T {
  if (ellipse.radiusY <= ellipse.radiusX) {
    return ellipse;
  }

  const shifted = ellipse.startAngle !== undefined && ellipse.endAngle !== undefined
    ? { startAngle: normalizeParam(ellipse.startAngle - Math.PI / 2), endAngle: normalizeParam(ellipse.endAngle - Math.PI / 2) }
    : {};

  return {
    ...ellipse,
    radiusX: ellipse.radiusY,
    radiusY: ellipse.radiusX,
    rotation: normalizeParam(ellipse.rotation + Math.PI / 2, -Math.PI),
    ...shifted
  };
}

// Leva um ângulo para [base, base + 2π).
function normalizeParam(angle: number, base = 0): number {
  const wrapped = (angle - base) % TWO_PI;
  return (wrapped < 0 ? wrapped + TWO_PI : wrapped) + base;
}

/**
 * Perímetro da elipse completa pela segunda aproximação de Ramanujan (erro relativo < 1e-9 para
 * excentricidades usuais de desenho).
 */
export function ellipsePerimeter(radiusX: number, radiusY: number): number {
  const a = Math.max(radiusX, radiusY);
  const b = Math.min(radiusX, radiusY);

  if (a <= 0) {
    return 0;
  }

  const h = ((a - b) * (a - b)) / ((a + b) * (a + b));
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/**
 * Comprimento da elipse ou do arco de elipse, integrando |dP/dt| = √(rx²·sin²t + ry²·cos²t) pela regra
 * de Simpson ao longo da varredura paramétrica.
 */
export function ellipseArcLength(ellipse: EllipseGeometry, intervals = 512): number {
  if (isFullEllipse(ellipse)) {
    return ellipsePerimeter(ellipse.radiusX, ellipse.radiusY);
  }

  const { start, sweep } = normalizeEllipseSweep(ellipse.startAngle!, ellipse.endAngle!);
  const n = intervals % 2 === 0 ? intervals : intervals + 1;
  const h = sweep / n;
  const speed = (t: number) => Math.hypot(ellipse.radiusX * Math.sin(t), ellipse.radiusY * Math.cos(t));
  let sum = speed(start) + speed(start + sweep);

  for (let index = 1; index < n; index += 1) {
    sum += (index % 2 === 0 ? 2 : 4) * speed(start + index * h);
  }

  return (sum * h) / 3;
}

/**
 * Constrói um arco de elipse a partir da elipse completa e de dois pontos que definem os ângulos
 * inicial e final. Cada ponto é projetado no referencial da elipse para obter o ângulo paramétrico;
 * a varredura vai do início ao fim no sentido crescente.
 */
export function ellipseArcFromPoints(
  base: EllipseGeometry,
  startPoint: Point2D,
  endPoint: Point2D
): EllipseGeometry | null {
  const startAngle = ellipseParamAtPoint(base.center, base.radiusX, base.radiusY, base.rotation, startPoint);
  const endAngle = ellipseParamAtPoint(base.center, base.radiusX, base.radiusY, base.rotation, endPoint);
  const { sweep } = normalizeEllipseSweep(startAngle, endAngle);

  if (sweep <= CAD_EPSILON) {
    return null;
  }

  return { ...base, startAngle, endAngle };
}
