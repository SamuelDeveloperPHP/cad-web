import {
  expandBlockReference,
  type BlockDefinition,
  type CadDocument,
  type CadEntity,
  type EllipseEntity,
  type PolylineEntity,
  type SplineEntity,
  type TextEntity
} from "@cad-web/cad-core";
import type { Point2D } from "@cad-web/cad-geometry";
import { aciToHex } from "./dxfColors";

// Exportacao para DXF ASCII R12 (AC1009), o formato mais compativel entre CADs.
//
// Convencoes (inversas do importador em dxf.ts):
// - O documento guarda Y para baixo; o DXF usa Y para cima. Todo ponto troca o sinal de Y.
// - Arco: o importador le {code 50, code 51} e cria {startAngle:-to, endAngle:-from, clockwise:true}.
//   O inverso (que faz ida e volta exata) e, em graus: clockwise ? (50=-end, 51=-start)
//   : (50=-start, 51=-end). O DXF sempre percorre o arco no sentido anti-horario de 50 a 51.
// - Curvas sem primitiva nativa no R12 (elipse, spline) sao achatadas em POLYLINE (geometria exata
//   dentro da tesselacao). Referencias de bloco sao expandidas na geometria. Cotas ainda nao sao
//   exportadas.

type SegmentCount = number;

const ELLIPSE_SEGMENTS: SegmentCount = 72;
const BEZIER_SEGMENTS: SegmentCount = 24;

// Formata um real sem notacao cientifica, removendo zeros a direita.
function fmt(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Object.is(value, -0) || Math.abs(value) < 1e-12) {
    return "0";
  }
  const fixed = value.toFixed(8);
  return fixed.replace(/\.?0+$/, "");
}

// rad (mundo, Y para baixo) -> graus DXF (Y para cima) normalizados em [0, 360).
function toDxfDegrees(radians: number): number {
  let degrees = (radians * 180) / Math.PI % 360;
  if (degrees < 0) {
    degrees += 360;
  }
  return degrees;
}

type AciEntry = Readonly<{ aci: number; r: number; g: number; b: number }>;

let aciPalette: ReadonlyArray<AciEntry> | null = null;

function buildAciPalette(): ReadonlyArray<AciEntry> {
  if (aciPalette !== null) {
    return aciPalette;
  }
  const entries: AciEntry[] = [];
  for (let aci = 1; aci < 256; aci += 1) {
    const hex = aciToHex(aci);
    const rgb = hex === null ? null : hexToRgb(hex);
    if (rgb !== null) {
      entries.push({ aci, r: rgb.r, g: rgb.g, b: rgb.b });
    }
  }
  aciPalette = entries;
  return entries;
}

function hexToRgb(hex: string): Readonly<{ r: number; g: number; b: number }> | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (match === null || match[1] === undefined) {
    return null;
  }
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

// Indice ACI mais proximo de uma cor hex (distancia euclidiana em RGB). Default 7 quando desconhecida.
function nearestAci(hex: string | undefined): number {
  if (hex === undefined) {
    return 7;
  }
  const rgb = hexToRgb(hex);
  if (rgb === null) {
    return 7;
  }
  let best = 7;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of buildAciPalette()) {
    const dr = entry.r - rgb.r;
    const dg = entry.g - rgb.g;
    const db = entry.b - rgb.b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry.aci;
    }
  }
  return best;
}

// O R12 nao aceita espacos no nome da camada; normaliza mantendo algo legivel.
function sanitizeLayerName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_$.\-]/g, "_");
  return cleaned === "" ? "0" : cleaned;
}

class DxfWriter {
  private readonly lines: string[] = [];

  tag(code: number, value: string | number): void {
    this.lines.push(String(code));
    this.lines.push(typeof value === "number" ? fmt(value) : value);
  }

  toString(): string {
    return this.lines.join("\n") + "\n";
  }
}

// Serializa o documento CAD em DXF ASCII R12.
export function serializeCadDocumentToDxf(document: CadDocument): string {
  const writer = new DxfWriter();
  const layerNameById = new Map<string, string>();
  for (const layer of document.layers) {
    layerNameById.set(layer.id, sanitizeLayerName(layer.name));
  }

  writeHeader(writer);
  writeTables(writer, document, layerNameById);
  writeEntities(writer, document, layerNameById);

  writer.tag(0, "EOF");
  return writer.toString();
}

function writeHeader(writer: DxfWriter): void {
  writer.tag(0, "SECTION");
  writer.tag(2, "HEADER");
  writer.tag(9, "$ACADVER");
  writer.tag(1, "AC1009");
  writer.tag(9, "$INSUNITS");
  writer.tag(70, 4); // 4 = milimetros (unidade base do documento)
  writer.tag(0, "ENDSEC");
}

