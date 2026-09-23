import type {
  CadDisplayUnit,
  CadDocument,
  CadEntity,
  CadLayer,
  DimensionStyle,
  TextEntity
} from "@cad-web/cad-core";
import {
  IDENTITY_MATRIX,
  affineEllipse,
  ellipseParamAtPoint,
  flattenCubicBezier,
  flattenQuadraticBezier,
  linearPartTimesRotationScale,
  multiplyMatrices,
  rotationMatrix,
  scaleMatrix,
  svgArcToCenter,
  transformPoint,
  translationMatrix,
  type Matrix2D,
  type Point2D
} from "@cad-web/cad-geometry";
import { CAD_IO_SCHEMA_VERSION, CadIoValidationError, validateCadDocument } from "./json";

/**
 * Importação de SVG.
 *
 * - **SVG exportado pelo CAD-WEB**: cada entidade traz o próprio JSON em `data-cad-entity` e o documento
 *   traz camadas, estilos de cota e unidades em `data-cad-document`; a ida e volta é exata para todos os
 *   tipos (inclusive elipses, arcos, arcos de elipse, cotas e textos), com cor, tipo e espessura de linha.
 * - **SVG de outros programas**: o arquivo é percorrido respeitando a hierarquia de grupos e seus
 *   `transform` (matrix, translate, scale, rotate, skewX/Y). Linhas, retângulos, círculos, elipses,
 *   polylines/polígonos, `<path>` (M/L/H/V/Z/A/C/S/Q/T) e `<text>` viram entidades nativas; arcos do
 *   path viram arcos ou arcos de elipse; curvas de Bézier viram splines exatas. Camadas do CAD-WEB e do
 *   Inkscape viram camadas. `<use>` instancia elementos de `<defs>` e `<symbol>` (com viewBox); regras CSS
 *   de `<style>` (tag, .classe, #id) valem com a precedência do SVG; width/height com unidade (mm, cm, in,
 *   pt, pc, q, px) + viewBox convertem as coordenadas para mm. Conteúdo de `<defs>`, `<clipPath>` etc. e
 *   `display:none` é ignorado.
 */

type SvgContext = Readonly<{
  matrix: Matrix2D;
  // Propriedades de apresentação herdadas (stroke, fill, font-size...).
  style: ReadonlyMap<string, string>;
  layerId: string | null;
}>;

type DocumentMeta = Partial<Pick<CadDocument, "units" | "displayUnit" | "activeLayerId" | "activeDimensionStyleId">> & {
  layers?: ReadonlyArray<CadLayer>;
  dimensionStyles?: ReadonlyArray<DimensionStyle>;
};

const INHERITED_PROPERTIES = [
  "stroke",
  "fill",
  "font-size",
  "font-family",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "visibility"
];

// Conteúdo que não é desenho: definições, recortes, metadados etc.
const SKIPPED_ELEMENTS = new Set([
  "defs",
  "clippath",
  "mask",
  "symbol",
  "marker",
  "pattern",
  "style",
  "title",
  "desc",
  "metadata",
  "lineargradient",
  "radialgradient",
  "filter",
  "foreignobject",
  "script"
]);

const TAG_PATTERN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;

const DEFAULT_DIMENSION_STYLE: DimensionStyle = {
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
};

export function parseSvgDocument(source: string): CadDocument {
  if (!/<svg[\s>]/i.test(source)) {
    throw new CadIoValidationError("SVG source must contain an svg root element", "$");
  }

  return new SvgImporter(removeUnsafeSvgBlocks(source)).run();
}

class SvgImporter {
  private readonly entities: CadEntity[] = [];
  private readonly layers: CadLayer[] = [];
  private readonly usedIds = new Set<string>();
  // Índice original (data-cad-index) das entidades nativas, para restaurar a ordem de desenho.
  private readonly nativeOrder = new Map<CadEntity, number>();
  private meta: DocumentMeta | null = null;
  private documentId: string | null = null;
  private cssRules: ReadonlyArray<CssRule> = [];
  private useInstances = 0;
  private readonly elementsById = new Map<string, Readonly<{ start: number; afterTag: number; rawName: string; selfClosing: boolean }>>();

  constructor(private readonly source: string) {}

  run(): CadDocument {
    this.cssRules = parseCssRules(this.source);
    this.indexElementsById();
    this.walk(0, this.source.length, { matrix: IDENTITY_MATRIX, style: new Map(), layerId: null }, 0, new Set(), null);
    return this.buildDocument();
  }

