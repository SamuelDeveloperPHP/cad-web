import { describe, expect, it } from "vitest";
import { computeLineCurveFillet } from "./filletCurve";
import { distancePointToEllipse } from "./ellipse";

describe("line–curve fillet", () => {
  it("fillets a line with a circle from outside (circle stays whole)", () => {
    // Círculo r = 10 em (0, 0); linha horizontal y = 20; fillet r = 5 por fora entre os dois.
    const result = computeLineCurveFillet({
      line: { start: { x: -40, y: 20 }, end: { x: 40, y: 20 } },
      curve: { kind: "circle", center: { x: 0, y: 0 }, radius: 10 },
      span: null,
      radius: 5,
      linePick: { x: 30, y: 20 },
      curvePick: { x: 8, y: 6 }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Centro a 15 do centro do círculo (10 + 5) e a 5 da linha (y = 15): logo C = (0, 15).
    expect(result.arc.center.y).toBeCloseTo(15);
    expect(Math.hypot(result.arc.center.x, result.arc.center.y)).toBeCloseTo(15);
    expect(result.curveSpan).toBeNull();
    expect(result.tangentOnLine.y).toBeCloseTo(20);
  });

  it("fillets a line with an ellipse keeping tangency at both ends", () => {
    const ellipse = { kind: "ellipse" as const, center: { x: 0, y: 0 }, radiusX: 30, radiusY: 15, rotation: 0.2 };
    const result = computeLineCurveFillet({
      // A elipse vai até x ≈ 29,6; a linha em x = 35 fica a ~5,4, vão que um raio 4 alcança.
      line: { start: { x: 35, y: -40 }, end: { x: 35, y: 40 } },
      curve: ellipse,
      span: null,
      radius: 4,
      linePick: { x: 35, y: 30 },
      curvePick: { x: 20, y: 14 }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { center } = result.arc;
    expect(Math.abs(center.x - 35)).toBeCloseTo(4, 6);
    expect(distancePointToEllipse(center, { type: "ellipse", center: ellipse.center, radiusX: 30, radiusY: 15, rotation: 0.2 })).toBeCloseTo(4, 3);
    // O clique na linha foi acima da tangência: a ponta de cima (y = 40) é mantida.
    expect(result.line.end).toEqual({ x: 35, y: 40 });
  });

  it("trims an elliptical arc at the tangent point, keeping the picked side", () => {
    const result = computeLineCurveFillet({
      line: { start: { x: -50, y: 12 }, end: { x: 50, y: 12 } },
      curve: { kind: "ellipse", center: { x: 0, y: 0 }, radiusX: 30, radiusY: 15, rotation: 0 },
      span: { start: 0, sweep: Math.PI },
      radius: 3,
      linePick: { x: 40, y: 12 },
      curvePick: { x: 29.9, y: 1 }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.curveSpan?.start).toBe(0);
    expect(result.curveSpan!.sweep).toBeLessThan(Math.PI / 2);
    expect(result.line.end).toEqual({ x: 50, y: 12 });
  });

  it("fails when the radius cannot fit", () => {
    const result = computeLineCurveFillet({
      line: { start: { x: -50, y: 100 }, end: { x: 50, y: 100 } },
      curve: { kind: "circle", center: { x: 0, y: 0 }, radius: 10 },
      span: null,
      radius: 20,
      linePick: { x: 10, y: 100 },
      curvePick: { x: 0, y: 10 }
    });

    expect(result.ok).toBe(false);
  });
});
