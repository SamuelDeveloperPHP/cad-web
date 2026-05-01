import { describe, expect, it } from "vitest";
import { RotateTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("RotateTool", () => {
  it("requires selected entities", () => {
    const tool = new RotateTool();
    const context = createMockToolContext();

    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);

    expect(result).toEqual({
      type: "error",
      message: "Rotate requires selected entities."
    });
  });

  it("creates ghost preview after base point", () => {
    const tool = new RotateTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 0, y: 10 }), context);

    // Angle of (0, 10) relative to (0, 0) is PI/2
    const angleRadians = Math.PI / 2;

    expect(result.type).toBe("preview");
    if (result.type === "preview" && result.preview.type === "ghostEntities") {
      const line = result.preview.entities[0] as any;
      expect(line.start.x).toBeCloseTo(0, 5); // Original: 0, 0 -> Rotated: 0, 0
      expect(line.start.y).toBeCloseTo(0, 5);
      expect(line.end.x).toBeCloseTo(-0, 5); // Original: 100, 0 -> Rotated: 0, 100
      expect(line.end.y).toBeCloseTo(100, 5);
    } else {
      expect.fail("Preview should be ghostEntities");
    }
  });

  it("generates RotateEntitiesCommand on destination click", () => {
    const tool = new RotateTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("RotateEntitiesCommand");
    expect(context.commands[0]).toMatchObject({
      entityIds: ["line_001"],
      pivot: { x: 0, y: 0 },
      angleRadians: 0
    });
  });

  it("cancels without emitting command", () => {
    const tool = new RotateTool();
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
