import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { ChamferTool, parseChamferDistanceInput } from "../src/modify/ChamferTool";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("ChamferTool", () => {
  it("creates a chamfer line and trims both selected line branches", () => {
    const tool = new ChamferTool();
    const document = createDocument([
      { id: "line_a", layerId: "source", type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
      { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onCommandInput("3", context);
    tool.onPointerDown(createPointerEvent({ x: -6, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 6 }), context);
    const nextDocument = context.commands[0].execute(document);
    const lineA = nextDocument.entities.find((entity) => entity.id === "line_a");
    const lineB = nextDocument.entities.find((entity) => entity.id === "line_b");
    const chamferLine = nextDocument.entities.find((entity) => entity.type === "line" && entity.id !== "line_a" && entity.id !== "line_b");

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({ type: "ChamferLineLineCommand" });
    expect((lineA as any).end.x).toBeCloseTo(-3);
    expect((lineA as any).end.y).toBeCloseTo(0);
    expect((lineB as any).start.x).toBeCloseTo(0);
    expect((lineB as any).start.y).toBeCloseTo(3);
    expect(chamferLine).toMatchObject({ type: "line", layerId: "source" });
    expect((chamferLine as any).start.x).toBeCloseTo(-3);
    expect((chamferLine as any).start.y).toBeCloseTo(0);
    expect((chamferLine as any).end.x).toBeCloseTo(0);
    expect((chamferLine as any).end.y).toBeCloseTo(3);
  });

  it("supports asymmetric distances via comma syntax", () => {
    const tool = new ChamferTool();
    const document = createDocument([
      { id: "line_a", layerId: "source", type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
      { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onCommandInput("4,2", context);
    tool.onPointerDown(createPointerEvent({ x: -6, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 6 }), context);
    const nextDocument = context.commands[0].execute(document);
    const lineA = nextDocument.entities.find((entity) => entity.id === "line_a");
    const lineB = nextDocument.entities.find((entity) => entity.id === "line_b");

    expect((lineA as any).end.x).toBeCloseTo(-4);
    expect((lineB as any).start.y).toBeCloseTo(2);
  });

  it("applies a single distance to both branches via the d= shortcut", () => {
    const tool = new ChamferTool();
    const document = createDocument([
      { id: "line_a", layerId: "source", type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
      { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onCommandInput("d=4", context);
    tool.onPointerDown(createPointerEvent({ x: -6, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 6 }), context);
    const nextDocument = context.commands[0].execute(document);
    const lineA = nextDocument.entities.find((entity) => entity.id === "line_a");
    const lineB = nextDocument.entities.find((entity) => entity.id === "line_b");

    expect((lineA as any).end.x).toBeCloseTo(-4);
    expect((lineB as any).start.y).toBeCloseTo(4);
  });

  it("previews the chamfer before confirmation", () => {
    const tool = new ChamferTool();
    const context = createMockToolContext({
      document: createDocument([
        { id: "line_a", layerId: "source", type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
        { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
      ])
    });

    tool.activate(context);
    tool.onCommandInput("2", context);
    tool.onPointerDown(createPointerEvent({ x: -6, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 0, y: 6 }), context);

    expect(result.type).toBe("preview");
    expect(context.previews.at(-1)).toMatchObject({
      type: "ghostEntities",
      entities: [
        { id: "line_a" },
        { id: "line_b" },
        { type: "line", id: "chamfer_preview_line_a_line_b" }
      ]
    });
  });

  it("rejects invalid distance input", () => {
    const tool = new ChamferTool();
    const context = createMockToolContext();

    tool.activate(context);
    const result = tool.onCommandInput("0", context);

    expect(result.type).toBe("error");
    expect(context.messages).toContain("[Chamfer] Distances are invalid");
  });

  it("rejects parallel line pairs", () => {
    const tool = new ChamferTool();
    const context = createMockToolContext({
      document: createDocument([
        { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 2 }, end: { x: 10, y: 2 } }
      ])
    });

    tool.activate(context);
    tool.onCommandInput("1", context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 5, y: 2 }), context);

    expect(result.type).toBe("none");
    expect(context.commands).toEqual([]);
    expect(context.messages).toContain("[Chamfer] Lines are parallel or invalid");
  });

  it("blocks chamfer selection on locked layers", () => {
    const tool = new ChamferTool();
    const context = createMockToolContext({
      document: createDocument(
        [{ id: "line_a", layerId: "locked", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }],
        true
      )
    });

    tool.activate(context);
    tool.onCommandInput("1", context);
    const result = tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);

    expect(result.type).toBe("none");
    expect(context.messages).toContain("[Chamfer] Layer is locked");
  });

  it("undoes the chamfer command restoring the original lines", () => {
    const tool = new ChamferTool();
    const document = createDocument([
      { id: "line_a", layerId: "source", type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
      { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onCommandInput("3", context);
    tool.onPointerDown(createPointerEvent({ x: -6, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 6 }), context);

    const command = context.commands[0];
    const afterExecute = command.execute(document);
    const afterUndo = command.undo(afterExecute);
    const restoredA = afterUndo.entities.find((entity) => entity.id === "line_a");
    const restoredB = afterUndo.entities.find((entity) => entity.id === "line_b");
    const chamferLine = afterUndo.entities.find((entity) => entity.id !== "line_a" && entity.id !== "line_b");

    expect(restoredA).toMatchObject({ start: { x: -10, y: 0 }, end: { x: 0, y: 0 } });
    expect(restoredB).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 0, y: 10 } });
    expect(chamferLine).toBeUndefined();
  });

  it("cancels the second selection step with Escape", () => {
    const tool = new ChamferTool();
    const context = createMockToolContext({
      document: createDocument([
        { id: "line_a", layerId: "source", type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
        { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
      ])
    });

    tool.activate(context);
    tool.onCommandInput("2", context);
    tool.onPointerDown(createPointerEvent({ x: -6, y: 0 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.messages).toContain("[Chamfer] Select first line");
  });

  it("exposes command aliases", () => {
    expect(new ChamferTool().aliases).toEqual(["cha", "chamfer"]);
  });
});

describe("parseChamferDistanceInput", () => {
  it("parses single distance variants", () => {
    expect(parseChamferDistanceInput("10")).toEqual({ kind: "single", value: 10 });
    expect(parseChamferDistanceInput("d=10")).toEqual({ kind: "single", value: 10 });
    expect(parseChamferDistanceInput("distance=10")).toEqual({ kind: "single", value: 10 });
    expect(parseChamferDistanceInput("distancia=10")).toEqual({ kind: "single", value: 10 });
  });

  it("parses paired distance variants", () => {
    expect(parseChamferDistanceInput("10,5")).toEqual({ kind: "pair", value1: 10, value2: 5 });
    expect(parseChamferDistanceInput("10x5")).toEqual({ kind: "pair", value1: 10, value2: 5 });
    expect(parseChamferDistanceInput("d1=10 d2=5")).toEqual({ kind: "pair", value1: 10, value2: 5 });
    expect(parseChamferDistanceInput("distance1=10 distance2=5")).toEqual({ kind: "pair", value1: 10, value2: 5 });
    expect(parseChamferDistanceInput("distancia1=10 distancia2=5")).toEqual({ kind: "pair", value1: 10, value2: 5 });
  });

  it("returns invalid for non-positive or malformed values", () => {
    expect(parseChamferDistanceInput("0")).toEqual({ kind: "invalid" });
    expect(parseChamferDistanceInput("-5")).toEqual({ kind: "invalid" });
    expect(parseChamferDistanceInput("abc")).toEqual({ kind: "invalid" });
    expect(parseChamferDistanceInput("10,-1")).toEqual({ kind: "invalid" });
  });

  it("recognises empty input as such", () => {
    expect(parseChamferDistanceInput("")).toEqual({ kind: "empty" });
    expect(parseChamferDistanceInput("   ")).toEqual({ kind: "empty" });
  });
});

function createDocument(entities: ReadonlyArray<CadEntity>, lockTargetLayer = false): CadDocument {
  return {
    ...createEmptyDocument("doc_chamfer_tool"),
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "source", name: "Source", color: "#00ffff", visible: true, locked: false, order: 1 },
      { id: "locked", name: "Locked", color: "#ff0000", visible: true, locked: lockTargetLayer, order: 2 }
    ],
    activeLayerId: "layer_0",
    entities
  };
}
