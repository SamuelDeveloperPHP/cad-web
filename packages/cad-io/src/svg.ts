import type { CadDocument, CadEntity, CircleEntity, LineEntity, RectangleEntity } from "@cad-web/cad-core";
import type { CadJsonExportOptions } from "./json";
import { CAD_IO_APPLICATION, CAD_IO_SCHEMA_VERSION, CadIoValidationError, validateCadDocument } from "./json";

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

type ParsedSvgElement = Readonly<{
  tagName: "line" | "rect" | "circle";
  attributes: ReadonlyMap<string, string>;
  sourceIndex: number;
}>;

export function serializeCadDocumentToSvg(document: CadDocument, options: SvgExportOptions = {}): string {
  return Array.from(createSvgExportChunks(document, options)).join("");
}

export function parseSvgDocument(source: string): CadDocument {
  if (!/<svg[\s>]/i.test(source)) {
    throw new CadIoValidationError("SVG source must contain an svg root element", "$");
  }

  const sanitizedSource = removeUnsafeSvgBlocks(source);
  const entities: CadEntity[] = [];

  for (const element of iterateSupportedSvgElements(sanitizedSource)) {
    const entity = mapSvgElementToEntity(element);

    if (entity !== null) {
      entities.push(entity);
    }
  }

  const layersFromGroups = extractLayersFromSvg(sanitizedSource);
  const layers = layersFromGroups.length > 0 ? layersFromGroups : [
    { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 }
  ];

  const document: CadDocument = {
    schemaVersion: CAD_IO_SCHEMA_VERSION,
    id: getSvgDocumentId(sanitizedSource),
    units: "mm",
    layers,
    activeLayerId: layers[0]?.id ?? "layer_0",
    entities
  };

  validateCadDocument(document);

  return document;
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

  const entitiesByLayer = new Map<string, CadEntity[]>();
  for (const entity of document.entities) {
    const layerId = entity.layerId || "layer_0";
    if (!entitiesByLayer.has(layerId)) {
      entitiesByLayer.set(layerId, []);
    }
    entitiesByLayer.get(layerId)!.push(entity);
  }

  for (const layer of document.layers) {
    const layerEntities = entitiesByLayer.get(layer.id) || [];
    if (layerEntities.length === 0) continue;

    yield `    <g data-layer-id="${escapeSvgAttribute(layer.id)}" data-layer-name="${escapeSvgAttribute(layer.name)}">\n`;
    for (const entity of layerEntities) {
    yield `    ${serializeEntityToSvg(entity, precision, document)}\n`;
  }

    yield `    </g>\n`;
  }

  yield "  </g>\n";
  yield "</svg>\n";
}

function serializeEntityToSvg(entity: CadEntity, precision: number, document: any): string {
  if (entity.type === "line") {
    return serializeLineToSvg(entity, precision);
  }

  if (entity.type === "rectangle") {
    return serializeRectangleToSvg(entity, precision);
  }

  if (entity.type === "circle") {
    return serializeCircleToSvg(entity, precision);
  }

  if (entity.type === "dimension") {
    return serializeDimensionToSvg(entity as any, precision, document);
  }

  return "";
}

import { buildAlignedDimensionGeometry, buildLinearDimensionGeometry } from "@cad-web/cad-geometry";