function writeTables(writer: DxfWriter, document: CadDocument, layerNameById: Map<string, string>): void {
  writer.tag(0, "SECTION");
  writer.tag(2, "TABLES");
  writer.tag(0, "TABLE");
  writer.tag(2, "LAYER");

  const names = new Set<string>(["0"]);
  for (const name of layerNameById.values()) {
    names.add(name);
  }
  writer.tag(70, names.size);

  const colorByName = new Map<string, number>();
  for (const layer of document.layers) {
    colorByName.set(sanitizeLayerName(layer.name), nearestAci(layer.color));
  }

  for (const name of names) {
    writer.tag(0, "LAYER");
    writer.tag(2, name);
    writer.tag(70, 0);
    writer.tag(62, colorByName.get(name) ?? 7);
    writer.tag(6, "CONTINUOUS");
  }

  writer.tag(0, "ENDTAB");
  writer.tag(0, "ENDSEC");
}

function writeEntities(writer: DxfWriter, document: CadDocument, layerNameById: Map<string, string>): void {
  writer.tag(0, "SECTION");
  writer.tag(2, "ENTITIES");

  const blocks = document.blocks ?? [];
  for (const entity of document.entities) {
    writeEntity(writer, entity, layerNameById, blocks);
  }

  writer.tag(0, "ENDSEC");
}

function layerName(entity: CadEntity, layerNameById: Map<string, string>): string {
  return layerNameById.get(entity.layerId) ?? "0";
}

// Escreve o cabecalho comum (tipo, camada e cor opcional) de uma entidade DXF.
function startEntity(writer: DxfWriter, type: string, entity: CadEntity, layerNameById: Map<string, string>): void {
  writer.tag(0, type);
  writer.tag(8, layerName(entity, layerNameById));
  if (entity.color !== undefined) {
    writer.tag(62, nearestAci(entity.color));
  }
}

function writeEntity(writer: DxfWriter, entity: CadEntity, layerNameById: Map<string, string>, blocks: ReadonlyArray<BlockDefinition>): void {
  switch (entity.type) {
    case "line":
      startEntity(writer, "LINE", entity, layerNameById);
      writer.tag(10, entity.start.x);
      writer.tag(20, -entity.start.y);
      writer.tag(30, 0);
      writer.tag(11, entity.end.x);
      writer.tag(21, -entity.end.y);
      writer.tag(31, 0);
      break;
    case "circle":
      startEntity(writer, "CIRCLE", entity, layerNameById);
      writer.tag(10, entity.center.x);
      writer.tag(20, -entity.center.y);
      writer.tag(30, 0);
      writer.tag(40, entity.radius);
      break;
    case "arc": {
      startEntity(writer, "ARC", entity, layerNameById);
      writer.tag(10, entity.center.x);
      writer.tag(20, -entity.center.y);
      writer.tag(30, 0);
      writer.tag(40, entity.radius);
      const start = entity.clockwise ? -entity.endAngle : -entity.startAngle;
      const end = entity.clockwise ? -entity.startAngle : -entity.endAngle;
      writer.tag(50, toDxfDegrees(start));
      writer.tag(51, toDxfDegrees(end));
      break;
    }
    case "rectangle": {
      writePolyline(writer, entity, layerNameById, rectangleCorners(entity), true);
      break;
    }
    case "polyline":
      writePolyline(writer, entity, layerNameById, entity.points, (entity as PolylineEntity).closed);
      break;
    case "ellipse":
      writePolyline(writer, entity, layerNameById, sampleEllipse(entity), isClosedEllipse(entity));
      break;
    case "spline":
      writePolyline(writer, entity, layerNameById, sampleSpline(entity), (entity as SplineEntity).closed);
      break;
    case "text":
      writeText(writer, entity, layerNameById);
      break;
    case "block": {
      // Referencia de bloco: exporta a geometria expandida (um nivel pode conter blocos aninhados).
      for (const part of expandBlockReference(blocks, entity)) {
        writeEntity(writer, part, layerNameById, blocks);
      }
      break;
    }
    case "dimension":
      // Cotas ainda nao sao exportadas para DXF (geometria/estilo complexos); ficam de fora por ora.
      break;
    default:
      break;
  }
}

