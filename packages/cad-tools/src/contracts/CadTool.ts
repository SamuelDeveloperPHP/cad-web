import type { Point2D, SnapEntity } from "@cad-web/cad-geometry";
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

  // Opcional: quando true, a linha de comando repassa a entrada crua à ferramenta, sem resolver aliases
  // nem comandos globais (ex.: o conteúdo digitado na ferramenta de texto pode ser "u" ou "zoom").
  acceptsFreeText?(): boolean;

  // Opcional: quando true para a entrada, ela é uma opção da ferramenta (ex.: "a" = Axis na Ellipse) e
  // deve ser entregue a ela em vez de ativar a ferramenta de mesmo alias (ex.: "a" = Arc).
  claimsCommandInput?(input: string): boolean;

  // Opcional: quando true, a tecla vai direto para a ferramenta antes dos atalhos globais (ex.: Delete remove
  // o vértice do grip ativo em vez de apagar a entidade selecionada).
  claimsKeyDown?(event: ToolKeyboardEvent): boolean;

  // Opcional: ponto de referência do desenho em andamento (ponto anterior), que habilita perpendicular e tangente.
  getSnapReferencePoint?(): Point2D | null;
}
