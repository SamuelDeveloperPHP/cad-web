import {
  createEmptyDocument,
  decomposeBlockLinear,
  type BlockDefinition,
  type BlockReferenceEntity,
  type CadDisplayUnit,
  type CadDocument,
  type CadEntity,
  type CadLayer
} from "@cad-web/cad-core";
import { fitPointsToBezierChain, visualDegreesToWorldRadians, type Point2D } from "@cad-web/cad-geometry";
import { aciToHex, trueColorToHex } from "./dxfColors";
import { evaluateNurbs, isValidNurbs, sampleNurbs, type NurbsCurve } from "./dxfNurbs";
import { decodeDxfText, stripMtextFormatting } from "./dxfText";
import { validateCadDocument } from "./json";

/**
 * Importação de DXF ASCII (R12 e 2000+).
 *
 * Convenções:
 * - O DXF tem Y para cima; o documento guarda Y para baixo, então todo Y troca de sinal e os ângulos (graus
 *   anti-horários) viram radianos do mundo (visualDegreesToWorldRadians).
 * - Todas as coordenadas e comprimentos vão para mm pelo $INSUNITS (sem unidade definida = mm).
 * - Camadas (nome, cor ACI/true color, congelada/desligada, bloqueada, tipo de linha), blocos (BLOCK/INSERT com
 *   escala, rotação, matriz de linhas × colunas e extrusão (0,0,−1)) e as entidades LINE, LWPOLYLINE, POLYLINE
 *   (2D, com bulge → arcos), CIRCLE, ARC, ELLIPSE, SPLINE, TEXT, MTEXT, SOLID/TRACE, LEADER, HATCH (contornos) e
 *   DIMENSION (a geometria do bloco anônimo) são importados; o restante é contado no relatório.
 * - Entidades do espaço papel e invisíveis são ignoradas.
 */

export class DxfImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DxfImportError";
  }
}

export type DxfImportReport = Readonly<{
  // Entidades do desenho importadas (referências de bloco incluídas).
  entities: number;
  blocks: number;
  layers: number;
  // Tipos não suportados ou ignorados, com a contagem.
  skipped: Readonly<Record<string, number>>;
  warnings: ReadonlyArray<string>;
  // Unidade declarada no arquivo ($INSUNITS) e o fator aplicado para chegar a milímetros.
  sourceUnit: string;
  scaleToMillimeters: number;
}>;

export type DxfImportResult = Readonly<{ document: CadDocument; report: DxfImportReport }>;

export type DxfImportOptions = Readonly<{ documentId?: string }>;

// ------------------------------------------------------------------------------------------------
// Leitura dos grupos
// ------------------------------------------------------------------------------------------------

type Groups = Readonly<{ codes: Int32Array; values: ReadonlyArray<string> }>;

function readGroups(text: string): Groups {
  const codes: number[] = [];
  const values: string[] = [];
  let position = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 0;

  const nextLine = (): string | null => {
    if (position >= text.length) {
      return null;
    }

    let end = text.indexOf("\n", position);
    end = end === -1 ? text.length : end;
    const raw = text.slice(position, end);
    position = end + 1;
    line += 1;
    return raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  };

  for (;;) {
    const codeText = nextLine();

    if (codeText === null) {
      break;
    }

    if (codeText.trim() === "" && position >= text.length) {
      break;
    }

    const code = Number(codeText.trim());

    if (!Number.isInteger(code)) {
      throw new DxfImportError(`Invalid DXF: group code expected at line ${line} ("${codeText.slice(0, 20)}")`);
    }

    const value = nextLine();

    if (value === null) {
      break;
    }

    codes.push(code);
    values.push(value);
  }

  return { codes: Int32Array.from(codes), values };
}

// Registro DXF: um grupo 0 (tipo) e os grupos seguintes até o próximo 0.
class DxfRecord {
  constructor(
    readonly type: string,
    readonly codes: ReadonlyArray<number>,
    readonly values: ReadonlyArray<string>
  ) {}

  str(code: number): string | undefined {
    const index = this.codes.indexOf(code);
    return index === -1 ? undefined : this.values[index]!;
  }

  num(code: number, fallback: number): number {
    const text = this.str(code);

    if (text === undefined) {
      return fallback;
    }

    const value = Number(text.trim());
    return Number.isFinite(value) ? value : fallback;
  }

  all(code: number): number[] {
    const result: number[] = [];

    for (let index = 0; index < this.codes.length; index += 1) {
      if (this.codes[index] === code) {
        const value = Number(this.values[index]!.trim());

        if (Number.isFinite(value)) {
          result.push(value);
        }
      }
    }

    return result;
  }
}

function splitRecords(groups: Groups, start: number, end: number): DxfRecord[] {
  const records: DxfRecord[] = [];
  let index = start;

  while (index < end) {
    if (groups.codes[index] !== 0) {
      index += 1;
      continue;
    }

    const type = groups.values[index]!.trim();
    let next = index + 1;

    while (next < end && groups.codes[next] !== 0) {
      next += 1;
    }

    records.push(new DxfRecord(type, Array.from(groups.codes.subarray(index + 1, next)), groups.values.slice(index + 1, next)));
    index = next;
  }

  return records;
}

type SectionRanges = Map<string, Readonly<{ start: number; end: number }>>;

