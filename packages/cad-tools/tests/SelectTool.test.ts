import { describe, expect, it } from "vitest";
import { SelectTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("SelectTool", () => {
  it("selects the nearest line entity", () => {
    const tool = new SelectTool();
    const context = createMockToolContext();

    const result = tool.onPointerDown(createPointerEvent({ x: 50, y: 0.2 }), context);

    expect(result.type).toBe("message");
    expect(context.selection.entityIds).toEqual(["line_001"]);
  });

  it("clears selection when no entity is hit", () => {
    const tool = new SelectTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 50, y: 100 }), context);

    expect(context.selection.entityIds).toEqual([]);
  });

  it("cancels and clears selection on Escape", () => {
    const tool = new SelectTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.selection.entityIds).toEqual([]);
  });
});
