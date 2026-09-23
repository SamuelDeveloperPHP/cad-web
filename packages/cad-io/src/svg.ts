import { resolveDimensionStyle, type ArcEntity, type CadDocument, type CadEntity, type CircleEntity, type EllipseEntity, type LineEntity, type PolylineEntity, type RectangleEntity, type TextEntity } from "@cad-web/cad-core";
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
  tagName: "line" | "rect" | "circle" | "polyline" | "polygon";
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

  entities.push(...parseSvgTexts(sanitizedSource, layers.map((layer) => layer.id)));

  const document: CadDocument = {
    schemaVersion: CAD_IO_SCHEMA_VERSION,
    id: getSvgDocumentId(sanitizedSource),
    units: "mm",
    layers,
    activeLayerId: layers[0]?.id ?? "layer_0",
    dimensionStyles: [
      {
        id: "dimstyle_standard",
        name: "Standard",
        textHeight: 12,
        arrowSize: 6,
        extensionOffset: 2,
        extensionOvershoot: 3,
        precision: 2,
        unitSuffix: " mm",
        arrowType: "tick",
        isDefault: true
      }
    ],
    activeDimensionStyleId: "dimstyle_standard",
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

  if (entity.type === "arc") {
    return serializeArcToSvg(entity, precision);
  }

  if (entity.type === "ellipse") {
    return serializeEllipseToSvg(entity, precision);
  }

  if (entity.type === "polyline") {
    return serializePolylineToSvg(entity, precision);
  }

  if (entity.type === "dimension") {
    return serializeDimensionToSvg(entity as any, precision, document);
  }

  if (entity.type === "text") {
    return serializeTextToSvg(entity, precision);
  }

  return "";
}

/**
 * Exporta o texto como um grupo com um <text> por linha, cada um ancorado na origem calculada pelo
 * layout do kernel e girado em torno dela. O SVG usa o mesmo sistema do mundo (Y para baixo),
 * então a rotação entra sem inverter o sinal.
 */
function serializeTextToSvg(entity: TextEntity, precision: number): string {
  const layout = textLayout(entity);
  const anchor = entity.horizontalAlign === "center" ? "middle" : entity.horizontalAlign === "right" ? "end" : "start";
  const rotationDeg = ((entity.rotation ?? 0) * 180) / Math.PI;
  const fontFamily = entity.fontFamily !== undefined && entity.fontFamily.trim() !== "" ? entity.fontFamily : "Arial, sans-serif";
  const fill = entity.color !== undefined ? escapeSvgAttribute(entity.color) : "currentColor";
  const styleAttributes = [
    `font-size="${formatNumber(entity.height, precision)}"`,
    `font-family="${escapeSvgAttribute(fontFamily)}"`,
    entity.bold === true ? `font-weight="bold"` : "",
    entity.italic === true ? `font-style="italic"` : "",
    `text-anchor="${anchor}"`
  ].filter((attribute) => attribute !== "").join(" ");

  // Linhas vazias também são exportadas, para o espaçamento vertical sobreviver à ida e volta.
  const lines = layout.lines
    .map((line) => {
      const x = formatNumber(line.origin.x, precision);
      const y = formatNumber(line.origin.y, precision);
      const transform = Math.abs(rotationDeg) > 1e-9 ? ` transform="rotate(${formatNumber(rotationDeg, precision)} ${x} ${y})"` : "";
      return `<text x="${x}" y="${y}"${transform} xml:space="preserve">${escapeSvgAttribute(line.content)}</text>`;
    });

  // data-position e data-vertical-align permitem reconstruir o ponto de inserção exato na importação,
  // já que o SVG só guarda a origem de cada linha na linha de base.
  const roundTripAttributes = [
    `data-position="${formatNumber(entity.position.x, precision)} ${formatNumber(entity.position.y, precision)}"`,
    `data-vertical-align="${entity.verticalAlign ?? "baseline"}"`
  ].join(" ");

  return `<g id="${escapeSvgAttribute(entity.id)}" data-entity-type="text" data-layer-id="${escapeSvgAttribute(entity.layerId)}" ${roundTripAttributes} ${styleAttributes} fill="${fill}" stroke="none">${lines.join("")}</g>`;
}

