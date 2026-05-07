import { describe, expect, it } from "vitest";
import {
  getPathSourceLength,
  isPathSourceClosed,
  samplePathSourceByCount,
  validatePathSource,
  type PathSource
} from "./pathSource";

describe("getPathSourceLength", () => {
  it("returns segment length for line paths", () => {
    expect(getPathSourceLength({ type: "line", start: { x: 0, y: 0 }, end: { x: 3, y: 4 } })).toBeCloseTo(5);
  });

  it("returns full circumference for circle paths", () => {
    expect(getPathSourceLength({ type: "circle", center: { x: 0, y: 0 }, radius: 5 })).toBeCloseTo(2 * Math.PI * 5);
  });

  it("returns sweep length for arc paths", () => {
    const length = getPathSourceLength({
      type: "arc",
      center: { x: 0, y: 0 },
      radius: 4,
      startAngle: 0,
      endAngle: Math.PI / 2,
      clockwise: true
    });

    // O sweep curto de 0 a 90 graus em sentido CCW (clockwise=true neste codebase) cobre 4 * (pi/2).
    expect(length).toBeCloseTo(4 * Math.PI / 2);
  });

  it("delegates to polyline length helper", () => {
    expect(
      getPathSourceLength({ type: "polyline", points: [{ x: 0, y: 0 }, { x: 6, y: 8 }], closed: false })
    ).toBeCloseTo(10);
  });
});

describe("isPathSourceClosed", () => {
  it("treats circles as closed", () => {
    expect(isPathSourceClosed({ type: "circle", center: { x: 0, y: 0 }, radius: 1 })).toBe(true);
  });

  it("treats lines and arcs as open", () => {
    expect(isPathSourceClosed({ type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } })).toBe(false);
    expect(
      isPathSourceClosed({
        type: "arc",
        center: { x: 0, y: 0 },
        radius: 1,
        startAngle: 0,
        endAngle: Math.PI,
        clockwise: false
      })
    ).toBe(false);
  });

  it("respects polyline closed flag", () => {
    expect(
      isPathSourceClosed({ type: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true })
    ).toBe(true);
  });
});

describe("samplePathSourceByCount", () => {
  it("samples a line including start and end for count > 1", () => {
    const source: PathSource = { type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const samples = samplePathSourceByCount(source, 3);

    expect(samples).toHaveLength(3);
    expect(samples[0]?.point).toEqual({ x: 0, y: 0 });
    expect(samples[1]?.point).toEqual({ x: 5, y: 0 });
    expect(samples[2]?.point).toEqual({ x: 10, y: 0 });
    expect(samples[0]?.tangent).toEqual({ x: 1, y: 0 });
  });

  it("samples a circle without duplicating start and end", () => {
    const source: PathSource = { type: "circle", center: { x: 0, y: 0 }, radius: 1 };
    const samples = samplePathSourceByCount(source, 4);

    expect(samples).toHaveLength(4);
    expect(samples[0]?.point.x).toBeCloseTo(1);
    expect(samples[0]?.point.y).toBeCloseTo(0);
    expect(samples[1]?.point.x).toBeCloseTo(0);
    expect(samples[1]?.point.y).toBeCloseTo(1);
    // O quarto sample fica antes do fechamento, nunca igual ao primeiro.
    expect(samples[3]?.t).toBeLessThan(1);
  });

  it("samples an arc following the sweep direction", () => {
    const source: PathSource = {
      type: "arc",
      center: { x: 0, y: 0 },
      radius: 1,
      startAngle: 0,
      endAngle: Math.PI / 2,
      clockwise: true
    };
    const samples = samplePathSourceByCount(source, 3);

    expect(samples).toHaveLength(3);
    expect(samples[0]?.point.x).toBeCloseTo(1);
    expect(samples[0]?.point.y).toBeCloseTo(0);
    expect(samples[2]?.point.x).toBeCloseTo(0);
    expect(samples[2]?.point.y).toBeCloseTo(1);
  });

  it("returns normalized tangents for circles", () => {
    const samples = samplePathSourceByCount(
      { type: "circle", center: { x: 0, y: 0 }, radius: 5 },
      4
    );

    for (const sample of samples) {
      const length = Math.hypot(sample.tangent.x, sample.tangent.y);
      expect(length).toBeCloseTo(1);
    }
  });

  it("places a single sample at the start of any source", () => {
    const samples = samplePathSourceByCount(
      { type: "line", start: { x: 1, y: 1 }, end: { x: 5, y: 5 } },
      1
    );

    expect(samples).toHaveLength(1);
    expect(samples[0]?.point).toEqual({ x: 1, y: 1 });
  });

  it("rejects invalid count and zero-length sources", () => {
    expect(() =>
      samplePathSourceByCount({ type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, 0)
    ).toThrow();

    expect(() =>
      samplePathSourceByCount({ type: "circle", center: { x: 0, y: 0 }, radius: 0 }, 4)
    ).toThrow();
  });
});

describe("validatePathSource", () => {
  it("rejects polylines with fewer than two points", () => {
    expect(
      validatePathSource({ type: "polyline", points: [{ x: 0, y: 0 }], closed: false })
    ).toMatchObject({ ok: false });
  });

  it("rejects circles with non-positive radius", () => {
    expect(
      validatePathSource({ type: "circle", center: { x: 0, y: 0 }, radius: 0 })
    ).toMatchObject({ ok: false });
  });

  it("accepts a valid arc", () => {
    expect(
      validatePathSource({
        type: "arc",
        center: { x: 0, y: 0 },
        radius: 1,
        startAngle: 0,
        endAngle: Math.PI,
        clockwise: false
      })
    ).toEqual({ ok: true });
  });
});
