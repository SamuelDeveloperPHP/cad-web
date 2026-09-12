import type { SnapEntity } from "@cad-web/cad-geometry";
import type { ToolContext } from "./ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "./ToolEvent";
import type { ToolResult } from "./ToolResult";

export interface CadTool {
  readonly id: string;
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;

  activate(context: ToolContext): void;
  deactivate(context: ToolContext): void;

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult;
  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult;
  onPointerUp(event: ToolPointerEvent, context: ToolContext): ToolResult;

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult;
  onCommandInput(input: string, context: ToolContext): ToolResult;

  // Opcional: entidades de snap da geometria em andamento, para o marcador aparecer antes de confirmar (ex.: fechar polyline).
  getSnapEntities?(): ReadonlyArray<SnapEntity>;
}
