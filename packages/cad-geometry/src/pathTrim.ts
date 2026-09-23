import { lineIntersectionParameters } from "./curveTrim";
import type { IntersectPrimitive } from "./intersections";
import type { Point2D } from "./types";

/**
 * Trim de caminhos poligonais (polylines abertas e fechadas, retângulos convertidos em polyline).
 * O caminho é parametrizado pela distância s ao longo dele: [0, L] quando aberto e periódico (mod L)
 * quando fechado. Os cortes são as interseções de cada segmento com as primitivas de corte; o trecho
 * entre cortes que contém o clique é removido, como no TRIM do AutoCAD.
 */

export type PathPieces = Readonly<{
  kept: ReadonlyArray<ReadonlyArray<Point2D>>;
  removed: ReadonlyArray<Point2D>;
}>;

// Vértices percorridos em ordem; no caminho fechado o primeiro vértice se repete no fim.
export function pathVertices(points: ReadonlyArray<Point2D>, closed: boolean): ReadonlyArray<Point2D> {
  return closed && points.length >= 2 ? [...points, points[0]!] : points;
}

export function pathCumulativeLengths(points: ReadonlyArray<Point2D>, closed: boolean): ReadonlyArray<number> {
  const vertices = pathVertices(points, closed);
  const cumulative = [0];

  for (let index = 1; index < vertices.length; index += 1) {
    const a = vertices[index - 1]!;
    const b = vertices[index]!;
    cumulative.push(cumulative[index - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }

  return cumulative;
}

export function pointAtPathDistance(points: ReadonlyArray<Point2D>, closed: boolean, distanceAlong: number): Point2D {
  const vertices = pathVertices(points, closed);
  const cumulative = pathCumulativeLengths(points, closed);
  const total = cumulative[cumulative.length - 1]!;
  const s = closed ? wrap(distanceAlong, total) : Math.max(0, Math.min(total, distanceAlong));

  for (let index = 1; index < vertices.length; index += 1) {
    if (s <= cumulative[index]! || index === vertices.length - 1) {
      const length = cumulative[index]! - cumulative[index - 1]!;
      const t = length > 0 ? (s - cumulative[index - 1]!) / length : 0;
      const a = vertices[index - 1]!;
      const b = vertices[index]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }

  return vertices[0] ?? { x: 0, y: 0 };
}

// Distância ao longo do caminho do ponto do caminho mais próximo de point.
export function pathDistanceAtPoint(points: ReadonlyArray<Point2D>, closed: boolean, point: Point2D): number {
  const vertices = pathVertices(points, closed);
  const cumulative = pathCumulativeLengths(points, closed);
  let best = { distance: Number.POSITIVE_INFINITY, along: 0 };

  for (let index = 1; index < vertices.length; index += 1) {
    const a = vertices[index - 1]!;
    const b = vertices[index]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
    const distance = Math.hypot(a.x + dx * t - point.x, a.y + dy * t - point.y);

    if (distance < best.distance) {
      best = { distance, along: cumulative[index - 1]! + t * Math.sqrt(lengthSquared) };
    }
  }

  return best.along;
}

/**
 * Distâncias ao longo do caminho onde ele cruza as primitivas de corte (sem repetições). No caminho
 * aberto as pontas não contam como corte.
 */
export function pathCutDistances(
  points: ReadonlyArray<Point2D>,
  closed: boolean,
  primitives: ReadonlyArray<IntersectPrimitive>
): ReadonlyArray<number> {
  const vertices = pathVertices(points, closed);
  const cumulative = pathCumulativeLengths(points, closed);
  const total = cumulative[cumulative.length - 1]!;
  const cuts: number[] = [];

  for (let index = 1; index < vertices.length; index += 1) {
    const a = vertices[index - 1]!;
    const b = vertices[index]!;
    const length = cumulative[index]! - cumulative[index - 1]!;

    if (length <= 0) continue;

    for (const primitive of primitives) {
      for (const hit of lineIntersectionParameters(a, b, primitive)) {
        if (hit.parameter >= -1e-9 && hit.parameter <= 1 + 1e-9) {
          const s = cumulative[index - 1]! + Math.max(0, Math.min(1, hit.parameter)) * length;
          cuts.push(closed ? wrap(s, total) : s);
        }
      }
    }
  }

  const tolerance = Math.max(total * 1e-12, 1e-12);
  const sorted = cuts
    .filter((s) => closed || (s > tolerance && s < total - tolerance))
    .sort((left, right) => left - right);
  const unique: number[] = [];

  for (const s of sorted) {
    if (unique.length === 0 || s - unique[unique.length - 1]! > tolerance) unique.push(s);
  }

  if (closed && unique.length > 1 && total - unique[unique.length - 1]! + unique[0]! <= tolerance) {
    unique.pop();
  }

  return unique;
}

/**
 * Pedaço do caminho entre as distâncias from e to. No caminho fechado, from > to atravessa o início.
 */
export function extractPathPiece(points: ReadonlyArray<Point2D>, closed: boolean, from: number, to: number): ReadonlyArray<Point2D> {
  const vertices = pathVertices(points, closed);
  const cumulative = pathCumulativeLengths(points, closed);
  const total = cumulative[cumulative.length - 1]!;
  const collect = (start: number, end: number, includeStart: boolean): Point2D[] => {
    const result: Point2D[] = includeStart ? [pointAtPathDistance(points, closed, start)] : [];

    for (let index = 0; index < vertices.length; index += 1) {
      const s = cumulative[index]!;
      if (s > start + 1e-12 && s < end - 1e-12) result.push(vertices[index]!);
    }

    result.push(end >= total && closed ? vertices[0]! : pointAtPathDistance(points, closed, end));
    return result;
  };

  if (!closed || from <= to) {
    return dedupe(collect(from, to, true));
  }

  // Atravessa o início do caminho fechado: de from até o fim e do começo até to.
  return dedupe([...collect(from, total, true), ...collect(0, to, false)]);
}

/**
 * Remove o trecho entre cortes que contém a distância clicada.
 * - Caminho fechado: exige dois cortes; sobra um caminho aberto do corte seguinte ao anterior.
 * - Caminho aberto: sobram até dois pedaços (antes e depois do trecho removido).
 */
export function trimPolylinePath(
  points: ReadonlyArray<Point2D>,
  closed: boolean,
  cuts: ReadonlyArray<number>,
  clickDistance: number
): PathPieces | null {
  const cumulative = pathCumulativeLengths(points, closed);
  const intervals = trimIntervals(cumulative[cumulative.length - 1]!, closed, cuts, clickDistance);

  if (intervals === null) return null;

  return {
    removed: extractPathPiece(points, closed, intervals.removed[0], intervals.removed[1]),
    kept: intervals.kept.map(([from, to]) => extractPathPiece(points, closed, from, to))
  };
}

export type TrimIntervals = Readonly<{
  // Trechos mantidos [de, até]; no domínio fechado, de > até atravessa o início.
  kept: ReadonlyArray<readonly [number, number]>;
  removed: readonly [number, number];
}>;

/**
 * Núcleo do trim em um domínio 1D [0, total] (aberto) ou periódico de período total (fechado): remove o
 * intervalo entre cortes que contém o clique. Serve tanto para distâncias de polyline quanto para o
 * parâmetro de uma spline.
 */
export function trimIntervals(total: number, closed: boolean, cuts: ReadonlyArray<number>, click: number): TrimIntervals | null {
  const tolerance = Math.max(total * 1e-9, 1e-12);

  if (closed) {
    if (cuts.length < 2) return null;
    const position = wrap(click, total);

    for (let index = 0; index < cuts.length; index += 1) {
      const start = cuts[index]!;
      const next = cuts[(index + 1) % cuts.length]!;
      const inside = start <= next ? position >= start && position <= next : position >= start || position <= next;
      if (inside) return { removed: [start, next], kept: [[next, start]] };
    }

    return { removed: [cuts[cuts.length - 1]!, cuts[0]!], kept: [[cuts[0]!, cuts[cuts.length - 1]!]] };
  }

  if (cuts.length === 0) return null;

  const position = Math.max(0, Math.min(total, click));
  const bounds = [0, ...cuts, total];
  let index = 0;
  while (index < bounds.length - 2 && position > bounds[index + 1]!) index += 1;

  const from = bounds[index]!;
  const to = bounds[index + 1]!;
  const kept: Array<readonly [number, number]> = [];
  if (from > tolerance) kept.push([0, from]);
  if (total - to > tolerance) kept.push([to, total]);
  return { removed: [from, to], kept };
}

function wrap(value: number, period: number): number {
  if (period <= 0) return 0;
  const wrapped = value % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

function dedupe(points: ReadonlyArray<Point2D>): Point2D[] {
  const result: Point2D[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last === undefined || Math.hypot(last.x - point.x, last.y - point.y) > 1e-12) result.push(point);
  }
  return result;
}
