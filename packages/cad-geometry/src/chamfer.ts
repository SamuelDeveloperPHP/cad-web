import { CAD_EPSILON } from "./constants";
import type { LineGeometry, Point2D, Vector2D } from "./types";
import { cross, distance, normalize, subtractPoints } from "./vector";

// O modulo expoe utilidades puras para o calculo do chanfro entre duas linhas finitas.
// As funcoes nao dependem do React, do renderer nem do command pattern.

export type ChamferLineEntity = Readonly<{
  id?: string;
  type: "line";
  start: Point2D;
  end: Point2D;
}>;

export type ChamferLineGeometry = LineGeometry;

export type ComputeLineLineChamferInput = Readonly<{
  line1: ChamferLineEntity;
  line2: ChamferLineEntity;
  distance1: number;
  distance2: number;
  pickPoint1: Point2D;
  pickPoint2: Point2D;
  tolerance?: number;
}>;

export type ComputeLineLineChamferResult =
  | Readonly<{
      ok: true;
      line1Result: ChamferLineGeometry;
      line2Result: ChamferLineGeometry;
      chamferLine: ChamferLineGeometry;
      cutPoint1: Point2D;
      cutPoint2: Point2D;
      vertex: Point2D;
    }>
  | Readonly<{
      ok: false;
      reason: string;
    }>;

type BranchChoice = Readonly<{
  // O vetor aponta do vertice em direcao ao endpoint preservado.
  direction: Vector2D;
  // O endpoint que sera substituido pelo ponto de corte do chanfro.
  updateEndpoint: "start" | "end";
}>;

export function chooseLineBranchFromPickPoint(
  line: ChamferLineEntity,
  vertex: Point2D,
  pickPoint: Point2D,
  epsilon = CAD_EPSILON
): BranchChoice | null {
  // O metodo escolhe o ramo da linha cuja extremidade esta mais proxima do ponto clicado.
  const distanceToStart = distance(pickPoint, line.start);
  const distanceToEnd = distance(pickPoint, line.end);
  const pickedEndpoint = distanceToStart <= distanceToEnd ? "start" : "end";
  const endpointPoint = pickedEndpoint === "start" ? line.start : line.end;
  const selectedVector = subtractPoints(endpointPoint, vertex);
  const direction = normalize(selectedVector, epsilon);

  if (Math.hypot(direction.x, direction.y) <= epsilon) {
    // O fallback usa o ramo oposto quando o ponto clicado coincide com o vertice.
    const otherEndpoint = pickedEndpoint === "start" ? line.end : line.start;
    const fallbackVector = subtractPoints(otherEndpoint, vertex);
    const fallbackDirection = normalize(fallbackVector, epsilon);

    if (Math.hypot(fallbackDirection.x, fallbackDirection.y) <= epsilon) {
      return null;
    }

    return {
      direction: fallbackDirection,
      updateEndpoint: pickedEndpoint
    };
  }

  return {
    direction,
    updateEndpoint: pickedEndpoint === "start" ? "end" : "start"
  };
}

export function pointAtDistanceFromVertex(vertex: Point2D, direction: Vector2D, distanceFromVertex: number): Point2D {
  // O calculo soma o vetor unitario escalado pela distancia desejada ao vertice.
  return {
    x: vertex.x + direction.x * distanceFromVertex,
    y: vertex.y + direction.y * distanceFromVertex
  };
}

export function intersectInfiniteLineGeometriesForChamfer(
  line1: ChamferLineEntity,
  line2: ChamferLineEntity,
  epsilon = CAD_EPSILON
): Point2D | null {
  // O metodo retorna a interseccao das linhas infinitas representadas por dois segmentos.
  const direction1 = subtractPoints(line1.end, line1.start);
  const direction2 = subtractPoints(line2.end, line2.start);
  const denominator = cross(direction1, direction2);

  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const delta = subtractPoints(line2.start, line1.start);
  const parameter = cross(delta, direction2) / denominator;

  return {
    x: line1.start.x + direction1.x * parameter,
    y: line1.start.y + direction1.y * parameter
  };
}

export function computeLineLineChamfer(input: ComputeLineLineChamferInput): ComputeLineLineChamferResult {
  // O kernel orquestra validacoes de entrada, escolha de ramos e geracao das linhas finais do chanfro.
  const tolerance = input.tolerance ?? CAD_EPSILON;

  // O calculo rejeita distancias nao positivas, NaN ou Infinity antes de qualquer operacao geometrica.
  if (!Number.isFinite(input.distance1) || input.distance1 <= tolerance) {
    return { ok: false, reason: "Distance must be greater than zero." };
  }

  if (!Number.isFinite(input.distance2) || input.distance2 <= tolerance) {
    return { ok: false, reason: "Distance must be greater than zero." };
  }

  // O algoritmo localiza o vertice das linhas infinitas, que serve como ancora dos pontos de corte.
  const vertex = intersectInfiniteLineGeometriesForChamfer(input.line1, input.line2, tolerance);

  if (vertex === null) {
    return { ok: false, reason: "Lines are parallel or invalid." };
  }

  // O algoritmo determina, para cada linha, qual ramo o usuario quer preservar a partir do pickPoint.
  const branch1 = chooseLineBranchFromPickPoint(input.line1, vertex, input.pickPoint1, tolerance);
  const branch2 = chooseLineBranchFromPickPoint(input.line2, vertex, input.pickPoint2, tolerance);

  if (branch1 === null || branch2 === null) {
    return { ok: false, reason: "Lines are invalid." };
  }

  // O calculo rejeita linhas colineares quando os vetores diretores ficam paralelos.
  if (Math.abs(cross(branch1.direction, branch2.direction)) <= tolerance) {
    return { ok: false, reason: "Lines are parallel or invalid." };
  }

  // O algoritmo posiciona cada ponto de corte ao longo do ramo preservado, distante do vertice
  // pela distancia configurada para a linha correspondente.
  const cutPoint1 = pointAtDistanceFromVertex(vertex, branch1.direction, input.distance1);
  const cutPoint2 = pointAtDistanceFromVertex(vertex, branch2.direction, input.distance2);

  // O resultado substitui o endpoint oposto ao escolhido pelo ponto de corte calculado.
  const line1Result = updateLineEndpoint(input.line1, branch1.updateEndpoint, cutPoint1);
  const line2Result = updateLineEndpoint(input.line2, branch2.updateEndpoint, cutPoint2);
  // O segmento de chanfro liga os dois pontos de corte e nasce como uma LineGeometry pura.
  const chamferLine: ChamferLineGeometry = {
    type: "line",
    start: cutPoint1,
    end: cutPoint2
  };

  return {
    ok: true,
    line1Result,
    line2Result,
    chamferLine,
    cutPoint1,
    cutPoint2,
    vertex
  };
}

function updateLineEndpoint(line: ChamferLineEntity, endpoint: "start" | "end", point: Point2D): ChamferLineGeometry {
  // O metodo gera uma nova LineGeometry imutavel com apenas um dos endpoints atualizado.
  return endpoint === "start"
    ? {
        ...line,
        type: "line",
        start: point
      }
    : {
        ...line,
        type: "line",
        end: point
      };
}
