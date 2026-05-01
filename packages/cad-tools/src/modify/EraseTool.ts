import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { deleteEntitiesCommand } from "../commands/CadCommandTypes";

export class EraseTool implements CadTool {
  readonly id = "erase";
  readonly name = "Erase";
  readonly aliases = ["e", "erase"];

  activate(context: ToolContext): void {
    context.showMessage("Erase selected entities.");
  }

  deactivate(context: ToolContext): void {
    context.clearPreview();
  }

  onPointerDown(_event: ToolPointerEvent, context: ToolContext): ToolResult {
    return this.createDeleteCommand(context);
  }

  onPointerMove(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      return { type: "cancel" };
    }

    if (event.key === "Delete" || event.key === "Enter") {
      return this.createDeleteCommand(context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    if (input.trim().length === 0) {
      return this.createDeleteCommand(context);
    }

    return TOOL_RESULT_NONE;
  }

  private createDeleteCommand(context: ToolContext): ToolResult {
    if (context.selection.entityIds.length === 0) {
      return { type: "error", message: "Erase requires selected entities." };
    }

    const command = deleteEntitiesCommand(context.selection.entityIds);
    context.executeCommand(command);

    return { type: "command", command };
  }
}
