import { CAD_EPSILON } from "./constants";
import {
  getPathSourceLength,
  samplePathSourceByCount,
  validatePathSource,
  type PathSource,
  type PathSourceSample
} from "./pathSource";
import { polylinePathToPathSource } from "./pathSource";
import type { PolylinePath } from "./polyline";
import type { Point2D, Vector2D } from "./types";

// O modulo expoe utilidades puras para Path Array: amostragem por comprimento real e transformacoes
// que posicionam o basePoint da entidade source sobre cada sample do caminho, opcionalmente alinhando
// a entidade a tangente local. A amostragem e generica: aceita PathSource (line/circle/arc/polyline)
// reaproveitando o sampler central de pathSource.

export type PathSample = PathSourceSample;

export type PathArrayParams = Readonly<{
  count: number;
  basePoint: Point2D;
  alignToTangent: boolean;
}>;

export type PathArrayValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

export type PathArrayTransform = Readonly<{
  basePoint: Point2D;
  samplePoint: Point2D;
  rotationRadians: number;
}>;

export function validatePathArrayParams(
  params: PathArrayParams,
  source: PathSource | PolylinePath,
  epsilon = CAD_EPSILON
): PathArrayValidation {
  // O metodo concentra todas as regras de validacao para ferramenta e kernel compartilharem.
  if (!Number.isInteger(params.count) || params.count < 1) {
    return { ok: false, reason: "Count must be a positive integer." };
  }

  if (!Number.isFinite(params.basePoint.x) || !Number.isFinite(params.basePoint.y)) {
    return { ok: false, reason: "Base point must have finite coordinates." };
  }

  const pathSource = ensurePathSource(source);
  const sourceValidation = validatePathSource(pathSource, epsilon);

  if (!sourceValidation.ok) {
    return sourceValidation;
  }

  if (getPathSourceLength(pathSource, epsilon) <= epsilon) {
    return { ok: false, reason: "Path length must be greater than zero." };
  }

  return { ok: true };
}

export function samplePolylineByCount(
  polyline: PolylinePath,
  count: number,
  epsilon = CAD_EPSILON
): ReadonlyArray<PathSample> {
  // O wrapper preserva a API legada: continua valida pois polyline e um PathSource via adapter.
  return samplePathSourceByCount(polylinePathToPathSource(polyline), count, epsilon);
}

export function samplePathByCount(
  source: PathSource | PolylinePath,
  count: number,
  epsilon = CAD_EPSILON
): ReadonlyArray<PathSample> {
  // O sampler generico delega ao pathSource para evitar duplicacao de logica entre tipos.
  return samplePathSourceByCount(ensurePathSource(source), count, epsilon);
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

export function ensurePathSource(source: PathSource | PolylinePath): PathSource {
  // O adapter aceita tanto PolylinePath legacy quanto PathSource ja tipado, simplificando o downstream.
  if ("type" in source) {
    return source;
  }

  return polylinePathToPathSource(source);
}

// O Vector2D e re-exportado para que consumidores que importam tipos de pathArray nao precisem alcancar types.
export type { Vector2D };
