import { describe, expect, it } from "vitest";
import { computeLineLineChamfer } from "./chamfer";

describe("chamfer geometry", () => {
  it("computes a symmetric chamfer between two perpendicular lines", () => {
    const result = computeLineLineChamfer({
      line1: { type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
      line2: { type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } },
      distance1: 3,
      distance2: 3,
      pickPoint1: { x: -6, y: 0 },
      pickPoint2: { x: 0, y: 6 }
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.vertex.x).toBeCloseTo(0);
    expect(result.vertex.y).toBeCloseTo(0);
    expect(result.cutPoint1.x).toBeCloseTo(-3);
    expect(result.cutPoint1.y).toBeCloseTo(0);
    expect(result.cutPoint2.x).toBeCloseTo(0);
    expect(result.cutPoint2.y).toBeCloseTo(3);
    expect(result.line1Result.start.x).toBeCloseTo(-10);
    expect(result.line1Result.end.x).toBeCloseTo(-3);
    expect(result.line2Result.start.y).toBeCloseTo(3);
    expect(result.line2Result.end.y).toBeCloseTo(10);
    expect(result.chamferLine.start.x).toBeCloseTo(-3);
    expect(result.chamferLine.start.y).toBeCloseTo(0);
    expect(result.chamferLine.end.x).toBeCloseTo(0);
    expect(result.chamferLine.end.y).toBeCloseTo(3);
  });

  it("computes an asymmetric chamfer with distinct distances", () => {
    const result = computeLineLineChamfer({
      line1: { type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
      line2: { type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } },
      distance1: 4,
      distance2: 2,
      pickPoint1: { x: -6, y: 0 },
      pickPoint2: { x: 0, y: 6 }
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.cutPoint1.x).toBeCloseTo(-4);
    expect(result.cutPoint2.y).toBeCloseTo(2);
    expect(result.line1Result.end.x).toBeCloseTo(-4);
    expect(result.line2Result.start.y).toBeCloseTo(2);
  });

  it("rejects parallel lines", () => {
    const result = computeLineLineChamfer({
      line1: { type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      line2: { type: "line", start: { x: 0, y: 5 }, end: { x: 10, y: 5 } },
      distance1: 2,
      distance2: 2,
      pickPoint1: { x: 5, y: 0 },
      pickPoint2: { x: 5, y: 5 }
    });

    expect(result).toMatchObject({ ok: false });
  });

  it("rejects collinear lines", () => {
    const result = computeLineLineChamfer({
      line1: { type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      line2: { type: "line", start: { x: 12, y: 0 }, end: { x: 22, y: 0 } },
      distance1: 1,
      distance2: 1,
      pickPoint1: { x: 5, y: 0 },
      pickPoint2: { x: 17, y: 0 }
    });

    expect(result).toMatchObject({ ok: false });
  });

  it("rejects non-positive distances", () => {
    expect(
      computeLineLineChamfer({
        line1: { type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
        line2: { type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } },
        distance1: 0,
        distance2: 2,
        pickPoint1: { x: -6, y: 0 },
        pickPoint2: { x: 0, y: 6 }
      })
    ).toMatchObject({ ok: false });

    expect(
      computeLineLineChamfer({
        line1: { type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
        line2: { type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } },
        distance1: 2,
        distance2: -1,
        pickPoint1: { x: -6, y: 0 },
        pickPoint2: { x: 0, y: 6 }
      })
    ).toMatchObject({ ok: false });
  });

  it("respects pick point side selecting the opposite branch", () => {
    // O ramo escolhido depende do lado clicado de cada linha.
    const result = computeLineLineChamfer({
      line1: { type: "line", start: { x: -10, y: 0 }, end: { x: 10, y: 0 } },
      line2: { type: "line", start: { x: 0, y: -10 }, end: { x: 0, y: 10 } },
      distance1: 2,
      distance2: 2,
      pickPoint1: { x: 5, y: 0 },
      pickPoint2: { x: 0, y: 5 }
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.cutPoint1.x).toBeCloseTo(2);
    expect(result.cutPoint1.y).toBeCloseTo(0);
    expect(result.cutPoint2.x).toBeCloseTo(0);
    expect(result.cutPoint2.y).toBeCloseTo(2);
    expect(result.line1Result.start.x).toBeCloseTo(2);
    expect(result.line1Result.end.x).toBeCloseTo(10);
    expect(result.line2Result.start.y).toBeCloseTo(2);
    expect(result.line2Result.end.y).toBeCloseTo(10);
  });

  it("extends a short line up to the cut point when the distance exceeds its length", () => {
    // O calculo aceita extensao do ramo escolhido ate o ponto de corte calculado.
    const result = computeLineLineChamfer({
      line1: { type: "line", start: { x: -2, y: 0 }, end: { x: 0, y: 0 } },
      line2: { type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 2 } },
      distance1: 5,
      distance2: 1,
      pickPoint1: { x: -1, y: 0 },
      pickPoint2: { x: 0, y: 1 }
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.cutPoint1.x).toBeCloseTo(-5);
    expect(result.line1Result.end.x).toBeCloseTo(-5);
  });
});
