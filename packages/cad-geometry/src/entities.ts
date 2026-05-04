import { boundingBoxFromPoints, expandBoundingBox } from "./bounding-box";
import { buildAlignedDimensionGeometry, buildLinearDimensionGeometry } from "./dimensions";
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
    case "dimension": {
      let points: Point2D[] = [];
      const defaultStyle = {
        textHeight: entity.style?.textHeight ?? 12,
        arrowSize: entity.style?.arrowSize ?? 6,
        extensionOffset: entity.style?.extensionOffset ?? 2,
        extensionOvershoot: entity.style?.extensionOvershoot ?? 3,
        precision: entity.style?.precision ?? 2,
        unitSuffix: entity.style?.unitSuffix ?? " mm",
      };

      if (entity.dimensionType === "linear") {
        const geom = buildLinearDimensionGeometry(entity.definition, defaultStyle);
        points = [...geom.visualPoints];
      } else if (entity.dimensionType === "aligned") {
        const geom = buildAlignedDimensionGeometry(entity.definition, defaultStyle);
        points = [...geom.visualPoints];
      } else {
        points = [entity.definition.firstPoint, entity.definition.secondPoint, entity.definition.dimensionLinePoint];
      }

      // Approximate text width = textHeight * 0.7 * characters
      // Since visualPoints already includes textPosition, we expand the box by text width/height
      const charCount = (entity.textOverride || "000.00 mm").length;
      const textWidth = defaultStyle.textHeight * 0.7 * charCount;
      const padding = Math.max(defaultStyle.textHeight, textWidth / 2);

      return expandBoundingBox(boundingBoxFromPoints(points), padding);
    }
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
