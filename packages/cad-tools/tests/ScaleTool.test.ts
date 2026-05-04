import { describe, expect, it } from "vitest";
import { ScaleTool, type SnapService } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("ScaleTool", () => {
  it("requires selected entities", () => {
    const tool = new ScaleTool();
    const context = createMockToolContext();

    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);

    expect(result).toEqual({
      type: "error",
      message: "Scale requires selected entities."
    });
  });

  it("creates ghost preview after base point", () => {
    const tool = new ScaleTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 2, y: 0 }), context);

    expect(result.type).toBe("preview");
    expect(result.type === "preview" ? result.preview : null).toEqual({
      type: "ghostEntities",
      entities: [
        {
          id: "line_001",
          layerId: "layer_0",
          type: "line",
          start: { x: 0, y: 0 },
          end: { x: 200, y: 0 }
        }
      ]
    });
  });

  it("generates ScaleEntitiesCommand from numeric input", () => {
    const tool = new ScaleTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 1, y: 1 }), context);
    const result = tool.onCommandInput("2", context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("ScaleEntitiesCommand");
    expect(context.commands[0]).toMatchObject({
      entityIds: ["line_001"],
      pivot: { x: 1, y: 1 },
      factor: 2
    });
  });

  it("uses snap for base point", () => {
    const snapService: SnapService = {
      findSnap: (event) => ({
        snapped: true,
        point: { x: 10, y: 10 },
        rawPoint: event.worldPoint
      })
    };
    const tool = new ScaleTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] },
      snapService
    });

    tool.onPointerDown(createPointerEvent({ x: 1, y: 1 }), context);
    const result = tool.onCommandInput("3", context);

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({
      pivot: { x: 10, y: 10 },
      factor: 3
    });
  });

  it("cancels without emitting command", () => {
    const tool = new ScaleTool();
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