function findSections(groups: Groups): SectionRanges {
  const sections: SectionRanges = new Map();

  for (let index = 0; index < groups.codes.length; index += 1) {
    if (groups.codes[index] === 0 && groups.values[index]!.trim() === "SECTION" && groups.codes[index + 1] === 2) {
      const name = groups.values[index + 1]!.trim().toUpperCase();
      let end = index + 2;

      while (end < groups.codes.length && !(groups.codes[end] === 0 && groups.values[end]!.trim() === "ENDSEC")) {
        end += 1;
      }

      sections.set(name, { start: index + 2, end });
      index = end;
    }
  }

  return sections;
}

// ------------------------------------------------------------------------------------------------
// Unidades
// ------------------------------------------------------------------------------------------------

// $INSUNITS → milímetros por unidade.
const UNIT_TO_MM: Readonly<Record<number, Readonly<{ name: string; factor: number; display?: CadDisplayUnit }>>> = {
  1: { name: "inches", factor: 25.4 },
  2: { name: "feet", factor: 304.8 },
  3: { name: "miles", factor: 1_609_344 },
  4: { name: "millimeters", factor: 1, display: "mm" },
  5: { name: "centimeters", factor: 10, display: "cm" },
  6: { name: "meters", factor: 1000, display: "m" },
  7: { name: "kilometers", factor: 1_000_000, display: "km" },
  8: { name: "microinches", factor: 0.0000254 },
  9: { name: "mils", factor: 0.0254 },
  10: { name: "yards", factor: 914.4 },
  13: { name: "microns", factor: 0.001, display: "um" },
  14: { name: "decimeters", factor: 100 },
  15: { name: "decameters", factor: 10_000 },
  16: { name: "hectometers", factor: 100_000 },
  21: { name: "US survey feet", factor: 304.8006 }
};

function readInsertUnits(groups: Groups, section: Readonly<{ start: number; end: number }> | undefined): number {
  if (section === undefined) {
    return 0;
  }

  for (let index = section.start; index < section.end; index += 1) {
    if (groups.codes[index] === 9 && groups.values[index]!.trim() === "$INSUNITS") {
      return Number(groups.values[index + 1]?.trim() ?? 0) || 0;
    }
  }

  return 0;
}

// ------------------------------------------------------------------------------------------------
// Conversão
// ------------------------------------------------------------------------------------------------

type DxfVertex = { x: number; y: number; bulge: number };

const EPSILON = 1e-9;
const TWO_PI = Math.PI * 2;
const MAX_ARRAY_INSERTS = 10_000;

// Tipos de linha do AutoCAD → os tipos do CAD-WEB (sólido, tracejado, pontilhado).
function mapLineType(name: string | undefined): CadEntity["lineType"] | null {
  if (name === undefined) {
    return null;
  }

  const upper = name.trim().toUpperCase();

  if (upper === "" || upper === "BYLAYER" || upper === "BYBLOCK") {
    return null;
  }

  if (upper === "CONTINUOUS") {
    return "solid";
  }

  if (/DOT$|^DOT|DOTTED/.test(upper) && !/DASH/.test(upper)) {
    return "dotted";
  }

  return /DASH|HIDDEN|CENTER|PHANTOM|DIVIDE|BORDER|ACAD_ISO/.test(upper) ? "dashed" : "solid";
}

class DxfConverter {
  readonly layers: CadLayer[] = [];
  private readonly layerIds = new Map<string, string>();
  private readonly layerLineTypes = new Map<string, CadEntity["lineType"]>();
  private readonly skipped = new Map<string, number>();
  private readonly warnings: string[] = [];
  private counter = 0;

  constructor(private readonly scale: number) {}

  warn(message: string): void {
    if (this.warnings.length < 50 && !this.warnings.includes(message)) {
      this.warnings.push(message);
    }
  }

  skip(type: string, count = 1): void {
    this.skipped.set(type, (this.skipped.get(type) ?? 0) + count);
  }

