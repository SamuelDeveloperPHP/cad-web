import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { ExtendTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("ExtendTool", () => {
  it("selects a boundary edge and extends the picked line endpoint", () => {
    const tool = new ExtendTool();
    const document = createDocument([
      { id: "target", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { id: "boundary", layerId: "source", type: "line", start: { x: 20, y: -5 }, end: { x: 20, y: 5 } }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 20, y: 0 }), context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({ type: "ExtendLineCommand" });
    expect(context.commands[0].execute(document).entities).toMatchObject([
      { id: "target", type: "line", start: { x: 0, y: 0 }, end: { x: 20, y: 0 } },
      { id: "boundary" }
    ]);
  });

  it("uses all visible unlocked entities as boundary edges after Enter", () => {
    const tool = new ExtendTool();
    const document = createDocument([
      { id: "target", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
      { id: "rect", layerId: "source", type: "rectangle", x: 5, y: -1, width: 4, height: 2 }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 2, y: 0 }), context);

    expect(result.type).toBe("command");
    expect(context.commands[0].execute(document).entities[0]).toMatchObject({
      id: "target",
      end: { x: 5, y: 0 }
    });
  });

  it("extends to the nearest circle boundary intersection", () => {
    const tool = new ExtendTool();
    const document = createDocument([
      { id: "target", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { id: "circle", layerId: "source", type: "circle", center: { x: 20, y: 0 }, radius: 2 }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 18, y: 0 }), context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);

    expect(result.type).toBe("command");
    expect(context.commands[0].execute(document).entities[0]).toMatchObject({
      end: { x: 18, y: 0 }
    });
  });

  it("previews the segment that will be added", () => {
    const tool = new ExtendTool();
    const context = createMockToolContext({
      document: createDocument([
        { id: "target", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { id: "boundary", layerId: "source", type: "line", start: { x: 15, y: -5 }, end: { x: 15, y: 5 } }
      ])
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 15, y: 0 }), context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 10, y: 0 }), context);

    expect(result.type).toBe("preview");
    expect(context.previews.at(-1)).toMatchObject({
      type: "ghostEntities",
      entities: [{ id: "extend_preview_target", start: { x: 10, y: 0 }, end: { x: 15, y: 0 } }]
    });
  });

  it("blocks extending targets on locked layers", () => {
    const tool = new ExtendTool();
    const context = createMockToolContext({
      document: createDocument(
        [
          { id: "target", layerId: "locked", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
          { id: "boundary", layerId: "source", type: "line", start: { x: 20, y: -5 }, end: { x: 20, y: 5 } }
        ],
        true
      )
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 20, y: 0 }), context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);

    expect(result.type).toBe("none");
    expect(context.commands).toEqual([]);
    expect(context.messages).toContain("[Extend] Layer is locked");
  });

  it("exposes command aliases", () => {
    expect(new ExtendTool().aliases).toEqual(["ex", "extend"]);
  });
});

function createDocument(entities: ReadonlyArray<CadEntity>, lockTargetLayer = false): CadDocument {
  return {
    ...createEmptyDocument("doc_extend_tool"),
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "source", name: "Source", color: "#00ffff", visible: true, locked: false, order: 1 },
      { id: "locked", name: "Locked", color: "#ff0000", visible: true, locked: lockTargetLayer, order: 2 }
    ],
    activeLayerId: "layer_0",
    entities
  };
}