// POLYLINE R12 (POLYLINE + VERTEX + SEQEND), com Y invertido em cada vertice.
function writePolyline(
  writer: DxfWriter,
  entity: CadEntity,
  layerNameById: Map<string, string>,
  points: ReadonlyArray<Point2D>,
  closed: boolean
): void {
  if (points.length < 2) {
    return;
  }
  const name = layerName(entity, layerNameById);
  const aci = entity.color !== undefined ? nearestAci(entity.color) : null;

  writer.tag(0, "POLYLINE");
  writer.tag(8, name);
  if (aci !== null) {
    writer.tag(62, aci);
  }
  writer.tag(66, 1);
  writer.tag(10, 0);
  writer.tag(20, 0);
  writer.tag(30, 0);
  writer.tag(70, closed ? 1 : 0);

  for (const point of points) {
    writer.tag(0, "VERTEX");
    writer.tag(8, name);
    writer.tag(10, point.x);
    writer.tag(20, -point.y);
    writer.tag(30, 0);
  }

  writer.tag(0, "SEQEND");
  writer.tag(8, name);
}

function writeText(writer: DxfWriter, entity: TextEntity, layerNameById: Map<string, string>): void {
  // Conteudo multilinha vira uma entidade TEXT por linha, deslocada para baixo pela altura.
  const lines = entity.content.split("\n");
  const rotation = toDxfDegrees(-(entity.rotation ?? 0));
  const cos = Math.cos(entity.rotation ?? 0);
  const sin = Math.sin(entity.rotation ?? 0);
  const step = entity.height * 1.6;

  lines.forEach((line, index) => {
    // Cada linha desce ao longo da perpendicular a linha de base (no mundo, Y para baixo).
    const offset = step * index;
    const x = entity.position.x + sin * offset;
    const y = entity.position.y + cos * offset;
    startEntity(writer, "TEXT", entity, layerNameById);
    writer.tag(10, x);
    writer.tag(20, -y);
    writer.tag(30, 0);
    writer.tag(40, entity.height);
    writer.tag(1, line);
    if (rotation !== 0) {
      writer.tag(50, rotation);
    }
    if (entity.fontFamily !== undefined && entity.fontFamily !== "") {
      writer.tag(7, entity.fontFamily);
    }
  });
}

function rectangleCorners(entity: Extract<CadEntity, { type: "rectangle" }>): ReadonlyArray<Point2D> {
  const { x, y, width, height } = entity;
  const corners: Point2D[] = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ];
  const rotation = entity.rotation ?? 0;
  if (rotation === 0) {
    return corners;
  }
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return corners.map((corner) => {
    const dx = corner.x - x;
    const dy = corner.y - y;
    return { x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos };
  });
}

function isClosedEllipse(entity: EllipseEntity): boolean {
  return entity.startAngle === undefined || entity.endAngle === undefined;
}

function sampleEllipse(entity: EllipseEntity): ReadonlyArray<Point2D> {
  const closed = isClosedEllipse(entity);
  const start = entity.startAngle ?? 0;
  const end = entity.endAngle ?? Math.PI * 2;
  const sweep = closed ? Math.PI * 2 : normalizeSweep(end - start);
  const cos = Math.cos(entity.rotation);
  const sin = Math.sin(entity.rotation);
  const points: Point2D[] = [];
  const count = Math.max(8, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * ELLIPSE_SEGMENTS));
  const steps = closed ? count : count;
  for (let i = 0; i <= steps; i += 1) {
    const t = start + sweep * (i / steps);
    const lx = entity.radiusX * Math.cos(t);
    const ly = entity.radiusY * Math.sin(t);
    points.push({ x: entity.center.x + lx * cos - ly * sin, y: entity.center.y + lx * sin + ly * cos });
  }
  if (closed) {
    points.pop(); // evita duplicar o primeiro ponto; o flag closed fecha a polyline
  }
  return points;
}

function normalizeSweep(sweep: number): number {
  let value = sweep;
  while (value <= 0) {
    value += Math.PI * 2;
  }
  return value;
}

function sampleSpline(entity: SplineEntity): ReadonlyArray<Point2D> {
  const cp = entity.controlPoints;
  if (cp.length < 4) {
    return cp;
  }
  const points: Point2D[] = [];
  for (let segment = 0; segment + 3 < cp.length; segment += 3) {
    const p0 = cp[segment];
    const c1 = cp[segment + 1];
    const c2 = cp[segment + 2];
    const p1 = cp[segment + 3];
    if (p0 === undefined || c1 === undefined || c2 === undefined || p1 === undefined) {
      continue;
    }
    const startI = segment === 0 ? 0 : 1;
    for (let i = startI; i <= BEZIER_SEGMENTS; i += 1) {
      points.push(cubicBezier(p0, c1, c2, p1, i / BEZIER_SEGMENTS));
    }
  }
  return points;
}

function cubicBezier(p0: Point2D, c1: Point2D, c2: Point2D, p1: Point2D, t: number): Point2D {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y
  };
}
