import { entityBoundingBox, expandBlockReference, getDocumentSpatialIndex, type CadDocument, type CadEntity, type DimensionEntity, type TextEntity } from "@cad-web/cad-core";
import type { BoundingBox } from "@cad-web/cad-geometry";
import { appendTextGreekingPath, LOD_TEXT_MIN_PX, renderDimensionEntity, renderTextEntity } from "./entities";
import { rotationMatrix, transformPoint, ellipseArcPoints, type Point2D } from "@cad-web/cad-geometry";
import { DEFAULT_RENDER_STYLE, type RenderStyle, type ScreenSize, type Viewport } from "./types";

// Abaixo deste tamanho em pixels a entidade é colapsada em um ponto (LOD), poupando a montagem da geometria.
const LOD_DOT_THRESHOLD_PX = 1.5;
// Vértices de polyline a menos deste deslocamento (px) do último vértice desenhado são descartados (decimação).
const POLYLINE_DECIMATION_PX = 0.4;
// Máximo de formas por chamada de stroke(): equilibra o custo por chamada e a granularidade da fatia de tempo.
const SHAPES_PER_STROKE = 1500;
// A cada tantos itens processados o relógio é consultado para respeitar o orçamento de tempo.
const CLOCK_CHECK_INTERVAL = 256;
// Folga (px) ao redor da janela de visualização para não cortar traços grossos, setas e tracejados nas bordas.
const VIEW_MARGIN_PX = 2;

export type RenderStats = {
  visibleEntities: number;
  renderedEntities: number;
  totalEntities: number;
  indexQueryTimeMs: number;
  renderTimeMs: number;
  // Chamadas de stroke() emitidas (uma por lote, não por entidade).
  strokeCalls: number;
  // Entidades colapsadas em pontos pelo LOD.
  dotEntities: number;
  // Vértices de polyline descartados pela decimação.
  decimatedVertices: number;
  // Quantidade de fatias de tempo usadas para concluir o desenho.
  steps: number;
  complete: boolean;
};

export type RenderJobOptions = Readonly<{
  // Tamanho da janela em pixels CSS; sem ele usa o tamanho do bitmap do canvas.
  screenSize?: ScreenSize;
}>;

type StrokeBucket = {
  readonly strokeStyle: string;
  readonly lineWidth: number;
  readonly dash: ReadonlyArray<number>;
  readonly entities: CadEntity[];
};

type SpecialItem = Readonly<{
  entity: DimensionEntity | TextEntity;
  strokeStyle: string;
  lineWidth: number;
  dash: ReadonlyArray<number>;
}>;

type DotBucket = { readonly color: string; readonly xs: number[] };

type Phase = "collect" | "strokes" | "dots" | "specials" | "done";

const NO_DASH: ReadonlyArray<number> = [];
const DASHED: ReadonlyArray<number> = [8, 6];
const DOTTED: ReadonlyArray<number> = [2, 4];

/**
 * Desenho de um documento em fatias de tempo. O trabalho é dividido em: coletar o que é visível (índice
 * espacial + camadas + LOD), agrupar por estilo de traço, e desenhar cada grupo com um único caminho por lote
 * (a troca de cor/espessura/tracejado e o stroke() por entidade eram o gargalo). step(orçamento) devolve true
 * ao terminar e pode ser chamado de novo para continuar, o que mantém a interface responsiva em desenhos grandes;
 * cancel() abandona o desenho (ao mudar o viewport antes de ele terminar). A ordem de desenho é por grupo de estilo
 * (na ordem em que aparecem no documento) e, dentro do grupo, a do documento.
 */
export class DocumentRenderJob {
  private phase: Phase = "collect";
  private started = false;
  private cancelled = false;