  /**
   * Percorre as tags em [from, to) com uma pilha de contextos (transform, estilo herdado, camada).
   * Em um fragmento instanciado por <use>, fragmentRoot descreve o elemento referenciado: ele entra mesmo
   * sendo <symbol> (tratado como grupo, com o mapeamento do viewBox) e herda o contexto do <use>.
   */
  private walk(
    from: number,
    to: number,
    rootContext: SvgContext,
    depth: number,
    visiting: ReadonlySet<string>,
    fragmentRoot: Readonly<{ matrix: Matrix2D | null }> | null
  ): void {
    const stack: Array<{ tag: string; context: SvgContext; id: string | undefined }> = [];
    const pattern = new RegExp(TAG_PATTERN.source, "g");
    pattern.lastIndex = from;
    let pendingFragmentRoot = fragmentRoot;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(this.source)) !== null && match.index < to) {
      const rawName = match[2];

      if (rawName === undefined) {
        continue; // comentário, CDATA, declaração
      }

      const tag = localName(rawName);
      const closing = match[1] === "/";

      if (closing) {
        const index = findLastIndex(stack, (entry) => entry.tag === tag);
        if (index >= 0) stack.length = index;
        continue;
      }

      const selfClosing = match[4] === "/";
      const attributes = parseSvgAttributes(match[3] ?? "");
      const css = cssDeclarationsFor(this.cssRules, tag, attributes);
      const parent = stack[stack.length - 1]?.context ?? rootContext;
      const afterTag = pattern.lastIndex;
      const skipSubtree = () => {
        if (!selfClosing) pattern.lastIndex = findMatchingClose(this.source, rawName, afterTag);
      };
      const isFragmentRoot = pendingFragmentRoot !== null;
      const fragmentMatrix = pendingFragmentRoot?.matrix ?? null;
      pendingFragmentRoot = null;

      if ((SKIPPED_ELEMENTS.has(tag) && !(isFragmentRoot && tag === "symbol")) || isHidden(attributes, css)) {
        skipSubtree();
        continue;
      }

      const isRootSvg = tag === "svg" && stack.length === 0 && depth === 0;
      let context = this.childContext(parent, attributes, css, tag, isRootSvg);

      if (fragmentMatrix !== null) {
        context = { ...context, matrix: multiplyMatrices(context.matrix, fragmentMatrix) };
      }

      if (isRootSvg && this.documentId === null) {
        this.readRootMetadata(attributes);
      }

      // Entidade exportada pelo CAD-WEB: o JSON embutido é a fonte exata; o desenho SVG é só visual.
      const native = attributes.get("data-cad-entity");
      if (native !== undefined && depth === 0) {
        this.addNativeEntity(native, parseNumber(attributes.get("data-cad-index")));
        skipSubtree();
        continue;
      }

      if (tag === "use") {
        // Um <use> que aponta para um ancestral seu é circular: pelo SVG, não desenha nada.
        const ancestors = new Set([...visiting, ...stack.map((entry) => entry.id).filter((value): value is string => value !== undefined)]);
        this.instantiateUse(attributes, context, depth, ancestors);
        skipSubtree();
        continue;
      }

      if (tag === "g" && attributes.get("data-entity-type") === "text" && !selfClosing) {
        const end = findMatchingClose(this.source, rawName, afterTag);
        this.addLegacyTextGroup(attributes, this.source.slice(afterTag, end), context, match.index);
        pattern.lastIndex = end;
        continue;
      }

      if (tag === "text") {
        if (!selfClosing) {
          const end = findMatchingClose(this.source, rawName, afterTag);
          this.addText(attributes, this.source.slice(afterTag, closeTagStart(this.source, end)), context, match.index);
          pattern.lastIndex = end;
        }
        continue;
      }

      this.addShape(tag, attributes, context, match.index);

      if (!selfClosing) {
        stack.push({ tag, context, id: attributes.get("id") });
      }
    }
  }

  // Posição de cada elemento com id, para o <use> instanciar o trecho referenciado.
  private indexElementsById(): void {
    const pattern = new RegExp(TAG_PATTERN.source, "g");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(this.source)) !== null) {
      if (match[2] === undefined || match[1] === "/") continue;
      const id = /\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(match[3] ?? "");
      const value = id?.[1] ?? id?.[2];
      if (value !== undefined && !this.elementsById.has(value)) {
        this.elementsById.set(value, { start: match.index, afterTag: pattern.lastIndex, rawName: match[2], selfClosing: match[4] === "/" });
      }
    }
  }

  /**
   * <use href="#id" x y>: instancia o elemento referenciado (inclusive dentro de <defs> ou um <symbol>)
   * com o transform do <use> e o deslocamento x/y; o <symbol> com viewBox é ajustado a width/height.
   * Referências circulares, profundidade acima de 8 e explosão de instâncias são bloqueadas.
   */
  private instantiateUse(attributes: ReadonlyMap<string, string>, context: SvgContext, depth: number, visiting: ReadonlySet<string>): void {
    const href = attributes.get("href");
    const id = href?.startsWith("#") ? href.slice(1) : null;

    if (id === null || visiting.has(id) || depth >= MAX_USE_DEPTH || this.entities.length >= MAX_IMPORTED_ENTITIES || this.useInstances >= MAX_USE_INSTANCES) return;

    this.useInstances += 1;

    const target = this.elementsById.get(id);
    if (target === undefined) return;

    const matrix = multiplyMatrices(context.matrix, translationMatrix(parseNumber(attributes.get("x")) ?? 0, parseNumber(attributes.get("y")) ?? 0));
    let fragmentMatrix: Matrix2D | null = null;

    if (localName(target.rawName) === "symbol") {
      const targetAttributes = parseSvgAttributes(TAG_ATTRIBUTES(this.source, target.start));
      fragmentMatrix = viewBoxMatrix(targetAttributes.get("viewbox") ?? targetAttributes.get("viewBox"), parseNumber(attributes.get("width")), parseNumber(attributes.get("height")));
    }

    const end = target.selfClosing ? target.afterTag : findMatchingClose(this.source, target.rawName, target.afterTag);
    this.walk(target.start, end, { ...context, matrix }, depth + 1, new Set([...visiting, id]), { matrix: fragmentMatrix });
  }

  private childContext(
    parent: SvgContext,
    attributes: ReadonlyMap<string, string>,
    css: ReadonlyMap<string, string>,
    tag: string,
    isRootSvg: boolean
  ): SvgContext {
    const transform = attributes.get("transform");
    let matrix = transform === undefined ? parent.matrix : multiplyMatrices(parent.matrix, parseTransformList(transform));

    if (isRootSvg) {
      // Unidades físicas: width/height com unidade (mm, cm, in, pt, pc, q, px) + viewBox definem mm por unidade.
      const scale = physicalScale(attributes);
      if (scale !== null) matrix = multiplyMatrices(matrix, scaleMatrix(scale));
    } else if (tag === "svg") {
      // <svg> aninhado: desloca por x/y e mapeia o viewBox para width/height.
      matrix = multiplyMatrices(matrix, translationMatrix(parseNumber(attributes.get("x")) ?? 0, parseNumber(attributes.get("y")) ?? 0));
      const viewBox = viewBoxMatrix(attributes.get("viewbox"), parseNumber(attributes.get("width")), parseNumber(attributes.get("height")));
      if (viewBox !== null) matrix = multiplyMatrices(matrix, viewBox);
    }

    const style = new Map(parent.style);
    for (const name of INHERITED_PROPERTIES) {
      const value = readPresentation(attributes, name, css);
      if (value !== undefined && value !== "inherit") style.set(name, value);
    }

    return { matrix, style, layerId: this.readLayer(attributes, tag) ?? parent.layerId };
  }

  // Grupos de camada: os do CAD-WEB (data-layer-id + data-layer-name) e os do Inkscape (groupmode="layer").
  private readLayer(attributes: ReadonlyMap<string, string>, tag: string): string | null {
    if (tag !== "g") return null;

    const cadLayerId = sanitizeIdentifier(attributes.get("data-layer-id"));
    const cadLayerName = attributes.get("data-layer-name");

    if (cadLayerId !== null && cadLayerName !== undefined) {
      this.ensureLayer(cadLayerId, cadLayerName);
      return cadLayerId;
    }

    if (attributes.get("inkscape:groupmode") === "layer") {
      const label = attributes.get("inkscape:label");
      const id = sanitizeIdentifier(attributes.get("id")) ?? sanitizeIdentifier(label);
      if (id !== null) {
        this.ensureLayer(id, label ?? id);
        return id;
      }
    }

    return null;
  }

  private ensureLayer(id: string, name: string): void {
    if (!this.layers.some((layer) => layer.id === id)) {
      this.layers.push({ id, name: name.trim() || id, color: "#ffffff", visible: true, locked: false, order: this.layers.length });
    }
  }

  private readRootMetadata(attributes: ReadonlyMap<string, string>): void {
    this.documentId = sanitizeIdentifier(attributes.get("data-document-id")) ?? "svg_import";
    const raw = attributes.get("data-cad-document");

    if (raw === undefined) return;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed)) this.meta = parsed as DocumentMeta;
    } catch {
      this.meta = null;
    }
  }

  private addNativeEntity(raw: string, order: number | null): void {
    try {
      const parsed = JSON.parse(raw) as unknown;

      if (isRecord(parsed) && typeof parsed.id === "string" && typeof parsed.type === "string" && isValidEntity(parsed as CadEntity)) {
        this.usedIds.add(parsed.id);
        this.entities.push(parsed as CadEntity);
        if (order !== null) this.nativeOrder.set(parsed as CadEntity, order);
      }
    } catch {
      // JSON corrompido: a entidade é ignorada, o restante do arquivo segue.
    }
  }

  private push(entity: CadEntity): void {
    if (isValidEntity(entity)) {
      this.usedIds.add(entity.id);
      this.entities.push(entity);
    }
  }

  private base(attributes: ReadonlyMap<string, string>, context: SvgContext, prefix: string, index: number, colorProperty = "stroke") {
    const color = importedColor(context.style.get(colorProperty));
    return {
      id: this.uniqueId(sanitizeIdentifier(attributes.get("id")) ?? `${prefix}_${index}`),
      layerId: sanitizeIdentifier(attributes.get("data-layer-id")) ?? context.layerId ?? "layer_0",
      ...(color !== undefined ? { color } : {})
    };
  }

  private uniqueId(preferred: string): string {
    let candidate = preferred;
    let counter = 1;

    while (this.usedIds.has(candidate)) {
      candidate = `${preferred}_${counter}`;
      counter += 1;
    }

    this.usedIds.add(candidate);
    return candidate;
  }

  private addShape(tag: string, attributes: ReadonlyMap<string, string>, context: SvgContext, index: number): void {
    const m = context.matrix;
    const number = (name: string, fallback: number) => parseNumber(attributes.get(name)) ?? fallback;

    if (tag === "line") {
      const start = transformPoint({ x: number("x1", 0), y: number("y1", 0) }, m);
      const end = transformPoint({ x: number("x2", 0), y: number("y2", 0) }, m);
      this.push({ ...this.base(attributes, context, "line", index), type: "line", start, end });
      return;
    }

    if (tag === "rect") {
      this.addRect(attributes, context, index);
      return;
    }

    if (tag === "circle" || tag === "ellipse") {
      const rx = tag === "circle" ? number("r", 0) : number("rx", 0);
      const ry = tag === "circle" ? number("r", 0) : number("ry", 0);

      if (rx > 0 && ry > 0) {
        this.addEllipseLike(attributes, context, index, { x: number("cx", 0), y: number("cy", 0) }, rx, ry, tag);
      }
      return;
    }

    if (tag === "polyline" || tag === "polygon") {
      const points = parsePointList(attributes.get("points") ?? "").map((point) => transformPoint(point, m));
      this.addPointRun(attributes, context, index, tag, points, tag === "polygon");
      return;
    }

    if (tag === "path") {
      this.addPath(attributes, context, index);
    }
  }

  private addRect(attributes: ReadonlyMap<string, string>, context: SvgContext, index: number): void {
    const width = parseNumber(attributes.get("width"));
    const height = parseNumber(attributes.get("height"));

    if (width === null || height === null || width <= 0 || height <= 0) return;

    const x = parseNumber(attributes.get("x")) ?? 0;
    const y = parseNumber(attributes.get("y")) ?? 0;
    const m = context.matrix;
    const base = this.base(attributes, context, "rect", index);

    if (isIdentity(m)) {
      this.push({ ...base, type: "rectangle", x, y, width, height, rotation: 0 });
      return;
    }

    const similarity = similarityOf(m);

    if (similarity !== null) {
      const origin = transformPoint({ x, y }, m);
      this.push({ ...base, type: "rectangle", x: origin.x, y: origin.y, width: width * similarity.scale, height: height * similarity.scale, rotation: similarity.rotation });
      return;
    }

    // Cisalhamento, escala não uniforme com rotação ou espelhamento: o retângulo vira polígono fechado.
    const corners = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }].map((point) => transformPoint(point, m));
    this.push({ ...base, type: "polyline", points: corners, closed: true });
  }

  private addEllipseLike(
    attributes: ReadonlyMap<string, string>,
    context: SvgContext,
    index: number,
    center: Point2D,
    rx: number,
    ry: number,
    prefix: string
  ): void {
    const image = affineEllipse(transformPoint(center, context.matrix), linearPartTimesRotationScale(context.matrix, 0, rx, ry));
    const base = this.base(attributes, context, prefix, index);

    if (Math.abs(image.radiusX - image.radiusY) <= 1e-9 * image.radiusX) {
      this.push({ ...base, type: "circle", center: image.center, radius: image.radiusX });
      return;
    }

    this.push({ ...base, type: "ellipse", center: image.center, radiusX: image.radiusX, radiusY: image.radiusY, rotation: normalizeRotation(image.rotation) });
  }

  // Sequência de pontos: 2 pontos abertos viram linha; demais viram polyline (fechada ou aberta).
  private addPointRun(
    attributes: ReadonlyMap<string, string>,
    context: SvgContext,
    index: number,
    prefix: string,
    rawPoints: ReadonlyArray<Point2D>,
    closed: boolean
  ): void {
    const points = dedupeConsecutive(rawPoints);

    if (closed && points.length >= 3) {
      this.push({ ...this.base(attributes, context, prefix, index), type: "polyline", points, closed: true });
      return;
    }

    if (points.length === 2 && prefix === "path") {
      this.push({ ...this.base(attributes, context, prefix, index), type: "line", start: points[0]!, end: points[1]! });
      return;
    }

    if (points.length >= 2) {
      this.push({ ...this.base(attributes, context, prefix, index), type: "polyline", points, closed: false });
    }
  }

  /**
   * Run de path: só retas viram linha/polyline; com curvas, o run inteiro vira uma spline exata (as retas
   * entram como Béziers retas). A transformação afim é aplicada aos pontos de controle, sem perda.
   */
  private addPathRun(attributes: ReadonlyMap<string, string>, context: SvgContext, index: number, run: Extract<PathItem, { kind: "run" }>): void {
    const m = context.matrix;

    if (!run.segments.some((segment) => segment.kind === "cubic")) {
      const points = [run.start, ...run.segments.map((segment) => segment.to)];
      const closedPoints = run.closed && points.length > 1 && samePoint(points[0]!, points[points.length - 1]!) ? points.slice(0, -1) : points;
      this.addPointRun(attributes, context, index, "path", closedPoints.map((point) => transformPoint(point, m)), run.closed);
      return;
    }

    const chain: Point2D[] = [run.start];
    let previous = run.start;

    for (const segment of run.segments) {
      if (segment.kind === "cubic") {
        chain.push(segment.c1, segment.c2, segment.to);
      } else {
        chain.push(
          { x: previous.x + (segment.to.x - previous.x) / 3, y: previous.y + (segment.to.y - previous.y) / 3 },
          { x: previous.x + (2 * (segment.to.x - previous.x)) / 3, y: previous.y + (2 * (segment.to.y - previous.y)) / 3 },
          segment.to
        );
      }
      previous = segment.to;
    }

    this.push({
      ...this.base(attributes, context, "path", index),
      type: "spline",
      controlPoints: chain.map((point) => transformPoint(point, m)),
      closed: run.closed
    });
  }

  private addPath(attributes: ReadonlyMap<string, string>, context: SvgContext, index: number): void {
    const items = parsePathData(attributes.get("d") ?? "");
    const m = context.matrix;

    for (const item of items) {
      if (item.kind === "run") {
        this.addPathRun(attributes, context, index, item);
        continue;
      }

      const arc = svgArcToCenter(item.from, item.to, item.rx, item.ry, item.rotation, item.largeArc, item.sweep);

      if (arc === null) {
        this.addPointRun(attributes, context, index, "path", [item.from, item.to].map((point) => transformPoint(point, m)), false);
        continue;
      }

      const image = affineEllipse(transformPoint(arc.center, m), linearPartTimesRotationScale(m, arc.rotation, arc.radiusX, arc.radiusY));
      const from = transformPoint(item.from, m);
      const to = transformPoint(item.to, m);
      const determinant = m.a * m.d - m.b * m.c;
      // Varredura crescente no mundo quando o sentido do SVG e o da transformação concordam.
      const increasing = arc.deltaParam > 0 !== determinant < 0;
      const base = this.base(attributes, context, "path", index);

      if (Math.abs(image.radiusX - image.radiusY) <= 1e-9 * image.radiusX) {
        this.push({
          ...base,
          type: "arc",
          center: image.center,
          radius: image.radiusX,
          startAngle: Math.atan2(from.y - image.center.y, from.x - image.center.x),
          endAngle: Math.atan2(to.y - image.center.y, to.x - image.center.x),
          clockwise: increasing
        });
        continue;
      }

      const rotation = normalizeRotation(image.rotation);
      const paramFrom = ellipseParamAtPoint(image.center, image.radiusX, image.radiusY, rotation, from);
      const paramTo = ellipseParamAtPoint(image.center, image.radiusX, image.radiusY, rotation, to);
      this.push({
        ...base,
        type: "ellipse",
        center: image.center,
        radiusX: image.radiusX,
        radiusY: image.radiusY,
        rotation,
        startAngle: increasing ? paramFrom : paramTo,
        endAngle: increasing ? paramTo : paramFrom
      });
    }
  }

  private addText(attributes: ReadonlyMap<string, string>, inner: string, context: SvgContext, index: number): void {
    const preserve = attributes.get("xml:space") === "preserve";
    const content = readSvgTextLines(inner, preserve).filter((line) => line !== "").join("\n");
    const fontSize = parseNumber(context.style.get("font-size") ?? "16");

    if (content === "" || fontSize === null || fontSize <= 0) return;

    const m = context.matrix;
    const position = transformPoint({ x: firstNumber(attributes.get("x")), y: firstNumber(attributes.get("y")) }, m);
    const rotation = Math.atan2(m.b, m.a);
    const height = fontSize * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    const verticalAlign = readVerticalAlign(context.style.get("dominant-baseline"));

    this.push({
      ...this.base(attributes, context, "text", index, "fill"),
      type: "text",
      position,
      content,
      height,
      ...(Math.abs(rotation) > 1e-12 ? { rotation } : {}),
      ...readTextStyleFields(context.style),
      ...(verticalAlign !== "baseline" ? { verticalAlign } : {})
    });
  }

  /**
   * Texto exportado por uma versão anterior do CAD-WEB (sem data-cad-entity): um grupo com um <text> por
   * linha e o ponto de inserção exato em data-position.
   */
  private addLegacyTextGroup(attributes: ReadonlyMap<string, string>, inner: string, context: SvgContext, index: number): void {
    const lines: Array<{ attributes: ReadonlyMap<string, string>; content: string }> = [];
    const textPattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
    let match: RegExpExecArray | null;

    while ((match = textPattern.exec(inner)) !== null) {
      const lineAttributes = parseSvgAttributes(match[1] ?? "");
      const preserve = /\bxml:space\s*=\s*["']preserve["']/i.test(match[1] ?? "");
      lines.push({ attributes: lineAttributes, content: readSvgTextLines(match[2] ?? "", preserve).join(" ") });
    }

    const first = lines[0];
    const content = lines.map((line) => line.content).join("\n");
    const height = parseNumber(context.style.get("font-size"));

    if (first === undefined || content.trim() === "" || height === null || height <= 0) return;

    const firstX = parseNumber(first.attributes.get("x")) ?? 0;
    const firstY = parseNumber(first.attributes.get("y")) ?? 0;
    const rotation = readRotationRadians(first.attributes.get("transform"));
    const [positionX, positionY] = (attributes.get("data-position") ?? "").trim().split(/[\s,]+/).map((part) => parseNumber(part));
    const hasPosition = positionX !== null && positionX !== undefined && positionY !== null && positionY !== undefined;
    const verticalAlign = readVerticalAlign(attributes.get("data-vertical-align"));

    this.push({
      ...this.base(attributes, context, "text", index, "fill"),
      type: "text",
      position: hasPosition ? { x: positionX!, y: positionY! } : { x: firstX, y: firstY },
      content,
      height,
      ...(rotation !== 0 ? { rotation } : {}),
      ...readTextStyleFields(context.style),
      ...(hasPosition && verticalAlign !== "baseline" ? { verticalAlign } : {})
    });
  }

  private buildDocument(): CadDocument {
    if (this.nativeOrder.size > 0) {
      // Ordenação estável: entidades com índice na ordem original; as demais mantêm a posição relativa ao fim.
      const encounter = new Map(this.entities.map((entity, index) => [entity, index]));
      this.entities.sort((left, right) => {
        const a = this.nativeOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
        const b = this.nativeOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
        return a !== b ? a - b : encounter.get(left)! - encounter.get(right)!;
      });
    }

    const metaLayers = Array.isArray(this.meta?.layers) ? this.meta!.layers.filter(isLayerLike) : [];
    const layers: CadLayer[] = metaLayers.length > 0 ? [...metaLayers] : [...this.layers];

    // Camadas referenciadas pelas entidades e ausentes do arquivo são criadas, para aparecerem no painel.
    // A camada 0, quando necessária, vem primeiro, como nos programas de CAD.
    const referenced = new Set(this.entities.map((entity) => entity.layerId || "layer_0"));
    if ((referenced.has("layer_0") || layers.length === 0) && !layers.some((layer) => layer.id === "layer_0")) {
      layers.unshift({ id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 });
    }

    for (const layerId of referenced) {
      if (!layers.some((layer) => layer.id === layerId)) {
        layers.push({ id: layerId, name: layerId, color: "#ffffff", visible: true, locked: false, order: layers.length });
      }
    }

    layers.forEach((layer, index) => {
      if (layer.order !== index && metaLayers.length === 0) layers[index] = { ...layer, order: index };
    });

    const metaStyles = Array.isArray(this.meta?.dimensionStyles)
      ? this.meta!.dimensionStyles.filter(isDimensionStyleLike)
      : [];
    const dimensionStyles = metaStyles.length > 0 ? metaStyles : [DEFAULT_DIMENSION_STYLE];
    const units = ["mm", "cm", "m", "in"].includes(String(this.meta?.units)) ? this.meta!.units! : "mm";
    const displayUnit = ["um", "mm", "cm", "m", "km"].includes(String(this.meta?.displayUnit)) ? (this.meta!.displayUnit as CadDisplayUnit) : undefined;
    const activeLayerId = layers.some((layer) => layer.id === this.meta?.activeLayerId)
      ? this.meta!.activeLayerId!
      : layers.some((layer) => layer.id === "layer_0") ? "layer_0" : layers[0]!.id;
    const activeDimensionStyleId = dimensionStyles.some((style) => style.id === this.meta?.activeDimensionStyleId)
      ? this.meta!.activeDimensionStyleId!
      : dimensionStyles[0]!.id;

    const document: CadDocument = {
      schemaVersion: CAD_IO_SCHEMA_VERSION,
      id: this.documentId ?? "svg_import",
      units,
      ...(displayUnit !== undefined ? { displayUnit } : {}),
      layers,
      activeLayerId,
      dimensionStyles,
      activeDimensionStyleId,
      entities: this.entities
    };

    validateCadDocument(document);
    return document;
  }
}

