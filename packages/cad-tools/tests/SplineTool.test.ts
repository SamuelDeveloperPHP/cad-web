import { createEmptyDocument, type CadDocument, type CadEntity, type SplineEntity } from "@cad-web/cad-core";
import { evaluateBezierChain, fitPointsToBezierChain, nearestOnBezierChain } from "@cad-web/cad-geometry";
import { describe, expect, it } from "vitest";
import { OffsetTool, SplineTool, TrimTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

function documentWith(entities: ReadonlyArray<CadEntity>): CadDocument {
  return { ...createEmptyDocument("doc_spline"), entities };
}

function splineThrough(points: ReadonlyArray<{ x: number; y: number }>, closed = false, id = "s"): SplineEntity {
  return { id, layerId: "layer_0", type: "spline", closed, fitPoints: points, controlPoints: fitPointsToBezierChain(points, closed) };
}

describe("SplineTool", () => {
  it("creates an open spline through clicked fit points on Enter", () => {
    const tool = new SplineTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    expect(tool.onPointerMove(createPointerEvent({ x: 20, y: 0 }), context).type).toBe("preview");
    tool.onPointerDown(createPointerEvent({ x: 20, y: 0 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Enter"), context);

    expect(result.type).toBe("command");
    const entity = (context.commands[0] as any).entity as SplineEntity;
    expect(entity).toMatchObject({ type: "spline", closed: false, fitPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }] });
    expect(evaluateBezierChain(entity.controlPoints, 1)).toEqual({ x: 10, y: 10 });
  });

  it("closes with c, undoes with u and accepts typed points in the working unit", () => {
    const tool = new SplineTool();
    const context = createMockToolContext({ unitScale: 10 });

    tool.activate(context);
    tool.onCommandInput("0,0", context);
    tool.onCommandInput("@2,0", context);
    tool.onCommandInput("@5,5", context);
    tool.onCommandInput("u", context);
    tool.onCommandInput("2,2", context);
    tool.onCommandInput("0,2", context);
    expect(tool.claimsCommandInput("c")).toBe(true);
    const result = tool.onCommandInput("c", context);

    expect(result.type).toBe("command");
    const entity = (context.commands[0] as any).entity as SplineEntity;
    expect(entity.closed).toBe(true);
    expect(entity.fitPoints).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]);
    expect(entity.controlPoints.at(-1)).toEqual(entity.controlPoints[0]);
  });

  it("needs two points to finish and three to close", () => {
    const tool = new SplineTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onCommandInput("0,0", context);
    expect(tool.onCommandInput("", context).type).toBe("error");
    tool.onCommandInput("5,0", context);
    expect(tool.onCommandInput("c", context).type).toBe("error");
    expect(tool.onCommandInput("", context).type).toBe("command");
  });

  it("does not claim c/u before the first point", () => {
    expect(new SplineTool().claimsCommandInput("c")).toBe(false);
  });
});

describe("Trim and Offset of splines", () => {
  it("trims the middle of an open spline between two lines, keeping exact pieces", () => {
    const spline = splineThrough([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }]);
    const cutA: CadEntity = { id: "a", layerId: "layer_0", type: "line", start: { x: 8, y: -20 }, end: { x: 8, y: 30 } };
    const cutB: CadEntity = { id: "b", layerId: "layer_0", type: "line", start: { x: 22, y: -20 }, end: { x: 22, y: 30 } };
    const document = documentWith([spline, cutA, cutB]);
    const context = createMockToolContext({ document });
    const tool = new TrimTool();

    tool.activate(context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const middle = evaluateBezierChain(spline.controlPoints, 1.5);
    const result = tool.onPointerDown(createPointerEvent(middle), context);

    expect(result.type).toBe("command");
    const next = context.commands[0]!.execute(document);
    const pieces = next.entities.filter((entity) => entity.type === "spline") as SplineEntity[];
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.fitPoints).toBeUndefined();
    expect(pieces[0]!.controlPoints.at(-1)!.x).toBeCloseTo(8, 9);
    expect(pieces[1]!.controlPoints[0]!.x).toBeCloseTo(22, 9);
    // Os pedaços seguem a curva original.
    expect(nearestOnBezierChain(spline.controlPoints, evaluateBezierChain(pieces[1]!.controlPoints, 0.5)).distance).toBeLessThan(1e-9);
    expect(context.commands[0]!.undo(next).entities).toEqual(document.entities);
  });

  it("trims a closed spline into an open one with two cuts", () => {
    const spline = splineThrough([{ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }, { x: 0, y: -10 }], true);
    const cut: CadEntity = { id: "c", layerId: "layer_0", type: "line", start: { x: 0, y: -20 }, end: { x: 0, y: 20 } };
    const document = documentWith([spline, cut]);
    const context = createMockToolContext({ document });
    const tool = new TrimTool();

    tool.activate(context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    const piece = context.commands[0]!.execute(document).entities.find((entity) => entity.id === "s") as SplineEntity;

    expect(piece.closed).toBe(false);
    expect(Math.abs(piece.controlPoints[0]!.x)).toBeLessThan(1e-9);
    expect(evaluateBezierChain(piece.controlPoints, (piece.controlPoints.length - 1) / 6).x).toBeLessThan(0);
  });

  it("offsets a spline into another spline at the given distance", () => {
    const spline = splineThrough([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
    const document = documentWith([spline]);
    const context = createMockToolContext({ document, viewport: { origin: { x: 0, y: 0 }, scale: 1 } });
    const tool = new OffsetTool();

    tool.activate(context);
    tool.onCommandInput("1", context);
    tool.onPointerDown(createPointerEvent(evaluateBezierChain(spline.controlPoints, 0.5)), context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 20 }), context);

    const offset = (context.commands[0] as any).entity as SplineEntity;
    expect(offset.type).toBe("spline");
    expect(nearestOnBezierChain(spline.controlPoints, evaluateBezierChain(offset.controlPoints, 0.7)).distance).toBeCloseTo(1, 3);
  });
});
