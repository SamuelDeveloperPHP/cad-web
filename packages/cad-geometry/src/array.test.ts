import { describe, expect, it } from "vitest";
import {
  buildRectangularArrayOffsets,
  countRectangularArrayPositions,
  validateRectangularArrayParams
} from "./array";

describe("rectangular array offsets", () => {
  it("excludes the origin by default and orders cells row-major", () => {
    const offsets = buildRectangularArrayOffsets({ rows: 2, columns: 3, spacingX: 10, spacingY: 5 });

    expect(offsets).toEqual([
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 20, y: 5 }
    ]);
  });

  it("includes the origin when explicitly requested", () => {
    const offsets = buildRectangularArrayOffsets({
      rows: 1,
      columns: 2,
      spacingX: 4,
      spacingY: 0,
      includeOrigin: true
    });

    expect(offsets).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 }
    ]);
  });

  it("supports negative spacing in both axes", () => {
    const offsets = buildRectangularArrayOffsets({ rows: 2, columns: 2, spacingX: -3, spacingY: -7 });

    expect(offsets).toEqual([
      { x: -3, y: 0 },
      { x: 0, y: -7 },
      { x: -3, y: -7 }
    ]);
  });

  it("allows zero in one axis when the other is non zero", () => {
    const onlyVertical = buildRectangularArrayOffsets({ rows: 3, columns: 1, spacingX: 0, spacingY: 5 });
    const onlyHorizontal = buildRectangularArrayOffsets({ rows: 1, columns: 3, spacingX: 8, spacingY: 0 });

    expect(onlyVertical).toEqual([
      { x: 0, y: 5 },
      { x: 0, y: 10 }
    ]);

    expect(onlyHorizontal).toEqual([
      { x: 8, y: 0 },
      { x: 16, y: 0 }
    ]);
  });

  it("rejects fractional or non-positive rows and columns", () => {
    expect(validateRectangularArrayParams({ rows: 0, columns: 2, spacingX: 1, spacingY: 1 })).toMatchObject({ ok: false });
    expect(validateRectangularArrayParams({ rows: 1.5, columns: 2, spacingX: 1, spacingY: 1 })).toMatchObject({ ok: false });
    expect(validateRectangularArrayParams({ rows: 2, columns: -1, spacingX: 1, spacingY: 1 })).toMatchObject({ ok: false });
  });

  it("rejects when both spacings are zero", () => {
    const validation = validateRectangularArrayParams({ rows: 3, columns: 3, spacingX: 0, spacingY: 0 });

    expect(validation).toMatchObject({ ok: false });
  });

  it("counts rows*columns - 1 new positions", () => {
    expect(countRectangularArrayPositions({ rows: 3, columns: 4, spacingX: 1, spacingY: 1 })).toBe(11);
    expect(countRectangularArrayPositions({ rows: 1, columns: 1, spacingX: 1, spacingY: 1 })).toBe(0);
  });

  it("throws when building offsets with invalid params", () => {
    expect(() => buildRectangularArrayOffsets({ rows: 2, columns: 2, spacingX: 0, spacingY: 0 })).toThrow();
  });
});
