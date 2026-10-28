import type { Point2D } from "@cad-web/cad-geometry";

/**
 * Avaliação de B-splines racionais (NURBS) do DXF por Cox–de Boor, usada para amostrar o SPLINE e ajustá-lo
 * a uma cadeia de Béziers cúbicas.
 */

export type NurbsCurve = Readonly<{
  degree: number;
  knots: ReadonlyArray<number>;
  controlPoints: ReadonlyArray<Point2D>;
  // Um peso por ponto de controle (1 quando não racional).
  weights: ReadonlyArray<number>;
}>;

// A curva é válida quando há n + p + 1 nós, n ≥ p + 1 pontos e os nós não decrescem.
export function isValidNurbs(curve: NurbsCurve): boolean {
  const { degree, knots, controlPoints, weights } = curve;

  if (!Number.isInteger(degree) || degree < 1 || controlPoints.length < degree + 1 || weights.length !== controlPoints.length) {
    return false;
  }

  if (knots.length !== controlPoints.length + degree + 1) {
    return false;
  }

  for (let index = 1; index < knots.length; index += 1) {
    if (!(knots[index]! >= knots[index - 1]!)) {
      return false;
    }
  }

  return knots[knots.length - 1]! > knots[0]! && weights.every((weight) => Number.isFinite(weight) && weight > 0);
}

// Intervalo de nós [knots[span], knots[span + 1]) que contém u (u = último nó fica no último intervalo não vazio).
function findSpan(curve: NurbsCurve, u: number): number {
  const { degree, knots, controlPoints } = curve;
  const last = controlPoints.length - 1;

  if (u >= knots[last + 1]!) {
    return last;
  }

  let low = degree;
  let high = last + 1;

  while (high - low > 1) {
    const middle = (low + high) >> 1;

    if (u < knots[middle]!) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return low;
}

export function evaluateNurbs(curve: NurbsCurve, parameter: number): Point2D {
  const { degree, knots, controlPoints, weights } = curve;
  const u = Math.min(Math.max(parameter, knots[degree]!), knots[controlPoints.length]!);
  const span = findSpan(curve, u);

  // Algoritmo de de Boor em coordenadas homogêneas (x·w, y·w, w).
  const points = Array.from({ length: degree + 1 }, (_unused, offset) => {
    const index = span - degree + offset;
    const weight = weights[index]!;
    return { x: controlPoints[index]!.x * weight, y: controlPoints[index]!.y * weight, w: weight };
  });

  for (let step = 1; step <= degree; step += 1) {
    for (let index = degree; index >= step; index -= 1) {
      const left = knots[span - degree + index]!;
      const right = knots[span + 1 + index - step]!;
      const denominator = right - left;
      const alpha = denominator === 0 ? 0 : (u - left) / denominator;
      const previous = points[index - 1]!;
      const current = points[index]!;

      points[index] = {
        x: (1 - alpha) * previous.x + alpha * current.x,
        y: (1 - alpha) * previous.y + alpha * current.y,
        w: (1 - alpha) * previous.w + alpha * current.w
      };
    }
  }

  const result = points[degree]!;
  return { x: result.x / result.w, y: result.y / result.w };
}

/**
 * Amostra a curva em n pontos ao longo do domínio, com mais amostras nos intervalos de nós distintos
 * (cada trecho polinomial recebe a mesma quantidade), para o ajuste posterior por Béziers.
 */
export function sampleNurbs(curve: NurbsCurve, samplesPerSpan = 12): ReadonlyArray<Point2D> {
  const { degree, knots, controlPoints } = curve;
  const start = knots[degree]!;
  const end = knots[controlPoints.length]!;
  const distinct: number[] = [start];

  for (let index = degree + 1; index < controlPoints.length; index += 1) {
    const value = knots[index]!;

    if (value > distinct[distinct.length - 1]! + 1e-12 && value < end - 1e-12) {
      distinct.push(value);
    }
  }

  distinct.push(end);
  const points: Point2D[] = [];

  for (let span = 0; span < distinct.length - 1; span += 1) {
    const from = distinct[span]!;
    const to = distinct[span + 1]!;

    for (let step = 0; step < samplesPerSpan; step += 1) {
      points.push(evaluateNurbs(curve, from + ((to - from) * step) / samplesPerSpan));
    }
  }

  points.push(evaluateNurbs(curve, end));
  return points;
}
