import { describe, expect, it } from "vitest";
import {
  curveIntersectionParams,
  curveOfEntity,
  curvePointAt,
  entityWithSpan,
  extendPeriodicCurve,
  lineExtendCandidatesFromPrimitives,
  lineIntersectionParameters,
  trimLineByPrimitives,
  trimPeriodicCurve,
  wrapAngle
} from "./curveTrim";
import type { IntersectPrimitive } from "./intersections";

const HALF_PI = Math.PI / 2;
const ellipsePrimitive = (extra: Partial<{ startAngle: number; endAngle: number }> = {}): IntersectPrimitive => ({
  kind: "ellipse",
  ellipse: { type: "ellipse", center: { x: 0, y: 0 }, radiusX: 20, radiusY: 10, rotation: 0, ...extra }
});

describe("line against primitives", () => {
  it("intersects an infinite line with an ellipse and respects the arc sweep", () => {
    const full = lineIntersectionParameters({ x: -100, y: 0 }, { x: -50, y: 0 }, ellipsePrimitive());
    expect(full.map((hit) => hit.point.x).sort((a, b) => a - b)).toEqual([-20, 20].map((x) => expect.closeTo(x, 9)));

    // Arco de elipse só na metade de y ≥ 0 (parâmetros de 0 a π): a reta y = 5 cruza as duas pontas; y = −5 não cruza.
    const upper = ellipsePrimitive({ startAngle: 0, endAngle: Math.PI });
    expect(lineIntersectionParameters({ x: 0, y: 5 }, { x: 1, y: 5 }, upper)).toHaveLength(2);
    expect(lineIntersectionParameters({ x: 0, y: -5 }, { x: 1, y: -5 }, upper)).toHaveLength(0);
  });

  it("trims a line crossing an ellipse", () => {
    const line = { type: "line" as const, start: { x: -40, y: 0 }, end: { x: 40, y: 0 } };
    const result = trimLineByPrimitives(line, [ellipsePrimitive()], { x: 0, y: 0 }, 1);

    expect(result.removedSegment?.start.x).toBeCloseTo(-20);
    expect(result.removedSegment?.end.x).toBeCloseTo(20);
    expect(result.resultLines).toHaveLength(2);
  });

  it("extends a line to the nearest ellipse crossing", () => {
    const line = { type: "line" as const, start: { x: -60, y: 0 }, end: { x: -40, y: 0 } };
    const [first] = lineExtendCandidatesFromPrimitives(line, [{ primitive: ellipsePrimitive(), entityId: "el" }], "end");

    expect(first?.point.x).toBeCloseTo(-20);
    expect(first?.boundaryId).toBe("el");
    expect(first?.boundaryType).toBe("ellipse");
  });

  it("extends a line to an arc boundary only where the arc exists", () => {
    const line = { type: "line" as const, start: { x: 0, y: 0 }, end: { x: 5, y: 0 } };
    const arc: IntersectPrimitive = { kind: "circle", center: { x: 0, y: 0 }, radius: 10, arc: { startAngle: -HALF_PI, endAngle: HALF_PI, clockwise: true } };
    expect(lineExtendCandidatesFromPrimitives(line, [{ primitive: arc }], "end")[0]?.point.x).toBeCloseTo(10);
    expect(lineExtendCandidatesFromPrimitives(line, [{ primitive: arc }], "start")).toHaveLength(0);
  });
});

describe("periodic curve trim/extend", () => {
  it("trims the clicked portion of a closed curve between two cuts", () => {
    const result = trimPeriodicCurve(null, [HALF_PI, Math.PI], 2);

    expect(result?.removed.start).toBeCloseTo(HALF_PI);
    expect(result?.removed.sweep).toBeCloseTo(HALF_PI);
    expect(result?.kept).toHaveLength(1);
    expect(result?.kept[0]?.start).toBeCloseTo(Math.PI);
    expect(result?.kept[0]?.sweep).toBeCloseTo(3 * HALF_PI);
  });

  it("handles the portion that wraps through zero", () => {
    const result = trimPeriodicCurve(null, [HALF_PI, 3 * HALF_PI], 0.1);

    expect(result?.removed.start).toBeCloseTo(3 * HALF_PI);
    expect(result?.removed.sweep).toBeCloseTo(Math.PI);
    expect(result?.kept[0]?.start).toBeCloseTo(HALF_PI);
  });

  it("needs two cuts on a closed curve", () => {
    expect(trimPeriodicCurve(null, [1], 2)).toBeNull();
  });

  it("splits an open span around the removed middle piece", () => {
    const result = trimPeriodicCurve({ start: 0, sweep: Math.PI }, [1, 2], 1.5);

    expect(result?.kept).toHaveLength(2);
    expect(result?.kept[0]).toMatchObject({ start: 0, sweep: 1 });
    expect(result?.kept[1]?.start).toBeCloseTo(2);
    expect(result?.kept[1]?.sweep).toBeCloseTo(Math.PI - 2);
  });

  it("trims the end piece of an open span", () => {
    const result = trimPeriodicCurve({ start: 0, sweep: Math.PI }, [1], 2.5);

    expect(result?.kept).toEqual([{ start: 0, sweep: 1 }]);
  });

  it("extends either end of a span to the nearest boundary without overlapping itself", () => {
    const span = { start: 0, sweep: HALF_PI };
    const end = extendPeriodicCurve(span, [Math.PI, 3 * HALF_PI], "end");
    const start = extendPeriodicCurve(span, [Math.PI, 3 * HALF_PI], "start");

    expect(end?.sweep).toBeCloseTo(Math.PI);
    expect(start?.start).toBeCloseTo(-HALF_PI);
    expect(start?.sweep).toBeCloseTo(Math.PI);
    expect(extendPeriodicCurve(span, [HALF_PI / 2], "end")).toBeNull();
  });

  it("finds curve parameters where a closed ellipse crosses a line", () => {
    const params = curveIntersectionParams(
      { kind: "ellipse", center: { x: 0, y: 0 }, radiusX: 20, radiusY: 10, rotation: 0 },
      [{ kind: "segment", a: { x: 0, y: -50 }, b: { x: 0, y: 50 } }]
    );

    expect(params.map((p) => wrapAngle(p))).toEqual([expect.closeTo(HALF_PI, 9), expect.closeTo(3 * HALF_PI, 9)]);
  });

  it("maps entities to spans and back, keeping entity fields", () => {
    const arc = { type: "arc" as const, id: "a", center: { x: 0, y: 0 }, radius: 5, startAngle: HALF_PI, endAngle: 0, clockwise: false };
    const { curve, span } = curveOfEntity(arc);
    expect(span?.start).toBeCloseTo(0);
    expect(span?.sweep).toBeCloseTo(HALF_PI);
    expect(curvePointAt(curve, span!.start).x).toBeCloseTo(5);

    const circle = { type: "circle" as const, id: "c", layerId: "L", center: { x: 1, y: 2 }, radius: 3 };
    expect(entityWithSpan(circle, { start: 0, sweep: 1 })).toMatchObject({ type: "arc", id: "c", layerId: "L", startAngle: 0, endAngle: 1, clockwise: true });

    const ellipse = { type: "ellipse" as const, id: "e", center: { x: 0, y: 0 }, radiusX: 4, radiusY: 2, rotation: 0 };
    expect(curveOfEntity(ellipse).span).toBeNull();
    expect(entityWithSpan(ellipse, { start: 1, sweep: 2 })).toMatchObject({ type: "ellipse", startAngle: 1, endAngle: 3 });
  });
});