  private readonly stylesByKey = new Map<string, StrokeBucket>();
  private readonly dotsByColor = new Map<string, DotBucket>();
  private readonly specials: SpecialItem[] = [];
  private readonly layerById: ReadonlyMap<string, CadDocument["layers"][number]>;
  private readonly viewBounds: BoundingBox;
  private readonly originX: number;
  private readonly originY: number;
  private readonly scale: number;

  private candidates: ReadonlyArray<CadEntity> = [];
  private candidateCursor = 0;
  private bucketList: StrokeBucket[] = [];
  private bucketCursor = 0;
  private shapeCursor = 0;
  private dotList: DotBucket[] = [];
  private dotBucketCursor = 0;
  private dotCursor = 0;
  private specialCursor = 0;

  private readonly result: RenderStats;

  constructor(
    private readonly context: CanvasRenderingContext2D,
    private readonly document: CadDocument,
    private readonly viewport: Viewport,
    private readonly style: RenderStyle = DEFAULT_RENDER_STYLE,
    options: RenderJobOptions = {}
  ) {
    this.originX = viewport.origin.x;
    this.originY = viewport.origin.y;
    this.scale = viewport.scale;
    this.layerById = new Map(document.layers.map((layer) => [layer.id, layer]));

    const width = options.screenSize?.width ?? context.canvas.width;
    const height = options.screenSize?.height ?? context.canvas.height;
    const margin = VIEW_MARGIN_PX / viewport.scale;
    this.viewBounds = {
      minX: viewport.origin.x - margin,
      minY: viewport.origin.y - margin,
      maxX: viewport.origin.x + width / viewport.scale + margin,
      maxY: viewport.origin.y + height / viewport.scale + margin
    };

    this.result = {
      visibleEntities: 0,
      renderedEntities: 0,
      totalEntities: document.entities.length,
      indexQueryTimeMs: 0,
      renderTimeMs: 0,
      strokeCalls: 0,
      dotEntities: 0,
      decimatedVertices: 0,
      steps: 0,
      complete: false
    };
  }

  get done(): boolean {
    return this.phase === "done";
  }

  get stats(): RenderStats {
    return this.result;
  }

  // Fração aproximada do trabalho concluída (0 a 1), para indicadores de progresso.
  get progress(): number {
    switch (this.phase) {
      case "collect":
        return this.candidates.length === 0 ? 0 : (this.candidateCursor / this.candidates.length) * 0.3;
      case "strokes":
        return 0.3 + (this.bucketList.length === 0 ? 0 : (this.bucketCursor / this.bucketList.length) * 0.6);
      case "dots":
        return 0.9;
      case "specials":
        return 0.95;
      default:
        return 1;
    }
  }

  // Abandona o desenho: restaura o estado do contexto e impede novos passos.
  cancel(): void {
    if (this.cancelled || this.phase === "done") {
      return;
    }

    this.cancelled = true;
    this.finish(false);
  }

  /**
   * Avança o desenho por até budgetMs milissegundos (Infinity = até o fim). Devolve true quando terminou.
   * Pelo menos uma unidade de trabalho é feita por chamada, então o desenho sempre progride.
   */
  step(budgetMs = Number.POSITIVE_INFINITY): boolean {
    if (this.phase === "done" || this.cancelled) {
      return true;
    }

    const stepStart = performance.now();
    const deadline = stepStart + budgetMs;

    if (!this.started) {
      this.started = true;
      this.context.save();
      this.context.strokeStyle = this.style.strokeColor;
      this.context.lineWidth = this.style.lineWidth;
    }

    this.result.steps += 1;

    // A fase em curso no início da chamada sempre executa (garante progresso); as seguintes só se sobrar tempo.
    let first = true;
    const hasTime = (): boolean => first || performance.now() < deadline;

    if (this.phase === "collect" && hasTime()) {
      first = false;

      if (this.collect(deadline)) {
        this.phase = "strokes";
        this.bucketList = [...this.stylesByKey.values()];
        this.dotList = [...this.dotsByColor.values()];
      }
    }

    if (this.phase === "strokes" && hasTime()) {
      first = false;

      if (this.drawStrokes(deadline)) {
        this.phase = "dots";
      }
    }

    if (this.phase === "dots" && hasTime()) {
      first = false;

      if (this.drawDots(deadline)) {
        this.phase = "specials";
      }
    }

    if (this.phase === "specials" && hasTime()) {
      first = false;

      if (this.drawSpecials(deadline)) {
        this.finish(true);
      }
    }

    this.result.renderTimeMs += performance.now() - stepStart;
    return this.done;
  }

