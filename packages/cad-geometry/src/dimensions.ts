import type { Point2D } from "./types";
import type { Vector2D } from "./types";
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
  extensionLine1?: { start: Point2D; end: Point2D };
  extensionLine2?: { start: Point2D; end: Point2D };
  dimensionLine: { start: Point2D; end: Point2D };
  leaderLine?: { start: Point2D; end: Point2D };
  textPosition: Point2D;
  textRotation: number;
  measuredValue: number;
  formattedText: string;
  visualPoints: ReadonlyArray<Point2D>;
}>;

export type RadiusDimensionDefGeom = Readonly<{
  center: Point2D;
  radius: number;
  leaderEndPoint: Point2D;
}>;

export type DiameterDimensionDefGeom = Readonly<{
  center: Point2D;
  radius: number;
  leaderEndPoint: Point2D;
}>;

import { formatMeasurement } from "./measurements";

export function distanceBetweenPoints(a: Point2D, b: Point2D): number {
  return distance(a, b);
}

export function angleBetweenPoints(a: Point2D, b: Point2D): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function normalizeVector(vector: Vector2D): Vector2D {
  return normalize(vector);
}

export function perpendicularVector(vector: Vector2D): Vector2D {
  return { x: -vector.y, y: vector.x };
}

export function projectPointOnLine(point: Point2D, linePoint: Point2D, lineDirection: Vector2D): Point2D {
  const unitDirection = normalize(lineDirection);
  const parameter = dot(subtractPoints(point, linePoint), unitDirection);

  return addVector(linePoint, scaleVector(unitDirection, parameter));
}

export function formatDimensionValue(value: number, precision: number, suffix: string, docUnit: string = "mm", displayUnit: string = "mm"): string {
  const formatted = formatMeasurement(value, docUnit, displayUnit, precision);
  return `${formatted}${suffix}`;
}

export function formatRadiusDimensionValue(radius: number, style: DimensionStyleGeom, docUnit: string = "mm", displayUnit: string = "mm"): string {
  return `R ${formatDimensionValue(radius, style.precision, style.unitSuffix, docUnit, displayUnit)}`;
}

export function formatDiameterDimensionValue(radius: number, style: DimensionStyleGeom, docUnit: string = "mm", displayUnit: string = "mm"): string {
  return `\u00d8 ${formatDimensionValue(radius * 2, style.precision, style.unitSuffix, docUnit, displayUnit)}`;
}

