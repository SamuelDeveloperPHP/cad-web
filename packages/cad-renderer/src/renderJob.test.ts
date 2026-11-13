import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { DocumentRenderJob, renderDocument2D } from "./renderJob";

// Canvas simulado que registra as chamadas de caminho e o estado de traço no momento de cada stroke.
function createRecordingContext(width = 800, height = 600) {
  const calls: string[] = [];
  const strokes: Array<Readonly<{ color: unknown; width: unknown; dash: ReadonlyArray<number>; segments: number }>> = [];
  const dots: Array<readonly [number, number, unknown]> = [];
  const state: Record<string, unknown> = { strokeStyle: "#000", fillStyle: "#000", lineWidth: 1 };
  let dash: ReadonlyArray<number> = [];
  let segments = 0;
  let saves = 0;
  const target: Record<string | symbol, unknown> = { canvas: { width, height } };

  const context = new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (typeof key === "string" && key in state) return state[key];
      if (key === "save") return () => { saves += 1; };
      if (key === "restore") return () => { saves -= 1; };
      if (key === "setLineDash") return (value: ReadonlyArray<number>) => { dash = value; };
      if (key === "beginPath") return () => { segments = 0; calls.push("beginPath"); };
      if (key === "lineTo" || key === "bezierCurveTo") return () => { segments += 1; calls.push(String(key)); };
      if (key === "stroke") return () => { strokes.push({ color: state.strokeStyle, width: state.lineWidth, dash, segments }); calls.push("stroke"); };
      if (key === "fillRect") return (x: number, y: number) => { dots.push([x, y, state.fillStyle]); };
      return (..._args: unknown[]) => { calls.push(String(key)); };
    },
    set(_obj, key, value) {
      state[String(key)] = value;
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;

  return { context, calls, strokes, dots, openSaves: () => saves };
}

function documentWith(entities: ReadonlyArray<CadEntity>): CadDocument {
  return { ...createEmptyDocument("doc_render_job"), entities };
}

const viewport = { origin: { x: 0, y: 0 }, scale: 1 };

function manyLines(count: number, extra: Partial<CadEntity> = {}): CadEntity[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `l${index}`,
    layerId: "layer_0",
    type: "line",
    start: { x: (index % 100) * 7.5, y: Math.floor(index / 100) * 9 },
    end: { x: (index % 100) * 7.5 + 6, y: Math.floor(index / 100) * 9 + 4 },
    ...extra
  })) as CadEntity[];
}