function serializePolylineToSvg(entity: PolylineEntity, precision: number): string {
  // O exportador escolhe <polygon> para closed=true e <polyline> para abertas, conforme convencao SVG.
  const pointsAttribute = entity.points
    .map((point) => `${formatNumber(point.x, precision)},${formatNumber(point.y, precision)}`)
    .join(" ");

  const tag = entity.closed ? "polygon" : "polyline";

  return [
    `<${tag} id="${escapeSvgAttribute(entity.id)}"`,
    `data-layer-id="${escapeSvgAttribute(entity.layerId)}"`,
    `data-entity-type="polyline"`,
    `data-closed="${entity.closed ? "true" : "false"}"`,
    `points="${pointsAttribute}" />`
  ].join(" ");
}

import { textBoundingBox, textLayout, arcBoundingBox, arcEndPoint, arcStartPoint, arcSweepAngle, ellipseArcBoundingBox, ellipsePointAtParam, normalizeEllipseSweep, buildAlignedDimensionGeometry, buildLinearDimensionGeometry, buildRadiusDimensionGeometry, buildDiameterDimensionGeometry, buildAngularDimensionGeometry } from "@cad-web/cad-geometry";

function serializeDimensionToSvg(entity: any, precision: number, document: any): string {
  const resolvedStyle = resolveDimensionStyle(document, entity);

  const defaultStyle = {
    textHeight: resolvedStyle.textHeight ?? 12,
    arrowSize: resolvedStyle.arrowSize ?? 6,
    extensionOffset: resolvedStyle.extensionOffset ?? 2,
    extensionOvershoot: resolvedStyle.extensionOvershoot ?? 3,
    precision: resolvedStyle.precision ?? 2,
    unitSuffix: resolvedStyle.unitSuffix ?? " mm",
    arrowType: resolvedStyle.arrowType ?? "tick",
  };

  let geom: any;
  if (entity.dimensionType === "linear") {
    geom = buildLinearDimensionGeometry(entity.definition, defaultStyle, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "aligned") {
    geom = buildAlignedDimensionGeometry(entity.definition, defaultStyle, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "radius") {
    geom = buildRadiusDimensionGeometry(entity.definition, defaultStyle, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "diameter") {
    geom = buildDiameterDimensionGeometry(entity.definition, defaultStyle, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "angular") {
    geom = buildAngularDimensionGeometry(entity.definition, defaultStyle);
  }

  const lines: string[] = [];
  
  if (geom.extensionLine1 && geom.extensionLine2) {
    lines.push(`<line x1="${formatNumber(geom.extensionLine1.start.x, precision)}" y1="${formatNumber(geom.extensionLine1.start.y, precision)}" x2="${formatNumber(geom.extensionLine1.end.x, precision)}" y2="${formatNumber(geom.extensionLine1.end.y, precision)}" />`);
    lines.push(`<line x1="${formatNumber(geom.extensionLine2.start.x, precision)}" y1="${formatNumber(geom.extensionLine2.start.y, precision)}" x2="${formatNumber(geom.extensionLine2.end.x, precision)}" y2="${formatNumber(geom.extensionLine2.end.y, precision)}" />`);
  }

  if (entity.dimensionType === "angular") {
    // O exportador desenha cotas angulares como arco SVG.
    // Os angulos ficam em radianos e o sweepFlag define o sentido.
    // O comando A usa rx ry x-axis-rotation large-arc-flag sweep-flag x y.
    const rx = geom.radius;
    const ry = geom.radius;
    // A diferenca angular define o large-arc-flag.
    let diff = geom.endAngle - geom.startAngle;
    if (diff < 0) diff += 2 * Math.PI;
    const largeArcFlag = diff > Math.PI ? 1 : 0;
    
    // O arco usa pontos absolutos ja calculados no sistema do documento.
    lines.push(`<path d="M ${formatNumber(geom.arcStart.x, precision)} ${formatNumber(geom.arcStart.y, precision)} A ${formatNumber(rx, precision)} ${formatNumber(ry, precision)} 0 ${largeArcFlag} ${geom.sweepFlag === 0 ? 0 : 1} ${formatNumber(geom.arcEnd.x, precision)} ${formatNumber(geom.arcEnd.y, precision)}" fill="none" />`);
  } else {
    lines.push(`<line x1="${formatNumber(geom.dimensionLine.start.x, precision)}" y1="${formatNumber(geom.dimensionLine.start.y, precision)}" x2="${formatNumber(geom.dimensionLine.end.x, precision)}" y2="${formatNumber(geom.dimensionLine.end.y, precision)}" />`);
  }
  if (geom.leaderLine) {
    lines.push(`<line x1="${formatNumber(geom.leaderLine.start.x, precision)}" y1="${formatNumber(geom.leaderLine.start.y, precision)}" x2="${formatNumber(geom.leaderLine.end.x, precision)}" y2="${formatNumber(geom.leaderLine.end.y, precision)}" />`);
  }

  if (defaultStyle.arrowType === "tick") {
    // O exportador desenha marcas arquitetonicas.
    const ts = defaultStyle.arrowSize * 0.5;
    if (entity.dimensionType === "angular") {
      lines.push(`<line x1="${formatNumber(geom.arcStart.x - ts, precision)}" y1="${formatNumber(geom.arcStart.y + ts, precision)}" x2="${formatNumber(geom.arcStart.x + ts, precision)}" y2="${formatNumber(geom.arcStart.y - ts, precision)}" stroke-width="1.5" />`);
      lines.push(`<line x1="${formatNumber(geom.arcEnd.x - ts, precision)}" y1="${formatNumber(geom.arcEnd.y + ts, precision)}" x2="${formatNumber(geom.arcEnd.x + ts, precision)}" y2="${formatNumber(geom.arcEnd.y - ts, precision)}" stroke-width="1.5" />`);
    } else {
      if (entity.dimensionType !== "radius") {
        lines.push(`<line x1="${formatNumber(geom.dimensionLine.start.x - ts, precision)}" y1="${formatNumber(geom.dimensionLine.start.y + ts, precision)}" x2="${formatNumber(geom.dimensionLine.start.x + ts, precision)}" y2="${formatNumber(geom.dimensionLine.start.y - ts, precision)}" stroke-width="1.5" />`);
      }
      lines.push(`<line x1="${formatNumber(geom.dimensionLine.end.x - ts, precision)}" y1="${formatNumber(geom.dimensionLine.end.y + ts, precision)}" x2="${formatNumber(geom.dimensionLine.end.x + ts, precision)}" y2="${formatNumber(geom.dimensionLine.end.y - ts, precision)}" stroke-width="1.5" />`);
    }
  } else if (defaultStyle.arrowType !== "none") {
    // O exportador gera seta cheia (polygon), seta aberta (polyline) ou ponto (circle).
    const arrowType = defaultStyle.arrowType;
    const drawArrow = (p1: {x:number, y:number}, p2: {x:number, y:number}) => {
      if (arrowType === "dot") {
        return `<circle cx="${formatNumber(p1.x, precision)}" cy="${formatNumber(p1.y, precision)}" r="${formatNumber(defaultStyle.arrowSize * 0.25, precision)}" fill="currentColor" stroke="none" />`;
      }
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
      if (arrowType === "open") {
        return `<polyline points="${formatNumber(pnt1.x, precision)},${formatNumber(pnt1.y, precision)} ${formatNumber(p1.x, precision)},${formatNumber(p1.y, precision)} ${formatNumber(pnt2.x, precision)},${formatNumber(pnt2.y, precision)}" fill="none" />`;
      }
      return `<polygon points="${formatNumber(p1.x, precision)},${formatNumber(p1.y, precision)} ${formatNumber(pnt1.x, precision)},${formatNumber(pnt1.y, precision)} ${formatNumber(pnt2.x, precision)},${formatNumber(pnt2.y, precision)}" />`;
    };

    if (entity.dimensionType === "radius") {
      lines.push(drawArrow(geom.dimensionLine.end, geom.dimensionLine.start));
    } else if (entity.dimensionType === "angular") {
      lines.push(drawArrow(geom.arcStart, { x: geom.arcStart.x - Math.sin(geom.startAngle), y: geom.arcStart.y + Math.cos(geom.startAngle) }));
      lines.push(drawArrow(geom.arcEnd, { x: geom.arcEnd.x + Math.sin(geom.endAngle), y: geom.arcEnd.y - Math.cos(geom.endAngle) }));
    } else {
      lines.push(drawArrow(geom.dimensionLine.start, geom.dimensionLine.end));
      lines.push(drawArrow(geom.dimensionLine.end, geom.dimensionLine.start));
    }
  }

  const textVal = entity.textOverride || geom.formattedText;
  const rotDeg = (geom.textRotation * 180) / Math.PI;

  const textTransform = rotDeg !== 0 
    ? `transform="rotate(${formatNumber(rotDeg, precision)} ${formatNumber(geom.textPosition.x, precision)} ${formatNumber(geom.textPosition.y, precision)})"` 
    : "";

  const textColorOverride = resolvedStyle.textColor || resolvedStyle.color ? ` fill="${escapeSvgAttribute(resolvedStyle.textColor || resolvedStyle.color || "")}"` : ` fill="currentColor"`;

  const text = `<text x="${formatNumber(geom.textPosition.x, precision)}" y="${formatNumber(geom.textPosition.y, precision)}" text-anchor="middle" dominant-baseline="central" font-size="${formatNumber(defaultStyle.textHeight, precision)}px" font-family="Arial, sans-serif" ${textTransform}${textColorOverride}>${escapeSvgAttribute(textVal)}</text>`;

  const strokeOverride = resolvedStyle.lineColor || resolvedStyle.color ? ` stroke="${escapeSvgAttribute(resolvedStyle.lineColor || resolvedStyle.color || "")}"` : "";

  return `<g data-entity-type="dimension" data-dimension-type="${escapeSvgAttribute(entity.dimensionType)}" id="${escapeSvgAttribute(entity.id)}" data-layer-id="${escapeSvgAttribute(entity.layerId)}"${strokeOverride}>
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

function serializeEllipseToSvg(entity: EllipseEntity, precision: number): string {
  // Arco de elipse é exportado como <path> com o comando A (elliptical arc) do SVG.
  if (entity.startAngle !== undefined && entity.endAngle !== undefined) {
    return serializeEllipseArcToSvg(entity, precision);
  }

  // O exportador usa <ellipse> com transform rotate no centro quando há rotação.
  const attributes = [
    `<ellipse id="${escapeSvgAttribute(entity.id)}"`,
    `data-layer-id="${escapeSvgAttribute(entity.layerId)}"`,
    `data-entity-type="ellipse"`,
    `cx="${formatNumber(entity.center.x, precision)}"`,
    `cy="${formatNumber(entity.center.y, precision)}"`,
    `rx="${formatNumber(entity.radiusX, precision)}"`,
    `ry="${formatNumber(entity.radiusY, precision)}"`
  ];

  if (entity.rotation !== 0) {
    attributes.push(
      `transform="rotate(${formatNumber((entity.rotation * 180) / Math.PI, precision)} ${formatNumber(entity.center.x, precision)} ${formatNumber(entity.center.y, precision)})"`
    );
  }

  attributes.push("/>");

  return attributes.join(" ");
}

function serializeEllipseArcToSvg(entity: EllipseEntity, precision: number): string {
  const startAngle = entity.startAngle ?? 0;
  const endAngle = entity.endAngle ?? 0;
  const { sweep } = normalizeEllipseSweep(startAngle, endAngle);

  const start = ellipsePointAtParam(entity.center, entity.radiusX, entity.radiusY, entity.rotation, startAngle);
  const end = ellipsePointAtParam(entity.center, entity.radiusX, entity.radiusY, entity.rotation, startAngle + sweep);
  const xAxisRotation = (entity.rotation * 180) / Math.PI;
  const largeArcFlag = sweep > Math.PI ? 1 : 0;
  // A varredura cresce no sentido paramétrico positivo, que no sistema y-para-baixo do documento é o sweep-flag 1.
  const sweepFlag = 1;

  return [
    `<path id="${escapeSvgAttribute(entity.id)}"`,
    `data-layer-id="${escapeSvgAttribute(entity.layerId)}"`,
    `data-entity-type="ellipse"`,
    `d="M ${formatNumber(start.x, precision)} ${formatNumber(start.y, precision)} A ${formatNumber(entity.radiusX, precision)} ${formatNumber(entity.radiusY, precision)} ${formatNumber(xAxisRotation, precision)} ${largeArcFlag} ${sweepFlag} ${formatNumber(end.x, precision)} ${formatNumber(end.y, precision)}" />`
  ].join(" ");
}

function serializeArcToSvg(entity: ArcEntity, precision: number): string {
  const start = arcStartPoint(entity);
  const end = arcEndPoint(entity);
  const largeArcFlag = arcSweepAngle(entity.startAngle, entity.endAngle, entity.clockwise) > Math.PI ? 1 : 0;
  const sweepFlag = entity.clockwise ? 1 : 0;

  return [
    `<path id="${escapeSvgAttribute(entity.id)}"`,
    `data-layer-id="${escapeSvgAttribute(entity.layerId)}"`,
    `data-entity-type="arc"`,
    `d="M ${formatNumber(start.x, precision)} ${formatNumber(start.y, precision)} A ${formatNumber(entity.radius, precision)} ${formatNumber(entity.radius, precision)} 0 ${largeArcFlag} ${sweepFlag} ${formatNumber(end.x, precision)} ${formatNumber(end.y, precision)}" />`
  ].join(" ");
}

/**
 * Importa textos do SVG em duas passadas:
 * 1. Grupos exportados pelo CAD-WEB (`<g data-entity-type="text">`): um grupo vira uma única entidade
 *    de várias linhas, com ponto de inserção e alinhamento vertical exatos (data-position/data-vertical-align).
 * 2. `<text>` avulsos de outros programas: cada elemento vira uma entidade, lendo atributos ou `style`,
 *    `<tspan>` com x/y/dy como quebras de linha e transform `rotate`/`translate`.
 * A camada vem do atributo data-layer-id do próprio elemento ou do grupo de camada que o contém.
 */
function parseSvgTexts(source: string, layerIds: ReadonlyArray<string>): TextEntity[] {
  const entities: TextEntity[] = [];
  const layerRanges = findLayerGroupRanges(source);
  const fallbackLayerId = layerIds[0] ?? "layer_0";
  const layerAt = (index: number, own: string | undefined): string => {
    const explicit = sanitizeSvgIdentifier(own);
    if (explicit !== null) return explicit;
    const range = layerRanges.find((candidate) => index >= candidate.start && index < candidate.end);
    return range?.id ?? fallbackLayerId;
  };

  const groupPattern = /<g\b([^>]*\bdata-entity-type\s*=\s*["']text["'][^>]*)>([\s\S]*?)<\/g>/gi;
  let groupMatch: RegExpExecArray | null;

  while ((groupMatch = groupPattern.exec(source)) !== null) {
    const attributes = parseSvgAttributes(groupMatch[1] ?? "");
    const lines = Array.from(iterateSvgTextElements(groupMatch[2] ?? ""));
    const entity = buildTextFromCadWebGroup(attributes, lines, groupMatch.index, layerAt(groupMatch.index, attributes.get("data-layer-id")));

    if (entity !== null) {
      entities.push(entity);
    }
  }

  // Os grupos já tratados são apagados (mantendo os índices) para não reimportar suas linhas na passada genérica.
  const remaining = source.replace(groupPattern, (match) => " ".repeat(match.length));

  for (const element of iterateSvgTextElements(remaining)) {
    const entity = buildTextFromSvgElement(element, layerAt(element.sourceIndex, element.attributes.get("data-layer-id")));

    if (entity !== null) {
      entities.push(entity);
    }
  }

  return entities;
}

type ParsedSvgText = Readonly<{
  attributes: ReadonlyMap<string, string>;
  lines: ReadonlyArray<string>;
  sourceIndex: number;
}>;

function* iterateSvgTextElements(source: string): Iterable<ParsedSvgText> {
  const textPattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;

  while ((match = textPattern.exec(source)) !== null) {
    yield {
      attributes: parseSvgAttributes(match[1] ?? ""),
      lines: readSvgTextLines(match[2] ?? "", /\bxml:space\s*=\s*["']preserve["']/i.test(match[1] ?? "")),
      sourceIndex: match.index
    };
  }
}

// Extrai as linhas do conteúdo de um <text>: cada <tspan> com x, y ou dy inicia uma nova linha.
function readSvgTextLines(inner: string, preserveSpaces = false): ReadonlyArray<string> {
  if (!/<tspan\b/i.test(inner)) {
    // Com xml:space="preserve" (como na exportação do CAD-WEB) os espaços do conteúdo são mantidos.
    return [preserveSpaces ? decodeSvgText(inner.replace(/<[^>]*>/g, "")) : normalizeSvgTextContent(inner)];
  }

  const lines: string[] = [];
  const leading = normalizeSvgTextContent(inner.slice(0, inner.search(/<tspan\b/i)));
  let current = leading;
  const tspanPattern = /<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/gi;
  let match: RegExpExecArray | null;

  while ((match = tspanPattern.exec(inner)) !== null) {
    const attributes = parseSvgAttributes(match[1] ?? "");
    const content = normalizeSvgTextContent(match[2] ?? "");
    const startsLine = attributes.has("x") || attributes.has("y") || attributes.has("dy");

    if (startsLine && current !== "") {
      lines.push(current);
      current = content;
    } else {
      current = current === "" ? content : `${current}${content}`;
    }
  }

  lines.push(current);
  return lines;
}

// Remove marcação interna, decodifica entidades e colapsa espaços (comportamento padrão do SVG).
function normalizeSvgTextContent(raw: string): string {
  return decodeSvgText(raw.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function decodeSvgText(value: string): string {
  return decodeSvgAttribute(
    value
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeFromCodePoint(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(Number.parseInt(dec, 10)))
  );
}

function safeFromCodePoint(codePoint: number): string {
  return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
}

function buildTextFromCadWebGroup(
  attributes: ReadonlyMap<string, string>,
  lines: ReadonlyArray<ParsedSvgText>,
  sourceIndex: number,
  layerId: string
): TextEntity | null {
  const content = lines.map((line) => line.lines.join(" ")).join("\n");
  const height = parseSvgNumber(readSvgStyle(attributes, "font-size") ?? "");
  const first = lines[0];

  if (first === undefined || content.trim() === "" || height === null || height <= 0) {
    return null;
  }

  const firstX = parseSvgNumber(first.attributes.get("x") ?? "") ?? 0;
  const firstY = parseSvgNumber(first.attributes.get("y") ?? "") ?? 0;
  const rotation = readSvgTextTransform(first.attributes.get("transform"), firstX, firstY).rotation;
  const positionParts = (attributes.get("data-position") ?? "").trim().split(/[\s,]+/).map((part) => parseSvgNumber(part));
  const [positionX, positionY] = positionParts;
  const verticalAlign = readVerticalAlign(attributes.get("data-vertical-align"));

  return {
    id: sanitizeSvgIdentifier(attributes.get("id")) ?? `text_${sourceIndex}`,
    layerId,
    type: "text",
    // Sem data-position (SVG antigo), a origem da primeira linha é o ponto de inserção na linha de base.
    position: positionX !== null && positionX !== undefined && positionY !== null && positionY !== undefined
      ? { x: positionX, y: positionY }
      : { x: firstX, y: firstY },
    content,
    height,
    ...(rotation !== 0 ? { rotation } : {}),
    ...readTextStyleFields(attributes),
    ...(positionX !== null && positionX !== undefined && verticalAlign !== "baseline" ? { verticalAlign } : {})
  };
}

function buildTextFromSvgElement(element: ParsedSvgText, layerId: string): TextEntity | null {
  const content = element.lines.filter((line) => line !== "").join("\n");
  // O tamanho padrão de fonte do SVG é 16.
  const height = parseSvgNumber(readSvgStyle(element.attributes, "font-size") ?? "16");

  if (content === "" || height === null || height <= 0) {
    return null;
  }

  const x = parseSvgNumber(element.attributes.get("x") ?? "") ?? 0;
  const y = parseSvgNumber(element.attributes.get("y") ?? "") ?? 0;
  const transform = readSvgTextTransform(element.attributes.get("transform"), x, y);
  const verticalAlign = readVerticalAlign(readSvgStyle(element.attributes, "dominant-baseline"));

  return {
    id: sanitizeSvgIdentifier(element.attributes.get("id")) ?? `text_${element.sourceIndex}`,
    layerId,
    type: "text",
    position: { x: x + transform.offset.x, y: y + transform.offset.y },
    content,
    height,
    ...(transform.rotation !== 0 ? { rotation: transform.rotation } : {}),
    ...readTextStyleFields(element.attributes),
    ...(verticalAlign !== "baseline" ? { verticalAlign } : {})
  };
}

// Campos de estilo comuns: alinhamento horizontal, fonte, negrito, itálico e cor.
function readTextStyleFields(attributes: ReadonlyMap<string, string>): Partial<TextEntity> {
  const anchor = readSvgStyle(attributes, "text-anchor");
  const fontFamily = readSvgStyle(attributes, "font-family")?.trim();
  const weight = readSvgStyle(attributes, "font-weight")?.trim().toLowerCase();
  const style = readSvgStyle(attributes, "font-style")?.trim().toLowerCase();
  const fill = readSvgStyle(attributes, "fill")?.trim();
  const bold = weight === "bold" || weight === "bolder" || (weight !== undefined && Number(weight) >= 600);

  return {
    ...(anchor === "middle" ? { horizontalAlign: "center" as const } : anchor === "end" ? { horizontalAlign: "right" as const } : {}),
    // A fonte padrão da exportação não é gravada de volta, para o texto seguir o padrão do app.
    ...(fontFamily !== undefined && fontFamily !== "" && fontFamily !== "Arial, sans-serif" ? { fontFamily } : {}),
    ...(bold ? { bold: true } : {}),
    ...(style === "italic" || style === "oblique" ? { italic: true } : {}),
    ...(fill !== undefined && /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(fill) ? { color: fill } : {})
  };
}

// Lê uma propriedade de apresentação do atributo direto ou da declaração inline em style.
function readSvgStyle(attributes: ReadonlyMap<string, string>, name: string): string | undefined {
  const direct = attributes.get(name);

  if (direct !== undefined) {
    return direct;
  }

  const style = attributes.get("style");

  if (style === undefined) {
    return undefined;
  }

  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");

    if (separator > 0 && declaration.slice(0, separator).trim().toLowerCase() === name) {
      return declaration.slice(separator + 1).trim();
    }
  }

  return undefined;
}

function readVerticalAlign(value: string | undefined): NonNullable<TextEntity["verticalAlign"]> {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "middle" || normalized === "central") return "middle";
  if (normalized === "top" || normalized === "hanging" || normalized === "text-before-edge") return "top";
  if (normalized === "bottom" || normalized === "text-after-edge" || normalized === "ideographic") return "bottom";
  return "baseline";
}

/**
 * Interpreta o transform de um <text>: rotate(a) em torno do próprio ponto (ou da origem quando x = y = 0)
 * vira rotação; translate(tx[, ty]) vira deslocamento do ponto. Outros transforms são ignorados.
 * O SVG usa o mesmo sistema do mundo (Y para baixo), então o ângulo entra sem inverter o sinal.
 */
function readSvgTextTransform(
  transform: string | undefined,
  x: number,
  y: number
): Readonly<{ rotation: number; offset: { x: number; y: number } }> {
  const identity = { rotation: 0, offset: { x: 0, y: 0 } };

  if (transform === undefined) {
    return identity;
  }

  const number = "([-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?)";
  const rotateMatch = transform.trim().match(new RegExp(`^rotate\\(\\s*${number}(?:[\\s,]+${number}[\\s,]+${number})?\\s*\\)$`, "i"));

  if (rotateMatch?.[1] !== undefined) {
    const pivotX = rotateMatch[2] === undefined ? 0 : Number(rotateMatch[2]);
    const pivotY = rotateMatch[3] === undefined ? 0 : Number(rotateMatch[3]);
    const aroundPoint = Math.abs(pivotX - x) < 1e-6 && Math.abs(pivotY - y) < 1e-6;

    return aroundPoint ? { rotation: (Number(rotateMatch[1]) * Math.PI) / 180, offset: { x: 0, y: 0 } } : identity;
  }

  const translateMatch = transform.trim().match(new RegExp(`^translate\\(\\s*${number}(?:[\\s,]+${number})?\\s*\\)$`, "i"));

  if (translateMatch?.[1] !== undefined) {
    return { rotation: 0, offset: { x: Number(translateMatch[1]), y: translateMatch[2] === undefined ? 0 : Number(translateMatch[2]) } };
  }

  return identity;
}

// Faixas [início, fim) no código-fonte de cada grupo de camada exportado, para herdar a camada do texto.
function findLayerGroupRanges(source: string): ReadonlyArray<Readonly<{ id: string; start: number; end: number }>> {
  const starts: Array<{ id: string; start: number }> = [];
  const pattern = /<g\b[^>]*data-layer-id="([^"]+)"[^>]*data-layer-name="[^"]*"[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    starts.push({ id: decodeSvgAttribute(match[1] ?? ""), start: match.index });
  }

  return starts.map((entry, index) => ({ ...entry, end: starts[index + 1]?.start ?? source.length }));
}

function removeUnsafeSvgBlocks(source: string): string {
  // A importacao ignora blocos executaveis antes de procurar entidades suportadas.
  return source
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "");
}

function* iterateSupportedSvgElements(source: string): Iterable<ParsedSvgElement> {
  const elementPattern = /<(line|rect|circle|polyline|polygon)\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = elementPattern.exec(source)) !== null) {
    const tagName = match[1]?.toLowerCase();
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

  if (element.tagName === "polyline") {
    return mapSvgPolylineToEntity(element, false);
  }

  if (element.tagName === "polygon") {
    return mapSvgPolylineToEntity(element, true);
  }

  return mapSvgCircleToEntity(element);
}

function mapSvgPolylineToEntity(element: ParsedSvgElement, closed: boolean): PolylineEntity | null {
  // O parser le o atributo points e gera uma PolylineEntity; closed reflete o tag (polyline vs polygon).
  const rawPoints = element.attributes.get("points");

  if (rawPoints === undefined) {
    return null;
  }

  const points = parseSvgPointsAttribute(rawPoints);
  const minVertices = closed ? 3 : 2;

  if (points.length < minVertices) {
    return null;
  }

  return {
    id: readSvgEntityId(element, closed ? "polygon" : "polyline"),
    layerId: readSvgLayerId(element),
    type: "polyline",
    points,
    closed
  };
}

function parseSvgPointsAttribute(raw: string): ReadonlyArray<{ x: number; y: number }> {
  // O parser aceita pontos separados por espacos, virgulas ou ambos, conforme spec SVG.
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const points: Array<{ x: number; y: number }> = [];

  for (let index = 0; index < tokens.length - 1; index += 2) {
    const xRaw = tokens[index];
    const yRaw = tokens[index + 1];

    if (xRaw === undefined || yRaw === undefined) {
      continue;
    }

    const x = parseSvgNumber(xRaw);
    const y = parseSvgNumber(yRaw);

    if (x === null || y === null) {
      continue;
    }

    points.push({ x, y });
  }

  return points;
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
  return (
    tagName === "line" ||
    tagName === "rect" ||
    tagName === "circle" ||
    tagName === "polyline" ||
    tagName === "polygon"
  );
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
    bounds = mergeBounds(bounds, calculateEntityBounds(entity, document));
  }

  return bounds ?? {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100
  };
}

function calculateEntityBounds(entity: CadEntity, document?: CadDocument): SvgBounds {
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
    const resolvedStyle = document ? resolveDimensionStyle(document, entity as any) : ((entity as any).style || {});
    const defaultStyle = {
      textHeight: resolvedStyle.textHeight ?? 12,
      arrowSize: resolvedStyle.arrowSize ?? 6,
      extensionOffset: resolvedStyle.extensionOffset ?? 2,
      extensionOvershoot: resolvedStyle.extensionOvershoot ?? 3,
      precision: resolvedStyle.precision ?? 2,
      unitSuffix: resolvedStyle.unitSuffix ?? " mm",
      arrowType: resolvedStyle.arrowType ?? "tick",
    };
    let geom: any;

    if (entity.dimensionType === "linear") {
      geom = buildLinearDimensionGeometry(entity.definition as any, defaultStyle);
    } else if (entity.dimensionType === "aligned") {
      geom = buildAlignedDimensionGeometry(entity.definition as any, defaultStyle);
    } else if (entity.dimensionType === "radius") {
      geom = buildRadiusDimensionGeometry(entity.definition as any, defaultStyle);
    } else if (entity.dimensionType === "diameter") {
      geom = buildDiameterDimensionGeometry(entity.definition as any, defaultStyle);
    } else {
      geom = buildAngularDimensionGeometry(entity.definition as any, defaultStyle);
    }
      
    return calculateBoundsFromPoints(geom.visualPoints as ReadonlyArray<Readonly<{ x: number; y: number }>>);
  }

  if (entity.type === "arc") {
    return arcBoundingBox(entity);
  }

  if (entity.type === "ellipse") {
    return ellipseArcBoundingBox({
      type: "ellipse",
      center: entity.center,
      radiusX: entity.radiusX,
      radiusY: entity.radiusY,
      rotation: entity.rotation,
      startAngle: entity.startAngle,
      endAngle: entity.endAngle
    });
  }

  if (entity.type === "polyline") {
    return calculateBoundsFromPoints(entity.points);
  }

  if (entity.type === "text") {
    return textBoundingBox(entity);
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