// ------------------------------------------------------------------------------------------------
// Path
// ------------------------------------------------------------------------------------------------

type PathSegment =
  | Readonly<{ kind: "line"; to: Point2D }>
  | Readonly<{ kind: "cubic"; c1: Point2D; c2: Point2D; to: Point2D }>;

type PathItem =
  | Readonly<{ kind: "run"; start: Point2D; segments: ReadonlyArray<PathSegment>; closed: boolean }>
  | Readonly<{ kind: "arc"; from: Point2D; to: Point2D; rx: number; ry: number; rotation: number; largeArc: boolean; sweep: boolean }>;

/**
 * Interpreta o atributo d. Trechos retos e curvas (C/S cúbicas; Q/T quadráticas elevadas a cúbicas, de
 * forma exata) formam "runs"; cada comando A vira um item de arco próprio. Z fecha o run quando ele
 * começou no início do subpath (acrescentando o segmento reto de fechamento, se preciso).
 */
export function parsePathData(d: string): ReadonlyArray<PathItem> {
  const items: PathItem[] = [];
  const reader = new PathReader(d);
  let current: Point2D = { x: 0, y: 0 };
  let subpathStart: Point2D = { x: 0, y: 0 };
  let runStart: Point2D = current;
  let segments: PathSegment[] = [];
  let runStartsSubpath = true;
  let lastControl: Point2D | null = null;
  let lastCommand = "";
  let command = "";

  const flush = (closed = false) => {
    if (segments.length > 0) items.push({ kind: "run", start: runStart, segments, closed });
    segments = [];
  };
  const push = (segment: PathSegment) => {
    if (segments.length === 0) runStart = current;
    segments.push(segment);
    current = segment.to;
  };

  while (!reader.done()) {
    const letter = reader.readCommand();

    if (letter !== null) {
      command = letter;
    } else if (command === "") {
      break; // número sem comando: path inválido
    } else if (command === "M") {
      command = "L";
    } else if (command === "m") {
      command = "l";
    }

    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const offset = (point: Point2D): Point2D => (relative ? { x: current.x + point.x, y: current.y + point.y } : point);

    if (upper === "Z") {
      if (segments.length > 0 && !samePoint(current, subpathStart)) push({ kind: "line", to: subpathStart });
      flush(segments.length > 0 && runStartsSubpath);
      current = subpathStart;
      runStartsSubpath = true;
      lastControl = null;
      lastCommand = upper;
      continue;
    }

    // H e V recebem um único número; os demais comandos começam por um par.
    const point = upper === "H" || upper === "V" ? null : reader.readPoint();

    if (point === null && upper !== "H" && upper !== "V") break;

    if (upper === "M") {
      flush();
      current = offset(point!);
      subpathStart = current;
      runStartsSubpath = true;
      lastControl = null;
    } else if (upper === "L") {
      push({ kind: "line", to: offset(point!) });
      lastControl = null;
    } else if (upper === "H" || upper === "V") {
      const value = reader.readNumber();
      if (value === null) break;
      push({
        kind: "line",
        to: upper === "H"
          ? { x: relative ? current.x + value : value, y: current.y }
          : { x: current.x, y: relative ? current.y + value : value }
      });
      lastControl = null;
    } else if (upper === "C" || upper === "S") {
      const control1: Point2D = upper === "C"
        ? offset(point!)
        : lastControl !== null && (lastCommand === "C" || lastCommand === "S")
          ? { x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y }
          : current;
      const control2 = upper === "C" ? reader.readPoint() : point;
      const end = reader.readPoint();
      if (control2 === null || end === null) break;
      const absoluteControl2 = offset(control2);
      push({ kind: "cubic", c1: control1, c2: absoluteControl2, to: offset(end) });
      lastControl = absoluteControl2;
    } else if (upper === "Q" || upper === "T") {
      const control: Point2D = upper === "Q"
        ? offset(point!)
        : lastControl !== null && (lastCommand === "Q" || lastCommand === "T")
          ? { x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y }
          : current;
      const end = upper === "Q" ? reader.readPoint() : point;
      if (end === null) break;
      const absoluteEnd = offset(end);
      // Elevação de grau exata: a quadrática é a cúbica com controles a 2/3 do caminho até o controle.
      push({
        kind: "cubic",
        c1: { x: current.x + (2 / 3) * (control.x - current.x), y: current.y + (2 / 3) * (control.y - current.y) },
        c2: { x: absoluteEnd.x + (2 / 3) * (control.x - absoluteEnd.x), y: absoluteEnd.y + (2 / 3) * (control.y - absoluteEnd.y) },
        to: absoluteEnd
      });
      lastControl = control;
    } else if (upper === "A") {
      const rotation = reader.readNumber();
      const largeArc = reader.readFlag();
      const sweep = reader.readFlag();
      const end = reader.readPoint();
      if (rotation === null || largeArc === null || sweep === null || end === null) break;
      const absoluteEnd = offset(end);
      flush();
      runStartsSubpath = false;
      items.push({ kind: "arc", from: current, to: absoluteEnd, rx: point!.x, ry: point!.y, rotation, largeArc, sweep });
      current = absoluteEnd;
      lastControl = null;
    } else {
      break;
    }

    lastCommand = upper;
  }

  flush();
  return items;
}

