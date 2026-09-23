import { describe, expect, it } from "vitest";
import { computeSplineFillet } from "./filletSpline";
import type { IntersectPrimitive } from "./intersections";
import {
  bezierChainDerivative,
  bezierSegmentCount,
  evaluateBezierChain,
  fitPointsToBezierChain,
  nearestOnBezierChain
} from "./spline";
import { extendBezierChain } from "./splineExtend";
import { getSplineGripPoints, splineControlFrame, updateSplineByGrip } from "./splineGrips";
import type { Point2D } from "./types";

const vertical = (x: number): IntersectPrimitive => ({ kind: "segment", a: { x, y: -10_000 }, b: { x, y: 10_000 } });

describe("spline extend", () => {
  const chain = fitPointsToBezierChain([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }], false);

  it("continues the end segment polynomial exactly up to the boundary", () => {
    const result = extendBezierChain(chain, "end", [vertical(25)])!;

    expect(result.mode).toBe("natural");
    expect(result.point.x).toBeCloseTo(25, 7);
    expect(result.chain).toHaveLength(chain.length);
    expect(result.chain.slice(0, 4)).toEqual(chain.slice(0, 4));
    // A curva original continua inteira dentro da nova (mesmo polinômio no último segmento).
    const nearest = nearestOnBezierChain(result.chain, { x: 20, y: 0 });
    expect(nearest.distance).toBeLessThan(1e-7);
    expect(result.added[0]!.x).toBeCloseTo(20, 9);
    expect(result.added.at(-1)!.x).toBeCloseTo(25, 7);
  });

  it("extends the start end and keeps the other end", () => {
    const result = extendBezierChain(chain, "start", [vertical(-4)])!;

    expect(result.chain[0]!.x).toBeCloseTo(-4, 7);
    expect(result.chain.at(-1)).toEqual({ x: 20, y: 0 });
    expect(nearestOnBezierChain(result.chain, { x: 0, y: 0 }).distance).toBeLessThan(1e-7);
  });

  it("falls back to a straight tangent extension for far boundaries", () => {
    const result = extendBezierChain(chain, "end", [vertical(500)])!;
    const n = bezierSegmentCount(result.chain);
    const tangentBefore = bezierChainDerivative(result.chain, n - 1 - 1e-9);
    const tangentAfter = bezierChainDerivative(result.chain, n - 1 + 1e-9);

    expect(result.mode).toBe("tangent");
    expect(result.point.x).toBeCloseTo(500, 7);
    expect(n).toBe(bezierSegmentCount(chain) + 1);
    // G1: a reta sai na direção da tangente da ponta.
    const cross = tangentBefore.x * tangentAfter.y - tangentBefore.y * tangentAfter.x;
    expect(Math.abs(cross) / (Math.hypot(tangentBefore.x, tangentBefore.y) * Math.hypot(tangentAfter.x, tangentAfter.y))).toBeLessThan(1e-6);
  });

  it("reaches circle boundaries and returns null without a boundary ahead", () => {
    const circle = extendBezierChain(chain, "end", [{ kind: "circle", center: { x: 30, y: -5 }, radius: 4 }])!;
    expect(Math.hypot(circle.point.x - 30, circle.point.y + 5)).toBeCloseTo(4, 6);

    expect(extendBezierChain(chain, "end", [vertical(-10)])).toBeNull();
    expect(extendBezierChain(chain, "end", [])).toBeNull();
  });
});

describe("spline fillet", () => {
  const upright = fitPointsToBezierChain([{ x: 0, y: -20 }, { x: 0, y: 0 }, { x: 0, y: 20 }], false);

  it("fillets a spline with a line and trims both on the picked sides", () => {
    const result = computeSplineFillet({
      spline: { chain: upright, closed: false },
      splinePick: { x: 0, y: 15 },
      other: { kind: "line", start: { x: -30, y: 0 }, end: { x: 30, y: 0 } },
      otherPick: { x: 15, y: 0 },
      radius: 5
    });

    if (!result.ok) throw new Error(result.reason);
    expectPoint(result.arc.center, { x: 5, y: 5 });
    expectPoint(result.tangentOnSpline, { x: 0, y: 5 });
    expectPoint(result.tangentOnOther, { x: 5, y: 0 });
    expectPoint(result.spline![0]!, { x: 0, y: 5 });
    expectPoint(result.spline!.at(-1)!, { x: 0, y: 20 });
    expect(result.other).toMatchObject({ kind: "line", end: { x: 30, y: 0 } });
    if (result.other.kind === "line") expectPoint(result.other.start, { x: 5, y: 0 });
  });

  it("fillets a spline with a circle without trimming the circle", () => {
    const result = computeSplineFillet({
      spline: { chain: upright, closed: false },
      splinePick: { x: 0, y: 10 },
      other: { kind: "curve", curve: { kind: "circle", center: { x: 8, y: 0 }, radius: 4 }, span: null },
      otherPick: { x: 8, y: 4 },
      radius: 3
    });

    if (!result.ok) throw new Error(result.reason);
    expectPoint(result.arc.center, { x: 3, y: Math.sqrt(24) });
    expect(result.other).toEqual({ kind: "curve", span: null });
    expectPoint(result.spline![0]!, { x: 0, y: Math.sqrt(24) });
  });

  it("fillets two splines", () => {
    const flat = fitPointsToBezierChain([{ x: -30, y: 0 }, { x: 30, y: 0 }], false);
    const result = computeSplineFillet({
      spline: { chain: upright, closed: false },
      splinePick: { x: 0, y: 15 },
      other: { kind: "spline", chain: flat, closed: false },
      otherPick: { x: 15, y: 0 },
      radius: 5
    });

    if (!result.ok) throw new Error(result.reason);
    expectPoint(result.arc.center, { x: 5, y: 5 });
    if (result.other.kind !== "spline") throw new Error("expected spline");
    expectPoint(result.other.chain![0]!, { x: 5, y: 0 });
    expectPoint(result.other.chain!.at(-1)!, { x: 30, y: 0 });
  });

  it("is tangent to a curved spline", () => {
    const wave = fitPointsToBezierChain([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }], false);
    const result = computeSplineFillet({
      spline: { chain: wave, closed: false },
      splinePick: { x: 5, y: 6 },
      other: { kind: "line", start: { x: 15, y: -20 }, end: { x: 15, y: 30 } },
      otherPick: { x: 15, y: 20 },
      radius: 2
    });

    if (!result.ok) throw new Error(result.reason);
    expect(Math.abs(result.arc.center.x - 15)).toBeCloseTo(2, 9);
    expect(nearestOnBezierChain(wave, result.arc.center).distance).toBeCloseTo(2, 6);
    expectPoint(result.spline!.at(-1)!, result.tangentOnSpline);
  });

  it("rejects a radius that does not fit", () => {
    const result = computeSplineFillet({
      spline: { chain: upright, closed: false },
      splinePick: { x: 0, y: 15 },
      other: { kind: "line", start: { x: -30, y: 0 }, end: { x: 30, y: 0 } },
      otherPick: { x: 15, y: 0 },
      radius: 100
    });

    expect(result.ok).toBe(false);
  });
});