function serializeDimensionToSvg(entity: any, precision: number, document: any): string {
  const defaultStyle = {
    textHeight: entity.style?.textHeight ?? 12,
    arrowSize: entity.style?.arrowSize ?? 6,
    extensionOffset: entity.style?.extensionOffset ?? 2,
    extensionOvershoot: entity.style?.extensionOvershoot ?? 3,
    precision: entity.style?.precision ?? 2,
    unitSuffix: entity.style?.unitSuffix ?? " mm",
    arrowType: entity.style?.arrowType ?? "tick",
  };

  const geom = entity.dimensionType === "linear" 
    ? buildLinearDimensionGeometry(entity.definition, defaultStyle, document.units, document.displayUnit || document.units)
    : buildAlignedDimensionGeometry(entity.definition, defaultStyle, document.units, document.displayUnit || document.units);

  const lines = [
    `<line x1="${formatNumber(geom.extensionLine1.start.x, precision)}" y1="${formatNumber(geom.extensionLine1.start.y, precision)}" x2="${formatNumber(geom.extensionLine1.end.x, precision)}" y2="${formatNumber(geom.extensionLine1.end.y, precision)}" />`,
    `<line x1="${formatNumber(geom.extensionLine2.start.x, precision)}" y1="${formatNumber(geom.extensionLine2.start.y, precision)}" x2="${formatNumber(geom.extensionLine2.end.x, precision)}" y2="${formatNumber(geom.extensionLine2.end.y, precision)}" />`,
    `<line x1="${formatNumber(geom.dimensionLine.start.x, precision)}" y1="${formatNumber(geom.dimensionLine.start.y, precision)}" x2="${formatNumber(geom.dimensionLine.end.x, precision)}" y2="${formatNumber(geom.dimensionLine.end.y, precision)}" />`
  ];

  if (defaultStyle.arrowType === "arrow") {
    // Generate SVG for filled arrows
    const drawArrow = (p1: {x:number, y:number}, p2: {x:number, y:number}) => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return "";
      const nx = dx / len;
      const ny = dy / len;
      const aLen = defaultStyle.arrowSize;
      const aWid = defaultStyle.arrowSize * 0.3;
      const pnt1 = { x: p1.x + nx * aLen - ny * aWid, y: p1.y + ny * aLen + nx * aWid };
      const pnt2 = { x: p1.x + nx * aLen + ny * aWid, y: p1.y + ny * aLen - nx * aWid };
      return `<polygon points="${formatNumber(p1.x, precision)},${formatNumber(p1.y, precision)} ${formatNumber(pnt1.x, precision)},${formatNumber(pnt1.y, precision)} ${formatNumber(pnt2.x, precision)},${formatNumber(pnt2.y, precision)}" />`;
    };
    lines.push(drawArrow(geom.dimensionLine.start, geom.dimensionLine.end));
    lines.push(drawArrow(geom.dimensionLine.end, geom.dimensionLine.start));
  } else {
    // Draw Ticks
    const ts = defaultStyle.arrowSize * 0.5;
    lines.push(`<line x1="${formatNumber(geom.dimensionLine.start.x - ts, precision)}" y1="${formatNumber(geom.dimensionLine.start.y + ts, precision)}" x2="${formatNumber(geom.dimensionLine.start.x + ts, precision)}" y2="${formatNumber(geom.dimensionLine.start.y - ts, precision)}" stroke-width="1.5" />`);
    lines.push(`<line x1="${formatNumber(geom.dimensionLine.end.x - ts, precision)}" y1="${formatNumber(geom.dimensionLine.end.y + ts, precision)}" x2="${formatNumber(geom.dimensionLine.end.x + ts, precision)}" y2="${formatNumber(geom.dimensionLine.end.y - ts, precision)}" stroke-width="1.5" />`);
  }

  const textVal = entity.textOverride || geom.formattedText;
  const rotDeg = (geom.textRotation * 180) / Math.PI;

  const textTransform = rotDeg !== 0 
    ? `transform="rotate(${formatNumber(rotDeg, precision)} ${formatNumber(geom.textPosition.x, precision)} ${formatNumber(geom.textPosition.y, precision)})"` 
    : "";

  const text = `<text x="${formatNumber(geom.textPosition.x, precision)}" y="${formatNumber(geom.textPosition.y, precision)}" text-anchor="middle" dominant-baseline="central" font-size="${formatNumber(defaultStyle.textHeight, precision)}px" font-family="Arial, sans-serif" ${textTransform}>${escapeSvgAttribute(textVal)}</text>`;

  return `<g data-entity-type="dimension" data-dimension-type="${escapeSvgAttribute(entity.dimensionType)}" id="${escapeSvgAttribute(entity.id)}" data-layer-id="${escapeSvgAttribute(entity.layerId)}">
    ${lines.join("\n    ")}
    ${text}
  </g>`;
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

function removeUnsafeSvgBlocks(source: string): string {
  // A importacao ignora blocos executaveis antes de procurar entidades suportadas.
  return source
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "");
}

function* iterateSupportedSvgElements(source: string): Iterable<ParsedSvgElement> {
  const elementPattern = /<(line|rect|circle)\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = elementPattern.exec(source)) !== null) {
    const tagName = match[1];
    const attributeSource = match[2];

    if (!isSupportedSvgTagName(tagName) || attributeSource === undefined) {
      continue;
    }

    yield {
      tagName,
      attributes: parseSvgAttributes(attributeSource),
      sourceIndex: match.index
    };
  }
}

function parseSvgAttributes(source: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(source)) !== null) {
    const rawName = match[1];
    const value = match[2] ?? match[3] ?? match[4];

    if (rawName === undefined || value === undefined) {
      continue;
    }

    const name = rawName.toLowerCase();

    if (name.startsWith("on") || name === "href" || name === "xlink:href") {
      continue;
    }

    attributes.set(name, decodeSvgAttribute(value));
  }

  return attributes;
}

function mapSvgElementToEntity(element: ParsedSvgElement): CadEntity | null {
  if (element.tagName === "line") {
    return mapSvgLineToEntity(element);
  }

  if (element.tagName === "rect") {
    return mapSvgRectToEntity(element);
  }

  return mapSvgCircleToEntity(element);
}

function mapSvgLineToEntity(element: ParsedSvgElement): LineEntity | null {
  const x1 = readRequiredNumber(element, "x1");
  const y1 = readRequiredNumber(element, "y1");
  const x2 = readRequiredNumber(element, "x2");
  const y2 = readRequiredNumber(element, "y2");

  if (x1 === null || y1 === null || x2 === null || y2 === null) {
    return null;
  }

  return {
    id: readSvgEntityId(element, "line"),
    layerId: readSvgLayerId(element),
    type: "line",
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 }
  };
}