class PathReader {
  private index = 0;

  constructor(private readonly text: string) {}

  done(): boolean {
    this.skipSeparators();
    return this.index >= this.text.length;
  }

  readCommand(): string | null {
    this.skipSeparators();
    const char = this.text[this.index];
    if (char !== undefined && /[MmZzLlHhVvCcSsQqTtAa]/.test(char)) {
      this.index += 1;
      return char;
    }
    return null;
  }

  readNumber(): number | null {
    this.skipSeparators();
    const match = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(this.text.slice(this.index));
    if (match === null) return null;
    this.index += match[0].length;
    return Number(match[0]);
  }

  // Lê um par; para H/V devolve null sem consumir (o chamador lê um número só).
  readPoint(): Point2D | null {
    const start = this.index;
    const x = this.readNumber();
    const y = x === null ? null : this.readNumber();
    if (x === null || y === null) {
      this.index = start;
      return null;
    }
    return { x, y };
  }

  // Flags do arco são um único dígito 0/1 e podem vir colados ("a10 10 0 01 5 5").
  readFlag(): boolean | null {
    this.skipSeparators();
    const char = this.text[this.index];
    if (char === "0" || char === "1") {
      this.index += 1;
      return char === "1";
    }
    return null;
  }

  private skipSeparators(): void {
    while (this.index < this.text.length && /[\s,]/.test(this.text[this.index]!)) this.index += 1;
  }
}

