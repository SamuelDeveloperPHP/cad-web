import { arcSweepAngle } from "./arc";
import { CAD_EPSILON } from "./constants";
import { getPointAtPolylineDistance, getPolylineLength, type PolylinePath } from "./polyline";
import type { Point2D, Vector2D } from "./types";
import { distance, normalize, subtractPoints } from "./vector";

// O modulo expoe PathSource, uma uniao de fontes de caminho 1D que podem ser usadas pelo PathArrayTool
// e por outras ferramentas futuras (offset por caminho, distribuicao de cotas etc.).
// Cada fonte responde com comprimento total e amostragem por distancia, mantendo a tangente normalizada.

export type PathSourcePolyline = Readonly<{
  type: "polyline";
  points: ReadonlyArray<Point2D>;
  closed: boolean;
}>;

export type PathSourceLine = Readonly<{
  type: "line";
  start: Point2D;
  end: Point2D;
}>;

export type PathSourceCircle = Readonly<{
  type: "circle";
  center: Point2D;
  radius: number;
}>;

export type PathSourceArc = Readonly<{
  type: "arc";
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;
}>;

export type PathSource = PathSourcePolyline | PathSourceLine | PathSourceCircle | PathSourceArc;

export type PathSourceSample = Readonly<{
  point: Point2D;
  tangent: Vector2D;
  distance: number;
  t: number;
}>;

export type PathSourceValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

export function polylinePathToPathSource(polyline: PolylinePath): PathSourcePolyline {
  // O metodo converte uma PolylinePath leve em PathSourcePolyline tipada para reuso por adapters.
  return {
    type: "polyline",
    points: polyline.points,
    closed: polyline.closed
  };
}

export function isPathSourceClosed(source: PathSource): boolean {
  // O metodo identifica caminhos onde o final encontra o inicio, evitando duplicar amostras nos extremos.
  if (source.type === "polyline") {
    return source.closed;
  }

  // Um circulo e sempre fechado; line e arc sao abertos por definicao neste MVP.
  return source.type === "circle";
}

export function getPathSourceLength(source: PathSource, epsilon = CAD_EPSILON): number {
  // O calculo retorna o comprimento real do caminho para servir de base na amostragem.
  if (source.type === "polyline") {
    return getPolylineLength(source);
  }

  if (source.type === "line") {
    return distance(source.start, source.end);
  }

  if (source.type === "circle") {
    return 2 * Math.PI * source.radius;
  }

  // O caso arc usa o sweep efetivo multiplicado pelo raio para descobrir o arco real entre os angulos.
  const sweep = arcSweepAngle(source.startAngle, source.endAngle, source.clockwise);
  const length = sweep * source.radius;

  return Math.abs(length) <= epsilon ? 0 : length;
}

export function validatePathSource(source: PathSource, epsilon = CAD_EPSILON): PathSourceValidation {
  // O metodo concentra todas as validacoes geometricas em um unico ponto.
  if (source.type === "polyline") {
    if (source.points.length < 2) {
      return { ok: false, reason: "Polyline path must have at least two vertices." };
    }
  }

  if (source.type === "circle" || source.type === "arc") {
    if (!Number.isFinite(source.radius) || source.radius <= epsilon) {
      return { ok: false, reason: "Circle/Arc path must have a positive radius." };
    }
  }

  if (getPathSourceLength(source, epsilon) <= epsilon) {
    return { ok: false, reason: "Path length must be greater than zero." };
  }

  return { ok: true };
}

export function samplePathSourceByCount(source: PathSource, count: number, epsilon = CAD_EPSILON): ReadonlyArray<PathSourceSample> {
  // O algoritmo distribui count amostras ao longo do comprimento real do caminho.
  // Para path aberto e count > 1, inclui inicio e fim. Para path fechado, evita duplicar inicio/fim.
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Path source count must be a positive integer.");
  }

  const validation = validatePathSource(source, epsilon);

  if (!validation.ok) {
    throw new Error(`Invalid path source: ${validation.reason}`);
  }

  const totalLength = getPathSourceLength(source, epsilon);
  const samples: PathSourceSample[] = [];

  if (count === 1) {
    samples.push(samplePathSourceAtDistance(source, 0, totalLength));
    return samples;
  }

  if (isPathSourceClosed(source)) {
    const step = totalLength / count;

    for (let index = 0; index < count; index += 1) {
      samples.push(samplePathSourceAtDistance(source, index * step, totalLength));
    }

    return samples;
  }

  const step = totalLength / (count - 1);

  for (let index = 0; index < count; index += 1) {
    samples.push(samplePathSourceAtDistance(source, index * step, totalLength));
  }

  return samples;
}

export function samplePathSourceAtDistance(source: PathSource, distanceAlong: number, totalLength: number): PathSourceSample {
  // O metodo dispatcha para o sampler especifico de cada tipo, sempre retornando tangente normalizada.
  if (source.type === "polyline") {
    const polylineSample = getPointAtPolylineDistance(source, distanceAlong);

    if (polylineSample === null) {
      throw new Error("Polyline sampling failed: zero-length path.");
    }

    return {
      point: polylineSample.point,
      tangent: polylineSample.tangent,
      distance: polylineSample.distanceAlong,
      t: totalLength > 0 ? polylineSample.distanceAlong / totalLength : 0
    };
  }

  if (source.type === "line") {
    const direction = normalize(subtractPoints(source.end, source.start));
    const ratio = totalLength > 0 ? distanceAlong / totalLength : 0;

    return {
      point: {
        x: source.start.x + (source.end.x - source.start.x) * ratio,
        y: source.start.y + (source.end.y - source.start.y) * ratio
      },
      tangent: direction,
      distance: distanceAlong,
      t: ratio
    };
  }

  if (source.type === "circle") {
    // O caso circle parte do angulo zero no sentido anti-horario, alinhado com a convencao matematica.
    const angle = source.radius > 0 ? distanceAlong / source.radius : 0;
    const point: Point2D = {
      x: source.center.x + Math.cos(angle) * source.radius,
      y: source.center.y + Math.sin(angle) * source.radius
    };
    // A tangente em um circulo e perpendicular ao raio; no sentido anti-horario aponta para (-sin, cos).
    const tangent: Vector2D = { x: -Math.sin(angle), y: Math.cos(angle) };

    return {
      point,
      tangent,
      distance: distanceAlong,
      t: totalLength > 0 ? distanceAlong / totalLength : 0
    };
  }

  // O caso arc segue o sentido do sweep configurado.
  // Convencao do codebase: clockwise=true significa percorrer o arco com angulos crescentes (CCW matematico).
  const sweep = arcSweepAngle(source.startAngle, source.endAngle, source.clockwise);
  const direction = source.clockwise ? 1 : -1;
  const sweepRatio = source.radius > 0 ? distanceAlong / source.radius : 0;
  const angle = source.startAngle + direction * Math.min(sweepRatio, sweep);
  const point: Point2D = {
    x: source.center.x + Math.cos(angle) * source.radius,
    y: source.center.y + Math.sin(angle) * source.radius
  };
  // O vetor tangente em CCW (clockwise=true neste codebase) e (-sin, cos); em CW e o oposto.
  const tangent: Vector2D = source.clockwise
    ? { x: -Math.sin(angle), y: Math.cos(angle) }
    : { x: Math.sin(angle), y: -Math.cos(angle) };

  return {
    point,
    tangent,
    distance: distanceAlong,
    t: totalLength > 0 ? distanceAlong / totalLength : 0
  };
}