  private finish(complete: boolean): void {
    if (this.started) {
      this.context.restore();
    }

    this.phase = "done";
    this.result.complete = complete;
  }

  // Fase 1: consulta o índice e classifica cada entidade visível (camada, LOD, grupo de estilo).
  private collect(deadline: number): boolean {
    if (this.candidates.length === 0 && this.candidateCursor === 0) {
      const indexStart = performance.now();
      this.candidates = getDocumentSpatialIndex(this.document).query(this.viewBounds);
      this.result.indexQueryTimeMs = performance.now() - indexStart;
      this.result.visibleEntities = this.candidates.length;
    }

    let processed = 0;

    while (this.candidateCursor < this.candidates.length) {
      this.classify(this.candidates[this.candidateCursor]!);
      this.candidateCursor += 1;
      processed += 1;

      if (processed % CLOCK_CHECK_INTERVAL === 0 && performance.now() >= deadline) {
        return this.candidateCursor >= this.candidates.length;
      }
    }

    return true;
  }

  private classify(candidate: CadEntity): void {
    if (candidate.type !== "block") {
      this.classifyEntity(candidate);
      return;
    }

    // Referências de bloco são desenhadas pela geometria expandida (cacheada por referência); cada entidade
    // expandida carrega a camada herdada, então a visibilidade vale por entidade.
    const blockLayer = this.layerById.get(candidate.layerId || "layer_0");
    if (blockLayer && !blockLayer.visible) return;

    const blockBounds = entityBoundingBox(candidate, this.document.blocks);
    const blockExtent = Math.max((blockBounds.maxX - blockBounds.minX) * this.scale, (blockBounds.maxY - blockBounds.minY) * this.scale);

    // LOD: um bloco sub-pixel vira um ponto, sem expandir a geometria.
    if (blockExtent < LOD_DOT_THRESHOLD_PX) {
      this.addDot((blockBounds.minX + blockBounds.maxX) / 2, (blockBounds.minY + blockBounds.maxY) / 2, this.style.overrideStroke === true ? this.style.strokeColor : candidate.color || blockLayer?.color || this.style.strokeColor);
      return;
    }

    // Cada entidade expandida só é desenhada se cruzar a janela de visualização (culling interno do bloco).
    for (const child of expandBlockReference(this.document.blocks, candidate)) {
      const childBounds = entityBoundingBox(child);

      if (childBounds.minX <= this.viewBounds.maxX && childBounds.maxX >= this.viewBounds.minX && childBounds.minY <= this.viewBounds.maxY && childBounds.maxY >= this.viewBounds.minY) {
        this.classifyEntity(child);
      }
    }
  }

