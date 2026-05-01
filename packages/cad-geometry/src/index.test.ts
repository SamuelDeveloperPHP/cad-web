import { describe, expect, it } from "vitest";
import {
  boundingBoxContainsPoint,
  boundingBoxFromPoints,
  createCircle,
  createSegment,
  distance,
  distancePointToSegment,
  getEntityBoundingBox,
  nearlyEqual,
  pointsNearlyEqual,
  projectPointOnSegment,
  rotationMatrix,
  transformPoint,
  translationMatrix,
  unionBoundingBoxes
} from "./index";

describe("cad-geometry tolerance", () => {
  it("compares floating point values with engineering tolerance", () => {
    expect(nearlyEqual(0.1 + 0.2, 0.3)).toBe(true);
    expect(nearlyEqual(0.1, 0.2)).toBe(false);
  });

  it("compares points with tolerance", () => {
    expect(
      pointsNearlyEqual(
        { x: 10, y: 20 },
        { x: 10 + 1e-10, y: 20 - 1e-10 }
      )
    ).toBe(true);
  });
});

describe("cad-geometry vectors", () => {
  it("calculates euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("cad-geometry matrices", () => {
  it("translates points", () => {
    expect(transformPoint({ x: 2, y: 3 }, translationMatrix(10, -5))).toEqual({
      x: 12,
      y: -2
    });
  });

  it("rotates points around the world origin", () => {
    const rotated = transformPoint({ x: 1, y: 0 }, rotationMatrix(Math.PI / 2));

    expect(pointsNearlyEqual(rotated, { x: 0, y: 1 })).toBe(true);
  });
});

describe("cad-geometry bounding boxes", () => {
  it("creates bounding boxes from points", () => {
    expect(
      boundingBoxFromPoints([
        { x: 3, y: -1 },
        { x: -2, y: 10 },
        { x: 5, y: 4 }
      ])
    ).toEqual({
      minX: -2,
      minY: -1,
      maxX: 5,
      maxY: 10
    });
  });

  it("unites bounding boxes and checks containment", () => {
    const box = unionBoundingBoxes(
      { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      { minX: -5, minY: 2, maxX: 4, maxY: 20 }
    );

    expect(box).toEqual({ minX: -5, minY: 0, maxX: 10, maxY: 20 });
    expect(boundingBoxContainsPoint(box, { x: 0, y: 10 })).toBe(true);
    expect(boundingBoxContainsPoint(box, { x: 20, y: 10 })).toBe(false);
  });
});

describe("cad-geometry entities", () => {
  it("creates serializable segment geometry", () => {
    const segment = createSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, "seg_001");

    expect(JSON.parse(JSON.stringify(segment))).toEqual(segment);
  });

  it("calculates circle bounding box", () => {
    expect(getEntityBoundingBox(createCircle({ x: 10, y: 20 }, 5))).toEqual({
      minX: 5,
      minY: 15,
      maxX: 15,
      maxY: 25
    });
  });
});

describe("cad-geometry point projection", () => {
  it("projects a point on a segment", () => {
    const projection = projectPointOnSegment(
      { x: 3, y: 4 },
      { x: 0, y: 0 },
      { x: 10, y: 0 }
    );

    expect(projection.point).toEqual({ x: 3, y: 0 });
    expect(projection.parameter).toBe(0.3);
    expect(projection.distance).toBe(4);
  });

  it("clamps projection to segment endpoints", () => {
    expect(distancePointToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
  });
});
