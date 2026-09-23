import { describe, expect, it } from "vitest";
import { distancePointToEllipse } from "./ellipse";
import { offsetEllipseToBezierChain } from "./offset";
import {
  bezierChainBoundingBox,
  bezierChainDerivative,
  bezierChainIntersectionParams,
  bezierChainLength,
  bezierChainParamAtLength,
  evaluateBezierChain,
  fitPointsToBezierChain,
  flattenBezierChain,
  nearestOnBezierChain,
  offsetBezierChain,
  subBezierChain
} from "./spline";

const fit = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }];

describe("spline fit", () => {
  it("passes through every fit point with continuous tangent and curvature", () => {
    const chain = fitPointsToBezierChain(fit, false);

    expect(chain).toHaveLength(10);
    fit.forEach((point, index) => {
      const onCurve = evaluateBezierChain(chain, index);
      expect(onCurve.x).toBeCloseTo(point.x, 12);
      expect(onCurve.y).toBeCloseTo(point.y, 12);
    });

    // C1 nas junções: derivada igual dos dois lados (a parametrização por corda mantém a continuidade).
    for (const joint of [1, 2]) {
      const before = bezierChainDerivative(chain, joint - 1e-9);
      const after = bezierChainDerivative(chain, joint + 1e-9);
      const ratio = Math.hypot(after.x, after.y) / Math.hypot(before.x, before.y);
      expect(Math.abs(before.x * after.y - before.y * after.x) / (Math.hypot(before.x, before.y) * Math.hypot(after.x, after.y))).toBeLessThan(1e-6);
      expect(ratio).toBeGreaterThan(0);
    }
  });

  it("makes a straight segment from two points", () => {
    const chain = fitPointsToBezierChain([{ x: 0, y: 0 }, { x: 9, y: 0 }], false);

    expect(chain).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }, { x: 9, y: 0 }]);
  });

  it("closes smoothly through the first point (periodic)", () => {
    const square = [{ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }, { x: 0, y: -10 }];
    const chain = fitPointsToBezierChain(square, true);
    const start = bezierChainDerivative(chain, 0);
    const end = bezierChainDerivative(chain, 4 - 1e-9);

    expect(chain).toHaveLength(13);
    expect(chain[12]).toEqual(chain[0]);
    expect(start.x).toBeCloseTo(end.x, 5);
    expect(start.y).toBeCloseTo(end.y, 5);
    // Por simetria, a spline periódica pelos 4 pontos quase coincide com o círculo de raio 10.
    expect(Math.hypot(evaluateBezierChain(chain, 0.5).x, evaluateBezierChain(chain, 0.5).y)).toBeCloseTo(10, 0);
  });
});

describe("spline measures", () => {
  const chain = fitPointsToBezierChain(fit, false);

  it("computes an exact bounding box that contains every sample", () => {
    const box = bezierChainBoundingBox(chain);
    for (const point of flattenBezierChain(chain)) {
      expect(point.x).toBeGreaterThanOrEqual(box.minX - 1e-9);
      expect(point.y).toBeLessThanOrEqual(box.maxY + 1e-9);
    }
    expect(box.maxY).toBeGreaterThan(10);
    expect(box.minY).toBeLessThan(0);
  });

  it("measures length consistently with a fine polyline", () => {
    const polyline = flattenBezierChain(chain, 1e-9);
    const approx = polyline.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - polyline[index]!.x, point.y - polyline[index]!.y), 0);

    expect(bezierChainLength(chain)).toBeCloseTo(approx, 6);
    const half = evaluateBezierChain(chain, bezierChainParamAtLength(chain, bezierChainLength(chain) / 2));
    expect(half.x).toBeCloseTo(15, 6);
  });

  it("finds the nearest point (perpendicular foot)", () => {
    const target = { x: 12, y: 20 };
    const hit = nearestOnBezierChain(chain, target);
    const tangent = bezierChainDerivative(chain, hit.u);
    const toTarget = { x: target.x - hit.point.x, y: target.y - hit.point.y };

    // No ponto mais próximo, o vetor até o alvo é perpendicular à tangente.
    expect((toTarget.x * tangent.x + toTarget.y * tangent.y) / (Math.hypot(toTarget.x, toTarget.y) * Math.hypot(tangent.x, tangent.y))).toBeCloseTo(0, 6);
    for (const u of [hit.u - 0.05, hit.u + 0.05]) {
      const other = evaluateBezierChain(chain, u);
      expect(Math.hypot(other.x - target.x, other.y - target.y)).toBeGreaterThan(hit.distance);
    }
  });

  it("intersects with a line exactly (bisection)", () => {
    const params = bezierChainIntersectionParams(chain, { kind: "segment", a: { x: 0, y: 5 }, b: { x: 30, y: 5 } });

    expect(params.length).toBe(3);
    for (const u of params) expect(evaluateBezierChain(chain, u).y).toBeCloseTo(5, 10);
  });

  it("extracts a sub-chain that follows the original curve", () => {
    const piece = subBezierChain(chain, 0.5, 2.25);

    expect(piece[0]!.x).toBeCloseTo(evaluateBezierChain(chain, 0.5).x, 12);
    expect(piece.at(-1)!.y).toBeCloseTo(evaluateBezierChain(chain, 2.25).y, 12);
    expect(piece.length).toBe(10);
  });
});

describe("offsets as splines", () => {
  it("offsets an ellipse within tolerance", () => {
    const ellipse = { center: { x: 0, y: 0 }, radiusX: 40, radiusY: 15, rotation: 0.3 };
    const result = offsetEllipseToBezierChain(ellipse, 3, { x: 100, y: 0 })!;

    expect(result.closed).toBe(true);
    expect(result.chain[0]).toEqual(result.chain.at(-1));
    for (const point of flattenBezierChain(result.chain)) {
      // Tolerância do ajuste: 1e-5 do maior raio (0,4 µm para 40 mm).
      expect(Math.abs(distancePointToEllipse(point, { type: "ellipse", ...ellipse }) - 3)).toBeLessThan(4e-4);
    }
    // Poucos segmentos comparados à polyline densa (centenas de pontos).
    expect((result.chain.length - 1) / 3).toBeLessThan(60);
  });

  it("offsets a spline to the picked side", () => {
    const chain = fitPointsToBezierChain(fit, false);
    const offset = offsetBezierChain(chain, 2, { x: 10, y: 20 })!;

    for (const point of flattenBezierChain(offset, 1e-4).filter((_, index) => index % 7 === 0)) {
      expect(nearestOnBezierChain(chain, point).distance).toBeCloseTo(2, 2);
    }
    expect(offset[0]!.y).toBeGreaterThan(0);
  });
});
