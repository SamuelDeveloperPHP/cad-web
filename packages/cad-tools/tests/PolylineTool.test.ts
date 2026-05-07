import { createEmptyDocument, type CadDocument, type PolylineEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { PolylineTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("PolylineTool", () => {
  it("creates an open polyline with three points and finishes on Enter", () => {
    const tool = new PolylineTool();
    const context = createMockToolContext({ document: createDocument() });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 5 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Enter"), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]).toMatchObject({ type: "CreateEntityCommand" });

    const entity = (context.commands[0] as any).entity as PolylineEntity;
    expect(entity.type).toBe("polyline");
    expect(entity.closed).toBe(false);
    expect(entity.points).toHaveLength(3);
    expect(entity.points[0]).toEqual({ x: 0, y: 0 });
    expect(entity.points[2]).toEqual({ x: 5, y: 5 });
  });

  it("creates a closed polyline when C is pressed", () => {
    const tool = new PolylineTool();
    const context = createMockToolContext({ document: createDocument() });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 5 }), context);
    tool.onKeyDown(createKeyboardEvent("c"), context);

    expect(context.commands).toHaveLength(1);
    const entity = (context.commands[0] as any).entity as PolylineEntity;
    expect(entity.closed).toBe(true);
  });

  it("removes the last vertex when U is pressed during creation", () => {
    const tool = new PolylineTool();
    const context = createMockToolContext({ document: createDocument() });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 5 }), context);
    tool.onKeyDown(createKeyboardEvent("u"), context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);

    const entity = (context.commands[0] as any).entity as PolylineEntity;
    expect(entity.points).toHaveLength(2);
    expect(entity.points[1]).toEqual({ x: 5, y: 0 });
  });

  it("rejects Enter with fewer than two points", () => {
    const tool = new PolylineTool();
    const context = createMockToolContext({ document: createDocument() });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Enter"), context);

    expect(result.type).toBe("error");
    expect(context.commands).toEqual([]);
    expect(context.messages).toContain("[Polyline] Not enough points");
  });

  it("rejects close with fewer than three points", () => {
    const tool = new PolylineTool();
    const context = createMockToolContext({ document: createDocument() });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("c"), context);

    expect(result.type).toBe("error");
    expect(context.commands).toEqual([]);
  });

  it("cancels with Escape without creating a command", () => {
    const tool = new PolylineTool();
    const context = createMockToolContext({ document: createDocument() });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
  });

  it("blocks creation when the active layer is locked", () => {
    const tool = new PolylineTool();
    const document = {
      ...createEmptyDocument("doc_polyline"),
      layers: [
        { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: true, order: 0 }
      ],
      activeLayerId: "layer_0"
    } as CadDocument;
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);

    expect(context.messages).toContain("[Polyline] Layer is locked");
    expect(context.commands).toEqual([]);
  });

  it("exposes command aliases", () => {
    expect(new PolylineTool().aliases).toEqual(["pl", "polyline", "polilinha"]);
  });
});

function createDocument(): CadDocument {
  return {
    ...createEmptyDocument("doc_polyline_tool"),
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 }
    ],
    activeLayerId: "layer_0"
  };
}
