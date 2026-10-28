import {
  CreateBlockCommand,
  type BlockDefinition,
  type BlockReferenceEntity,
  type CadEntity
} from "@cad-web/cad-core";
import type { Point2D } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { parseDirectInput, userPointToWorld } from "../draw/directInput";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

type BlockStage = "base_point" | "name";

const MAX_BLOCK_NAME_LENGTH = 60;

/**
 * Cria uma definição de bloco a partir da seleção, como o BLOCK do AutoCAD: ponto base (clique ou x,y) →
 * nome. As entidades selecionadas viram a definição e são substituídas por uma referência no mesmo lugar
 * (a aparência não muda), em uma única operação de histórico. Cotas ainda não entram em blocos.
 *
 * A referência fica na camada 0: as entidades da camada 0 dentro do bloco herdam a camada da referência;
 * as demais mantêm a própria.
 */
export class BlockTool implements CadTool {
  readonly id = "block";
  readonly name = "Block";
  readonly aliases = ["b", "block", "bloco"];

  private stage: BlockStage = "base_point";
  private sources: ReadonlyArray<CadEntity> = [];
  private basePoint: Point2D | null = null;
  private cursorPoint: Point2D | null = null;

  // No estágio do nome, a linha de comando entrega o texto cru (o nome pode coincidir com aliases como "line").
  acceptsFreeText(): boolean {
    return this.stage === "name" && this.sources.length > 0 && this.basePoint !== null;
  }

  activate(context: ToolContext): void {
    this.basePoint = null;
    this.cursorPoint = null;
    this.stage = "base_point";
    context.clearPreview();
    this.sources = selectableSources(context);

    if (this.sources.length === 0) {
      context.showMessage("[Block] Select objects first (dimensions cannot be part of a block yet), then run BLOCK.");
      return;
    }

    context.showMessage(`[Block] ${this.sources.length} object${this.sources.length === 1 ? "" : "s"} selected. Specify base point (click or x,y).`);
  }

  deactivate(context: ToolContext): void {
    this.sources = [];
    this.basePoint = null;
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (event.button !== "primary" || this.sources.length === 0 || this.stage !== "base_point") {
      return TOOL_RESULT_NONE;
    }

    return this.acceptBasePoint(resolveSnappedPoint(event, context), context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    this.cursorPoint = resolveSnappedPoint(event, context);
    return TOOL_RESULT_NONE;
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      this.deactivate(context);
      context.showMessage("[Block] Cancelled");
      return { type: "cancel" };
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    if (this.sources.length === 0) {
      return TOOL_RESULT_NONE;
    }

    if (this.stage === "base_point") {
      const parsed = parseDirectInput(input);

      if (parsed.kind === "absolute") {
        return this.acceptBasePoint(userPointToWorld(parsed.point, context.unitScale), context);
      }

      return parsed.kind === "empty" ? TOOL_RESULT_NONE : this.fail(context, "[Block] Specify the base point as x,y or click on the drawing.");
    }

    return this.createBlock(input, context);
  }

  private acceptBasePoint(point: Point2D, context: ToolContext): ToolResult {
    this.basePoint = point;
    this.stage = "name";
    context.showMessage("[Block] Enter the block name.");
    return TOOL_RESULT_NONE;
  }

  private createBlock(rawName: string, context: ToolContext): ToolResult {
    const name = rawName.trim();

    if (name.length === 0) {
      return this.fail(context, "[Block] Enter the block name.");
    }

    if (name.length > MAX_BLOCK_NAME_LENGTH) {
      return this.fail(context, `[Block] The name must have at most ${MAX_BLOCK_NAME_LENGTH} characters.`);
    }

    if ((context.document.blocks ?? []).some((block) => block.name.toLowerCase() === name.toLowerCase())) {
      return this.fail(context, `[Block] A block named "${name}" already exists. Choose another name.`);
    }

    const definition: BlockDefinition = { name, basePoint: this.basePoint!, entities: this.sources };
    const reference: BlockReferenceEntity = {
      id: `block_${sanitizeId(name)}_${uniqueSuffix()}`,
      layerId: "layer_0",
      type: "block",
      blockName: name,
      position: this.basePoint!
    };
    const command = new CreateBlockCommand(definition, this.sources.map((entity) => entity.id), reference);

    context.executeCommand(command);
    context.selectEntities([reference.id]);
    context.clearPreview();
    context.showMessage(`[Block] Block "${name}" created with ${this.sources.length} object${this.sources.length === 1 ? "" : "s"}. Use INSERT to place it.`);
    this.sources = [];
    this.basePoint = null;
    this.stage = "base_point";

    return { type: "command", command };
  }

  private fail(context: ToolContext, message: string): ToolResult {
    context.showMessage(message);
    return { type: "error", message };
  }
}

// Seleção utilizável: entidades existentes em camadas visíveis e desbloqueadas; cotas ficam de fora.
function selectableSources(context: ToolContext): ReadonlyArray<CadEntity> {
  const selected = new Set(context.selection.entityIds);
  const usableLayers = new Set(context.document.layers.filter((layer) => layer.visible !== false && layer.locked !== true).map((layer) => layer.id));

  return context.document.entities.filter((entity) => selected.has(entity.id) && entity.type !== "dimension" && usableLayers.has(entity.layerId || "layer_0"));
}

function sanitizeId(text: string): string {
  return text.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 24);
}

function uniqueSuffix(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}
