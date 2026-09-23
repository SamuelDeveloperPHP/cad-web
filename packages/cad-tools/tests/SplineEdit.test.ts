import { createEmptyDocument, type CadDocument, type CadEntity, type SplineEntity } from "@cad-web/cad-core";
import { evaluateBezierChain, fitPointsToBezierChain, nearestOnBezierChain } from "@cad-web/cad-geometry";
import { describe, expect, it } from "vitest";
import { ExtendTool, FilletTool, SelectTool, gripEntitiesOfSelection } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

function documentWith(entities: ReadonlyArray<CadEntity>): CadDocument {
  return { ...createEmptyDocument("doc_spline_edit"), entities };
}

function splineThrough(points: ReadonlyArray<{ x: number; y: number }>, closed = false, id = "s"): SplineEntity {
  return { id, layerId: "layer_0", type: "spline", closed, fitPoints: points, controlPoints: fitPointsToBezierChain(points, closed) };
}

const WAVE = splineThrough([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }]);
const WALL: CadEntity = { id: "wall", layerId: "layer_0", type: "line", start: { x: 25, y: -50 }, end: { x: 25, y: 50 } };

describe("Extend of splines", () => {
  function runExtend(entities: ReadonlyArray<CadEntity>, click: { x: number; y: number }) {
    const document = documentWith(entities);
    const context = createMockToolContext({ document, viewport: { origin: { x: 0, y: 0 }, scale: 10 } });
    const tool = new ExtendTool();
    tool.activate(context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const result = tool.onPointerDown(createPointerEvent(click), context);
    return { result, context, document, next: context.commands[0]?.execute(document) };
  }

  it("extends the end nearest to the click up to the boundary, dropping the fit points", () => {
    const { result, next, context, document } = runExtend([WAVE, WALL], evaluateBezierChain(WAVE.controlPoints, 1.8));
    const spline = next!.entities.find((entity) => entity.id === "s") as SplineEntity;

    expect(result.type).toBe("command");
    expect(spline.controlPoints.at(-1)!.x).toBeCloseTo(25, 6);
    expect(spline.controlPoints[0]).toEqual({ x: 0, y: 0 });
    expect(spline.fitPoints).toBeUndefined();
    expect(nearestOnBezierChain(spline.controlPoints, { x: 10, y: 5 }).distance).toBeLessThan(1e-7);
    expect(context.commands[0]!.undo(next!).entities.find((entity) => entity.id === "s")).toEqual(document.entities[0]);
  });

  it("refuses closed splines with a clear message", () => {
    const ring = splineThrough([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }], true, "ring");
    const { result, context } = runExtend([ring, WALL], { x: 10, y: 0 });

    expect(result.type).toBe("none");
    expect(context.messages.at(-1)).toBe("[Extend] Closed splines cannot be extended");
  });
});

describe("Fillet with splines", () => {
  const upright = splineThrough([{ x: 0, y: -20 }, { x: 0, y: 0 }, { x: 0, y: 20 }], false, "up");

  function runFillet(entities: ReadonlyArray<CadEntity>, first: { x: number; y: number }, second: { x: number; y: number }, radius = "5") {
    const document = documentWith(entities);
    const context = createMockToolContext({ document, viewport: { origin: { x: 0, y: 0 }, scale: 10 } });
    const tool = new FilletTool();
    tool.activate(context);
    tool.onCommandInput(radius, context);
    tool.onPointerDown(createPointerEvent(first), context);
    const result = tool.onPointerDown(createPointerEvent(second), context);
    return { result, context, document, next: context.commands[0]?.execute(document) };
  }

  it("fillets a line with a spline (spline picked first) in one undo step", () => {
    const line: CadEntity = { id: "l", layerId: "layer_0", type: "line", start: { x: -30, y: 0 }, end: { x: 30, y: 0 } };
    const { result, next, context, document } = runFillet([upright, line], { x: 0, y: 15 }, { x: 15, y: 0 });

    expect(result.type).toBe("command");
    const arc = next!.entities.find((entity) => entity.type === "arc") as any;
    const spline = next!.entities.find((entity) => entity.id === "up") as SplineEntity;
    const trimmed = next!.entities.find((entity) => entity.id === "l") as any;
    expect(arc.center.x).toBeCloseTo(5, 6);
    expect(arc.center.y).toBeCloseTo(5, 6);
    expect(spline.controlPoints[0]!.y).toBeCloseTo(5, 6);
    expect(spline.fitPoints).toBeUndefined();
    expect(trimmed.start.x).toBeCloseTo(5, 6);
    expect(context.commands[0]!.undo(next!).entities).toEqual(document.entities);
  });

  it("fillets a line with a spline (line picked first) and two splines", () => {
    const line: CadEntity = { id: "l", layerId: "layer_0", type: "line", start: { x: -30, y: 0 }, end: { x: 30, y: 0 } };
    const lineFirst = runFillet([upright, line], { x: 15, y: 0 }, { x: 0, y: 15 });
    expect((lineFirst.next!.entities.find((entity) => entity.type === "arc") as any).center.x).toBeCloseTo(5, 6);

    const flat = splineThrough([{ x: -30, y: 0 }, { x: 30, y: 0 }], false, "flat");
    const both = runFillet([upright, flat], { x: 0, y: 15 }, { x: 15, y: 0 });
    const flatAfter = both.next!.entities.find((entity) => entity.id === "flat") as SplineEntity;
    expect(flatAfter.controlPoints[0]!.x).toBeCloseTo(5, 6);
  });

  it("fillets a spline with an arc, trimming the arc", () => {
    // Arco de 90° a 270° (lado esquerdo) do círculo de centro (8, 0) e raio 4.
    const arc: CadEntity = { id: "a", layerId: "layer_0", type: "arc", center: { x: 8, y: 0 }, radius: 4, startAngle: Math.PI / 2, endAngle: (3 * Math.PI) / 2, clockwise: true };
    const { result, next } = runFillet([upright, arc], { x: 0, y: 10 }, { x: 8 - 4 * Math.cos(Math.PI / 4), y: 4 * Math.sin(Math.PI / 4) }, "3");

    expect(result.type).toBe("command");
    const fillet = next!.entities.find((entity) => entity.type === "arc" && entity.id !== "a") as any;
    expect(fillet.center.x).toBeCloseTo(3, 6);
    expect(fillet.center.y).toBeCloseTo(Math.sqrt(24), 6);
    const trimmedArc = next!.entities.find((entity) => entity.id === "a") as any;
    expect(trimmedArc.endAngle - trimmedArc.startAngle).toBeLessThan(Math.PI);
  });
});

