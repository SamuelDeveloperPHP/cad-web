import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { TrimTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("TrimTool", () => {
  it("selects a cutting edge and trims the picked side of a line", () => {
    const tool = new TrimTool();
    const document = createDocument([
      { id: "target", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { id: "cut", layerId: "source", type: "line", start: { x: 4, y: -5 }, end: { x: 4, y: 5 } }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 4, y: 2 }), context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 2, y: 0 }), context);

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({ type: "TrimLineCommand" });
    expect(context.commands[0].execute(document).entities).toMatchObject([
      { id: "target", type: "line", start: { x: 4, y: 0 }, end: { x: 10, y: 0 } },
      { id: "cut" }
    ]);
  });

  it("uses all visible unlocked entities as cutting edges after Enter", () => {
    const tool = new TrimTool();
    const document = createDocument([
      { id: "target", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { id: "rect", layerId: "source", type: "rectangle", x: 3, y: -1, width: 4, height: 2 }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    const nextDocument = context.commands[0].execute(document);

    expect(result.type).toBe("command");
    expect(nextDocument.entities).toHaveLength(3);
    expect(nextDocument.entities[0]).toMatchObject({ id: "target", start: { x: 0, y: 0 }, end: { x: 3, y: 0 } });
    expect(nextDocument.entities[1]).toMatchObject({ type: "line", start: { x: 7, y: 0 }, end: { x: 10, y: 0 } });
  });

  it("previews the segment that will be removed", () => {
    const tool = new TrimTool();
    const context = createMockToolContext({
      document: createDocument([
        { id: "target", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { id: "cut", layerId: "source", type: "line", start: { x: 4, y: -5 }, end: { x: 4, y: 5 } }
      ])
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 4, y: 2 }), context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 2, y: 0 }), context);

    expect(result.type).toBe("preview");
    expect(context.previews.at(-1)).toMatchObject({
      type: "ghostEntities",
      entities: [{ id: "trim_preview_target", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }]
    });
  });

  it("blocks trimming targets on locked layers", () => {
    const tool = new TrimTool();
    const context = createMockToolContext({
      document: createDocument(
        [
          { id: "target", layerId: "locked", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
          { id: "cut", layerId: "source", type: "line", start: { x: 4, y: -5 }, end: { x: 4, y: 5 } }
        ],
        true
      )
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 4, y: 2 }), context);
    tool.onKeyDown(createKeyboardEvent("Enter"), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 2, y: 0 }), context);

    expect(result.type).toBe("none");
    expect(context.commands).toEqual([]);
    expect(context.messages).toContain("[Trim] Layer is locked");
  });

  it("exposes command aliases", () => {
    expect(new TrimTool().aliases).toEqual(["tr", "trim"]);
  });
});

function createDocument(entities: ReadonlyArray<CadEntity>, lockTargetLayer = false): CadDocument {
  return {
    ...createEmptyDocument("doc_trim_tool"),
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "source", name: "Source", color: "#00ffff", visible: true, locked: false, order: 1 },
      { id: "locked", name: "Locked", color: "#ff0000", visible: true, locked: lockTargetLayer, order: 2 }
    ],
    activeLayerId: "layer_0",
    entities
  };
}
