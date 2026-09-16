import { describe, expect, it } from "vitest";
import { LineTool, type SnapService } from "../src";
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
        layerId: "layer_0",
        type: "line",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 }
      }
    });
  });

  it("uses snapped points when creating the entity", () => {
    const snapService: SnapService = {
      findSnap: (event) => ({
        snapped: true,
        point: event.worldPoint.x < 5 ? { x: 0, y: 0 } : { x: 10, y: 0 },
        rawPoint: event.worldPoint
      })
    };
    const tool = new LineTool();
    const context = createMockToolContext({ snapService });

    tool.onPointerDown(createPointerEvent({ x: 0.4, y: 0.2 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 9.7, y: 0.1 }), context);

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({
      entity: {
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

  it("creates a line by typing direct distance", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerMove(createPointerEvent({ x: 10, y: 0 }), context);
    const result = tool.onCommandInput("5", context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]).toMatchObject({
      entity: {
        type: "line",
        start: { x: 0, y: 0 },
        end: { x: 5, y: 0 }
      }
    });
  });

  it("creates a line by typing absolute coordinates", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onCommandInput("10,20", context);

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({
      entity: {
        type: "line",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 20 }
      }
    });
  });

  it("creates a line by typing relative coordinates", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 5 }), context);
    const result = tool.onCommandInput("@10,0", context);

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({
      entity: {
        type: "line",
        start: { x: 5, y: 5 },
        end: { x: 15, y: 5 }
      }
    });
  });

  it("creates a line by typing polar input", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onCommandInput("@10<90", context);

    expect(result.type).toBe("command");
    const end = (context.commands[0] as any).entity.end;
    expect(end.x).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(10);
  });

  it("rejects invalid text input", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onCommandInput("abc", context);

    expect(result.type).toBe("error");
    expect(context.commands).toEqual([]);
  });

  it("converts typed distance by the working unit scale", () => {
    const tool = new LineTool();
    // unitScale 1000 = trabalhar em metros com base em mm.
    const context = createMockToolContext({ unitScale: 1000 });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerMove(createPointerEvent({ x: 10, y: 0 }), context);
    const result = tool.onCommandInput("5", context);

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({
      entity: { type: "line", start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } }
    });
  });

  it("ignores command input before first point is placed", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.activate(context);
    const result = tool.onCommandInput("10", context);

    expect(result).toEqual({ type: "none" });
    expect(context.commands).toEqual([]);
  });
});
