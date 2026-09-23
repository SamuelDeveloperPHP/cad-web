import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { ellipsePointAtParam, normalizeEllipseSweep } from "@cad-web/cad-geometry";
import { describe, expect, it } from "vitest";
import { ExtendTool, TrimTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

const ELLIPSE: CadEntity = { id: "el", layerId: "layer_0", type: "ellipse", center: { x: 0, y: 0 }, radiusX: 20, radiusY: 10, rotation: 0 };
const VERTICAL: CadEntity = { id: "v", layerId: "layer_0", type: "line", start: { x: 0, y: -30 }, end: { x: 0, y: 30 } };

function documentWith(entities: ReadonlyArray<CadEntity>): CadDocument {
  return { ...createEmptyDocument("doc_curves"), entities };
}

function runTrim(entities: ReadonlyArray<CadEntity>, click: { x: number; y: number }) {
  const document = documentWith(entities);
  const context = createMockToolContext({ document, viewport: { origin: { x: 0, y: 0 }, scale: 10 } });
  const tool = new TrimTool();
  tool.activate(context);
  tool.onKeyDown(createKeyboardEvent("Enter"), context);
  const result = tool.onPointerDown(createPointerEvent(click), context);
  return { result, context, next: context.commands[0]?.execute(document), document };
}

function runExtend(entities: ReadonlyArray<CadEntity>, click: { x: number; y: number }) {
  const document = documentWith(entities);
  const context = createMockToolContext({ document, viewport: { origin: { x: 0, y: 0 }, scale: 10 } });
  const tool = new ExtendTool();
  tool.activate(context);
  tool.onKeyDown(createKeyboardEvent("Enter"), context);
  const result = tool.onPointerDown(createPointerEvent(click), context);
  return { result, context, next: context.commands[0]?.execute(document), document };
}

describe("Trim with ellipses and curves", () => {
  it("trims a line using an ellipse as cutting edge", () => {
    const line: CadEntity = { id: "l", layerId: "layer_0", type: "line", start: { x: -40, y: 0 }, end: { x: 40, y: 0 } };
    const { next } = runTrim([ELLIPSE, line], { x: 30, y: 0 });
    const lines = next!.entities.filter((entity) => entity.type === "line") as any[];

    // O trecho de x = 20 a 40 sai; ficam os pedaços de −40 a −20 e de −20 a 20.
    expect(lines).toHaveLength(2);
    expect(lines[0].start.x).toBeCloseTo(-40);
    expect(lines[0].end.x).toBeCloseTo(-20);
    expect(lines[1].end.x).toBeCloseTo(20);
  });

  it("turns a closed ellipse into an elliptical arc between two cuts, with undo", () => {
    const { result, next, context, document } = runTrim([ELLIPSE, VERTICAL], { x: 20, y: 0 });
    const arc = next!.entities.find((entity) => entity.id === "el") as any;

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({ type: "ReplaceEntityCommand" });
    // Sobra a metade esquerda (x ≤ 0): o ponto médio do arco fica em x = −20.
    const { start, sweep } = normalizeEllipseSweep(arc.startAngle, arc.endAngle);
    expect(sweep).toBeCloseTo(Math.PI);
    expect(ellipsePointAtParam(arc.center, arc.radiusX, arc.radiusY, arc.rotation, start + sweep / 2).x).toBeCloseTo(-20);
    expect(context.commands[0]!.undo(next!).entities).toEqual(document.entities);
  });

  it("needs two cuts to trim a closed ellipse", () => {
    const tangentLine: CadEntity = { id: "t", layerId: "layer_0", type: "line", start: { x: 20, y: -30 }, end: { x: 20, y: 0 } };
    const { result, context } = runTrim([ELLIPSE, tangentLine], { x: -20, y: 0 });

    expect(result.type).toBe("none");
    expect(context.messages.at(-1)).toMatch(/Trim/);
  });

  it("splits an elliptical arc into two pieces", () => {
    const upper: CadEntity = { ...ELLIPSE, startAngle: 0, endAngle: Math.PI } as CadEntity;
    const { next } = runTrim([upper, VERTICAL, { ...VERTICAL, id: "v2", start: { x: -10, y: -30 }, end: { x: -10, y: 30 } }], ellipsePointAtParam({ x: 0, y: 0 }, 20, 10, 0, 1.9));
    const pieces = next!.entities.filter((entity) => entity.type === "ellipse");

    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.id).toBe("el");
  });

  it("trims a circle into an arc and an arc into two arcs", () => {
    const circle: CadEntity = { id: "c", layerId: "layer_0", type: "circle", center: { x: 0, y: 0 }, radius: 10 };
    const circleResult = runTrim([circle, VERTICAL], { x: 10, y: 0 });
    const arc = circleResult.next!.entities.find((entity) => entity.id === "c") as any;
    expect(arc.type).toBe("arc");
    expect(Math.cos((arc.startAngle + arc.endAngle) / 2)).toBeCloseTo(-1);

    const halfArc: CadEntity = { id: "a", layerId: "layer_0", type: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: Math.PI, endAngle: 0, clockwise: true };
    const arcResult = runTrim([halfArc, VERTICAL], { x: 0, y: 10 });
    expect(arcResult.result.type).toBe("command");
  });
});

