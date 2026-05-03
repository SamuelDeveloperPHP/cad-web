import { describe, expect, it, vi } from "vitest";
import { CircleTool } from "../src/draw/CircleTool";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

vi.stubGlobal("crypto", {
  randomUUID: () => "001"
});

describe("CircleTool", () => {
  it("initializes and asks for center point", () => {
    const tool = new CircleTool();
    const context = createMockToolContext();

    tool.activate(context);

    expect(context.messages.at(-1)).toBe("Specify center point for CIRCLE.");
  });

  it("creates ghost preview after first click", () => {
    const tool = new CircleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    // Move to { x: 10, y: 50 }, radius = 40
    const result = tool.onPointerMove(createPointerEvent({ x: 10, y: 50 }), context);

    expect(result.type).toBe("preview");
    if (result.type === "preview" && result.preview.type === "ghostEntities") {
      expect(result.preview.entities).toHaveLength(1);
      expect(result.preview.entities[0]).toMatchObject({
        type: "circle",
        center: { x: 10, y: 10 },
        radius: 40
      });
    } else {
      expect.fail("Preview should be ghostEntities");
    }
  });

  it("generates CreateEntityCommand on second click", () => {
    const tool = new CircleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    // 3, 4, 5 triangle, distance = 5
    const result = tool.onPointerDown(createPointerEvent({ x: 3, y: 4 }), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("CreateEntityCommand");
    expect((context.commands[0] as any).entity).toMatchObject({
      id: "circle_001",
      type: "circle",
      center: { x: 0, y: 0 },
      radius: 5
    });
  });

  it("generates CreateEntityCommand via precise input '50' (radius)", () => {
    const tool = new CircleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    const result = tool.onCommandInput("50", context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect((context.commands[0] as any).entity).toMatchObject({
      type: "circle",
      center: { x: 10, y: 10 },
      radius: 50
    });
  });

  it("generates CreateEntityCommand via precise input 'd=100' (diameter)", () => {
    const tool = new CircleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    const result = tool.onCommandInput("d=100", context);

    expect(result.type).toBe("command");
    expect((context.commands[0] as any).entity).toMatchObject({
      type: "circle",
      radius: 50
    });
  });

  it("returns error for invalid precise input", () => {
    const tool = new CircleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    const result = tool.onCommandInput("invalid_input", context);

    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.message).toContain("Invalid input");
    }
    expect(context.commands).toHaveLength(0);
  });

  it("cancels without emitting command", () => {
    const tool = new CircleTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
    expect(context.previews.at(-1)).toBeNull();
  });
});