  get skippedReport(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.skipped);
  }

  get warningList(): ReadonlyArray<string> {
    return this.warnings;
  }

  // ---- camadas ----

  readLayerTable(records: ReadonlyArray<DxfRecord>): void {
    for (const record of records) {
      if (record.type !== "LAYER") {
        continue;
      }

      const name = (record.str(2) ?? "").trim();

      if (name === "" || this.layerIds.has(name)) {
        continue;
      }

      const flags = record.num(70, 0);
      const colorIndex = record.num(62, 7);
      const trueColor = record.str(420) !== undefined ? trueColorToHex(record.num(420, -1)) : null;
      const color = trueColor ?? aciToHex(Math.abs(colorIndex)) ?? "#ffffff";
      const id = this.registerLayer(name);
      const lineType = mapLineType(record.str(6));

      if (lineType !== null && lineType !== undefined) {
        this.layerLineTypes.set(id, lineType);
      }

      // Desligada (cor negativa) e congelada (bit 1) ficam invisíveis; bit 4 = bloqueada.
      this.layers.push({ id, name, color, visible: colorIndex >= 0 && (flags & 1) === 0, locked: (flags & 4) !== 0, order: this.layers.length });
    }
  }

  private registerLayer(name: string): string {
    const existing = this.layerIds.get(name);

    if (existing !== undefined) {
      return existing;
    }

    let id = name === "0" ? "layer_0" : `layer_${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x"}`;
    const used = new Set(this.layerIds.values());
    let suffix = 2;

    while (used.has(id)) {
      id = `${id.replace(/_\d+$/, "")}_${suffix}`;
      suffix += 1;
    }

    this.layerIds.set(name, id);
    return id;
  }

  // Camada da entidade; nomes ausentes na tabela entram com a cor padrão.
  layerOf(record: DxfRecord): string {
    const name = (record.str(8) ?? "0").trim() || "0";
    const known = this.layerIds.has(name);
    const id = this.registerLayer(name);

    if (!known) {
      this.layers.push({ id, name, color: "#ffffff", visible: true, locked: false, order: this.layers.length });
    }

    return id;
  }

  ensureDefaultLayer(): void {
    if (!this.layers.some((layer) => layer.id === "layer_0")) {
      this.registerLayer("0");
      this.layers.unshift({ id: "layer_0", name: "0", color: "#ffffff", visible: true, locked: false, order: 0 });
    }

    this.layers.forEach((layer, index) => {
      if (layer.order !== index) {
        this.layers[index] = { ...layer, order: index };
      }
    });
  }

  // ---- utilitários de geometria (DXF: Y para cima, em unidades do arquivo) ----

  private point(x: number, y: number, flip = false): Point2D {
    const worldY = -y * this.scale;
    return { x: (flip ? -x : x) * this.scale, y: worldY === 0 ? 0 : worldY };
  }

  private length(value: number): number {
    return value * this.scale;
  }

  private nextId(prefix: string, record: DxfRecord): string {
    this.counter += 1;
    const handle = record.str(5)?.trim();
    return `dxf_${prefix}_${handle !== undefined && handle !== "" ? handle : this.counter}_${this.counter}`;
  }

  private base(record: DxfRecord, prefix: string): Readonly<{ id: string; layerId: string; color?: string; lineType?: "solid" | "dashed" | "dotted" }> {
    const layerId = this.layerOf(record);
    const trueColor = record.str(420) !== undefined ? trueColorToHex(record.num(420, -1)) : null;
    const index = record.num(62, 256);
    const color = trueColor ?? (index > 0 && index < 256 ? aciToHex(index) : null);
    const ownLineType = mapLineType(record.str(6));
    const lineType = ownLineType ?? this.layerLineTypes.get(layerId) ?? null;

    return {
      id: this.nextId(prefix, record),
      layerId,
      ...(color !== null ? { color } : {}),
      ...(lineType !== null && lineType !== "solid" ? { lineType } : {})
    };
  }

  // Arco anti-horário (ângulos DXF em radianos, Y para cima) → arco do documento (Y para baixo).
  private arc(record: DxfRecord, center: Point2D, radius: number, startRad: number, endRad: number, flip: boolean): CadEntity | null {
    if (!(radius > EPSILON)) {
      return null;
    }

    // O espelhamento do OCS (0,0,−1) reflete os ângulos em torno do eixo Y e inverte o sentido.
    const from = flip ? Math.PI - endRad : startRad;
    const to = flip ? Math.PI - startRad : endRad;

    return {
      ...this.base(record, "arc"),
      type: "arc",
      center: this.point(center.x, center.y, flip),
      radius: this.length(radius),
      startAngle: -to,
      endAngle: -from,
      clockwise: true
    };
  }

  // ---- entidades ----

  convert(record: DxfRecord, children: ReadonlyArray<DxfRecord> = []): CadEntity[] {
    if (record.num(67, 0) === 1) {
      this.skip("paper space entities");
      return [];
    }

    if (record.num(60, 0) === 1) {
      this.skip("invisible entities");
      return [];
    }

    const flip = record.num(230, 1) < 0;

    switch (record.type) {
      case "LINE":
        return this.line(record);
      case "LWPOLYLINE":
        return this.lwpolyline(record, flip);
      case "POLYLINE":
        return this.polyline(record, children, flip);
      case "CIRCLE":
        return this.circle(record, flip);
      case "ARC":
        return this.arcEntity(record, flip);
      case "ELLIPSE":
        return this.ellipse(record);
      case "SPLINE":
        return this.spline(record);
      case "TEXT":
        return this.text(record, flip);
      case "MTEXT":
        return this.mtext(record, flip);
      case "INSERT":
        return this.insert(record, flip);
      case "DIMENSION":
        return this.dimension(record);
      case "SOLID":
      case "TRACE":
        return this.solid(record);
      case "LEADER":
        return this.leader(record);
      case "HATCH":
        return this.hatch(record);
      default:
        this.skip(record.type);
        return [];
    }
  }

  private line(record: DxfRecord): CadEntity[] {
    return [{
      ...this.base(record, "line"),
      type: "line",
      start: this.point(record.num(10, 0), record.num(20, 0)),
      end: this.point(record.num(11, 0), record.num(21, 0))
    }];
  }

  private circle(record: DxfRecord, flip: boolean): CadEntity[] {
    const radius = record.num(40, 0);

    return radius > EPSILON
      ? [{ ...this.base(record, "circle"), type: "circle", center: this.point(record.num(10, 0), record.num(20, 0), flip), radius: this.length(radius) }]
      : [];
  }

  private arcEntity(record: DxfRecord, flip: boolean): CadEntity[] {
    const start = (record.num(50, 0) * Math.PI) / 180;
    let end = (record.num(51, 360) * Math.PI) / 180;

    // Início = fim (módulo 2π) seria um arco de varredura nula; o DXF o trata como circunferência.
    if (Math.abs(((end - start) % TWO_PI)) < EPSILON) {
      end = start + TWO_PI;
    }

    const entity = this.arc(record, { x: record.num(10, 0), y: record.num(20, 0) }, record.num(40, 0), start, end, flip);
    return entity === null ? [] : [entity];
  }

  private ellipse(record: DxfRecord): CadEntity[] {
    const majorX = record.num(11, 0);
    const majorY = record.num(21, 0);
    const radiusX = Math.hypot(majorX, majorY);
    const ratio = record.num(40, 1);

    if (!(radiusX > EPSILON) || !(ratio > EPSILON) || ratio > 1 + 1e-9) {
      return [];
    }

    const start = record.num(41, 0);
    const end = record.num(42, TWO_PI);
    const full = Math.abs(((end - start) % TWO_PI)) < 1e-9 || Math.abs(end - start - TWO_PI) < 1e-9;
    const rotation = Math.atan2(-majorY, majorX);

    return [{
      ...this.base(record, "ellipse"),
      type: "ellipse",
      center: this.point(record.num(10, 0), record.num(20, 0)),
      radiusX: this.length(radiusX),
      radiusY: this.length(radiusX * Math.min(1, ratio)),
      rotation: Math.abs(rotation) < 1e-12 ? 0 : rotation,
      // Os parâmetros do DXF crescem no sentido anti-horário (Y para cima): no documento invertem de sinal.
      ...(full ? {} : { startAngle: -end, endAngle: -start })
    }];
  }

  private lwpolyline(record: DxfRecord, flip: boolean): CadEntity[] {
    const vertices: DxfVertex[] = [];

    for (let index = 0; index < record.codes.length; index += 1) {
      const code = record.codes[index]!;
      const value = Number(record.values[index]!.trim());

      if (code === 10) {
        vertices.push({ x: value, y: 0, bulge: 0 });
      } else if (code === 20 && vertices.length > 0) {
        vertices[vertices.length - 1]!.y = value;
      } else if (code === 42 && vertices.length > 0) {
        vertices[vertices.length - 1]!.bulge = Number.isFinite(value) ? value : 0;
      }
    }

    return this.polylineEntities(record, vertices, (record.num(70, 0) & 1) !== 0, flip);
  }

  private polyline(record: DxfRecord, children: ReadonlyArray<DxfRecord>, flip: boolean): CadEntity[] {
    const flags = record.num(70, 0);

    // Malhas (16: polygon mesh, 64: polyface) e polylines 3D (8) não têm representação 2D simples.
    if ((flags & 16) !== 0 || (flags & 64) !== 0) {
      this.skip("POLYLINE (mesh)");
      return [];
    }

    if ((flags & 4) !== 0) {
      this.warn("Curve-fit POLYLINE imported through its vertices (the fitted curve is not recomputed).");
    }

    const vertices: DxfVertex[] = children
      .filter((child) => child.type === "VERTEX" && (child.num(70, 0) & 16) === 0)
      .map((child) => ({ x: child.num(10, 0), y: child.num(20, 0), bulge: child.num(42, 0) }));

    return this.polylineEntities(record, vertices, (flags & 1) !== 0, flip);
  }

  /**
   * Vértices (com bulge) → entidades: trechos retos viram polylines e segmentos com bulge viram arcos exatos
   * (a polyline do CAD-WEB ainda não tem arcos). Sem bulge, uma única polyline.
   */
  private polylineEntities(record: DxfRecord, vertices: ReadonlyArray<DxfVertex>, closed: boolean, flip: boolean): CadEntity[] {
    if (vertices.length < 2) {
      return [];
    }

    if (vertices.every((vertex) => Math.abs(vertex.bulge) < EPSILON)) {
      return [{
        ...this.base(record, "polyline"),
        type: "polyline",
        points: vertices.map((vertex) => this.point(vertex.x, vertex.y, flip)),
        closed: closed && vertices.length >= 3
      }];
    }

    const entities: CadEntity[] = [];
    let run: Point2D[] = [];
    const flush = () => {
      if (run.length >= 2) {
        entities.push({ ...this.base(record, "polyline"), type: "polyline", points: run, closed: false });
      }

      run = [];
    };
    const segmentCount = closed ? vertices.length : vertices.length - 1;

    for (let index = 0; index < segmentCount; index += 1) {
      const from = vertices[index]!;
      const to = vertices[(index + 1) % vertices.length]!;
      const fromPoint = this.point(from.x, from.y, flip);

      if (run.length === 0) {
        run.push(fromPoint);
      }

      if (Math.abs(from.bulge) < EPSILON) {
        run.push(this.point(to.x, to.y, flip));
        continue;
      }

      flush();
      const chord = Math.hypot(to.x - from.x, to.y - from.y);

      if (chord < EPSILON) {
        continue;
      }

      const included = 4 * Math.atan(from.bulge);
      const radius = chord / (2 * Math.sin(Math.abs(included) / 2));
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const offset = chord / 2 / Math.tan(included / 2);
      const center = { x: mid.x - ((to.y - from.y) / chord) * offset, y: mid.y + ((to.x - from.x) / chord) * offset };
      const angleFrom = Math.atan2(from.y - center.y, from.x - center.x);
      const angleTo = Math.atan2(to.y - center.y, to.x - center.x);
      // Bulge positivo percorre o arco no sentido anti-horário (de from para to); negativo, no horário.
      const arc = from.bulge > 0 ? this.arc(record, center, radius, angleFrom, angleTo, flip) : this.arc(record, center, radius, angleTo, angleFrom, flip);

      if (arc !== null) {
        entities.push(arc);
      }

      run = [this.point(to.x, to.y, flip)];
    }

    flush();
    return entities;
  }

  private spline(record: DxfRecord): CadEntity[] {
    const degree = Math.round(record.num(71, 3));
    const flags = record.num(70, 0);
    const closed = (flags & 1) !== 0 || (flags & 2) !== 0;
    const control = pairPoints(record.all(10), record.all(20));
    const fit = pairPoints(record.all(11), record.all(21));
    const weights = record.all(41);
    const curve: NurbsCurve = {
      degree,
      knots: record.all(40),
      controlPoints: control,
      weights: weights.length === control.length ? weights : control.map(() => 1)
    };
    const base = this.base(record, "spline");

    if (control.length > 0 && isValidNurbs(curve)) {
      // Grau 1 é uma polyline.
      if (degree === 1) {
        return [{ ...base, type: "polyline", points: control.map((point) => this.point(point.x, point.y)), closed: closed && control.length >= 3 }];
      }

      let samples = sampleNurbs(curve).map((point) => this.point(point.x, point.y));
      samples = dedupe(samples);

      if (closed && samples.length > 2 && distance(samples[0]!, samples[samples.length - 1]!) < 1e-9 * Math.max(1, this.scale)) {
        samples = samples.slice(0, -1);
      }

      if (samples.length >= (closed ? 3 : 2)) {
        return [{ ...base, type: "spline", closed, controlPoints: fitPointsToBezierChain(samples, closed) }];
      }
    }

    if (fit.length >= (closed ? 3 : 2)) {
      const fitPoints = dedupe(fit.map((point) => this.point(point.x, point.y)));

      if (fitPoints.length >= (closed ? 3 : 2)) {
        return [{ ...base, type: "spline", closed, fitPoints, controlPoints: fitPointsToBezierChain(fitPoints, closed) }];
      }
    }

    // Último recurso: polyline pelos pontos de controle.
    if (control.length >= 2) {
      this.warn("Invalid SPLINE knots: imported as a polyline through the control points.");
      return [{ ...base, type: "polyline", points: control.map((point) => this.point(point.x, point.y)), closed: false }];
    }

    this.skip("SPLINE (invalid)");
    return [];
  }

  private text(record: DxfRecord, flip: boolean): CadEntity[] {
    const content = decodeDxfText(record.str(1) ?? "");
    const height = record.num(40, 0);

    if (content.trim() === "" || !(height > EPSILON)) {
      return [];
    }

    const horizontal = record.num(72, 0);
    const vertical = record.num(73, 0);
    // Com alinhamento diferente do padrão, o ponto de inserção é o segundo (11,21); 3 (aligned) e 5 (fit) ficam à esquerda.
    const useAlignmentPoint = (horizontal !== 0 || vertical !== 0) && horizontal !== 3 && horizontal !== 5 && record.str(11) !== undefined;
    const anchor = useAlignmentPoint ? { x: record.num(11, 0), y: record.num(21, 0) } : { x: record.num(10, 0), y: record.num(20, 0) };
    const rotation = visualDegreesToWorldRadians(flip ? 180 - record.num(50, 0) : record.num(50, 0));

    return [{
      ...this.base(record, "text"),
      type: "text",
      position: this.point(anchor.x, anchor.y, flip),
      content,
      height: this.length(height),
      ...(rotation !== 0 ? { rotation } : {}),
      horizontalAlign: horizontal === 1 || horizontal === 4 ? "center" : horizontal === 2 ? "right" : "left",
      verticalAlign: horizontal === 4 ? "middle" : vertical === 1 ? "bottom" : vertical === 2 ? "middle" : vertical === 3 ? "top" : "baseline"
    }];
  }

  private mtext(record: DxfRecord, flip: boolean): CadEntity[] {
    // O conteúdo vem em pedaços de 250 caracteres (grupo 3) seguidos do último (grupo 1).
    let raw = "";

    for (let index = 0; index < record.codes.length; index += 1) {
      if (record.codes[index] === 3) {
        raw += record.values[index]!;
      }
    }

    raw += record.str(1) ?? "";
    const content = stripMtextFormatting(raw).replace(/\n+$/g, "");
    const height = record.num(40, 0);

    if (content.trim() === "" || !(height > EPSILON)) {
      return [];
    }

    const attachment = Math.round(record.num(71, 1));
    const column = (attachment - 1) % 3;
    const row = Math.floor((attachment - 1) / 3);
    // Direção explícita (11,21) tem prioridade sobre o ângulo (50).
    const degrees = record.str(11) !== undefined ? (Math.atan2(record.num(21, 0), record.num(11, 1)) * 180) / Math.PI : record.num(50, 0);
    const rotation = visualDegreesToWorldRadians(flip ? 180 - degrees : degrees);

    return [{
      ...this.base(record, "mtext"),
      type: "text",
      position: this.point(record.num(10, 0), record.num(20, 0), flip),
      content,
      height: this.length(height),
      ...(rotation !== 0 ? { rotation } : {}),
      horizontalAlign: column === 1 ? "center" : column === 2 ? "right" : "left",
      verticalAlign: row === 0 ? "top" : row === 1 ? "middle" : "bottom"
    }];
  }

  private insert(record: DxfRecord, flip: boolean): CadEntity[] {
    const name = (record.str(2) ?? "").trim();

    if (name === "") {
      return [];
    }

    const scaleX = record.num(41, 1) || 1;
    const scaleY = record.num(42, 1) || 1;
    const angle = (record.num(50, 0) * Math.PI) / 180;
    const columns = Math.max(1, Math.round(record.num(70, 1)));
    const rows = Math.max(1, Math.round(record.num(71, 1)));
    const columnSpacing = record.num(44, 0);
    const rowSpacing = record.num(45, 0);

    if (columns * rows > MAX_ARRAY_INSERTS) {
      this.warn(`INSERT array of ${columns}×${rows} exceeds ${MAX_ARRAY_INSERTS} items and was skipped.`);
      this.skip("INSERT (array too large)");
      return [];
    }

    // Parte linear no espaço DXF: F·R(θ)·S (F = reflexão em X do OCS (0,0,−1)); no documento (Y para baixo) vira Y·L·Y.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const fx = flip ? -1 : 1;
    const dxf = { a: fx * cos * scaleX, b: sin * scaleX, c: -fx * sin * scaleY, d: cos * scaleY };
    const decomposed = decomposeBlockLinear({ a: dxf.a, b: -dxf.b, c: -dxf.c, d: dxf.d });

    if (decomposed === null) {
      this.skip("INSERT (unsupported transform)");
      return [];
    }

    const results: CadEntity[] = [];
    const baseProps = this.base(record, "insert");

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        // Deslocamento da matriz no referencial girado do INSERT (espaço DXF).
        const dx = column * columnSpacing;
        const dy = row * rowSpacing;
        const position = {
          x: record.num(10, 0) + cos * dx - sin * dy,
          y: record.num(20, 0) + sin * dx + cos * dy
        };
        const reference: BlockReferenceEntity = {
          ...baseProps,
          id: rows * columns === 1 ? baseProps.id : `${baseProps.id}_${row}_${column}`,
          type: "block",
          blockName: name,
          position: this.point(position.x, position.y, flip),
          ...(Math.abs(decomposed.rotation) > 1e-12 ? { rotation: decomposed.rotation } : {}),
          ...(Math.abs(decomposed.scaleX - 1) > 1e-12 ? { scaleX: decomposed.scaleX } : {}),
          ...(Math.abs(decomposed.scaleY - 1) > 1e-12 ? { scaleY: decomposed.scaleY } : {})
        };

        results.push(reference);
      }
    }

    return results;
  }

  // A cota vira uma referência ao bloco anônimo (*D1...) que o AutoCAD grava com a geometria já posicionada.
  private dimension(record: DxfRecord): CadEntity[] {
    const name = (record.str(2) ?? "").trim();

    if (name === "") {
      this.skip("DIMENSION (without geometry block)");
      return [];
    }

    return [{ ...this.base(record, "dimension"), type: "block", blockName: name, position: { x: 0, y: 0 } }];
  }

  // Preenchimentos sólidos viram o contorno (a polyline do CAD-WEB não tem preenchimento).
  private solid(record: DxfRecord): CadEntity[] {
    const corners = [0, 1, 3, 2].map((offset) => ({ x: record.num(10 + offset, Number.NaN), y: record.num(20 + offset, Number.NaN) }));
    const points = dedupe(corners.filter((corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y)).map((corner) => this.point(corner.x, corner.y)));

    return points.length >= 3 ? [{ ...this.base(record, "solid"), type: "polyline", points, closed: true }] : [];
  }

  private leader(record: DxfRecord): CadEntity[] {
    const points = dedupe(pairPoints(record.all(10), record.all(20)).map((point) => this.point(point.x, point.y)));
    return points.length >= 2 ? [{ ...this.base(record, "leader"), type: "polyline", points, closed: false }] : [];
  }

  /**
   * HATCH: importa os contornos (caminhos de polyline e arestas de linha, arco e arco de elipse); o padrão de
   * preenchimento não é desenhado. Arestas de spline são ignoradas.
   */
  private hatch(record: DxfRecord): CadEntity[] {
    const entities: CadEntity[] = [];
    const codes = record.codes;
    const values = record.values;
    let cursor = codes.indexOf(91);

    if (cursor === -1) {
      this.skip("HATCH (without boundary)");
      return [];
    }

    const pathCount = Math.round(Number(values[cursor]!));
    cursor += 1;
    let converted = false;

    const read = (code: number): number => {
      while (cursor < codes.length && codes[cursor] !== code) {
        cursor += 1;
      }

      const value = cursor < codes.length ? Number(values[cursor]!.trim()) : Number.NaN;
      cursor += 1;
      return value;
    };

    for (let path = 0; path < pathCount && cursor < codes.length; path += 1) {
      const flag = read(92);

      if (!Number.isFinite(flag)) {
        break;
      }

      if ((flag & 2) !== 0) {
        const hasBulge = read(72) !== 0;
        const closed = read(73) !== 0;
        const count = Math.round(read(93));
        const vertices: DxfVertex[] = [];

        for (let index = 0; index < count; index += 1) {
          const x = read(10);
          const y = read(20);
          // O bulge vem logo após o vértice quando o caminho o declara.
          const bulge = hasBulge && codes[cursor] === 42 ? read(42) : 0;
          vertices.push({ x, y, bulge });
        }

        entities.push(...this.polylineEntities(record, vertices, closed, false));
        converted = true;
      } else {
        const edgeCount = Math.round(read(93));

        for (let edge = 0; edge < edgeCount; edge += 1) {
          const type = read(72);

          if (type === 1) {
            const [x1, y1, x2, y2] = [read(10), read(20), read(11), read(21)];
            entities.push({ ...this.base(record, "hatch"), type: "line", start: this.point(x1, y1), end: this.point(x2, y2) });
          } else if (type === 2) {
            const [cx, cy, radius, start, end] = [read(10), read(20), read(40), read(50), read(51)];
            const counterClockwise = read(73) !== 0;
            const from = ((counterClockwise ? start : end) * Math.PI) / 180;
            const to = ((counterClockwise ? end : start) * Math.PI) / 180;
            const arc = this.arc(record, { x: cx, y: cy }, radius, from, to <= from ? to + TWO_PI : to, false);

            if (arc !== null) {
              entities.push(arc);
            }
          } else if (type === 3) {
            const [cx, cy, mx, my, ratio, start, end] = [read(10), read(20), read(11), read(21), read(40), read(50), read(51)];
            const counterClockwise = read(73) !== 0;
            const from = ((counterClockwise ? start : end) * Math.PI) / 180;
            const to = ((counterClockwise ? end : start) * Math.PI) / 180;
            const radiusX = Math.hypot(mx, my);

            if (radiusX > EPSILON && ratio > EPSILON && ratio <= 1 + 1e-9) {
              entities.push({
                ...this.base(record, "hatch"),
                type: "ellipse",
                center: this.point(cx, cy),
                radiusX: this.length(radiusX),
                radiusY: this.length(radiusX * Math.min(1, ratio)),
                rotation: Math.atan2(-my, mx),
                startAngle: -(to <= from ? to + TWO_PI : to),
                endAngle: -from
              });
            }
          } else {
            this.skip("HATCH (spline edge)");
            return entities;
          }
        }

        converted = true;
      }
    }

    if (!converted) {
      this.skip("HATCH (without boundary)");
    } else {
      this.warn("HATCH imported as outline only (fill pattern is not drawn).");
    }

    return entities;
  }
}

