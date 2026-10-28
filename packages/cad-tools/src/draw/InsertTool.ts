import { CreateEntityCommand, findBlockDefinition, type BlockDefinition, type BlockReferenceEntity } from "@cad-web/cad-core";
import { visualDegreesToWorldRadians, type Point2D } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { CadPreview, ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { parseDirectInput, userPointToWorld } from "./directInput";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

type InsertStage = "choose_block" | "place";

// Opções do estágio de posicionamento: "s=2", "sx=2", "sy=-1", "r=45" (graus no sentido anti-horário do AutoCAD).
const OPTION_PATTERN = /^(s|sc|scale|sx|sy|r|rot|rotate)\s*=?\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i;

/**
 * Insere blocos, como o INSERT do AutoCAD: escolhe-se o bloco pelo nome (ou pelo painel de blocos) e o ponto
 * base dele acompanha o cursor; clique ou x,y posiciona e a inserção continua até o Esc. Escala e rotação
 * são opções digitadas a qualquer momento (`s=2`, `sx=`, `sy=`, `r=90`) e valem para as próximas inserções.
 * A referência entra na camada ativa; as entidades da camada 0 do bloco herdam essa camada.
 */
export class InsertTool implements CadTool {
  readonly id = "insert";
  readonly name = "Insert";
  readonly aliases = ["i", "insert", "inserir"];

  private stage: InsertStage = "choose_block";
  private blockName: string | null = null;
  private presetName: string | null = null;
  private scaleX = 1;
  private scaleY = 1;
  private rotationDegrees = 0;
  private cursorPoint: Point2D | null = null;

  // O painel de blocos escolhe o bloco antes de ativar a ferramenta (a escolha vale para a próxima ativação).
  presetBlock(name: string | null): void {
    this.presetName = name;
  }

  // Estágio do nome: a entrada crua é o nome do bloco; no posicionamento, só as opções s/sx/sy/r.
  claimsCommandInput(input: string): boolean {
    return this.stage === "choose_block" || OPTION_PATTERN.test(input.trim());
  }

  activate(context: ToolContext): void {
    this.cursorPoint = null;
    this.blockName = null;
    this.stage = "choose_block";
    context.clearPreview();
    const blocks = context.document.blocks ?? [];

    if (blocks.length === 0) {
      context.showMessage("[Insert] No blocks in this drawing. Create one with BLOCK or import a DXF with blocks.");
      return;
    }

    const preset = this.presetName;
    this.presetName = null;

    if (preset !== null && findBlockDefinition(blocks, preset) !== undefined) {
      this.chooseBlock(preset, context);
      return;
    }

    context.showMessage(`[Insert] Enter the block name: ${describeBlocks(blocks)}`);
  }

  deactivate(context: ToolContext): void {
    this.blockName = null;
    this.stage = "choose_block";
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (event.button !== "primary" || this.stage !== "place") {
      return TOOL_RESULT_NONE;
    }

    return this.place(resolveSnappedPoint(event, context), context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.stage !== "place") {
      return TOOL_RESULT_NONE;
    }

    this.cursorPoint = resolveSnappedPoint(event, context);
    return this.preview(this.cursorPoint, context);
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      this.deactivate(context);
      context.showMessage("[Insert] Finished");
      return { type: "cancel" };
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const text = input.trim();

    if (this.stage === "choose_block") {
      if (text.length === 0) {
        context.showMessage(`[Insert] Enter the block name: ${describeBlocks(context.document.blocks ?? [])}`);
        return TOOL_RESULT_NONE;
      }

      const block = (context.document.blocks ?? []).find((candidate) => candidate.name.toLowerCase() === text.toLowerCase());

      if (block === undefined) {
        const message = `[Insert] Block "${text}" not found. ${describeBlocks(context.document.blocks ?? [])}`;
        context.showMessage(message);
        return { type: "error", message };
      }

      return this.chooseBlock(block.name, context);
    }

    const option = OPTION_PATTERN.exec(text);

    if (option !== null) {
      return this.applyOption(option[1]!.toLowerCase(), Number(option[2]), context);
    }

    const parsed = parseDirectInput(text);

    if (parsed.kind === "absolute") {
      return this.place(userPointToWorld(parsed.point, context.unitScale), context);
    }

    if (parsed.kind === "empty") {
      return TOOL_RESULT_NONE;
    }

    const message = "[Insert] Click, type x,y, or an option: s=scale, sx=, sy=, r=angle.";
    context.showMessage(message);
    return { type: "error", message };
  }

  private chooseBlock(name: string, context: ToolContext): ToolResult {
    this.blockName = name;
    this.stage = "place";
    context.showMessage(this.placePrompt());
    return TOOL_RESULT_NONE;
  }

  private applyOption(keyword: string, value: number, context: ToolContext): ToolResult {
    if (keyword.startsWith("r")) {
      this.rotationDegrees = value;
    } else {
      if (value === 0) {
        const message = "[Insert] The scale must not be zero.";
        context.showMessage(message);
        return { type: "error", message };
      }

      if (keyword === "sx") this.scaleX = value;
      else if (keyword === "sy") this.scaleY = value;
      else {
        this.scaleX = value;
        this.scaleY = value;
      }
    }

    context.showMessage(this.placePrompt());
    return this.cursorPoint !== null ? this.preview(this.cursorPoint, context) : TOOL_RESULT_NONE;
  }

  private placePrompt(): string {
    return `[Insert] "${this.blockName}" scale ${format(this.scaleX)}${this.scaleX === this.scaleY ? "" : `×${format(this.scaleY)}`}, rotation ${format(this.rotationDegrees)}°. Click or type x,y; options: s=, sx=, sy=, r=. Esc to finish.`;
  }

  private reference(point: Point2D, context: ToolContext, id: string): BlockReferenceEntity {
    const rotation = this.rotationDegrees === 0 ? 0 : visualDegreesToWorldRadians(this.rotationDegrees);

    return {
      id,
      layerId: context.document.activeLayerId,
      type: "block",
      blockName: this.blockName!,
      position: point,
      ...(rotation !== 0 ? { rotation } : {}),
      ...(this.scaleX !== 1 ? { scaleX: this.scaleX } : {}),
      ...(this.scaleY !== 1 ? { scaleY: this.scaleY } : {})
    };
  }

  private preview(point: Point2D, context: ToolContext): ToolResult {
    const preview: CadPreview = { type: "ghostEntities", entities: [this.reference(point, context, "insert_preview")] };
    context.setPreview(preview);
    return { type: "preview", preview };
  }

  private place(point: Point2D, context: ToolContext): ToolResult {
    if (this.blockName === null) {
      return TOOL_RESULT_NONE;
    }

    const reference = this.reference(point, context, `block_${sanitizeId(this.blockName)}_${uniqueSuffix()}`);
    const command = new CreateEntityCommand(reference);

    context.executeCommand(command);
    context.selectEntities([reference.id]);
    context.showMessage(`[Insert] "${this.blockName}" inserted. Click for another, or press Esc to finish.`);
    return { type: "command", command };
  }
}

function describeBlocks(blocks: ReadonlyArray<BlockDefinition>): string {
  const names = blocks.slice(0, 12).map((block) => block.name).join(", ");
  return `${blocks.length} block${blocks.length === 1 ? "" : "s"} (${names}${blocks.length > 12 ? ", …" : ""})`;
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function sanitizeId(text: string): string {
  return text.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 24);
}

function uniqueSuffix(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}
