import { createEmptyDocument, type BlockDefinition, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { renderDocument2D } from "./renderJob";

// Canvas simulado: registra os segmentos desenhados (moveTo/lineTo) e a cor de traço no momento de cada stroke.
function createRecordingContext() {
  const strokes: Array<Readonly<{ from: readonly [number, number]; to: readonly [number, number]; color: unknown }>> = [];
  const dots: Array<readonly [number, number]> = [];
  const state: Record<string, unknown> = { strokeStyle: "#000", fillStyle: "#000", lineWidth: 1 };
  let last: readonly [number, number] = [0, 0];
  let from: readonly [number, number] = [0, 0];
  const target: Record<string | symbol, unknown> = { canvas: { width: 800, height: 600 } };

  const context = new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (typeof key === "string" && key in state) return state[key];
      if (key === "moveTo") return (x: number, y: number) => { last = [x, y]; from = [x, y]; };
      if (key === "lineTo") return (x: number, y: number) => { from = last; last = [x, y]; };
      if (key === "stroke") return () => { strokes.push({ from, to: last, color: state.strokeStyle }); };
      if (key === "fillRect") return (x: number, y: number) => { dots.push([x, y]); };
      return () => undefined;
    },
    set(_obj, key, value) {
      state[String(key)] = value;
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;

  return { context, strokes, dots };
}

const BLOCK: BlockDefinition = {
  name: "tick",
  basePoint: { x: 0, y: 0 },
  entities: [{ id: "t", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }]
};

function documentWith(entities: ReadonlyArray<CadEntity>, layers = createEmptyDocument("x").layers): CadDocument {
  return { ...createEmptyDocument("doc_render_blocks"), layers, blocks: [BLOCK], entities };
}

const viewport = { origin: { x: 0, y: 0 }, scale: 10 };
const reference = (extra: Partial<Extract<CadEntity, { type: "block" }>> = {}): CadEntity => ({ id: "r", layerId: "layer_0", type: "block", blockName: "tick", position: { x: 5, y: 5 }, ...extra });

describe("block rendering", () => {
  it("draws the expanded geometry at the reference position, rotation and scale", () => {
    const { context, strokes } = createRecordingContext();
    renderDocument2D(context, documentWith([reference({ scaleX: 2 })]), viewport);

    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.from).toEqual([50, 50]);
    expect(strokes[0]!.to).toEqual([250, 50]);
  });

  it("hides the block when its layer is hidden and inherits the reference layer for layer 0 entities", () => {
    const layers = [
      { id: "layer_0", name: "0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "pipes", name: "pipes", color: "#00ff00", visible: true, locked: false, order: 1 }
    ];
    const visible = createRecordingContext();
    renderDocument2D(visible.context, documentWith([reference({ layerId: "pipes" })], layers), viewport);
    expect(visible.strokes[0]!.color).toBe("#00ff00");

    const hidden = createRecordingContext();
    renderDocument2D(hidden.context, documentWith([reference({ layerId: "pipes" })], layers.map((layer) => (layer.id === "pipes" ? { ...layer, visible: false } : layer))), viewport);
    expect(hidden.strokes).toHaveLength(0);
  });

  it("collapses a sub-pixel block into a dot", () => {
    const { context, strokes, dots } = createRecordingContext();
    renderDocument2D(context, documentWith([reference({ scaleX: 0.01, scaleY: 0.01 })]), viewport);

    expect(strokes).toHaveLength(0);
    expect(dots).toHaveLength(1);
  });

  it("draws nothing (and does not throw) when the definition is missing", () => {
    const { context, strokes } = createRecordingContext();
    renderDocument2D(context, documentWith([reference({ blockName: "missing" })]), viewport);

    expect(strokes).toHaveLength(0);
  });
});
