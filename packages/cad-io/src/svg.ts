import { resolveDimensionStyle, type ArcEntity, type CadDocument, type CadEntity, type CircleEntity, type EllipseEntity, type LineEntity, type PolylineEntity, type RectangleEntity, type TextEntity } from "@cad-web/cad-core";
import type { CadJsonExportOptions } from "./json";
import { CAD_IO_APPLICATION, CAD_IO_SCHEMA_VERSION, validateCadDocument } from "./json";

export { parseSvgDocument } from "./svgImport";

export type SvgExportOptions = CadJsonExportOptions &
  Readonly<{
    strokeColor?: string;
    strokeWidth?: number;
    padding?: number;
    // Embute o JSON de cada entidade e do documento (camadas, estilos de cota, unidades) para que a
    // reimportação no CAD-WEB seja exata. Padrão: true. Outros programas ignoram esses atributos.
    embedCadData?: boolean;
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

  const embed = options.embedCadData !== false;
  const documentData = embed
    ? ` data-cad-document="${escapeSvgAttribute(JSON.stringify({
        units: document.units,
        displayUnit: document.displayUnit,
        layers: document.layers,
        activeLayerId: document.activeLayerId,
        dimensionStyles: document.dimensionStyles,
        activeDimensionStyleId: document.activeDimensionStyleId
      }))}"`
    : "";

  yield `<svg xmlns="http://www.w3.org/2000/svg" data-application="${CAD_IO_APPLICATION}" data-schema-version="${CAD_IO_SCHEMA_VERSION}" data-document-id="${escapeSvgAttribute(document.id)}"${documentData} viewBox="${formatNumber(bounds.minX, precision)} ${formatNumber(bounds.minY, precision)} ${formatNumber(width, precision)} ${formatNumber(height, precision)}">\n`;
  yield `  <g fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke">\n`;

  // A exportação agrupa por camada; o índice original volta em data-cad-index para preservar a ordem de desenho.
  const entityOrder = new Map(document.entities.map((entity, index) => [entity, index]));
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
    yield `    ${decorateEntityElement(serializeEntityToSvg(entity, precision, document), entity, embed, entityOrder.get(entity) ?? 0)}\n`;
  }

    yield `    </g>\n`;
  }

  yield "  </g>\n";
  yield "</svg>\n";
}

/**
 * Acrescenta ao elemento raiz da entidade os atributos de aparência (cor, espessura, tracejado) e, quando
 * pedido, o JSON da entidade em data-cad-entity (fonte exata para a reimportação).
 */
function decorateEntityElement(markup: string, entity: CadEntity, embed: boolean, order: number): string {
  if (markup === "") {
    return markup;
  }

  const attributes: string[] = [];

  if (entity.type !== "text" && entity.type !== "dimension") {
    if (entity.color !== undefined) attributes.push(`stroke="${escapeSvgAttribute(entity.color)}"`);
    if (entity.lineThickness !== undefined) attributes.push(`stroke-width="${entity.lineThickness}"`);
    if (entity.lineType === "dashed") attributes.push(`stroke-dasharray="8 6"`);
    if (entity.lineType === "dotted") attributes.push(`stroke-dasharray="2 4"`);
  }

  if (embed) {
    attributes.push(`data-cad-index="${order}"`, `data-cad-entity="${escapeSvgAttribute(JSON.stringify(entity))}"`);
  }

  if (attributes.length === 0) {
    return markup;
  }

  // Os atributos entram no fim da tag de abertura (valores já escapados não contêm ">").
  const tagEnd = markup.search(/\s*\/?>/);
  return `${markup.slice(0, tagEnd)} ${attributes.join(" ")}${markup.slice(tagEnd)}`;
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

function escapeSvgAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
