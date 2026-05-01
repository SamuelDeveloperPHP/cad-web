import { describe, expect, it } from "vitest";
import type { CadTool, ToolContext, ToolKeyboardEvent, ToolPointerEvent, ToolResult } from "../src";
import { ToolRegistry, TOOL_RESULT_NONE } from "../src";

describe("ToolRegistry", () => {
  it("registers and resolves tools by id and alias", () => {
    const registry = new ToolRegistry();
    const tool = createTool("move", ["m", "move"]);

    registry.register(tool);

    expect(registry.get("move")).toBe(tool);
    expect(registry.resolve("m")).toBe(tool);
    expect(registry.resolve(" MOVE ")).toBe(tool);
  });

  it("returns null for unknown tools", () => {
    const registry = new ToolRegistry();

    expect(registry.resolve("line")).toBeNull();
  });

  it("rejects duplicate tool aliases", () => {
    const registry = new ToolRegistry();

    registry.register(createTool("move", ["m"]));

    expect(() => registry.register(createTool("mirror", ["m"]))).toThrow("already registered");
  });
});

function createTool(id: string, aliases: ReadonlyArray<string>): CadTool {
  return {
    id,
    name: id,
    aliases,
    activate: noopLifecycle,
    deactivate: noopLifecycle,
    onPointerDown: noopPointer,
    onPointerMove: noopPointer,
    onPointerUp: noopPointer,
    onKeyDown: noopKeyboard,
    onCommandInput: noopCommandInput
  };
}

function noopLifecycle(_context: ToolContext): void {
  return undefined;
}

function noopPointer(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
  return TOOL_RESULT_NONE;
}

function noopKeyboard(_event: ToolKeyboardEvent, _context: ToolContext): ToolResult {
  return TOOL_RESULT_NONE;
}

function noopCommandInput(_input: string, _context: ToolContext): ToolResult {
  return TOOL_RESULT_NONE;
}