describe("Extend with ellipses and curves", () => {
  it("extends a line to an ellipse boundary", () => {
    const line: CadEntity = { id: "l", layerId: "layer_0", type: "line", start: { x: -60, y: 0 }, end: { x: -40, y: 0 } };
    const { next } = runExtend([ELLIPSE, line], { x: -41, y: 0 });

    expect((next!.entities.find((entity) => entity.id === "l") as any).end.x).toBeCloseTo(-20);
  });

  it("extends an elliptical arc end along the ellipse to a line", () => {
    // Arco de 0 a π/2 (x ≥ 0, y ≥ 0); a reta vertical x = −10 corta a elipse em y = ±8.66.
    const arcEl: CadEntity = { ...ELLIPSE, startAngle: 0, endAngle: Math.PI / 2 } as CadEntity;
    const line: CadEntity = { id: "b", layerId: "layer_0", type: "line", start: { x: -10, y: 0 }, end: { x: -10, y: 30 } };
    const { next, context } = runExtend([arcEl, line], ellipsePointAtParam({ x: 0, y: 0 }, 20, 10, 0, 1.4));
    const extended = next!.entities.find((entity) => entity.id === "el") as any;

    expect(context.commands[0]).toMatchObject({ type: "ReplaceEntityCommand" });
    const end = ellipsePointAtParam(extended.center, extended.radiusX, extended.radiusY, extended.rotation, extended.endAngle);
    expect(end.x).toBeCloseTo(-10);
    expect(end.y).toBeGreaterThan(0);
  });

  it("extends a circular arc to a line", () => {
    const arc: CadEntity = { id: "a", layerId: "layer_0", type: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI / 4, clockwise: true };
    const line: CadEntity = { id: "b", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 30 } };
    const { next } = runExtend([arc, line], { x: 10 * Math.cos(0.7), y: 10 * Math.sin(0.7) });
    const extended = next!.entities.find((entity) => entity.id === "a") as any;

    expect(extended.endAngle).toBeCloseTo(Math.PI / 2);
  });

  it("explains that closed ellipses cannot be extended", () => {
    const { result, context } = runExtend([ELLIPSE, VERTICAL], { x: 20, y: 0 });

    expect(result.type).toBe("none");
    expect(context.messages.at(-1)).toBe("[Extend] Closed circles and ellipses cannot be extended");
  });
});

describe("Trim and Extend of rectangles and polylines", () => {
  it("trims one side of a rectangle into an open polyline", () => {
    const rect: CadEntity = { id: "r", layerId: "layer_0", type: "rectangle", x: 0, y: 0, width: 20, height: 10, color: "#00ff00" };
    const cutter: CadEntity = { id: "v", layerId: "layer_0", type: "line", start: { x: 10, y: -5 }, end: { x: 10, y: 15 } };
    const { result, next, context, document } = runTrim([rect, cutter], { x: 20, y: 5 });
    const piece = next!.entities.find((entity) => entity.id === "r") as any;

    expect(result.type).toBe("command");
    expect(piece).toMatchObject({ type: "polyline", closed: false, color: "#00ff00" });
    expect(piece.points).toEqual([{ x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(context.commands[0]!.undo(next!).entities).toEqual(document.entities);
  });

  it("splits an open polyline at two cuts", () => {
    const polyline: CadEntity = { id: "p", layerId: "layer_0", type: "polyline", points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }], closed: false };
    const cutA: CadEntity = { id: "a", layerId: "layer_0", type: "line", start: { x: 10, y: -5 }, end: { x: 10, y: 5 } };
    const cutB: CadEntity = { id: "b", layerId: "layer_0", type: "circle", center: { x: 30, y: 10 }, radius: 3 };
    const { next } = runTrim([polyline, cutA, cutB], { x: 30, y: 2 });
    const pieces = next!.entities.filter((entity) => entity.type === "polyline") as any[];

    expect(pieces).toHaveLength(2);
    expect(pieces[0].points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(pieces[1].points[0].y).toBeCloseTo(7);
  });

  it("asks for two cuts on a closed polyline", () => {
    const polyline: CadEntity = { id: "p", layerId: "layer_0", type: "polyline", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: true };
    const cut: CadEntity = { id: "c", layerId: "layer_0", type: "line", start: { x: 10, y: 5 }, end: { x: 30, y: 5 } };
    const { result, context } = runTrim([polyline, cut], { x: 5, y: 0 });

    expect(result.type).toBe("none");
    expect(context.messages.at(-1)).toBe("[Trim] A closed shape needs two cutting points");
  });

  it("extends the last segment of an open polyline to a boundary", () => {
    const polyline: CadEntity = { id: "p", layerId: "layer_0", type: "polyline", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }], closed: false };
    const boundary: CadEntity = { id: "b", layerId: "layer_0", type: "line", start: { x: 0, y: 20 }, end: { x: 30, y: 20 } };
    const { next } = runExtend([polyline, boundary], { x: 10, y: 4 });

    expect((next!.entities.find((entity) => entity.id === "p") as any).points.at(-1)).toEqual({ x: 10, y: 20 });
  });

  it("extends the first segment of an open polyline", () => {
    const polyline: CadEntity = { id: "p", layerId: "layer_0", type: "polyline", points: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }], closed: false };
    const boundary: CadEntity = { id: "b", layerId: "layer_0", type: "line", start: { x: -2, y: -5 }, end: { x: -2, y: 5 } };
    const { next } = runExtend([polyline, boundary], { x: 6, y: 0 });

    expect((next!.entities.find((entity) => entity.id === "p") as any).points[0]).toEqual({ x: -2, y: 0 });
  });
});