describe("Spline grips", () => {
  const spline = splineThrough([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);

  it("drags a fit point grip and refits the spline", () => {
    const document = documentWith([spline]);
    const context = createMockToolContext({ document, selection: { entityIds: ["s"] }, viewport: { origin: { x: 0, y: 0 }, scale: 1 } });
    const tool = new SelectTool();

    const down = tool.onPointerDown(createPointerEvent({ x: 10.5, y: 10 }), context);
    expect(down.type).toBe("preview");
    tool.onPointerMove(createPointerEvent({ x: 10, y: 20 }), context);
    const up = tool.onPointerUp(createPointerEvent({ x: 10, y: 20 }), context);

    expect(up.type).toBe("complete");
    const next = context.commands[0]!.execute(document);
    const edited = next.entities[0] as SplineEntity;
    expect(edited.fitPoints![1]).toEqual({ x: 10, y: 20 });
    expect(evaluateBezierChain(edited.controlPoints, 1)).toEqual({ x: 10, y: 20 });
    expect(context.selection.entityIds).toEqual(["s"]);
    expect(context.commands[0]!.undo(next).entities[0]).toEqual(spline);
  });

  it("drags a control vertex of a spline without fit points and cancels with Esc", () => {
    const { fitPoints: _fit, ...controlOnly } = spline;
    const document = documentWith([controlOnly]);
    const context = createMockToolContext({ document, selection: { entityIds: ["s"] }, viewport: { origin: { x: 0, y: 0 }, scale: 1 } });
    const tool = new SelectTool();
    const handle = controlOnly.controlPoints[1]!;

    tool.onPointerDown(createPointerEvent(handle), context);
    tool.onPointerMove(createPointerEvent({ x: handle.x, y: handle.y + 3 }), context);
    expect(tool.onKeyDown(createKeyboardEvent("Escape"), context).type).toBe("cancel");
    expect(context.commands).toHaveLength(0);

    tool.onPointerDown(createPointerEvent(handle), context);
    tool.onPointerUp(createPointerEvent({ x: handle.x, y: handle.y + 5 }), context);
    const edited = context.commands[0]!.execute(document).entities[0] as SplineEntity;
    expect(edited.controlPoints[1]).toEqual({ x: handle.x, y: handle.y + 5 });
    expect(edited.controlPoints[0]).toEqual(controlOnly.controlPoints[0]);
  });

  it("shows grips for every selected spline but ignores locked layers", () => {
    const other = splineThrough([{ x: 0, y: 50 }, { x: 20, y: 50 }], false, "s2");
    const document = documentWith([spline, other]);

    expect(gripEntitiesOfSelection(document, ["s", "s2"]).map((entity) => entity.id)).toEqual(["s", "s2"]);

    const locked = { ...document, layers: document.layers.map((layer) => ({ ...layer, locked: true })) };
    const context = createMockToolContext({ document: locked, selection: { entityIds: ["s"] }, viewport: { origin: { x: 0, y: 0 }, scale: 1 } });
    new SelectTool().onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    expect(context.messages.at(-1)).toBe("[Grip] Layer is locked.");
  });
});
