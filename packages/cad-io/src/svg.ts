import type { CadDocument, CadEntity, CircleEntity, LineEntity, RectangleEntity } from "@cad-web/cad-core";
import type { CadJsonExportOptions } from "./json";
import { CAD_IO_APPLICATION, CAD_IO_SCHEMA_VERSION, validateCadDocument } from "./json";

export type SvgExportOptions = CadJsonExportOptions &
  Readonly<{
    strokeColor?: string;
    strokeWidth?: number;
    padding?: number;
  }>;

type SvgBounds = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

export function serializeCadDocumentToSvg(document: CadDocument, options: SvgExportOptions = {}): string {
  return Array.from(createSvgExportChunks(document, options)).join("");
}

export function* createSvgExportChunks(
  document: CadDocument,
  options: SvgExportOptions = {}
): Iterable<string> {
  validateCadDocument(document);

  const precision = options.precision ?? 3;
  const padding = options.padding ?? 10;
  const bounds = expandBounds(calculateDocumentBounds(document), padding);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const strokeColor = escapeSvgAttribute(options.strokeColor ?? "#111827");
  const strokeWidth = formatNumber(options.strokeWidth ?? 1, precision);

  yield `<svg xmlns="http://www.w3.org/2000/svg" data-application="${CAD_IO_APPLICATION}" data-schema-version="${CAD_IO_SCHEMA_VERSION}" data-document-id="${escapeSvgAttribute(document.id)}" viewBox="${formatNumber(bounds.minX, precision)} ${formatNumber(bounds.minY, precision)} ${formatNumber(width, precision)} ${formatNumber(height, precision)}">\n`;
  yield `  <g fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke">\n`;

  for (const entity of document.entities) {
    yield `    ${serializeEntityToSvg(entity, precision)}\n`;
  }

  yield "  </g>\n";
  yield "</svg>\n";
}

function serializeEntityToSvg(entity: CadEntity, precision: number): string {
  if (entity.type === "line") {
    return serializeLineToSvg(entity, precision);
  }

  if (entity.type === "rectangle") {
    return serializeRectangleToSvg(entity, precision);
  }

  return serializeCircleToSvg(entity, precision);
}

function serializeLineToSvg(entity: LineEntity, precision: number): string {
  return [
    `<line id="${escapeSvgAttribute(entity.id)}"`,
    `data-layer-id="${escapeSvgAttribute(entity.layerId)}"`,
    `x1="${formatNumber(entity.start.x, precision)}"`,
    `y1="${formatNumber(entity.start.y, precision)}"`,
    `x2="${formatNumber(entity.end.x, precision)}"`,
    `y2="${formatNumber(entity.end.y, precision)}" />`
  ].join(" ");
}

function serializeRectangleToSvg(entity: RectangleEntity, precision: number): string {
  const attributes = [
    `<rect id="${escapeSvgAttribute(entity.id)}"`,
    `data-layer-id="${escapeSvgAttribute(entity.layerId)}"`,
    `x="${formatNumber(entity.x, precision)}"`,
    `y="${formatNumber(entity.y, precision)}"`,
    `width="${formatNumber(entity.width, precision)}"`,
    `height="${formatNumber(entity.height, precision)}"`
  ];

  if (entity.rotation !== undefined && entity.rotation !== 0) {
    attributes.push(
      `transform="rotate(${formatNumber((entity.rotation * 180) / Math.PI, precision)} ${formatNumber(entity.x, precision)} ${formatNumber(entity.y, precision)})"`
    );
  }

  attributes.push("/>");

  return attributes.join(" ");
}

function serializeCircleToSvg(entity: CircleEntity, precision: number): string {
  return [
    `<circle id="${escapeSvgAttribute(entity.id)}"`,
    `data-layer-id="${escapeSvgAttribute(entity.layerId)}"`,
    `cx="${formatNumber(entity.center.x, precision)}"`,
    `cy="${formatNumber(entity.center.y, precision)}"`,
    `r="${formatNumber(entity.radius, precision)}" />`
  ].join(" ");
}

function calculateDocumentBounds(document: CadDocument): SvgBounds {
  let bounds: SvgBounds | null = null;

  for (const entity of document.entities) {
    bounds = mergeBounds(bounds, calculateEntityBounds(entity));
  }

  return bounds ?? {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100
  };
}

function calculateEntityBounds(entity: CadEntity): SvgBounds {
  if (entity.type === "line") {
    return {
      minX: Math.min(entity.start.x, entity.end.x),
      minY: Math.min(entity.start.y, entity.end.y),
      maxX: Math.max(entity.start.x, entity.end.x),
      maxY: Math.max(entity.start.y, entity.end.y)
    };
  }

  if (entity.type === "rectangle") {
    return calculateBoundsFromPoints(getRectangleCorners(entity));
  }

  return {
    minX: entity.center.x - entity.radius,
    minY: entity.center.y - entity.radius,
    maxX: entity.center.x + entity.radius,
    maxY: entity.center.y + entity.radius
  };
}

function getRectangleCorners(entity: RectangleEntity): ReadonlyArray<Readonly<{ x: number; y: number }>> {
  const corners = [
    { x: entity.x, y: entity.y },
    { x: entity.x + entity.width, y: entity.y },
    { x: entity.x + entity.width, y: entity.y + entity.height },
    { x: entity.x, y: entity.y + entity.height }
  ];

  const rotation = entity.rotation;

  if (rotation === undefined || rotation === 0) {
    return corners;
  }

  return corners.map((point) => rotatePoint(point, { x: entity.x, y: entity.y }, rotation));
}

function rotatePoint(
  point: Readonly<{ x: number; y: number }>,
  pivot: Readonly<{ x: number; y: number }>,
  angleRadians: number
): Readonly<{ x: number; y: number }> {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;

  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos
  };
}

function calculateBoundsFromPoints(points: ReadonlyArray<Readonly<{ x: number; y: number }>>): SvgBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

function mergeBounds(left: SvgBounds | null, right: SvgBounds): SvgBounds {
  if (left === null) {
    return right;
  }

  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY)
  };
}

function expandBounds(bounds: SvgBounds, padding: number): SvgBounds {
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding
  };
}

function formatNumber(value: number, precision: number): string {
  const normalizedValue = Object.is(value, -0) ? 0 : value;
  const roundedValue = Number(normalizedValue.toFixed(precision));

  return String(roundedValue);
}

function escapeSvgAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
