import { describe, expect, it, vi } from "vitest";
import { MirrorTool } from "../src/modify/MirrorTool";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

vi.stubGlobal("crypto", {
  randomUUID: () => "001"
});

describe("MirrorTool", () => {
  it("requires selected entities on activation", () => {
    const tool = new MirrorTool();
    const context = createMockToolContext();

    tool.activate(context);

    expect(context.messages.at(-1)).toBe("Select entities before MIRROR.");
  });

  it("errors when there is no selection on pointer down", () => {
    const tool = new MirrorTool();
    const context = createMockToolContext();

    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);

    expect(result).toEqual({ type: "error", message: "Mirror requires selected entities." });
  });

  it("shows a mirrored ghost after the first axis point", () => {
    const tool = new MirrorTool();
    const context = createMockToolContext({ selection: { entityIds: ["line_001"] } });

    tool.activate(context);
    // Eixo vertical em x = 50: a linha (0,0)-(100,0) reflete para (100,0)-(0,0).
    tool.onPointerDown(createPointerEvent({ x: 50, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 50, y: 40 }), context);

    expect(result.type).toBe("preview");
    if (result.type === "preview" && result.preview.type === "ghostEntities") {
      const ghost = result.preview.entities[0];
      expect(ghost?.type).toBe("line");
      if (ghost?.type === "line") {
        expect(ghost.start.x).toBeCloseTo(100);
        expect(ghost.end.x).toBeCloseTo(0);
      }
    } else {
      expect.fail("Preview should be ghostEntities");
    }
  });

  it("creates a MirrorEntitiesCommand keeping the original by default", () => {
    const tool = new MirrorTool();
    const context = createMockToolContext({ selection: { entityIds: ["line_001"] } });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 50, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 50, y: 40 }), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("MirrorEntitiesCommand");
    expect(context.commands[0]).toMatchObject({ sourceEntityIds: ["line_001"], keepOriginal: true });
    expect(context.previews.at(-1)).toBeNull();
  });

  it("rejects coincident axis points", () => {
    const tool = new MirrorTool();
    const context = createMockToolContext({ selection: { entityIds: ["line_001"] } });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 50, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 50, y: 0 }), context);

    expect(result.type).toBe("error");
    expect(context.commands).toHaveLength(0);
  });

  it("cancels with Escape and clears the preview", () => {
    const tool = new MirrorTool();
    const context = createMockToolContext({ selection: { entityIds: ["line_001"] } });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 50, y: 0 }), context);
    tool.onPointerMove(createPointerEvent({ x: 50, y: 40 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
    expect(context.previews.at(-1)).toBeNull();
  });
});