// ------------------------------------------------------------------------------------------------
// Transformações
// ------------------------------------------------------------------------------------------------

export function parseTransformList(value: string): Matrix2D {
  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let matrix = IDENTITY_MATRIX;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const args = (match[2] ?? "").trim().split(/[\s,]+/).filter((part) => part !== "").map(Number);
    if (args.some((arg) => !Number.isFinite(arg))) continue;
    const name = (match[1] ?? "").toLowerCase();
    let next = IDENTITY_MATRIX;

    if (name === "matrix" && args.length === 6) {
      next = { a: args[0]!, b: args[1]!, c: args[2]!, d: args[3]!, e: args[4]!, f: args[5]! };
    } else if (name === "translate" && args.length >= 1) {
      next = translationMatrix(args[0]!, args[1] ?? 0);
    } else if (name === "scale" && args.length >= 1) {
      next = scaleMatrix(args[0]!, args[1] ?? args[0]!);
    } else if (name === "rotate" && args.length >= 1) {
      next = rotationMatrix((args[0]! * Math.PI) / 180, { x: args[1] ?? 0, y: args[2] ?? 0 });
    } else if (name === "skewx" && args.length === 1) {
      next = { ...IDENTITY_MATRIX, c: Math.tan((args[0]! * Math.PI) / 180) };
    } else if (name === "skewy" && args.length === 1) {
      next = { ...IDENTITY_MATRIX, b: Math.tan((args[0]! * Math.PI) / 180) };
    }

    matrix = multiplyMatrices(matrix, next);
  }

  return matrix;
}