describe("DocumentRenderJob", () => {
  it("agrupa entidades de mesmo estilo em poucos strokes", () => {
    const { context, strokes } = createRecordingContext();
    const stats = renderDocument2D(context, documentWith(manyLines(1000)), viewport);

    expect(stats.renderedEntities).toBe(1000);
    // Uma única cor/espessura: todas as 1000 linhas cabem em um stroke (limite de 1500 formas por lote).
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.segments).toBe(1000);
    expect(stats.strokeCalls).toBe(1);
  });

  it("separa lotes por cor, espessura e tracejado", () => {
    const { context, strokes } = createRecordingContext();
    const entities = [
      ...manyLines(10, { color: "#ff0000" }),
      ...manyLines(10, { color: "#00ff00", lineType: "dashed" }),
      ...manyLines(10, { color: "#ff0000", lineThickness: 3 })
    ];
    renderDocument2D(context, documentWith(entities), viewport);

    expect(strokes).toHaveLength(3);
    expect(strokes.map((stroke) => stroke.color)).toEqual(["#ff0000", "#00ff00", "#ff0000"]);
    expect(strokes[1]!.dash).toEqual([8, 6]);
    expect(strokes[2]!.width).toBe(3);
  });

  it("limita as formas por stroke para permitir fatias de tempo", () => {
    const { context, strokes } = createRecordingContext();
    renderDocument2D(context, documentWith(manyLines(4000)), viewport);

    expect(strokes.length).toBe(3);
    expect(strokes.reduce((sum, stroke) => sum + stroke.segments, 0)).toBe(4000);
  });

  it("liga o círculo e o arco ao próprio ponto inicial (sem segmento de ligação entre formas do lote)", () => {
    const { context, calls } = createRecordingContext();
    renderDocument2D(
      context,
      documentWith([
        { id: "c", layerId: "layer_0", type: "circle", center: { x: 100, y: 100 }, radius: 20 },
        { id: "a", layerId: "layer_0", type: "arc", center: { x: 300, y: 100 }, radius: 30, startAngle: 0, endAngle: Math.PI, clockwise: false }
      ] as CadEntity[]),
      viewport
    );

    // Cada arco é precedido por um moveTo no seu ponto inicial.
    const interesting = calls.filter((call) => call === "moveTo" || call === "arc");
    expect(interesting).toEqual(["moveTo", "arc", "moveTo", "arc"]);
  });

  it("colapsa entidades sub-pixel em pontos, agrupados por cor", () => {
    const { context, dots, strokes } = createRecordingContext();
    const tiny = Array.from({ length: 200 }, (_unused, index) => ({
      id: `t${index}`,
      layerId: "layer_0",
      type: "line",
      start: { x: index, y: 10 },
      end: { x: index + 0.1, y: 10.1 }
    })) as CadEntity[];
    const stats = renderDocument2D(context, documentWith(tiny), viewport);

    expect(stats.dotEntities).toBe(200);
    expect(dots).toHaveLength(200);
    expect(strokes).toHaveLength(0);
  });

  it("decima vértices de polyline que ficam a menos de meio pixel, preservando o último", () => {
    const wide = Array.from({ length: 1001 }, (_unused, index) => ({ x: index, y: index % 2 === 0 ? 0 : 0.5 }));
    const polyline = { id: "w", layerId: "layer_0", type: "polyline", points: wide, closed: false } as CadEntity;

    const dense = createRecordingContext();
    const keptAll = renderDocument2D(dense.context, documentWith([polyline]), { origin: { x: 0, y: 0 }, scale: 2 });
    expect(keptAll.decimatedVertices).toBe(0);

    const sparse = createRecordingContext();
    const decimated = renderDocument2D(sparse.context, documentWith([polyline]), { origin: { x: 0, y: 0 }, scale: 0.1 });
    expect(decimated.decimatedVertices).toBeGreaterThan(500);
    expect(sparse.calls.filter((call) => call === "lineTo").length).toBeLessThan(500);
  });

  it("desenha em fatias e mantém o contexto balanceado ao terminar", () => {
    const { context, strokes, openSaves } = createRecordingContext();
    const job = new DocumentRenderJob(context, documentWith(manyLines(6000)), viewport);
    let steps = 0;

    // Orçamento zero: cada passo faz apenas uma unidade de trabalho, mas sempre progride.
    while (!job.step(0)) {
      steps += 1;
      expect(steps).toBeLessThan(200);
    }

    expect(steps).toBeGreaterThan(1);
    expect(job.stats.complete).toBe(true);
    expect(job.stats.renderedEntities).toBe(6000);
    expect(strokes.reduce((sum, stroke) => sum + stroke.segments, 0)).toBe(6000);
    expect(openSaves()).toBe(0);
  });

  it("cancela restaurando o contexto e sem desenhar mais nada", () => {
    const { context, strokes, openSaves } = createRecordingContext();
    const job = new DocumentRenderJob(context, documentWith(manyLines(6000)), viewport);

    job.step(0);
    const drawn = strokes.length;
    job.cancel();

    expect(job.done).toBe(true);
    expect(job.stats.complete).toBe(false);
    expect(job.step()).toBe(true);
    expect(strokes).toHaveLength(drawn);
    expect(openSaves()).toBe(0);
  });

  it("respeita a visibilidade das camadas e o culling da janela", () => {
    const { context, strokes } = createRecordingContext();
    const document = documentWith([
      ...manyLines(5),
      { id: "far", layerId: "layer_0", type: "line", start: { x: 100000, y: 0 }, end: { x: 100010, y: 5 } },
      { id: "hidden", layerId: "layer_hidden", type: "line", start: { x: 0, y: 0 }, end: { x: 50, y: 50 } }
    ] as CadEntity[]);
    const layers = [...document.layers, { id: "layer_hidden", name: "H", color: "#fff", visible: false, locked: false }];
    const stats = renderDocument2D(context, { ...document, layers }, viewport);

    expect(stats.renderedEntities).toBe(5);
    expect(strokes[0]!.segments).toBe(5);
  });

  it("usa o tamanho de tela informado para o culling", () => {
    const { context } = createRecordingContext(4000, 4000);
    const entities = [
      { id: "in", layerId: "layer_0", type: "line", start: { x: 10, y: 10 }, end: { x: 60, y: 60 } },
      { id: "out", layerId: "layer_0", type: "line", start: { x: 1500, y: 1500 }, end: { x: 1600, y: 1600 } }
    ] as CadEntity[];
    const stats = renderDocument2D(context, documentWith(entities), viewport, undefined, { screenSize: { width: 800, height: 600 } });

    expect(stats.visibleEntities).toBe(1);
  });
});
