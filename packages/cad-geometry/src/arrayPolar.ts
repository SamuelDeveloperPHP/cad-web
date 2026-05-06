import { CAD_EPSILON } from "./constants";
import { rotationMatrix, transformPoint } from "./matrix";
import type { Point2D } from "./types";

// O modulo expoe utilidades puras para gerar matrizes polares (rotacionais) de entidades CAD.
// As funcoes nao dependem do React, do renderer nem do command pattern.

const FULL_CIRCLE_RADIANS = Math.PI * 2;

export type PolarArrayParams = Readonly<{
  count: number;
  fillAngleRadians: number;
  // O parametro indica se o angulo total cobre uma volta completa para distribuir as copias sem sobrepor a origem.
  fullCircle?: boolean;
}>;

export type PolarArrayValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

export function validatePolarArrayParams(
  params: PolarArrayParams,
  epsilon = CAD_EPSILON
): PolarArrayValidation {
  // O metodo concentra todas as regras geometricas para evitar duplicacao entre tool e kernel.
  if (!Number.isInteger(params.count) || params.count < 2) {
    return { ok: false, reason: "Count must be an integer greater than or equal to 2." };
  }

  if (!Number.isFinite(params.fillAngleRadians) || Math.abs(params.fillAngleRadians) <= epsilon) {
    return { ok: false, reason: "Fill angle must be a non-zero number." };
  }

  return { ok: true };
}

export function isFullCircleAngle(angleRadians: number, epsilon = CAD_EPSILON): boolean {
  // O metodo identifica se o angulo total fecha exatamente uma volta para distribuir copias sem duplicar a origem.
  return Math.abs(Math.abs(angleRadians) - FULL_CIRCLE_RADIANS) <= epsilon;
}

export function buildPolarArrayAngles(params: PolarArrayParams, epsilon = CAD_EPSILON): ReadonlyArray<number> {
  // O algoritmo produz os angulos de cada copia em radianos, sempre relativos a posicao original.
  const validation = validatePolarArrayParams(params, epsilon);

  if (!validation.ok) {
    throw new Error(`Invalid polar array params: ${validation.reason}`);
  }

  const treatAsFullCircle = params.fullCircle === true || isFullCircleAngle(params.fillAngleRadians, epsilon);
  const fillAngle = params.fillAngleRadians;

  if (treatAsFullCircle) {
    // O caso de volta completa distribui count copias igualmente sem repetir a origem ao final.
    const step = fillAngle / params.count;
    const angles: number[] = [];

    for (let index = 1; index < params.count; index += 1) {
      angles.push(index * step);
    }

    return angles;
  }

  // O caso parcial usa count - 1 intervalos para que a primeira copia esteja em 0 e a ultima em fillAngle.
  const step = fillAngle / (params.count - 1);
  const angles: number[] = [];

  for (let index = 1; index < params.count; index += 1) {
    angles.push(index * step);
  }

  return angles;
}

export function countPolarArrayCopies(params: PolarArrayParams): number {
  // O metodo retorna a quantidade de novas copias (excluindo a origem) para auxiliar avisos de performance.
  const validation = validatePolarArrayParams(params);

  if (!validation.ok) {
    return 0;
  }

  return params.count - 1;
}

export function rotatePointAroundCenter(point: Point2D, center: Point2D, angleRadians: number): Point2D {
  // O metodo aplica uma rotacao 2D usando a matrix afim ja existente no kernel.
  return transformPoint(point, rotationMatrix(angleRadians, center));
}
