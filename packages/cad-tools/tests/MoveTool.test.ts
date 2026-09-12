import { createEmptyDocument, type CadDocument, type DimensionEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { MoveTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("MoveTool", () => {
  it("requires selected entities", () => {
    const tool = new MoveTool();
    const context = createMockToolContext();

    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);

    expect(result).toEqual({
      type: "error",
      message: "Move requires selected entities."
    });
  });

  it("creates ghost preview after base point", () => {
    const tool = new MoveTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 10, y: 5 }), context);

    expect(result.type).toBe("preview");
    expect(result.type === "preview" ? result.preview : null).toEqual({
      type: "ghostEntities",
      entities: [
        {
          id: "line_001",
          layerId: "layer_0",
          type: "line",
          start: { x: 10, y: 5 },
          end: { x: 110, y: 5 }
        }
      ]
    });
  });

  it("generates MoveEntitiesCommand on destination click", () => {
    const tool = new MoveTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 2, y: 3 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 7, y: 11 }), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("MoveEntitiesCommand");
    expect(context.commands[0]).toMatchObject({
      entityIds: ["line_001"],
      displacement: { x: 5, y: 8 }
    });
  });

  it("shows the dimension following the move in the ghost preview", () => {
    const tool = new MoveTool();
    const context = createMockToolContext({
      document: createDimensionDocument(),
      selection: { entityIds: ["dim_linear"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 10, y: 5 }), context);

    expect(result.type).toBe("preview");
    const preview = result.type === "preview" ? result.preview : null;
    const ghost = preview?.type === "ghostEntities" ? (preview.entities[0] as DimensionEntity) : null;
    const def = ghost?.definition as { firstPoint: unknown; secondPoint: unknown; dimensionLinePoint: unknown };

    // A cota inteira acompanha o deslocamento (10,5) no preview.
    expect(def.firstPoint).toEqual({ x: 10, y: 5 });
    expect(def.secondPoint).toEqual({ x: 110, y: 5 });
    expect(def.dimensionLinePoint).toEqual({ x: 60, y: 15 });
  });

  it("cancels without emitting command", () => {
    const tool = new MoveTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
    expect(context.previews.at(-1)).toBeNull();
  });
});

function createDimensionDocument(): CadDocument {
  const document = createEmptyDocument("doc_move_dimension");
  const dimension: DimensionEntity = {
    id: "dim_linear",
    layerId: "layer_0",
    type: "dimension",
    dimensionType: "linear",
    definition: {
      firstPoint: { x: 0, y: 0 },
      secondPoint: { x: 100, y: 0 },
      dimensionLinePoint: { x: 50, y: 10 },
      orientation: "horizontal"
    }
  };

  return { ...document, entities: [dimension] };
}
