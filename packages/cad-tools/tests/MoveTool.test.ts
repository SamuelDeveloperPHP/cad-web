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
          layerId: "default",
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
    expect(context.commands[0]?.payload).toEqual({
      entityIds: ["line_001"],
      displacement: { x: 5, y: 8 }
    });
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