function isIdentity(m: Matrix2D): boolean {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
}

// Rotação + escala uniforme sem espelhamento (preserva retângulos como retângulos).
function similarityOf(m: Matrix2D): Readonly<{ scale: number; rotation: number }> | null {
  const scaleX = Math.hypot(m.a, m.b);
  const scaleY = Math.hypot(m.c, m.d);
  const orthogonal = Math.abs(m.a * m.c + m.b * m.d) <= 1e-9 * scaleX * scaleY;
  const determinant = m.a * m.d - m.b * m.c;

  if (!orthogonal || determinant <= 0 || Math.abs(scaleX - scaleY) > 1e-9 * scaleX) {
    return null;
  }

  return { scale: Math.abs(scaleX - 1) < 1e-12 ? 1 : scaleX, rotation: Math.atan2(m.b, m.a) };
}

function normalizeRotation(rotation: number): number {
  // Elipses são simétricas por 180°: a rotação fica em (−π/2, π/2].
  let value = rotation % Math.PI;
  if (value <= -Math.PI / 2) value += Math.PI;
  if (value > Math.PI / 2) value -= Math.PI;
  return Math.abs(value) < 1e-15 ? 0 : value;
}

function readRotationRadians(transform: string | undefined): number {
  if (transform === undefined) return 0;
  const m = parseTransformList(transform);
  return Math.atan2(m.b, m.a);
}

// ------------------------------------------------------------------------------------------------
// Texto
// ------------------------------------------------------------------------------------------------

