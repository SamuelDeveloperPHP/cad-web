import { describe, expect, it, vi } from "vitest";
import { RectangleTool } from "../src/draw/RectangleTool";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

vi.stubGlobal("crypto", {
  randomUUID: () => "001"
});

describe("RectangleTool", () => {
  it("initializes and asks for first point", () => {
    const tool = new RectangleTool();
    const context = createMockToolContext();

    tool.activate(context);

    expect(context.messages.at(-1)).toBe("Specify first corner point for RECTANGLE.");
  });

  it("creates ghost preview after first click", () => {
    const tool = new RectangleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 50, y: 30 }), context);

    expect(result.type).toBe("preview");
    if (result.type === "preview" && result.preview.type === "ghostEntities") {
      expect(result.preview.entities).toHaveLength(1);
      expect(result.preview.entities[0]).toMatchObject({
        type: "rectangle",
        x: 10,
        y: 10,
        width: 40,
        height: 20
      });
    } else {
      expect.fail("Preview should be ghostEntities");
    }
  });

  it("generates CreateEntityCommand on second click", () => {
    const tool = new RectangleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 100, y: 50 }), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("CreateEntityCommand");
    expect((context.commands[0] as any).entity).toMatchObject({
      id: "rect_001",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 50
    });
  });

  it("generates CreateEntityCommand via precise input '100,50'", () => {
    const tool = new RectangleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    const result = tool.onCommandInput("100,50", context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect((context.commands[0] as any).entity).toMatchObject({
      type: "rectangle",
      x: 10, // start X
      y: 10, // start Y
      width: 100, // min max makes it 100
      height: 50
    });
  });

  it("generates CreateEntityCommand via precise input 'w=100 h=50'", () => {
    const tool = new RectangleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    const result = tool.onCommandInput("w=100 h=50", context);

    expect(result.type).toBe("command");
    expect((context.commands[0] as any).entity).toMatchObject({
      type: "rectangle",
      width: 100,
      height: 50
    });
  });

  it("returns error for invalid precise input", () => {
    const tool = new RectangleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    const result = tool.onCommandInput("invalid_input", context);

    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.message).toContain("Invalid dimensions");
    }
    expect(context.commands).toHaveLength(0);
  });

  it("cancels without emitting command", () => {
    const tool = new RectangleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
    expect(context.previews.at(-1)).toBeNull();
  });
});
