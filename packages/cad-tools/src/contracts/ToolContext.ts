import type { CadDocument, EntityId } from "@cad-web/cad-core";
import type { Point2D, SnapResult } from "@cad-web/cad-geometry";
import type { ToolPointerEvent } from "./ToolEvent";
import type { CadCommand, CadPreview } from "./ToolResult";

export type SelectionState = Readonly<{
  entityIds: ReadonlyArray<EntityId>;
}>;

export type ViewportState = Readonly<{
  origin: Point2D;
  scale: number;
}>;

export interface SnapService {
  findSnap(event: ToolPointerEvent, context: ToolContext): SnapResult | null;
}

export interface CommandBus {
  execute(command: CadCommand): void;
}

export type NumericInputRequest = Readonly<{
  prompt: string;
  defaultValue?: number;
  min?: number;
  max?: number;
}>;

export interface ToolContext {
  // O contexto fornece apenas capacidades controladas para impedir que ferramentas alterem o documento diretamente.
  readonly document: CadDocument;
  readonly selection: SelectionState;
  readonly viewport: ViewportState;
  readonly snapService: SnapService;
  readonly commandBus: CommandBus;
  readonly orthoMode: boolean;
  readonly units: CadDocument["units"];
  readonly precision: number;

  setPreview(preview: CadPreview | null): void;
  clearPreview(): void;

  selectEntities(ids: ReadonlyArray<EntityId>): void;
  clearSelection(): void;

  executeCommand(command: CadCommand): void;

  showMessage(message: string): void;
  requestNumericInput(options: NumericInputRequest): void;

  cancelCurrentTool(): void;
}
