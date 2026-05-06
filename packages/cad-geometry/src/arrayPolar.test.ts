import { describe, expect, it } from "vitest";
import {
  buildPolarArrayAngles,
  countPolarArrayCopies,
  isFullCircleAngle,
  rotatePointAroundCenter,
  validatePolarArrayParams
} from "./arrayPolar";

describe("polar array angles", () => {
  it("distributes 6 items over a full circle without repeating the origin", () => {
    const angles = buildPolarArrayAngles({ count: 6, fillAngleRadians: Math.PI * 2 });

    expect(angles.length).toBe(5);

    const expectedStep = (Math.PI * 2) / 6;

    for (let index = 0; index < angles.length; index += 1) {
      expect(angles[index]).toBeCloseTo(expectedStep * (index + 1));
    }
  });

  it("uses count - 1 intervals for partial sweeps", () => {
    const angles = buildPolarArrayAngles({ count: 4, fillAngleRadians: Math.PI });

    expect(angles).toHaveLength(3);
    expect(angles[0]).toBeCloseTo(Math.PI / 3);
    expect(angles[1]).toBeCloseTo((Math.PI / 3) * 2);
    expect(angles[2]).toBeCloseTo(Math.PI);
  });

  it("supports negative fill angles for clockwise arrays", () => {
    const angles = buildPolarArrayAngles({ count: 3, fillAngleRadians: -Math.PI });

    expect(angles).toHaveLength(2);
    expect(angles[0]).toBeCloseTo(-Math.PI / 2);
    expect(angles[1]).toBeCloseTo(-Math.PI);
  });

  it("rejects count below two", () => {
    expect(validatePolarArrayParams({ count: 1, fillAngleRadians: Math.PI })).toMatchObject({ ok: false });
    expect(validatePolarArrayParams({ count: 0, fillAngleRadians: Math.PI })).toMatchObject({ ok: false });
    expect(validatePolarArrayParams({ count: 2.5, fillAngleRadians: Math.PI })).toMatchObject({ ok: false });
  });

  it("rejects zero fill angle", () => {
    expect(validatePolarArrayParams({ count: 4, fillAngleRadians: 0 })).toMatchObject({ ok: false });
  });

  it("counts new copies as count - 1", () => {
    expect(countPolarArrayCopies({ count: 6, fillAngleRadians: Math.PI * 2 })).toBe(5);
    expect(countPolarArrayCopies({ count: 1, fillAngleRadians: Math.PI })).toBe(0);
  });

  it("detects full circle within tolerance", () => {
    expect(isFullCircleAngle(Math.PI * 2)).toBe(true);
    expect(isFullCircleAngle(-Math.PI * 2)).toBe(true);
    expect(isFullCircleAngle(Math.PI * 2 + 1e-10)).toBe(true);
    expect(isFullCircleAngle(Math.PI)).toBe(false);
  });

  it("respects an explicit fullCircle flag even with custom angles", () => {
    const angles = buildPolarArrayAngles({ count: 4, fillAngleRadians: Math.PI * 2, fullCircle: true });

    expect(angles).toHaveLength(3);
    expect(angles[0]).toBeCloseTo(Math.PI / 2);
  });
});

describe("rotatePointAroundCenter", () => {
  it("rotates a point 90 degrees counterclockwise around the origin", () => {
    const result = rotatePointAroundCenter({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);

    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(10);
  });

  it("rotates around an arbitrary center", () => {
    const result = rotatePointAroundCenter({ x: 6, y: 0 }, { x: 5, y: 0 }, Math.PI);

    expect(result.x).toBeCloseTo(4);
    expect(result.y).toBeCloseTo(0);
  });
});
