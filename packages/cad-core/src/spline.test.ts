import { evaluateBezierChain, fitPointsToBezierChain } from "@cad-web/cad-geometry";
import { describe, expect, it } from "vitest";
import {
  cloneCadEntityWithOffset,
  entityBoundingBox,
  mirrorEntity,
  moveEntity,
  rotateEntity,
  scaleEntity,
  stretchEntity,
  type SplineEntity
} from "./index";

const fitPoints = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
const spline: SplineEntity = {
  id: "s",
  layerId: "layer_0",
  type: "spline",
  fitPoints,
  closed: false,
  controlPoints: fitPointsToBezierChain(fitPoints, false)
};

describe("SplineEntity transforms", () => {
  it("moves control and fit points", () => {
    const moved = moveEntity(spline, { x: 5, y: -1 }) as SplineEntity;

    expect(moved.fitPoints![1]).toEqual({ x: 15, y: 9 });
    expect(moved.controlPoints[0]).toEqual({ x: 5, y: -1 });
  });

  it("keeps the fit relationship under rotate, scale and mirror (similarities)", () => {
    const transforms = [
      rotateEntity(spline, { x: 3, y: 4 }, 0.7),
      scaleEntity(spline, { x: 1, y: 1 }, 2.5),
      mirrorEntity(spline, { x: 0, y: 0 }, { x: 1, y: 2 })!
    ] as SplineEntity[];

    for (const transformed of transforms) {
      const refit = fitPointsToBezierChain(transformed.fitPoints!, false);
      transformed.controlPoints.forEach((point, index) => {
        expect(point.x).toBeCloseTo(refit[index]!.x, 9);
        expect(point.y).toBeCloseTo(refit[index]!.y, 9);
      });
    }
  });

  it("stretches fit points inside the window and recomputes the curve", () => {
    const stretched = stretchEntity(spline, { minX: 15, minY: -1, maxX: 25, maxY: 1 }, { x: 5, y: 0 }) as SplineEntity;
    const end = evaluateBezierChain(stretched.controlPoints, 2);

    expect(stretched.fitPoints![2]).toEqual({ x: 25, y: 0 });
    expect(end.x).toBeCloseTo(25, 12);
    expect(stretchEntity(spline, { minX: 100, minY: 100, maxX: 200, maxY: 200 }, { x: 5, y: 0 })).toBe(spline);
  });

  it("clones for arrays and computes an exact bounding box", () => {
    expect((cloneCadEntityWithOffset(spline, { x: 1, y: 1 }, "copy") as SplineEntity).fitPoints![0]).toEqual({ x: 1, y: 1 });
    const box = entityBoundingBox(spline);
    expect(box.minX).toBeCloseTo(0, 12);
    expect(box.maxX).toBeCloseTo(20, 12);
    expect(box.maxY).toBeGreaterThanOrEqual(10);
  });
});
