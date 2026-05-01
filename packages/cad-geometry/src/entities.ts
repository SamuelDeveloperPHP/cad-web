import { boundingBoxFromPoints, expandBoundingBox } from "./bounding-box";
import type { BoundingBox, GeometryEntity, Point2D } from "./types";

export function createLine(start: Point2D, end: Point2D, id?: string): GeometryEntity {
  return {
    type: "line",
    ...(id === undefined ? {} : { id }),
    start,
    end
  };
}

export function createSegment(start: Point2D, end: Point2D, id?: string): GeometryEntity {
  return {
    type: "segment",
    ...(id === undefined ? {} : { id }),
    start,
    end
  };
}

export function createCircle(center: Point2D, radius: number, id?: string): GeometryEntity {
  assertPositiveRadius(radius);

  return {
    type: "circle",
    ...(id === undefined ? {} : { id }),
    center,
    radius
  };
}

export function getEntityBoundingBox(entity: GeometryEntity): BoundingBox {
  switch (entity.type) {
    case "line":
    case "segment":
      return boundingBoxFromPoints([entity.start, entity.end]);
    case "polyline":
      return boundingBoxFromPoints(entity.points);
    case "rectangle":
      return boundingBoxFromPoints(getRectangleCorners(entity.origin, entity.width, entity.height));
    case "circle":
      return expandBoundingBox(
        {
          minX: entity.center.x,
          minY: entity.center.y,
          maxX: entity.center.x,
          maxY: entity.center.y
        },
        entity.radius
      );
    case "arc":
      return expandBoundingBox(
        {
          minX: entity.center.x,
          minY: entity.center.y,
          maxX: entity.center.x,
          maxY: entity.center.y
        },
        entity.radius
      );
  }
}

function getRectangleCorners(origin: Point2D, width: number, height: number): ReadonlyArray<Point2D> {
  return [
    origin,
    { x: origin.x + width, y: origin.y },
    { x: origin.x + width, y: origin.y + height },
    { x: origin.x, y: origin.y + height }
  ];
}

function assertPositiveRadius(radius: number): void {
  if (radius <= 0) {
    throw new Error("Radius must be greater than zero.");
  }
}
