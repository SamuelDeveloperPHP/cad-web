import { describe, expect, it } from "vitest";
import { LineTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("LineTool", () => {
  it("creates rubber band preview after the first point", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 10, y: 5 }), context);

    expect(result).toEqual({
      type: "preview",
      preview: {
        type: "rubberBand",
        from: { x: 0, y: 0 },
        to: { x: 10, y: 5 }
      }
    });
    expect(context.previews.at(-1)).toEqual(result.type === "preview" ? result.preview : null);
  });

  it("generates CreateEntityCommand on second click", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("CreateEntityCommand");
    expect(context.commands[0]).toMatchObject({
      entity: {
        layerId: "default",
        type: "line",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 }
      }
    });
  });

  it("cancels draft with Escape", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.previews.at(-1)).toBeNull();
    expect(context.commands).toEqual([]);
  });

  it("rejects equal start and end points", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 1, y: 1 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 1, y: 1 }), context);

    expect(result).toEqual({
      type: "error",
      message: "Line requires two distinct points."
    });
    expect(context.commands).toEqual([]);
  });
});