describe("spline grips", () => {
  const fit = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];

  it("edits fit points and refits the curve", () => {
    const spline = { closed: false, fitPoints: fit, controlPoints: fitPointsToBezierChain(fit, false) };
    const grips = getSplineGripPoints(spline);

    expect(grips.map((grip) => grip.id)).toEqual(["fit:0", "fit:1", "fit:2"]);
    const updated = updateSplineByGrip(spline, "fit:1", { x: 10, y: 20 })!;
    expect(updated.fitPoints![1]).toEqual({ x: 10, y: 20 });
    expectPoint(evaluateBezierChain(updated.controlPoints, 1), { x: 10, y: 20 });
    expect(splineControlFrame(spline)).toHaveLength(0);
  });

  it("moves a curve vertex together with its handles", () => {
    const controlPoints = fitPointsToBezierChain(fit, false);
    const spline = { closed: false, controlPoints };
    const updated = updateSplineByGrip(spline, "cv:3", { x: controlPoints[3]!.x + 1, y: controlPoints[3]!.y + 2 })!;

    expect(getSplineGripPoints(spline)).toHaveLength(controlPoints.length);
    [2, 3, 4].forEach((index) => expectPoint(updated.controlPoints[index]!, { x: controlPoints[index]!.x + 1, y: controlPoints[index]!.y + 2 }));
    [0, 1, 5, 6].forEach((index) => expect(updated.controlPoints[index]).toEqual(controlPoints[index]));
    expect(splineControlFrame(spline)).toHaveLength(4);
  });

  it("keeps a smooth joint when a handle is dragged", () => {
    const controlPoints = fitPointsToBezierChain(fit, false);
    const spline = { closed: false, controlPoints };
    const anchor = controlPoints[3]!;
    const oppositeLength = Math.hypot(controlPoints[2]!.x - anchor.x, controlPoints[2]!.y - anchor.y);
    const updated = updateSplineByGrip(spline, "cv:4", { x: anchor.x + 3, y: anchor.y + 4 })!;
    const opposite = updated.controlPoints[2]!;

    expectPoint(opposite, { x: anchor.x - (3 / 5) * oppositeLength, y: anchor.y - (4 / 5) * oppositeLength });
  });

  it("treats the seam of a closed chain as a single grip", () => {
    const closedFit = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const controlPoints = fitPointsToBezierChain(closedFit, true);
    const spline = { closed: true, controlPoints };
    const last = controlPoints.length - 1;

    expect(getSplineGripPoints(spline)).toHaveLength(last);
    const moved = updateSplineByGrip(spline, "cv:0", { x: -1, y: -1 })!;
    expect(moved.controlPoints[0]).toEqual({ x: -1, y: -1 });
    expect(moved.controlPoints[last]).toEqual({ x: -1, y: -1 });
    expectPoint(moved.controlPoints[last - 1]!, { x: controlPoints[last - 1]!.x - 1, y: controlPoints[last - 1]!.y - 1 });

    // A alça logo após a costura gira a alça anterior à costura (junção suave).
    const handle = updateSplineByGrip(spline, "cv:1", { x: 0, y: -5 })!;
    expect(handle.controlPoints[last - 1]!.x).toBeCloseTo(0, 9);
    expect(handle.controlPoints[last - 1]!.y).toBeGreaterThan(0);
    expect(updateSplineByGrip(spline, "cv:99", { x: 0, y: 0 })).toBeNull();
    expect(updateSplineByGrip(spline, "fit:0", { x: 0, y: 0 })).toBeNull();
  });
});

function expectPoint(actual: Point2D, expected: Point2D, digits = 6): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}
