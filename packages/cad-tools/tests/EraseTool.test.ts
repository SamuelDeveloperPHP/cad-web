import { describe, expect, it } from "vitest";
import { EraseTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("EraseTool", () => {
  it("rejects erase when selection is empty", () => {
    const tool = new EraseTool();
    const context = createMockToolContext();

    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);

    expect(result).toEqual({
      type: "error",
      message: "Erase requires selected entities."
    });
    expect(context.commands).toEqual([]);
  });

  it("generates DeleteEntitiesCommand for current selection", () => {
    const tool = new EraseTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    const result = tool.onKeyDown(createKeyboardEvent("Delete"), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("DeleteEntitiesCommand");
    expect(context.commands[0]).toMatchObject({
      entityIds: ["line_001"]
    });
  });

  it("cancels on Escape without emitting command", () => {
    const tool = new EraseTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
  });
});