// Extrai as linhas do conteúdo de um <text>: cada <tspan> com x, y ou dy inicia uma nova linha.
function readSvgTextLines(inner: string, preserveSpaces = false): ReadonlyArray<string> {
  if (!/<tspan\b/i.test(inner)) {
    // Com xml:space="preserve" (como na exportação do CAD-WEB) os espaços do conteúdo são mantidos.
    return [preserveSpaces ? decodeSvgText(inner.replace(/<[^>]*>/g, "")) : normalizeSvgTextContent(inner)];
  }

  const lines: string[] = [];
  let current = normalizeSvgTextContent(inner.slice(0, inner.search(/<tspan\b/i)));
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

// Campos de estilo comuns: alinhamento horizontal, fonte, negrito e itálico.
function readTextStyleFields(style: ReadonlyMap<string, string>): Partial<TextEntity> {
  const anchor = style.get("text-anchor");
  const fontFamily = style.get("font-family")?.trim();
  const weight = style.get("font-weight")?.trim().toLowerCase();
  const fontStyle = style.get("font-style")?.trim().toLowerCase();
  const bold = weight === "bold" || weight === "bolder" || (weight !== undefined && Number(weight) >= 600);

  return {
    ...(anchor === "middle" ? { horizontalAlign: "center" as const } : anchor === "end" ? { horizontalAlign: "right" as const } : {}),
    // A fonte padrão da exportação não é gravada de volta, para o texto seguir o padrão do app.
    ...(fontFamily !== undefined && fontFamily !== "" && fontFamily !== "Arial, sans-serif" ? { fontFamily: fontFamily.replace(/^["']|["']$/g, "") } : {}),
    ...(bold ? { bold: true } : {}),
    ...(fontStyle === "italic" || fontStyle === "oblique" ? { italic: true } : {})
  };
}

function readVerticalAlign(value: string | undefined): NonNullable<TextEntity["verticalAlign"]> {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "middle" || normalized === "central") return "middle";
  if (normalized === "top" || normalized === "hanging" || normalized === "text-before-edge") return "top";
  if (normalized === "bottom" || normalized === "text-after-edge" || normalized === "ideographic") return "bottom";
  return "baseline";
}

// ------------------------------------------------------------------------------------------------
// Utilitários
// ------------------------------------------------------------------------------------------------

/**
 * Cor importada: "none", currentColor e cores quase pretas viram "cor da camada", pois o fundo do
 * desenho é escuro e o preto padrão dos SVGs deixaria as entidades invisíveis.
 */
function importedColor(value: string | undefined): string | undefined {
  const color = value?.trim();

  if (color === undefined || color === "" || /^(none|currentcolor|transparent|inherit)$/i.test(color) || /^url\(/i.test(color)) {
    return undefined;
  }

  const rgb = parseRgb(color);

  if (rgb !== null) {
    const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return luminance < 0.08 ? undefined : color;
  }

  return /^black$/i.test(color) ? undefined : /^[a-z]+$/i.test(color) ? color : undefined;
}

function parseRgb(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);

  if (hex !== null) {
    const digits = hex[1]!.length === 3 ? hex[1]!.split("").map((digit) => digit + digit).join("") : hex[1]!;
    return [0, 2, 4].map((offset) => Number.parseInt(digits.slice(offset, offset + 2), 16)) as [number, number, number];
  }

  const functional = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  return functional === null ? null : [Number(functional[1]), Number(functional[2]), Number(functional[3])];
}

// Precedência do SVG: declaração inline em style > regra CSS de <style> > atributo de apresentação.
function readPresentation(attributes: ReadonlyMap<string, string>, name: string, css?: ReadonlyMap<string, string>): string | undefined {
  const style = attributes.get("style");

  if (style !== undefined) {
    for (const declaration of style.split(";")) {
      const separator = declaration.indexOf(":");
      if (separator > 0 && declaration.slice(0, separator).trim().toLowerCase() === name) {
        return declaration.slice(separator + 1).replace(/!important/i, "").trim();
      }
    }
  }

  return css?.get(name) ?? attributes.get(name);
}

function isHidden(attributes: ReadonlyMap<string, string>, css?: ReadonlyMap<string, string>): boolean {
  return readPresentation(attributes, "display", css) === "none";
}

// ------------------------------------------------------------------------------------------------
// CSS de <style>
// ------------------------------------------------------------------------------------------------

type CssRule = Readonly<{
  tag: string | null;
  id: string | null;
  classes: ReadonlyArray<string>;
  specificity: number;
  order: number;
  declarations: ReadonlyMap<string, string>;
}>;

/**
 * Lê as regras dos blocos <style> com seletores simples: tag, .classe, #id, tag.classe, *, e listas
 * separadas por vírgula. Seletores com combinadores, atributos ou pseudo-classes são ignorados.
 */
function parseCssRules(source: string): ReadonlyArray<CssRule> {
  const rules: CssRule[] = [];
  const blocks = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let block: RegExpExecArray | null;
  let order = 0;

  while ((block = blocks.exec(source)) !== null) {
    const text = (block[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    let rule: RegExpExecArray | null;

    while ((rule = rulePattern.exec(text)) !== null) {
      const declarations = new Map<string, string>();
      for (const declaration of (rule[2] ?? "").split(";")) {
        const separator = declaration.indexOf(":");
        if (separator > 0) {
          declarations.set(declaration.slice(0, separator).trim().toLowerCase(), declaration.slice(separator + 1).replace(/!important/i, "").trim());
        }
      }

      for (const rawSelector of (rule[1] ?? "").split(",")) {
        const selector = rawSelector.trim();
        const parsed = /^(\*|[A-Za-z][\w-]*)?(#[\w-]+)?((?:\.[\w-]+)*)$/.exec(selector);
        if (selector === "" || parsed === null) continue;
        const tag = parsed[1] !== undefined && parsed[1] !== "*" ? parsed[1].toLowerCase() : null;
        const id = parsed[2]?.slice(1) ?? null;
        const classes = (parsed[3] ?? "").split(".").filter((name) => name !== "");
        rules.push({ tag, id, classes, specificity: (id !== null ? 100 : 0) + classes.length * 10 + (tag !== null ? 1 : 0), order: order++, declarations });
      }
    }
  }

  return rules;
}

// Declarações CSS que valem para o elemento: maior especificidade vence; em empate, a regra posterior.
function cssDeclarationsFor(rules: ReadonlyArray<CssRule>, tag: string, attributes: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  if (rules.length === 0) return EMPTY_MAP;

  const id = attributes.get("id");
  const classes = new Set((attributes.get("class") ?? "").split(/\s+/).filter((name) => name !== ""));
  const matching = rules
    .filter((rule) => (rule.tag === null || rule.tag === tag) && (rule.id === null || rule.id === id) && rule.classes.every((name) => classes.has(name)))
    .sort((left, right) => left.specificity - right.specificity || left.order - right.order);

  if (matching.length === 0) return EMPTY_MAP;

  const result = new Map<string, string>();
  for (const rule of matching) for (const [name, value] of rule.declarations) result.set(name, value);
  return result;
}

const EMPTY_MAP: ReadonlyMap<string, string> = new Map();
const MAX_USE_DEPTH = 8;
const MAX_IMPORTED_ENTITIES = 500_000;
const MAX_USE_INSTANCES = 100_000;

// ------------------------------------------------------------------------------------------------
// Unidades físicas e viewBox
// ------------------------------------------------------------------------------------------------

const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, q: 0.25, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 };

// Comprimento com unidade absoluta, em mm; null quando sem unidade (ou em %, em, etc.).
function lengthInMillimeters(value: string | undefined): number | null {
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(mm|cm|q|in|pt|pc|px)\s*$/i.exec(value ?? "");
  return match === null ? null : Number(match[1]) * MM_PER_UNIT[match[2]!.toLowerCase()]!;
}

function parseViewBox(value: string | undefined): Readonly<{ minX: number; minY: number; width: number; height: number }> | null {
  const numbers = (value ?? "").trim().split(/[\s,]+/).map(Number);
  if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number)) || numbers[2]! <= 0 || numbers[3]! <= 0) return null;
  return { minX: numbers[0]!, minY: numbers[1]!, width: numbers[2]!, height: numbers[3]! };
}

/**
 * Escala de unidade do usuário para mm no <svg> raiz, quando width/height trazem unidade absoluta:
 * com viewBox, mm por unidade = width_mm / largura do viewBox (uniforme, como preserveAspectRatio "meet");
 * sem viewBox, a unidade do usuário é o px do CSS (25,4/96 mm). Sem unidade, 1 unidade = 1 mm (padrão).
 * A origem do desenho é mantida (só escala), para as coordenadas continuarem as do arquivo.
 */
function physicalScale(attributes: ReadonlyMap<string, string>): number | null {
  const widthMm = lengthInMillimeters(attributes.get("width"));
  const heightMm = lengthInMillimeters(attributes.get("height"));

  if (widthMm === null && heightMm === null) return null;

  const viewBox = parseViewBox(attributes.get("viewbox"));
  const scales = viewBox === null
    ? [MM_PER_UNIT.px!]
    : [widthMm === null ? null : widthMm / viewBox.width, heightMm === null ? null : heightMm / viewBox.height].filter((value): value is number => value !== null);
  const scale = Math.min(...scales);

  return Number.isFinite(scale) && scale > 0 ? scale : null;
}

// Mapeia um viewBox para a área width × height (uniforme, "meet"); null se faltar informação.
function viewBoxMatrix(viewBoxValue: string | undefined, width: number | null, height: number | null): Matrix2D | null {
  const viewBox = parseViewBox(viewBoxValue);
  if (viewBox === null) return null;

  const scales = [width === null ? null : width / viewBox.width, height === null ? null : height / viewBox.height].filter((value): value is number => value !== null && value > 0);
  const scale = scales.length === 0 ? 1 : Math.min(...scales);
  return multiplyMatrices(scaleMatrix(scale), translationMatrix(-viewBox.minX, -viewBox.minY));
}

// Texto dos atributos da tag de abertura que começa em start.
function TAG_ATTRIBUTES(source: string, start: number): string {
  const pattern = new RegExp(TAG_PATTERN.source, "g");
  pattern.lastIndex = start;
  return pattern.exec(source)?.[3] ?? "";
}

function isValidEntity(entity: CadEntity): boolean {
  try {
    validateCadDocument({
      schemaVersion: CAD_IO_SCHEMA_VERSION,
      id: "entity_check",
      units: "mm",
      layers: [],
      activeLayerId: "layer_0",
      dimensionStyles: [],
      activeDimensionStyleId: "",
      entities: [entity]
    });
    return true;
  } catch {
    return false;
  }
}

function isDimensionStyleLike(value: unknown): value is DimensionStyle {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string"
    && ["textHeight", "arrowSize", "extensionOffset", "extensionOvershoot", "precision"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]))
    && typeof value.unitSuffix === "string" && typeof value.arrowType === "string";
}

function isLayerLike(value: unknown): value is CadLayer {
  return isRecord(value) && typeof value.id === "string" && value.id !== "" && typeof value.name === "string"
    && typeof value.color === "string" && typeof value.visible === "boolean" && typeof value.locked === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Nome da tag sem prefixo de namespace ("svg:g" → "g").
function localName(name: string): string {
  const colon = name.indexOf(":");
  return (colon >= 0 ? name.slice(colon + 1) : name).toLowerCase();
}

function findLastIndex<T>(items: ReadonlyArray<T>, predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return index;
  }
  return -1;
}

// Posição logo após o fechamento correspondente (respeitando aninhamento da mesma tag).
function findMatchingClose(source: string, rawName: string, from: number): number {
  const escaped = rawName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<(/?)${escaped}(?=[\\s/>])(?:"[^"]*"|'[^']*'|[^'">])*?(/?)>`, "gi");
  pattern.lastIndex = from;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    if (match[1] === "/") {
      depth -= 1;
      if (depth === 0) return pattern.lastIndex;
    } else if (match[2] !== "/") {
      depth += 1;
    }
  }

  return source.length;
}

// Início da tag de fechamento que termina em end (para recortar o conteúdo interno).
function closeTagStart(source: string, end: number): number {
  const start = source.lastIndexOf("</", end - 1);
  return start >= 0 ? start : end;
}

function parsePointList(raw: string): Point2D[] {
  const numbers = raw.trim().split(/[\s,]+/).filter((token) => token !== "").map(Number);
  const points: Point2D[] = [];

  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const x = numbers[index]!;
    const y = numbers[index + 1]!;
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }

  return points;
}

function dedupeConsecutive(points: ReadonlyArray<Point2D>): Point2D[] {
  const result: Point2D[] = [];
  for (const point of points) {
    if (result.length === 0 || !samePoint(result[result.length - 1]!, point)) result.push(point);
  }
  return result;
}

function samePoint(a: Point2D, b: Point2D): boolean {
  return Math.abs(a.x - b.x) <= 1e-12 && Math.abs(a.y - b.y) <= 1e-12;
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(value.trim());
  if (match === null) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

// x e y do <text> podem ser listas; vale o primeiro valor.
function firstNumber(value: string | undefined): number {
  return parseNumber(value?.trim().split(/[\s,]+/)[0]) ?? 0;
}

function sanitizeIdentifier(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

export function parseSvgAttributes(source: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(source)) !== null) {
    const rawName = match[1];
    const value = match[2] ?? match[3] ?? match[4];

    if (rawName === undefined || value === undefined) continue;

    const name = rawName.toLowerCase();

    // Atributos de evento e links externos nunca são lidos; só referências internas (#id) do <use>.
    if (name.startsWith("on")) continue;

    if (name === "href" || name === "xlink:href") {
      const decoded = decodeSvgAttribute(value).trim();
      if (decoded.startsWith("#")) attributes.set("href", decoded);
      continue;
    }

    attributes.set(name, decodeSvgAttribute(value));
  }

  return attributes;
}

export function decodeSvgAttribute(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function removeUnsafeSvgBlocks(source: string): string {
  // A importação ignora blocos executáveis antes de procurar entidades suportadas.
  return source
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "");
}
