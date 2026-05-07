import { describe, expect, it } from "vitest";
import {
  getPolylineTransformAtSample,
  samplePolylineByCount,
  validatePathArrayParams
} from "./pathArray";

describe("samplePolylineByCount", () => {
  it("places a single sample at the start of an open polyline", () => {
    const samples = samplePolylineByCount({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      closed: false
    }, 1);

    expect(samples).toHaveLength(1);
    expect(samples[0]?.point).toEqual({ x: 0, y: 0 });
    expect(samples[0]?.t).toBeCloseTo(0);
  });

  it("distributes samples from start to end on an open polyline including endpoints", () => {
    const samples = samplePolylineByCount({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      closed: false
    }, 5);

    expect(samples).toHaveLength(5);
    expect(samples[0]?.point.x).toBeCloseTo(0);
    expect(samples[2]?.point.x).toBeCloseTo(5);
    expect(samples[4]?.point.x).toBeCloseTo(10);
  });

  it("distributes samples on a closed polyline without duplicating start and end", () => {
    const samples = samplePolylineByCount({
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 }
      ],
      closed: true
    }, 4);

    expect(samples).toHaveLength(4);
    expect(samples[0]?.t).toBeCloseTo(0);
    // O ultimo sample deve ficar antes do fechamento, nunca igual ao primeiro.
    expect(samples[3]?.t).toBeLessThan(1);
  });

  it("returns a normalized tangent for each sample", () => {
    const samples = samplePolylineByCount({
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 10 }
      ],
      closed: false
    }, 3);

    for (const sample of samples) {
      const length = Math.hypot(sample.tangent.x, sample.tangent.y);
      expect(length).toBeCloseTo(1);
    }

    expect(samples[0]?.tangent.x).toBeCloseTo(0);
    expect(samples[0]?.tangent.y).toBeCloseTo(1);
  });

  it("samples by real length following an L-shaped polyline", () => {
    const samples = samplePolylineByCount({
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 6 }
      ],
      closed: false
    }, 3);

    expect(samples[0]?.point).toEqual({ x: 0, y: 0 });
    expect(samples[1]?.point.x).toBeCloseTo(4);
    expect(samples[1]?.point.y).toBeCloseTo(1);
    expect(samples[2]?.point).toEqual({ x: 4, y: 6 });
  });

  it("rejects invalid count values", () => {
    expect(() =>
      samplePolylineByCount(
        { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false },
        0
      )
    ).toThrow();

    expect(() =>
      samplePolylineByCount(
        { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false },
        2.5
      )
    ).toThrow();
  });

  it("rejects zero-length paths", () => {
    expect(() =>
      samplePolylineByCount(
        { points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], closed: false },
        3
      )
    ).toThrow();
  });
});

describe("getPolylineTransformAtSample", () => {
  it("returns a translate-only transform when alignToTangent is false", () => {
    const transform = getPolylineTransformAtSample(
      {
        point: { x: 10, y: 5 },
        tangent: { x: 1, y: 0 },
        distance: 10,
        t: 0.5
      },
      { x: 0, y: 0 },
      false
    );

    expect(transform.rotationRadians).toBeCloseTo(0);
    expect(transform.samplePoint).toEqual({ x: 10, y: 5 });
  });

  it("uses the tangent angle as rotation when alignToTangent is true", () => {
    const transform = getPolylineTransformAtSample(
      {
        point: { x: 0, y: 10 },
        tangent: { x: 0, y: 1 },
        distance: 10,
        t: 1
      },
      { x: 0, y: 0 },
      true
    );

    expect(transform.rotationRadians).toBeCloseTo(Math.PI / 2);
  });
});

describe("validatePathArrayParams", () => {
  it("rejects count below 1 and non-integer counts", () => {
    const polyline = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false };

    expect(
      validatePathArrayParams({ count: 0, basePoint: { x: 0, y: 0 }, alignToTangent: true }, polyline)
    ).toMatchObject({ ok: false });

    expect(
      validatePathArrayParams({ count: 2.5, basePoint: { x: 0, y: 0 }, alignToTangent: true }, polyline)
    ).toMatchObject({ ok: false });
  });

  it("rejects zero-length polylines", () => {
    expect(
      validatePathArrayParams(
        { count: 3, basePoint: { x: 0, y: 0 }, alignToTangent: true },
        { points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], closed: false }
      )
    ).toMatchObject({ ok: false });
  });

  it("accepts valid input", () => {
    expect(
      validatePathArrayParams(
        { count: 5, basePoint: { x: 1, y: 2 }, alignToTangent: false },
        { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false }
      )
    ).toEqual({ ok: true });
  });
});
