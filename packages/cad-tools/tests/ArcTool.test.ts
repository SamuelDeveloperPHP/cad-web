import { describe, expect, it, vi } from "vitest";
import { ArcTool } from "../src/draw/ArcTool";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

vi.stubGlobal("crypto", {
  randomUUID: () => "001"
});

describe("ArcTool", () => {
  it("initializes in three point mode and asks for the start point", () => {
    const tool = new ArcTool();
    const context = createMockToolContext();

    tool.activate(context);

    expect(tool.aliases).toEqual(["a", "arc", "arco"]);
    expect(context.messages.at(-1)).toBe("Specify start point of arc or [ce] for center mode.");
  });

  it("shows a rubber band after the first point and a ghost arc after the second", () => {
    const tool = new ArcTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    const rubber = tool.onPointerMove(createPointerEvent({ x: 0, y: 10 }), context);

    expect(rubber.type).toBe("preview");
    if (rubber.type === "preview") {
      expect(rubber.preview.type).toBe("rubberBand");
    }

    tool.onPointerDown(createPointerEvent({ x: 0, y: 10 }), context);
    const ghost = tool.onPointerMove(createPointerEvent({ x: -10, y: 0 }), context);

    expect(ghost.type).toBe("preview");
    if (ghost.type === "preview" && ghost.preview.type === "ghostEntities") {
      expect(ghost.preview.entities).toHaveLength(1);
      expect(ghost.preview.entities[0]).toMatchObject({ type: "arc", id: "preview_arc" });
      if (ghost.preview.entities[0]?.type === "arc") {
        expect(ghost.preview.entities[0].center.x).toBeCloseTo(0);
        expect(ghost.preview.entities[0].center.y).toBeCloseTo(0);
        expect(ghost.preview.entities[0].radius).toBeCloseTo(10);
      }
    } else {
      expect.fail("Preview should be ghostEntities");
    }
  });

  it("creates an arc through three points with CreateEntityCommand", () => {
    const tool = new ArcTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 10 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: -10, y: 0 }), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("CreateEntityCommand");

    const entity = (context.commands[0] as any).entity;
    expect(entity).toMatchObject({ id: "arc_001", type: "arc", layerId: context.document.activeLayerId });
    expect(entity.center.x).toBeCloseTo(0);
    expect(entity.center.y).toBeCloseTo(0);
    expect(entity.radius).toBeCloseTo(10);
    expect(context.previews.at(-1)).toBeNull();
    expect(context.messages.at(-1)).toBe("Specify start point of arc or [ce] for center mode.");
  });

  it("rejects collinear points, keeps the first two and reports the reason", () => {
    const tool = new ArcTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 5 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);

    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.message).toBe("Points are collinear.");
    }
    expect(context.commands).toHaveLength(0);

    const retry = tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    expect(retry.type).toBe("command");
    expect(context.commands).toHaveLength(1);
  });

  it("switches to center mode with 'ce' and creates an arc from center, start and end", () => {
    const tool = new ArcTool();
    const context = createMockToolContext();

    tool.activate(context);
    const modeResult = tool.onCommandInput("ce", context);

    expect(modeResult.type).toBe("message");
    expect(context.messages.at(-1)).toBe("Specify center point of arc.");

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    expect(context.messages.at(-1)).toBe("Specify start point of arc.");

    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    expect(context.messages.at(-1)).toBe("Specify end point of arc.");

    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 30 }), context);

    expect(result.type).toBe("command");
    const entity = (context.commands[0] as any).entity;
    expect(entity.type).toBe("arc");
    expect(entity.radius).toBeCloseTo(10);
    expect(entity.startAngle).toBeCloseTo(0);
    expect(entity.endAngle).toBeCloseTo(Math.PI / 2);
    expect(entity.clockwise).toBe(true);
  });

  it("refuses to change mode after the first point and rejects unknown input", () => {
    const tool = new ArcTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);

    const late = tool.onCommandInput("ce", context);
    expect(late.type).toBe("error");

    const unknown = tool.onCommandInput("xyz", context);
    expect(unknown.type).toBe("error");
    expect(context.commands).toHaveLength(0);
  });

  it("cancels with Escape, clears preview and returns to three point mode", () => {
    const tool = new ArcTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onCommandInput("ce", context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerMove(createPointerEvent({ x: 5, y: 5 }), context);

    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
    expect(context.previews.at(-1)).toBeNull();
    expect(context.messages.at(-1)).toBe("Specify start point of arc or [ce] for center mode.");
  });
});
