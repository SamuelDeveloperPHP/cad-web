import { createEmptyDocument, type CadDocument, type DimensionEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { SelectTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("SelectTool", () => {
  it("selects the nearest line entity", () => {
    const tool = new SelectTool();
    const context = createMockToolContext();

    const result = tool.onPointerDown(createPointerEvent({ x: 50, y: 0.2 }), context);

    expect(result.type).toBe("message");
    expect(context.selection.entityIds).toEqual(["line_001"]);
  });

  it("clears selection when no entity is hit", () => {
    const tool = new SelectTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 50, y: 100 }), context);

    expect(context.selection.entityIds).toEqual([]);
  });

  it("cancels and clears selection on Escape", () => {
    const tool = new SelectTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.selection.entityIds).toEqual([]);
  });

  it("selects a dimension entity by its dimension line", () => {
    const tool = new SelectTool();
    const context = createMockToolContext({
      document: createDimensionDocument(),
      viewport: { origin: { x: 0, y: 0 }, scale: 1 }
    });

    const result = tool.onPointerDown(createPointerEvent({ x: 5, y: 4 }), context);

    expect(result.type).toBe("message");
    expect(context.selection.entityIds).toEqual(["dim_linear"]);
  });

  it("updates a selected linear dimension grip with one command on pointer up", () => {
    const tool = new SelectTool();
    const context = createMockToolContext({
      document: createDimensionDocument(),
      selection: { entityIds: ["dim_linear"] },
      viewport: { origin: { x: 0, y: 0 }, scale: 1 }
    });

    tool.onPointerDown(createPointerEvent({ x: 5, y: 4 }), context);
    const preview = tool.onPointerMove(createPointerEvent({ x: 5, y: 8 }), context);
    const result = tool.onPointerUp(createPointerEvent({ x: 5, y: 8 }), context);

    expect(preview.type).toBe("preview");
    expect(result.type).toBe("complete");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]).toMatchObject({
      type: "UpdateEntityCommand",
      entityId: "dim_linear",
      patch: {
        definition: {
          dimensionLinePoint: { x: 5, y: 8 }
        }
      }
    });
    expect(context.selection.entityIds).toEqual(["dim_linear"]);
  });

  it("uses snap service while dragging a dimension grip", () => {
    const tool = new SelectTool();
    const context = createMockToolContext({
      document: createDimensionDocument(),
      selection: { entityIds: ["dim_linear"] },
      viewport: { origin: { x: 0, y: 0 }, scale: 1 },
      snapService: {
        findSnap: (event) => ({
          snapped: true,
          point: { x: event.worldPoint.x, y: 12 },
          rawPoint: event.worldPoint
        })
      }
    });

    tool.onPointerDown(createPointerEvent({ x: 5, y: 4 }), context);
    tool.onPointerUp(createPointerEvent({ x: 5, y: 8 }), context);

    expect(context.commands[0]).toMatchObject({
      patch: {
        definition: {
          dimensionLinePoint: { x: 5, y: 12 }
        }
      }
    });
  });

  it("cancels a dimension grip drag on Escape without creating a command", () => {
    const tool = new SelectTool();
    const context = createMockToolContext({
      document: createDimensionDocument(),
      selection: { entityIds: ["dim_linear"] },
      viewport: { origin: { x: 0, y: 0 }, scale: 1 }
    });

    tool.onPointerDown(createPointerEvent({ x: 5, y: 4 }), context);
    tool.onPointerMove(createPointerEvent({ x: 5, y: 8 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
    expect(context.messages).toContain("[Grip] Edit canceled.");
  });

  it("blocks dimension grip editing on locked layers", () => {
    const tool = new SelectTool();
    const context = createMockToolContext({
      document: createDimensionDocument(true),
      selection: { entityIds: ["dim_linear"] },
      viewport: { origin: { x: 0, y: 0 }, scale: 1 }
    });

    tool.onPointerDown(createPointerEvent({ x: 5, y: 4 }), context);
    tool.onPointerMove(createPointerEvent({ x: 5, y: 8 }), context);
    tool.onPointerUp(createPointerEvent({ x: 5, y: 8 }), context);

    expect(context.commands).toEqual([]);
    expect(context.messages).toContain("[Grip] Layer is locked.");
  });
});

function createDimensionDocument(locked = false): CadDocument {
  const document = createEmptyDocument("doc_select_dimensions");
  const dimension: DimensionEntity = {
    id: "dim_linear",
    layerId: "layer_0",
    type: "dimension",
    dimensionType: "linear",
    dimensionStyleId: "dimstyle_standard",
    definition: {
      firstPoint: { x: 0, y: 0 },
      secondPoint: { x: 10, y: 0 },
      dimensionLinePoint: { x: 5, y: 4 },
      orientation: "horizontal"
    }
  };

  return {
    ...document,
    layers: document.layers.map((layer) => layer.id === "layer_0" ? { ...layer, locked } : layer),
    entities: [dimension]
  };
}