export function buildLinearDimensionGeometry(def: LinearDimensionDefGeom, style: DimensionStyleGeom, docUnit: string = "mm", displayUnit: string = "mm"): DimensionGeometryResult {
  let isHorizontal = true;

  if (def.orientation === "auto") {
    // O construtor escolhe a orientacao pelo maior deslocamento a partir do ponto medio do segmento.
    const dx = Math.abs(def.dimensionLinePoint.x - (def.firstPoint.x + def.secondPoint.x) / 2);
    const dy = Math.abs(def.dimensionLinePoint.y - (def.firstPoint.y + def.secondPoint.y) / 2);
    // Um deslocamento maior em Y indica cota horizontal medindo X.
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
    // A linha de cota horizontal fixa Y pelo ponto de cota.
    dimStart = { x: p1.x, y: dl.y };
    dimEnd = { x: p2.x, y: dl.y };
  } else {
    // A linha de cota vertical fixa X pelo ponto de cota.
    dimStart = { x: dl.x, y: p1.y };
    dimEnd = { x: dl.x, y: p2.y };
  }

  // O construtor calcula as linhas de extensao do ponto medido ate a linha de cota.
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

  // A linha de cota alinhada permanece paralela ao segmento medido.
  const lineDir = normalize(subtractPoints(p2, p1));
  const normal = { x: -lineDir.y, y: lineDir.x };

  // A projecao do ponto de cota define a distancia perpendicular ate o segmento.
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
  // O texto permanece legivel quando a linha passa para o lado invertido.
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

export function buildRadiusDimensionGeometry(def: RadiusDimensionDefGeom, style: DimensionStyleGeom, docUnit: string = "mm", displayUnit: string = "mm"): DimensionGeometryResult {
  const measuredValue = def.radius;
  const formattedText = formatRadiusDimensionValue(measuredValue, style, docUnit, displayUnit);

  let direction = normalize(subtractPoints(def.leaderEndPoint, def.center));
  if (direction.x === 0 && direction.y === 0) direction = { x: 1, y: 0 };

  const intersectionPoint = addVector(def.center, scaleVector(direction, def.radius));

  const dimensionLine = { start: def.center, end: intersectionPoint };
  const leaderLine = { start: intersectionPoint, end: def.leaderEndPoint };

  const visualPoints = [def.center, intersectionPoint, def.leaderEndPoint];

  return {
    dimensionLine,
    leaderLine,
    textPosition: def.leaderEndPoint,
    textRotation: 0,
    measuredValue,
    formattedText,
    visualPoints
  };
}

export function buildDiameterDimensionGeometry(def: DiameterDimensionDefGeom, style: DimensionStyleGeom, docUnit: string = "mm", displayUnit: string = "mm"): DimensionGeometryResult {
  const measuredValue = def.radius * 2;
  const formattedText = formatDiameterDimensionValue(def.radius, style, docUnit, displayUnit);

  let direction = normalize(subtractPoints(def.leaderEndPoint, def.center));
  if (direction.x === 0 && direction.y === 0) direction = { x: 1, y: 0 };

  const p1 = subtractPoints(def.center, scaleVector(direction, def.radius));
  const p2 = addVector(def.center, scaleVector(direction, def.radius));

  const dimensionLine = { start: p1, end: p2 };
  
  // A linha guia parte da borda mais proxima do texto.
  const distP1 = distance(p1, def.leaderEndPoint);
  const distP2 = distance(p2, def.leaderEndPoint);
  const closerPoint = distP1 < distP2 ? p1 : p2;
  
  const leaderLine = { start: closerPoint, end: def.leaderEndPoint };

  const visualPoints = [p1, p2, def.leaderEndPoint];

  return {
    dimensionLine,
    leaderLine,
    textPosition: def.leaderEndPoint,
    textRotation: 0,
    measuredValue,
    formattedText,
    visualPoints
  };
}

export type AngularDimensionDefGeom = Readonly<{
  vertex: Point2D;
  firstPoint: Point2D;
  secondPoint: Point2D;
  arcPoint: Point2D;
}>;

export type AngularDimensionGeometryResult = Readonly<{
  arcCenter: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  sweepFlag: 0 | 1;
  arcStart: Point2D;
  arcEnd: Point2D;
  extensionLine1: { start: Point2D; end: Point2D };
  extensionLine2: { start: Point2D; end: Point2D };
  textPosition: Point2D;
  textRotation: number;
  measuredValue: number;
  formattedText: string;
  visualPoints: ReadonlyArray<Point2D>;
}>;

export function formatAngularDimensionValue(angleDegrees: number, precision: number): string {
  return `${angleDegrees.toFixed(precision)}\u00b0`;
}

export function buildAngularDimensionGeometry(
  def: AngularDimensionDefGeom,
  style: DimensionStyleGeom
): AngularDimensionGeometryResult {
  const v1 = subtractPoints(def.firstPoint, def.vertex);
  const v2 = subtractPoints(def.secondPoint, def.vertex);
  const vArc = subtractPoints(def.arcPoint, def.vertex);

  const angle1 = Math.atan2(v1.y, v1.x);
  const angle2 = Math.atan2(v2.y, v2.x);
  const angleArc = Math.atan2(vArc.y, vArc.x);

  const norm1 = (angle1 + 2 * Math.PI) % (2 * Math.PI);
  const norm2 = (angle2 + 2 * Math.PI) % (2 * Math.PI);
  const normArc = (angleArc + 2 * Math.PI) % (2 * Math.PI);

  let startAngle = norm1;
  let endAngle = norm2;
  
  let diff = (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);

  // A verificacao confirma se o ponto do arco fica entre os angulos em sentido anti-horario.
  const isArcInCCW = (normArc - startAngle + 2 * Math.PI) % (2 * Math.PI) <= diff;

  if (!isArcInCCW) {
    // A ordem dos angulos e invertida quando o arco escolhido esta no outro sentido.
    startAngle = norm2;
    endAngle = norm1;
    diff = (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
  }

  const measuredValue = diff * (180 / Math.PI);
  const formattedText = formatAngularDimensionValue(measuredValue, style.precision);

  const radius = Math.max(distance(def.vertex, def.arcPoint), 5); // O raio minimo evita arco degenerado.

  const arcStart = {
    x: def.vertex.x + radius * Math.cos(startAngle),
    y: def.vertex.y + radius * Math.sin(startAngle)
  };
  
  const arcEnd = {
    x: def.vertex.x + radius * Math.cos(endAngle),
    y: def.vertex.y + radius * Math.sin(endAngle)
  };

  const midAngle = startAngle + diff / 2;
  const textRadius = radius + (style.textHeight / 2) + 2;
  
  const textPosition = {
    x: def.vertex.x + textRadius * Math.cos(midAngle),
    y: def.vertex.y + textRadius * Math.sin(midAngle)
  };

  let textRotation = midAngle + Math.PI / 2;
  if (textRotation > Math.PI / 2 && textRotation < (3 * Math.PI) / 2) {
    textRotation += Math.PI; // O texto permanece orientado para leitura.
  }

  const offset = style.extensionOffset;
  const overshoot = style.extensionOvershoot;
  
  const ext1Start = {
    x: def.vertex.x + offset * Math.cos(startAngle),
    y: def.vertex.y + offset * Math.sin(startAngle)
  };
  const ext1End = {
    x: arcStart.x + overshoot * Math.cos(startAngle),
    y: arcStart.y + overshoot * Math.sin(startAngle)
  };

  const ext2Start = {
    x: def.vertex.x + offset * Math.cos(endAngle),
    y: def.vertex.y + offset * Math.sin(endAngle)
  };
  const ext2End = {
    x: arcEnd.x + overshoot * Math.cos(endAngle),
    y: arcEnd.y + overshoot * Math.sin(endAngle)
  };

  const extensionLine1 = { start: ext1Start, end: ext1End };
  const extensionLine2 = { start: ext2Start, end: ext2End };

  const visualPoints = [def.vertex, arcStart, arcEnd, ext1Start, ext1End, ext2Start, ext2End, textPosition];

  return {
    arcCenter: def.vertex,
    radius,
    startAngle,
    endAngle,
    sweepFlag: 1, // O arco segue do inicio ao fim em sentido anti-horario.
    arcStart,
    arcEnd,
    extensionLine1,
    extensionLine2,
    textPosition,
    textRotation,
    measuredValue,
    formattedText,
    visualPoints
  };
}
