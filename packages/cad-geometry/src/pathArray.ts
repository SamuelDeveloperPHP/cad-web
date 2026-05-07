import { CAD_EPSILON } from "./constants";
import {
  getPointAtPolylineDistance,
  getPolylineLength,
  type PolylinePath,
  type PolylineSampleResult
} from "./polyline";
import type { Point2D, Vector2D } from "./types";

// O modulo expoe utilidades puras para Path Array: amostragem por comprimento real e transformacoes
// que posicionam o basePoint da entidade source sobre cada sample do caminho, opcionalmente alinhando
// a entidade a tangente local.

export type PathSample = Readonly<{
  point: Point2D;
  tangent: Vector2D;
  distance: number;
  t: number;
}>;

export type PathArrayParams = Readonly<{
  count: number;
  basePoint: Point2D;
  alignToTangent: boolean;
}>;

export type PathArrayValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

export type PathArrayTransform = Readonly<{
  // O ponto de ancoragem na entidade source: ele sera deslocado ate samplePoint apos a rotacao.
  basePoint: Point2D;
  // O destino do basePoint apos a transformacao.
  samplePoint: Point2D;
  // A rotacao em torno do basePoint, em radianos, aplicada antes da translacao.
  rotationRadians: number;
}>;

export function validatePathArrayParams(
  params: PathArrayParams,
  polyline: PolylinePath,
  epsilon = CAD_EPSILON
): PathArrayValidation {
  // O metodo concentra todas as regras de validacao para ferramenta e kernel compartilharem.
  if (!Number.isInteger(params.count) || params.count < 1) {
    return { ok: false, reason: "Count must be a positive integer." };
  }

  if (!Number.isFinite(params.basePoint.x) || !Number.isFinite(params.basePoint.y)) {
    return { ok: false, reason: "Base point must have finite coordinates." };
  }

  if (polyline.points.length < 2) {
    return { ok: false, reason: "Polyline path must have at least two vertices." };
  }

  const totalLength = getPolylineLength(polyline);

  if (totalLength <= epsilon) {
    return { ok: false, reason: "Polyline path length must be greater than zero." };
  }

  return { ok: true };
}

export function samplePolylineByCount(
  polyline: PolylinePath,
  count: number,
  epsilon = CAD_EPSILON
): ReadonlyArray<PathSample> {
  // O algoritmo distribui count amostras ao longo do comprimento real do caminho.
  // Para path aberto e count > 1, inclui inicio e fim. Para path fechado, evita duplicar inicio/fim.
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Path array count must be a positive integer.");
  }

  const totalLength = getPolylineLength(polyline);

  if (totalLength <= epsilon) {
    throw new Error("Polyline path length must be greater than zero.");
  }

  const samples: PathSample[] = [];

  if (count === 1) {
    const sample = sampleAtDistance(polyline, 0, totalLength);
    if (sample !== null) {
      samples.push(sample);
    }
    return samples;
  }

  if (polyline.closed) {
    // O caso fechado divide o comprimento em count intervalos sem repetir a origem.
    const step = totalLength / count;

    for (let index = 0; index < count; index += 1) {
      const sample = sampleAtDistance(polyline, index * step, totalLength);
      if (sample !== null) {
        samples.push(sample);
      }
    }

    return samples;
  }

  // O caso aberto distribui as amostras de inicio (0) ate fim (totalLength) com count-1 intervalos.
  const step = totalLength / (count - 1);

  for (let index = 0; index < count; index += 1) {
    const sample = sampleAtDistance(polyline, index * step, totalLength);
    if (sample !== null) {
      samples.push(sample);
    }
  }

  return samples;
}

export function getPolylineTransformAtSample(
  sample: PathSample,
  basePoint: Point2D,
  alignToTangent: boolean
): PathArrayTransform {
  // O metodo encapsula a transformacao para reaproveitar entre core e preview.
  if (!alignToTangent) {
    return {
      basePoint,
      samplePoint: sample.point,
      rotationRadians: 0
    };
  }

  const tangentAngle = Math.atan2(sample.tangent.y, sample.tangent.x);

  return {
    basePoint,
    samplePoint: sample.point,
    rotationRadians: tangentAngle
  };
}

function sampleAtDistance(polyline: PolylinePath, distance: number, totalLength: number): PathSample | null {
  // O metodo converte um valor de distancia em sample completo (point, tangent, distance, t).
  const polylineSample = getPointAtPolylineDistance(polyline, distance);

  if (polylineSample === null) {
    return null;
  }

  return polylineSampleToPathSample(polylineSample, totalLength);
}

function polylineSampleToPathSample(sample: PolylineSampleResult, totalLength: number): PathSample {
  return {
    point: sample.point,
    tangent: sample.tangent,
    distance: sample.distanceAlong,
    t: totalLength > 0 ? sample.distanceAlong / totalLength : 0
  };
}