function mapSvgRectToEntity(element: ParsedSvgElement): RectangleEntity | null {
  const width = readRequiredNumber(element, "width");
  const height = readRequiredNumber(element, "height");

  if (width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }

  const x = readOptionalNumber(element, "x", 0);
  const y = readOptionalNumber(element, "y", 0);
  const rotation = readSupportedRotation(element, x, y);

  return {
    id: readSvgEntityId(element, "rect"),
    layerId: readSvgLayerId(element),
    type: "rectangle",
    x,
    y,
    width,
    height,
    rotation
  };
}

function mapSvgCircleToEntity(element: ParsedSvgElement): CircleEntity | null {
  const radius = readRequiredNumber(element, "r");

  if (radius === null || radius <= 0) {
    return null;
  }

  return {
    id: readSvgEntityId(element, "circle"),
    layerId: readSvgLayerId(element),
    type: "circle",
    center: {
      x: readOptionalNumber(element, "cx", 0),
      y: readOptionalNumber(element, "cy", 0)
    },
    radius
  };
}

function readSvgEntityId(element: ParsedSvgElement, prefix: string): string {
  return sanitizeSvgIdentifier(element.attributes.get("id")) ?? `${prefix}_${element.sourceIndex}`;
}

function readSvgLayerId(element: ParsedSvgElement): string {
  return sanitizeSvgIdentifier(element.attributes.get("data-layer-id")) ?? "layer_0";
}

function sanitizeSvgIdentifier(value: string | undefined): string | null {
  const trimmedValue = value?.trim();

  return trimmedValue === undefined || trimmedValue.length === 0 ? null : trimmedValue;
}

function readRequiredNumber(element: ParsedSvgElement, attributeName: string): number | null {
  const value = element.attributes.get(attributeName);

  if (value === undefined) {
    return null;
  }

  return parseSvgNumber(value);
}

function readOptionalNumber(element: ParsedSvgElement, attributeName: string, fallback: number): number {
  const value = element.attributes.get(attributeName);

  if (value === undefined) {
    return fallback;
  }

  return parseSvgNumber(value) ?? fallback;
}

function readSupportedRotation(element: ParsedSvgElement, x: number, y: number): number {
  const transform = element.attributes.get("transform");

  if (transform === undefined) {
    return 0;
  }

  const match = transform.match(/^rotate\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)(?:[\s,]+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)[\s,]+([-+]?\d*\.?\d+(?:e[-+]?\d+)?))?\s*\)$/i);

  if (match === null || match[1] === undefined) {
    return 0;
  }

  const pivotX = match[2] === undefined ? x : parseSvgNumber(match[2]);
  const pivotY = match[3] === undefined ? y : parseSvgNumber(match[3]);

  if (pivotX === null || pivotY === null || pivotX !== x || pivotY !== y) {
    return 0;
  }

  return (Number(match[1]) * Math.PI) / 180;
}

function parseSvgNumber(value: string): number | null {
  const match = value.trim().match(/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);

  if (match === null) {
    return null;
  }

  const parsedValue = Number(match[0]);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getSvgDocumentId(source: string): string {
  const svgOpenTag = source.match(/<svg\b([^>]*)>/i);

  if (svgOpenTag?.[1] === undefined) {
    return "svg_import";
  }

  const attributes = parseSvgAttributes(svgOpenTag[1]);

  return sanitizeSvgIdentifier(attributes.get("data-document-id")) ?? sanitizeSvgIdentifier(attributes.get("id")) ?? "svg_import";
}

function isSupportedSvgTagName(tagName: string | undefined): tagName is ParsedSvgElement["tagName"] {
  return tagName === "line" || tagName === "rect" || tagName === "circle";
}

function decodeSvgAttribute(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
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

  if (entity.type === "dimension") {
    // Basic approximation since we don't have text width here easily
    const defaultStyle = {
      textHeight: entity.style?.textHeight ?? 12,
      arrowSize: entity.style?.arrowSize ?? 6,
      extensionOffset: entity.style?.extensionOffset ?? 2,
      extensionOvershoot: entity.style?.extensionOvershoot ?? 3,
      precision: entity.style?.precision ?? 2,
      unitSuffix: entity.style?.unitSuffix ?? " mm",
      arrowType: entity.style?.arrowType ?? "tick",
    };
    const geom = entity.dimensionType === "linear" 
      ? buildLinearDimensionGeometry(entity.definition as any, defaultStyle)
      : buildAlignedDimensionGeometry(entity.definition as any, defaultStyle);
      
    return calculateBoundsFromPoints(geom.visualPoints as ReadonlyArray<Readonly<{ x: number; y: number }>>);
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

function extractLayersFromSvg(source: string) {
  const groupsPattern = /<g\b[^>]*data-layer-id="([^"]+)"[^>]*data-layer-name="([^"]+)"[^>]*>/gi;
  const layers = [];
  let match: RegExpExecArray | null;
  let order = 0;
  while ((match = groupsPattern.exec(source)) !== null) {
    layers.push({
      id: decodeSvgAttribute(match[1]!),
      name: decodeSvgAttribute(match[2]!),
      color: "#ffffff",
      visible: true,
      locked: false,
      order: order++
    });
  }
  return layers;
}

function escapeSvgAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