function pairPoints(xs: ReadonlyArray<number>, ys: ReadonlyArray<number>): Point2D[] {
  const count = Math.min(xs.length, ys.length);
  return Array.from({ length: count }, (_unused, index) => ({ x: xs[index]!, y: ys[index]! }));
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dedupe(points: ReadonlyArray<Point2D>): Point2D[] {
  const result: Point2D[] = [];

  for (const point of points) {
    const last = result[result.length - 1];

    if (last === undefined || distance(last, point) > 1e-12) {
      result.push(point);
    }
  }

  return result;
}

// Percorre as entidades de uma seção agrupando POLYLINE/VERTEX/SEQEND e descartando ATTRIB de INSERT.
function entityStream(records: ReadonlyArray<DxfRecord>): Array<Readonly<{ record: DxfRecord; children: ReadonlyArray<DxfRecord> }>> {
  const result: Array<{ record: DxfRecord; children: ReadonlyArray<DxfRecord> }> = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;

    if (record.type === "POLYLINE") {
      const children: DxfRecord[] = [];

      while (index + 1 < records.length && records[index + 1]!.type === "VERTEX") {
        index += 1;
        children.push(records[index]!);
      }

      if (records[index + 1]?.type === "SEQEND") {
        index += 1;
      }

      result.push({ record, children });
      continue;
    }

    if (record.type === "INSERT" && record.num(66, 0) === 1) {
      result.push({ record, children: [] });

      while (index + 1 < records.length && records[index + 1]!.type === "ATTRIB") {
        index += 1;
      }

      if (records[index + 1]?.type === "SEQEND") {
        index += 1;
      }

      continue;
    }

    result.push({ record, children: [] });
  }

  return result;
}

