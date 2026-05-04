import type { Point2D } from "./types";
import { distance, subtractPoints, normalize, addVector, scaleVector, dot } from "./vector";

export type LinearDimensionDefGeom = Readonly<{
  firstPoint: Point2D;
  secondPoint: Point2D;
  dimensionLinePoint: Point2D;
  orientation: "horizontal" | "vertical" | "auto";
}>;

export type AlignedDimensionDefGeom = Readonly<{
  firstPoint: Point2D;
  secondPoint: Point2D;
  dimensionLinePoint: Point2D;
}>;

export type DimensionStyleGeom = Readonly<{
  textHeight: number;
  arrowSize: number;
  extensionOffset: number;
  extensionOvershoot: number;
  precision: number;
  unitSuffix: string;
  arrowType?: "tick" | "arrow";
}>;

export type DimensionGeometryResult = Readonly<{
  extensionLine1: { start: Point2D; end: Point2D };
  extensionLine2: { start: Point2D; end: Point2D };
  dimensionLine: { start: Point2D; end: Point2D };
  textPosition: Point2D;
  textRotation: number;
  measuredValue: number;
  formattedText: string;
  visualPoints: ReadonlyArray<Point2D>;
}>;

import { formatMeasurement } from "./measurements";

export function formatDimensionValue(value: number, precision: number, suffix: string, docUnit: string = "mm", displayUnit: string = "mm"): string {
  const formatted = formatMeasurement(value, docUnit, displayUnit, precision);
  return `${formatted}${suffix}`;
}

export function buildLinearDimensionGeometry(def: LinearDimensionDefGeom, style: DimensionStyleGeom, docUnit: string = "mm", displayUnit: string = "mm"): DimensionGeometryResult {
  let isHorizontal = true;

  if (def.orientation === "auto") {
    // Determine automatically based on which axis has larger displacement from the segment midpoint to dimensionLinePoint
    const dx = Math.abs(def.dimensionLinePoint.x - (def.firstPoint.x + def.secondPoint.x) / 2);
    const dy = Math.abs(def.dimensionLinePoint.y - (def.firstPoint.y + def.secondPoint.y) / 2);
    // If dimensionLinePoint is moved more in Y direction, it's a horizontal dimension (measuring X).
    isHorizontal = dy >= dx;
  } else {
    isHorizontal = def.orientation === "horizontal";
  }

  const p1 = def.firstPoint;
  const p2 = def.secondPoint;
  const dl = def.dimensionLinePoint;

  let ext1Start = p1;
  let ext2Start = p2;
  
  let dimStart: Point2D;
  let dimEnd: Point2D;

  if (isHorizontal) {
    // Dimension line is horizontal (Y is fixed by dl.y)
    dimStart = { x: p1.x, y: dl.y };
    dimEnd = { x: p2.x, y: dl.y };
  } else {
    // Dimension line is vertical (X is fixed by dl.x)
    dimStart = { x: dl.x, y: p1.y };
    dimEnd = { x: dl.x, y: p2.y };
  }

  // Calculate direction of extension lines from measured point towards dimension line
  let extDir1 = normalize(subtractPoints(dimStart, p1));
  let extDir2 = normalize(subtractPoints(dimEnd, p2));

  if (extDir1.x === 0 && extDir1.y === 0) extDir1 = isHorizontal ? {x:0, y:1} : {x:1, y:0};
  if (extDir2.x === 0 && extDir2.y === 0) extDir2 = isHorizontal ? {x:0, y:1} : {x:1, y:0};

  const ext1End = addVector(dimStart, scaleVector(extDir1, style.extensionOvershoot));
  const ext2End = addVector(dimEnd, scaleVector(extDir2, style.extensionOvershoot));
  
  const ext1LineStart = addVector(p1, scaleVector(extDir1, style.extensionOffset));
  const ext2LineStart = addVector(p2, scaleVector(extDir2, style.extensionOffset));

  const measuredValue = distance(dimStart, dimEnd);
  const formattedText = formatDimensionValue(measuredValue, style.precision, style.unitSuffix, docUnit, displayUnit);

  const textPosition = {
    x: (dimStart.x + dimEnd.x) / 2,
    y: (dimStart.y + dimEnd.y) / 2
  };
  const textRotation = isHorizontal ? 0 : -Math.PI / 2;

  const visualPoints = [
    p1, p2, ext1LineStart, ext1End, ext2LineStart, ext2End, dimStart, dimEnd, textPosition
  ];

  return {
    extensionLine1: { start: ext1LineStart, end: ext1End },
    extensionLine2: { start: ext2LineStart, end: ext2End },
    dimensionLine: { start: dimStart, end: dimEnd },
    textPosition,
    textRotation,
    measuredValue,
    formattedText,
    visualPoints
  };
}

export function buildAlignedDimensionGeometry(def: AlignedDimensionDefGeom, style: DimensionStyleGeom, docUnit: string = "mm", displayUnit: string = "mm"): DimensionGeometryResult {
  const p1 = def.firstPoint;
  const p2 = def.secondPoint;
  const dl = def.dimensionLinePoint;

  const measuredValue = distance(p1, p2);
  const formattedText = formatDimensionValue(measuredValue, style.precision, style.unitSuffix, docUnit, displayUnit);

  if (measuredValue < 1e-6) {
    return {
      extensionLine1: { start: p1, end: p1 },
      extensionLine2: { start: p2, end: p2 },
      dimensionLine: { start: p1, end: p2 },
      textPosition: p1,
      textRotation: 0,
      measuredValue: 0,
      formattedText,
      visualPoints: [p1, p2, dl]
    };
  }

  // Dimension line is parallel to p1-p2.
  const lineDir = normalize(subtractPoints(p2, p1));
  const normal = { x: -lineDir.y, y: lineDir.x };

  // Determine projection of dl onto p1-p2 line.
  // Actually, we just need the perpendicular distance and direction from p1 to dimension line.
  // We can project dl onto the normal.
  const dlVec = subtractPoints(dl, p1);
  const projNormalDist = dot(dlVec, normal);
  
  const dimStart = addVector(p1, scaleVector(normal, projNormalDist));
  const dimEnd = addVector(p2, scaleVector(normal, projNormalDist));

  let extDir = projNormalDist >= 0 ? normal : scaleVector(normal, -1);

  const ext1End = addVector(dimStart, scaleVector(extDir, style.extensionOvershoot));
  const ext2End = addVector(dimEnd, scaleVector(extDir, style.extensionOvershoot));
  
  const ext1LineStart = addVector(p1, scaleVector(extDir, style.extensionOffset));
  const ext2LineStart = addVector(p2, scaleVector(extDir, style.extensionOffset));

  const textPosition = {
    x: (dimStart.x + dimEnd.x) / 2,
    y: (dimStart.y + dimEnd.y) / 2
  };
  
  let textRotation = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  // Keep text upright
  if (textRotation > Math.PI / 2 || textRotation < -Math.PI / 2) {
    textRotation += Math.PI;
  }

  const visualPoints = [
    p1, p2, ext1LineStart, ext1End, ext2LineStart, ext2End, dimStart, dimEnd, textPosition
  ];

  return {
    extensionLine1: { start: ext1LineStart, end: ext1End },
    extensionLine2: { start: ext2LineStart, end: ext2End },
    dimensionLine: { start: dimStart, end: dimEnd },
    textPosition,
    textRotation,
    measuredValue,
    formattedText,
    visualPoints
  };
}
