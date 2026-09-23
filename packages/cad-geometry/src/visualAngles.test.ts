import { describe, expect, it } from "vitest";
import {
  arcAnglesFromVisual,
  arcVisualAngles,
  ellipseArcVisualAngles,
  normalizeVisualDegrees,
  visualDegreesToWorldRadians,
  worldRadiansToVisualDegrees
} from "./visualAngles";

const deg = (value: number) => (value * Math.PI) / 180;

describe("visual angle convention (AutoCAD, Y up)", () => {
  it("negates angles between world and visual", () => {
    expect(visualDegreesToWorldRadians(0)).toBe(0);
    expect(visualDegreesToWorldRadians(90)).toBeCloseTo(-Math.PI / 2);
    expect(worldRadiansToVisualDegrees(-Math.PI / 2)).toBeCloseTo(90);
    expect(worldRadiansToVisualDegrees(Math.PI / 2)).toBeCloseTo(270);
    expect(normalizeVisualDegrees(-30)).toBeCloseTo(330);
    expect(normalizeVisualDegrees(360)).toBe(0);
  });

  it("describes a screen-counterclockwise arc from its stored start", () => {
    // clockwise = false: ângulo do mundo decrescente = anti-horário na tela. De 0 a −90° (mundo) = 0° a 90° visual.
    const angles = arcVisualAngles({ startAngle: 0, endAngle: deg(-90), clockwise: false });

    expect(angles.start).toBeCloseTo(0);
    expect(angles.end).toBeCloseTo(90);
    expect(angles.sweep).toBeCloseTo(90);
  });

  it("swaps start and end for a screen-clockwise arc", () => {
    // clockwise = true: de 0 a 90° no mundo = horário na tela, ou seja o arco visual de 270° a 360°.
    const angles = arcVisualAngles({ startAngle: 0, endAngle: deg(90), clockwise: true });

    expect(angles.start).toBeCloseTo(270);
    expect(angles.end).toBeCloseTo(0);
    expect(angles.sweep).toBeCloseTo(90);
  });

  it("round trips visual angles back to world angles preserving the stored direction", () => {
    for (const clockwise of [true, false]) {
      const world = arcAnglesFromVisual(clockwise, 30, 120);
      const visual = arcVisualAngles({ ...world, clockwise });

      expect(visual.start).toBeCloseTo(30);
      expect(visual.end).toBeCloseTo(120);
      expect(visual.sweep).toBeCloseTo(90);
    }
  });

  it("measures ellipse arc angles from the local X axis with real (not parametric) angles", () => {
    // Circunferência degenerada (rx = ry): ângulo real = paramétrico. Varredura no mundo de 0 a 90° = visual 270°→0°.
    const circular = ellipseArcVisualAngles({ radiusX: 10, radiusY: 10, startAngle: 0, endAngle: deg(90) });
    expect(circular.start).toBeCloseTo(270);
    expect(circular.end).toBeCloseTo(0);
    expect(circular.sweep).toBeCloseTo(90);

    // Elipse achatada: o parâmetro de 45° fica num ângulo real menor que 45° (atan(ry/rx)).
    const flat = ellipseArcVisualAngles({ radiusX: 20, radiusY: 10, startAngle: deg(-45), endAngle: 0 });
    expect(flat.start).toBeCloseTo(0);
    expect(flat.end).toBeCloseTo((Math.atan(0.5) * 180) / Math.PI);
  });
});

describe("ellipse arc visual angles inverse", () => {
  it("round trips visual angles through parameters", async () => {
    const { ellipseArcParamsFromVisual } = await import("./visualAngles");
    const params = ellipseArcParamsFromVisual(30, 12, 20, 200);
    const visual = ellipseArcVisualAngles({ radiusX: 30, radiusY: 12, ...params });

    expect(visual.start).toBeCloseTo(20, 9);
    expect(visual.end).toBeCloseTo(200, 9);
    expect(visual.sweep).toBeCloseTo(180, 9);
  });
});