function isValidEntity(entity: CadEntity): boolean {
  try {
    validateCadDocument({ ...createEmptyDocument("entity_check"), entities: [entity] });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------------------------
// API
// ------------------------------------------------------------------------------------------------

const IGNORED_BLOCK_PREFIXES = ["*model_space", "*paper_space"];

export function parseDxfDocumentWithReport(source: string | Uint8Array, options: DxfImportOptions = {}): DxfImportResult {
  const text = typeof source === "string" ? source : decodeDxfBytes(source);

  if (text.startsWith("AutoCAD Binary DXF")) {
    throw new DxfImportError("Binary DXF is not supported. Save the file as ASCII DXF and try again.");
  }

  const groups = readGroups(text);
  const sections = findSections(groups);

  if (sections.size === 0) {
    throw new DxfImportError("Invalid DXF: no SECTION found. Is this an ASCII DXF file?");
  }

  const unitCode = readInsertUnits(groups, sections.get("HEADER"));
  const unit = UNIT_TO_MM[unitCode];
  const scale = unit?.factor ?? 1;
  const converter = new DxfConverter(scale);

  if (unit === undefined) {
    converter.warn(unitCode === 0 ? "The file does not declare its units ($INSUNITS); millimeters assumed." : `Unknown $INSUNITS ${unitCode}; millimeters assumed.`);
  }

  const tables = sections.get("TABLES");

  if (tables !== undefined) {
    converter.readLayerTable(splitRecords(groups, tables.start, tables.end));
  }

  // Blocos
  const blocks: BlockDefinition[] = [];
  const blockNames = new Set<string>();
  const blocksSection = sections.get("BLOCKS");

  if (blocksSection !== undefined) {
    const records = splitRecords(groups, blocksSection.start, blocksSection.end);
    let index = 0;

    while (index < records.length) {
      const record = records[index]!;

      if (record.type !== "BLOCK") {
        index += 1;
        continue;
      }

      let end = index + 1;

      while (end < records.length && records[end]!.type !== "ENDBLK") {
        end += 1;
      }

      const name = (record.str(2) ?? record.str(3) ?? "").trim();
      const lower = name.toLowerCase();

      if (name !== "" && !IGNORED_BLOCK_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
        const basePoint = { x: record.num(10, 0) * scale, y: -record.num(20, 0) * scale };
        const entities: CadEntity[] = [];

        for (const { record: entityRecord, children } of entityStream(records.slice(index + 1, end))) {
          entities.push(...converter.convert(entityRecord, children).filter(isValidEntity));
        }

        let unique = name;
        let suffix = 2;

        while (blockNames.has(unique.toLowerCase())) {
          unique = `${name}_${suffix}`;
          suffix += 1;
        }

        blockNames.add(unique.toLowerCase());
        blocks.push({ name: unique, basePoint: { x: basePoint.x, y: basePoint.y === 0 ? 0 : basePoint.y }, entities });
      }

      index = end + 1;
    }
  }

  // Desenho (espaço modelo)
  const entitiesSection = sections.get("ENTITIES");
  const entities: CadEntity[] = [];

  if (entitiesSection !== undefined) {
    for (const { record, children } of entityStream(splitRecords(groups, entitiesSection.start, entitiesSection.end))) {
      entities.push(...converter.convert(record, children).filter(isValidEntity));
    }
  }

  converter.ensureDefaultLayer();

  // Referências a blocos inexistentes (ou ignorados) são descartadas, no desenho e dentro dos blocos.
  const known = new Set(blocks.map((block) => block.name));
  let missingReferences = 0;
  const keepReference = (entity: CadEntity): boolean => {
    if (entity.type !== "block" || known.has(entity.blockName)) {
      return true;
    }

    missingReferences += 1;
    return false;
  };
  const cleanedEntities = entities.filter(keepReference);
  const cleanedBlocks = blocks.map((block) => ({ ...block, entities: block.entities.filter(keepReference) }));

  if (missingReferences > 0) {
    converter.skip("INSERT (block not defined)", missingReferences);
  }

  const document: CadDocument = {
    ...createEmptyDocument(options.documentId ?? "dxf_import"),
    ...(unit?.display !== undefined ? { displayUnit: unit.display } : {}),
    layers: converter.layers,
    activeLayerId: "layer_0",
    ...(cleanedBlocks.length > 0 ? { blocks: cleanedBlocks } : {}),
    entities: cleanedEntities
  };

  validateCadDocument(document);

  return {
    document,
    report: {
      entities: cleanedEntities.length,
      blocks: cleanedBlocks.length,
      layers: converter.layers.length,
      skipped: converter.skippedReport,
      warnings: converter.warningList,
      sourceUnit: unit?.name ?? "unspecified",
      scaleToMillimeters: scale
    }
  };
}

export function parseDxfDocument(source: string | Uint8Array, options: DxfImportOptions = {}): CadDocument {
  return parseDxfDocumentWithReport(source, options).document;
}

const CODE_PAGE_LABELS: Readonly<Record<string, string>> = {
  ansi_1250: "windows-1250",
  ansi_1251: "windows-1251",
  ansi_1252: "windows-1252",
  ansi_1253: "windows-1253",
  ansi_1254: "windows-1254",
  ansi_1257: "windows-1257",
  dos850: "ibm850",
  dos437: "ibm437"
};

/**
 * Decodifica os bytes do arquivo: DXF a partir do R2007 é UTF-8; os anteriores usam a página de código declarada
 * em $DWGCODEPAGE (ANSI_1252 por padrão). Arquivos DWG e DXF binário são recusados com uma mensagem clara.
 */
export function decodeDxfBytes(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 24));

  if (/^AC10\d\d/.test(head)) {
    throw new DxfImportError("DWG files are not supported. Convert the file to DXF (for example with the ODA File Converter) and import the DXF.");
  }

  if (head.startsWith("AutoCAD Binary DXF")) {
    throw new DxfImportError("Binary DXF is not supported. Save the file as ASCII DXF and try again.");
  }

  const sample = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 65_536)));
  const version = /\$ACADVER\s+1\s+(AC\d+)/.exec(sample)?.[1];
  const codePage = /\$DWGCODEPAGE\s+3\s+([A-Za-z0-9_]+)/.exec(sample)?.[1]?.toLowerCase();
  const modern = version !== undefined && Number(version.slice(2)) >= 1021;

  if (!modern && codePage !== undefined) {
    const label = CODE_PAGE_LABELS[codePage];

    if (label !== undefined) {
      return new TextDecoder(label).decode(bytes);
    }
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// Reexportada para testes: avaliação de B-splines.
export { evaluateNurbs };
