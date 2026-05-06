import { describe, expect, it } from "vitest";
import { arcBoundingBox, computeLineLineFillet, distancePointToArc } from "./arc";

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
