import { describe, expect, it } from "vitest";
import {
  arcBoundingBox,
  arcEndPoint,
  arcSweepAngle,
  computeArcFromCenterStartEnd,
  computeArcFromThreePoints,
  computeLineLineFillet,
  distancePointToArc,
  isAngleOnArc
} from "./arc";

describe("arc geometry", () => {
  it("computes a line-line fillet with tangent points and center", () => {
    const result = computeLineLineFillet({
      line1: { type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
      line2: { type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } },
      radius: 2,
      pickPoint1: { x: -6, y: 0 },
      pickPoint2: { x: 0, y: 6 }
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.center.x).toBeCloseTo(-2);
    expect(result.center.y).toBeCloseTo(2);
    expect(result.tangentPoint1.x).toBeCloseTo(-2);
    expect(result.tangentPoint1.y).toBeCloseTo(0);
    expect(result.tangentPoint2.x).toBeCloseTo(0);
    expect(result.tangentPoint2.y).toBeCloseTo(2);
    expect(result.line1Result.end.x).toBeCloseTo(-2);
    expect(result.line2Result.start.y).toBeCloseTo(2);
    expect(result.clockwise).toBe(true);
  });

  it("rejects parallel lines and oversized radius values", () => {
    expect(
      computeLineLineFillet({
        line1: { type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        line2: { type: "line", start: { x: 0, y: 2 }, end: { x: 10, y: 2 } },
        radius: 1,
        pickPoint1: { x: 5, y: 0 },
        pickPoint2: { x: 5, y: 2 }
      })
    ).toMatchObject({ ok: false });

    expect(
      computeLineLineFillet({
        line1: { type: "line", start: { x: -2, y: 0 }, end: { x: 0, y: 0 } },
        line2: { type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 2 } },
        radius: 10,
        pickPoint1: { x: -1, y: 0 },
        pickPoint2: { x: 0, y: 1 }
      })
    ).toMatchObject({ ok: false, reason: "Radius too large or invalid." });
  });

  it("computes arc bounds and point distance on the arc sweep", () => {
    const arc = {
      type: "arc" as const,
      center: { x: -2, y: 2 },
      radius: 2,
      startAngle: -Math.PI / 2,
      endAngle: 0,
      clockwise: true
    };

    const bounds = arcBoundingBox(arc);

    expect(bounds.minX).toBeCloseTo(-2);
    expect(bounds.minY).toBeCloseTo(0);
    expect(bounds.maxX).toBeCloseTo(0);
    expect(bounds.maxY).toBeCloseTo(2);
    expect(distancePointToArc({ x: -1, y: 2 - Math.sqrt(3) }, arc)).toBeCloseTo(0);
  });
});

describe("arc construction", () => {
  it("builds an arc through three points with the middle point on the arc", () => {
    const result = computeArcFromThreePoints({ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.arc.center.x).toBeCloseTo(0);
    expect(result.arc.center.y).toBeCloseTo(0);
    expect(result.arc.radius).toBeCloseTo(10);
    expect(isAngleOnArc(Math.PI / 2, result.arc.startAngle, result.arc.endAngle, result.arc.clockwise)).toBe(true);
    expect(isAngleOnArc(-Math.PI / 2, result.arc.startAngle, result.arc.endAngle, result.arc.clockwise)).toBe(false);
    expect(distancePointToArc({ x: 0, y: 10 }, result.arc)).toBeCloseTo(0);
  });

  it("chooses the opposite sweep when the middle point is below the chord", () => {
    const result = computeArcFromThreePoints({ x: 10, y: 0 }, { x: 0, y: -10 }, { x: -10, y: 0 });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(isAngleOnArc(-Math.PI / 2, result.arc.startAngle, result.arc.endAngle, result.arc.clockwise)).toBe(true);
    expect(isAngleOnArc(Math.PI / 2, result.arc.startAngle, result.arc.endAngle, result.arc.clockwise)).toBe(false);
  });

  it("solves an off-center three point arc", () => {
    const result = computeArcFromThreePoints({ x: 3, y: 4 }, { x: 8, y: 9 }, { x: 13, y: 4 });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.arc.center.x).toBeCloseTo(8);
    expect(result.arc.center.y).toBeCloseTo(4);
    expect(result.arc.radius).toBeCloseTo(5);
  });

  it("rejects collinear points", () => {
    const result = computeArcFromThreePoints({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.reason).toBe("Points are collinear.");
  });

  it("rejects coincident points", () => {
    const result = computeArcFromThreePoints({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 });

    expect(result.ok).toBe(false);
  });

  it("builds an arc from center, start and end point with the end projected onto the circle", () => {
    const result = computeArcFromCenterStartEnd({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 25 });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.arc.radius).toBeCloseTo(10);
    expect(result.arc.startAngle).toBeCloseTo(0);
    expect(result.arc.endAngle).toBeCloseTo(Math.PI / 2);
    expect(result.arc.clockwise).toBe(true);
    expect(arcSweepAngle(result.arc.startAngle, result.arc.endAngle, result.arc.clockwise)).toBeCloseTo(Math.PI / 2);
    expect(arcEndPoint(result.arc).x).toBeCloseTo(0);
    expect(arcEndPoint(result.arc).y).toBeCloseTo(10);
  });

  it("rejects a zero radius arc from center and start", () => {
    const result = computeArcFromCenterStartEnd({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 5 });

    expect(result.ok).toBe(false);
  });

  it("rejects a zero sweep arc from center, start and end", () => {
    const result = computeArcFromCenterStartEnd({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 });

    expect(result.ok).toBe(false);
  });
});
