import { describe, expect, it } from "vitest";
import type { IntersectPrimitive } from "./intersections";
import { extractPathPiece, pathCutDistances, pathDistanceAtPoint, trimPolylinePath } from "./pathTrim";

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const verticalAt = (x: number): IntersectPrimitive => ({ kind: "segment", a: { x, y: -50 }, b: { x, y: 50 } });

describe("polyline path trim", () => {
  it("finds cuts along a closed path, including the closing segment", () => {
    // A reta x = 5 corta o lado de baixo (s = 5) e o de cima (s = 25).
    expect(pathCutDistances(square, true, [verticalAt(5)])).toEqual([5, 25]);
  });

  it("ignores the ends of an open path as cuts", () => {
    expect(pathCutDistances([{ x: 0, y: 0 }, { x: 10, y: 0 }], false, [verticalAt(0), verticalAt(4)])).toEqual([4]);
  });

  it("trims a closed square into an open polyline", () => {
    const cuts = pathCutDistances(square, true, [verticalAt(5)]);
    const result = trimPolylinePath(square, true, cuts, pathDistanceAtPoint(square, true, { x: 10, y: 5 }));

    // O lado direito sai; sobra a metade esquerda, de (5,10) a (5,0) passando por (0,10) e (0,0).
    expect(result?.kept).toEqual([[{ x: 5, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }, { x: 5, y: 0 }]]);
    expect(result?.removed).toEqual([{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }]);
  });

  it("handles the trimmed portion that crosses the start of a closed path", () => {
    const cuts = pathCutDistances(square, true, [verticalAt(5)]);
    const result = trimPolylinePath(square, true, cuts, pathDistanceAtPoint(square, true, { x: 0, y: 5 }));

    expect(result?.kept).toEqual([[{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }]]);
  });

  it("needs two cuts on a closed path", () => {
    expect(trimPolylinePath(square, true, [5], 20)).toBeNull();
  });

  it("splits an open path around the removed middle piece", () => {
    const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const cuts = pathCutDistances(path, false, [verticalAt(4), { kind: "segment", a: { x: 0, y: 6 }, b: { x: 20, y: 6 } }]);
    const result = trimPolylinePath(path, false, cuts, pathDistanceAtPoint(path, false, { x: 10, y: 2 }));

    expect(cuts).toEqual([4, 16]);
    expect(result?.kept).toEqual([[{ x: 0, y: 0 }, { x: 4, y: 0 }], [{ x: 10, y: 6 }, { x: 10, y: 10 }]]);
  });

  it("extracts wrapping pieces without duplicated vertices", () => {
    expect(extractPathPiece(square, true, 35, 5)).toEqual([{ x: 0, y: 5 }, { x: 0, y: 0 }, { x: 5, y: 0 }]);
  });
});
