import { lineExtendCandidatesFromPrimitives } from "./curveTrim";
import type { IntersectPrimitive } from "./intersections";
import {
  bezierChainBoundingBox,
  bezierChainIntersectionParams,
  bezierSegmentCount,
  cubicDerivative,
  isValidBezierChain,
  splitCubic,
  type BezierChain
} from "./spline";
import type { BoundingBox, Point2D, Vector2D } from "./types";

/**
 * Extensão de spline (EXTEND) até o limite mais próximo.
 *
 * 1. Extensão natural: o último segmento cúbico é prolongado como o próprio polinômio (t > 1), então a
 *    continuação é exata e suave (C∞ com a curva). Ela só vale enquanto a tangente gira menos de 90° e não
 *    encolhe (sem laço), até t = 4 (cerca de três vezes o segmento); como o ajuste por pontos usa a condição
 *    natural (curvatura zero nas pontas), a continuação começa praticamente reta.
 * 2. Se a extensão natural não alcança nenhum limite, a spline segue reta pela tangente da ponta (G1),
 *    como a extensão de uma linha.
 */

export type BezierChainExtension = Readonly<{
  chain: BezierChain;
  // Somente o trecho acrescentado (para o preview).
  added: BezierChain;
  point: Point2D;
  mode: "natural" | "tangent";
}>;

type Cubic = readonly [Point2D, Point2D, Point2D, Point2D];

const MAX_NATURAL_PARAM = 4;
const NATURAL_SCAN_STEP = 0.02;
const START_TOLERANCE = 1e-7;

// Mesma curva percorrida no sentido oposto (a cadeia invertida é exata).
export function reverseBezierChain(chain: BezierChain): BezierChain {
  return [...chain].reverse();
}

export function extendBezierChain(
  chain: BezierChain,
  endpoint: "start" | "end",
  primitives: ReadonlyArray<IntersectPrimitive>
): BezierChainExtension | null {
  if (!isValidBezierChain(chain) || primitives.length === 0) return null;

  const working = endpoint === "end" ? chain : reverseBezierChain(chain);
  const extension = extendChainEnd(working, primitives);

  if (extension === null || endpoint === "end") return extension;

  return { ...extension, chain: reverseBezierChain(extension.chain), added: reverseBezierChain(extension.added) };
}

/**
 * Caixa onde podem estar os limites alcançáveis pela extensão da ponta (natural até t = 4 e reta até reach).
 */
export function bezierChainExtensionSearchBox(chain: BezierChain, endpoint: "start" | "end", reach: number): BoundingBox {
  const working = endpoint === "end" ? chain : reverseBezierChain(chain);
  const cubic = lastCubic(working);
  const natural = bezierChainBoundingBox(splitCubic(cubic, MAX_NATURAL_PARAM)[0]);
  const end = cubic[3];
  const direction = endTangent(cubic);
  const far = { x: end.x + direction.x * reach, y: end.y + direction.y * reach };

  return {
    minX: Math.min(natural.minX, end.x, far.x),
    minY: Math.min(natural.minY, end.y, far.y),
    maxX: Math.max(natural.maxX, end.x, far.x),
    maxY: Math.max(natural.maxY, end.y, far.y)
  };
}

function extendChainEnd(chain: BezierChain, primitives: ReadonlyArray<IntersectPrimitive>): BezierChainExtension | null {
  const n = bezierSegmentCount(chain);
  const cubic = lastCubic(chain);
  const head = chain.slice(0, 3 * (n - 1) + 1);
  const limit = naturalExtensionLimit(cubic);

  if (limit > 1 + START_TOLERANCE) {
    const extended = splitCubic(cubic, limit)[0];
    let best: number | null = null;

    for (const primitive of primitives) {
      for (const s of bezierChainIntersectionParams(extended, primitive, 256)) {
        const t = s * limit;
        if (t > 1 + START_TOLERANCE && (best === null || t < best)) best = t;
      }
    }

    if (best !== null) {
      const newLast = splitCubic(cubic, best)[0];
      const added = splitCubic(newLast, 1 / best)[1];
      return { chain: [...head, newLast[1], newLast[2], newLast[3]], added, point: newLast[3], mode: "natural" };
    }
  }

  const end = cubic[3];
  const direction = endTangent(cubic);

  if (Math.hypot(direction.x, direction.y) === 0) return null;

  const ray = { type: "line" as const, start: { x: end.x - direction.x, y: end.y - direction.y }, end };
  const candidate = lineExtendCandidatesFromPrimitives(ray, primitives.map((primitive) => ({ primitive })), "end")
    .find((hit) => hit.extensionDistance > START_TOLERANCE * Math.max(1, Math.abs(end.x), Math.abs(end.y)));

  if (candidate === undefined) return null;

  const q = candidate.point;
  const added: Cubic = [
    end,
    { x: end.x + (q.x - end.x) / 3, y: end.y + (q.y - end.y) / 3 },
    { x: end.x + (2 * (q.x - end.x)) / 3, y: end.y + (2 * (q.y - end.y)) / 3 },
    q
  ];

  return { chain: [...chain, added[1], added[2], added[3]], added, point: q, mode: "tangent" };
}

function lastCubic(chain: BezierChain): Cubic {
  const base = 3 * (bezierSegmentCount(chain) - 1);
  return [chain[base]!, chain[base + 1]!, chain[base + 2]!, chain[base + 3]!];
}

// Parâmetro máximo da extensão natural: a tangente gira menos de 90° e não encolhe (evita laços e cúspides).
function naturalExtensionLimit(cubic: Cubic): number {
  const start = cubicDerivative(cubic, 1);
  const startLength = Math.hypot(start.x, start.y);

  if (startLength === 0) return 1;

  let limit = 1;

  for (let t = 1 + NATURAL_SCAN_STEP; t <= MAX_NATURAL_PARAM + 1e-12; t += NATURAL_SCAN_STEP) {
    const derivative = cubicDerivative(cubic, t);
    const length = Math.hypot(derivative.x, derivative.y);

    if (length < 0.1 * startLength || derivative.x * start.x + derivative.y * start.y <= 0) break;
    limit = t;
  }

  return limit;
}

// Tangente unitária na ponta final (com alça nula, usa o ponto de controle anterior não coincidente).
function endTangent(cubic: Cubic): Vector2D {
  const end = cubic[3];

  for (const reference of [cubic[2], cubic[1], cubic[0]]) {
    const dx = end.x - reference.x;
    const dy = end.y - reference.y;
    const length = Math.hypot(dx, dy);
    if (length > 1e-12) return { x: dx / length, y: dy / length };
  }

  return { x: 0, y: 0 };
}