  private classifyEntity(entity: CadEntity): void {
    const layer = this.layerById.get(entity.layerId || "layer_0");
    if (layer && !layer.visible) return;

    // LOD: entidades que ocupam menos de ~1.5px são desenhadas como um ponto, sem montar a geometria completa.
    // O envoltório já foi calculado (e cacheado) no culling, então a verificação é praticamente gratuita.
    const bounds = entityBoundingBox(entity);
    const screenExtent = Math.max((bounds.maxX - bounds.minX) * this.scale, (bounds.maxY - bounds.minY) * this.scale);
    const override = this.style.overrideStroke === true;
    const color = override ? this.style.strokeColor : entity.color || layer?.color || this.style.strokeColor;

    if (screenExtent < LOD_DOT_THRESHOLD_PX) {
      this.addDot((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, color);
      return;
    }

    const lineWidth = override ? this.style.lineWidth : entity.lineThickness !== undefined ? entity.lineThickness : this.style.lineWidth;
    const dash = override
      ? this.style.lineDash ?? NO_DASH
      : entity.lineType === "dashed" ? DASHED : entity.lineType === "dotted" ? DOTTED : NO_DASH;

    if (entity.type === "dimension" || (entity.type === "text" && entity.height * this.scale >= LOD_TEXT_MIN_PX)) {
      this.specials.push({ entity, strokeStyle: color, lineWidth, dash });
      return;
    }

    // O texto pequeno (greeking) é traçado em lote com espessura 1 e sem tracejado, como no desenho individual.
    const isGreeking = entity.type === "text";
    const bucketWidth = isGreeking ? 1 : lineWidth;
    const bucketDash = isGreeking ? NO_DASH : dash;
    const key = `${color}|${bucketWidth}|${bucketDash === NO_DASH ? "" : bucketDash.join(",")}`;
    let bucket = this.stylesByKey.get(key);

    if (bucket === undefined) {
      bucket = { strokeStyle: color, lineWidth: bucketWidth, dash: bucketDash, entities: [] };
      this.stylesByKey.set(key, bucket);
    }

    bucket.entities.push(entity);
  }

  private addDot(worldX: number, worldY: number, color: string): void {
    let bucket = this.dotsByColor.get(color);

    if (bucket === undefined) {
      bucket = { color, xs: [] };
      this.dotsByColor.set(color, bucket);
    }

    bucket.xs.push((worldX - this.originX) * this.scale, (worldY - this.originY) * this.scale);
  }

  // Fase 2: um caminho por lote de até SHAPES_PER_STROKE formas do mesmo estilo.
  private drawStrokes(deadline: number): boolean {
    const context = this.context;

    while (this.bucketCursor < this.bucketList.length) {
      const bucket = this.bucketList[this.bucketCursor]!;

      if (this.shapeCursor === 0) {
        context.strokeStyle = bucket.strokeStyle;
        context.lineWidth = bucket.lineWidth;
        context.setLineDash(bucket.dash.length === 0 ? [] : [...bucket.dash]);
      }

      while (this.shapeCursor < bucket.entities.length) {
        const end = Math.min(this.shapeCursor + SHAPES_PER_STROKE, bucket.entities.length);
        context.beginPath();

        for (let index = this.shapeCursor; index < end; index += 1) {
          this.appendShape(bucket.entities[index]!);
        }

        context.stroke();
        this.result.strokeCalls += 1;
        this.result.renderedEntities += end - this.shapeCursor;
        this.shapeCursor = end;

        if (performance.now() >= deadline) {
          if (this.shapeCursor >= bucket.entities.length) {
            this.shapeCursor = 0;
            this.bucketCursor += 1;
          }
          return this.bucketCursor >= this.bucketList.length;
        }
      }

      this.shapeCursor = 0;
      this.bucketCursor += 1;
    }

    return true;
  }

  // Fase 3: pontos do LOD, um fillStyle por cor.
  private drawDots(deadline: number): boolean {
    const context = this.context;

    while (this.dotBucketCursor < this.dotList.length) {
      const bucket = this.dotList[this.dotBucketCursor]!;

      if (this.dotCursor === 0) {
        context.fillStyle = bucket.color;
      }

      const end = Math.min(this.dotCursor + 8192, bucket.xs.length);

      for (let index = this.dotCursor; index < end; index += 2) {
        context.fillRect(bucket.xs[index]!, bucket.xs[index + 1]!, 1, 1);
      }

      this.result.renderedEntities += (end - this.dotCursor) / 2;
      this.result.dotEntities += (end - this.dotCursor) / 2;
      this.dotCursor = end;

      if (this.dotCursor >= bucket.xs.length) {
        this.dotCursor = 0;
        this.dotBucketCursor += 1;
      }

      if (performance.now() >= deadline) {
        return this.dotBucketCursor >= this.dotList.length;
      }
    }

    return true;
  }

  // Fase 4: cotas e textos legíveis, desenhados um a um (têm preenchimento, fonte e transformações próprias).
  private drawSpecials(deadline: number): boolean {
    const context = this.context;
    let processed = 0;

    while (this.specialCursor < this.specials.length) {
      const item = this.specials[this.specialCursor]!;
      context.strokeStyle = item.strokeStyle;
      context.lineWidth = item.lineWidth;
      context.setLineDash(item.dash.length === 0 ? [] : [...item.dash]);

      if (item.entity.type === "dimension") {
        renderDimensionEntity(context, this.document, item.entity, this.viewport);
      } else {
        renderTextEntity(context, item.entity, this.viewport);
      }

      this.result.renderedEntities += 1;
      this.specialCursor += 1;
      processed += 1;

      if (processed % 32 === 0 && performance.now() >= deadline) {
        return this.specialCursor >= this.specials.length;
      }
    }

    return true;
  }

  // Acrescenta a forma da entidade ao caminho atual, já em coordenadas de tela (transformação inline, sem alocar pontos).
  private appendShape(entity: CadEntity): void {
    const context = this.context;
    const ox = this.originX;
    const oy = this.originY;
    const k = this.scale;

    if (entity.type === "line") {
      context.moveTo((entity.start.x - ox) * k, (entity.start.y - oy) * k);
      context.lineTo((entity.end.x - ox) * k, (entity.end.y - oy) * k);
    } else if (entity.type === "rectangle") {
      let p1: Point2D = { x: entity.x, y: entity.y };
      let p2: Point2D = { x: entity.x + entity.width, y: entity.y };
      let p3: Point2D = { x: entity.x + entity.width, y: entity.y + entity.height };
      let p4: Point2D = { x: entity.x, y: entity.y + entity.height };

      if (entity.rotation) {
        const matrix = rotationMatrix(entity.rotation, p1);
        p1 = transformPoint(p1, matrix);
        p2 = transformPoint(p2, matrix);
        p3 = transformPoint(p3, matrix);
        p4 = transformPoint(p4, matrix);
      }

      context.moveTo((p1.x - ox) * k, (p1.y - oy) * k);
      context.lineTo((p2.x - ox) * k, (p2.y - oy) * k);
      context.lineTo((p3.x - ox) * k, (p3.y - oy) * k);
      context.lineTo((p4.x - ox) * k, (p4.y - oy) * k);
      context.closePath();
    } else if (entity.type === "circle") {
      const cx = (entity.center.x - ox) * k;
      const cy = (entity.center.y - oy) * k;
      const radius = entity.radius * k;

      // O moveTo evita o segmento de ligação que o arc() traçaria a partir do subcaminho anterior do lote.
      context.moveTo(cx + radius, cy);
      context.arc(cx, cy, radius, 0, Math.PI * 2);
    } else if (entity.type === "arc") {
      const cx = (entity.center.x - ox) * k;
      const cy = (entity.center.y - oy) * k;
      const radius = entity.radius * k;

      context.moveTo(cx + radius * Math.cos(entity.startAngle), cy + radius * Math.sin(entity.startAngle));
      context.arc(cx, cy, radius, entity.startAngle, entity.endAngle, !entity.clockwise);
    } else if (entity.type === "ellipse") {
      const isArc = entity.startAngle !== undefined && entity.endAngle !== undefined;

      if (isArc) {
        // O arco de elipse é traçado por amostragem, o que mantém render, envoltório e hit-test coerentes.
        const points = ellipseArcPoints(
          {
            type: "ellipse",
            center: entity.center,
            radiusX: entity.radiusX,
            radiusY: entity.radiusY,
            rotation: entity.rotation,
            startAngle: entity.startAngle,
            endAngle: entity.endAngle
          },
          Math.max(48, Math.ceil(Math.max(entity.radiusX, entity.radiusY) * k))
        );

        for (let index = 0; index < points.length; index += 1) {
          const point = points[index]!;

          if (index === 0) {
            context.moveTo((point.x - ox) * k, (point.y - oy) * k);
          } else {
            context.lineTo((point.x - ox) * k, (point.y - oy) * k);
          }
        }
      } else {
        // A elipse completa usa a API nativa do Canvas; a escala converte os semi-eixos para pixels.
        // Como o mundo não é espelhado na tela, a rotação é aplicada sem inverter o sinal.
        const cx = (entity.center.x - ox) * k;
        const cy = (entity.center.y - oy) * k;
        const radiusX = entity.radiusX * k;

        context.moveTo(cx + radiusX * Math.cos(entity.rotation), cy + radiusX * Math.sin(entity.rotation));
        context.ellipse(cx, cy, radiusX, entity.radiusY * k, entity.rotation, 0, Math.PI * 2);
      }
    } else if (entity.type === "polyline") {
      this.appendPolyline(entity.points, entity.closed === true);
    } else if (entity.type === "spline") {
      // A spline é uma cadeia de Béziers cúbicas: o Canvas a desenha de forma exata com bezierCurveTo.
      const chain = entity.controlPoints;

      if (chain.length >= 4) {
        context.moveTo((chain[0]!.x - ox) * k, (chain[0]!.y - oy) * k);

        for (let index = 1; index + 2 < chain.length; index += 3) {
          const c1 = chain[index]!;
          const c2 = chain[index + 1]!;
          const end = chain[index + 2]!;
          context.bezierCurveTo((c1.x - ox) * k, (c1.y - oy) * k, (c2.x - ox) * k, (c2.y - oy) * k, (end.x - ox) * k, (end.y - oy) * k);
        }

        if (entity.closed) context.closePath();
      }
    } else if (entity.type === "text") {
      appendTextGreekingPath(context, entity, this.viewport);
    }
  }

  // Polyline com decimação: vértices a menos de POLYLINE_DECIMATION_PX do último desenhado são descartados,
  // mantendo sempre o primeiro e o último para a forma e o fechamento não mudarem.
  private appendPolyline(points: ReadonlyArray<Point2D>, closed: boolean): void {
    if (points.length < 2) {
      return;
    }

    const context = this.context;
    const ox = this.originX;
    const oy = this.originY;
    const k = this.scale;
    let lastX = (points[0]!.x - ox) * k;
    let lastY = (points[0]!.y - oy) * k;
    context.moveTo(lastX, lastY);

    for (let index = 1; index < points.length; index += 1) {
      const x = (points[index]!.x - ox) * k;
      const y = (points[index]!.y - oy) * k;
      const isLast = index === points.length - 1;

      if (!isLast && Math.abs(x - lastX) < POLYLINE_DECIMATION_PX && Math.abs(y - lastY) < POLYLINE_DECIMATION_PX) {
        this.result.decimatedVertices += 1;
        continue;
      }

      context.lineTo(x, y);
      lastX = x;
      lastY = y;
    }

    if (closed) {
      context.closePath();
    }
  }
}

/**
 * Desenha o documento de uma vez (sem fatias de tempo). É a forma síncrona usada por previews, seleção e testes;
 * o app usa DocumentRenderJob diretamente para desenhar a base em fatias.
 */
export function renderDocument2D(
  context: CanvasRenderingContext2D,
  document: CadDocument,
  viewport: Viewport,
  style: RenderStyle = DEFAULT_RENDER_STYLE,
  options: RenderJobOptions = {}
): RenderStats {
  const job = new DocumentRenderJob(context, document, viewport, style, options);
  job.step();
  return job.stats;
}
