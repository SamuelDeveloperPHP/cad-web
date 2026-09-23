import type { TextEntity } from "@cad-web/cad-core";
import {
  addVector,
  distance,
  textLineAdvance,
  visualDegreesToWorldRadians,
  worldRadiansToVisualDegrees,
  type Point2D
} from "@cad-web/cad-geometry";
import { createEntityCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { CadPreview, ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";
import { parseDirectInput } from "./directInput";

type TextStage = "point" | "height" | "rotation" | "content";

// Altura usada quando o documento não oferece um estilo de cota ativo com textHeight válido.
const FALLBACK_TEXT_HEIGHT = 2.5;
// Texto de exemplo exibido no preview enquanto o usuário escolhe ponto, altura e rotação.
const PREVIEW_SAMPLE = "Text";
// Marca de cursor exibida no ponto onde a próxima linha será criada.
const PREVIEW_CARET = "_";

/**
 * Ferramenta de texto no estilo do comando TEXT do AutoCAD:
 * ponto de inserção → altura → rotação → conteúdo. Cada Enter com conteúdo cria uma entidade e
 * posiciona a próxima linha logo abaixo; Enter vazio conclui. Altura e rotação podem ser dadas
 * com o cursor (clique) ou digitadas; Enter vazio aceita o valor padrão exibido no prompt.
 *
 * A altura digitada está na unidade de trabalho (convertida por unitScale); a rotação é digitada
 * em graus na convenção visual do AutoCAD (anti-horário, 0° = Leste) e convertida para o mundo,
 * cujo eixo Y cresce para baixo na tela.
 */
export class TextTool implements CadTool {
  readonly id = "text";
  readonly name = "Text";
  readonly aliases = ["dt", "text", "texto", "dtext"];

  private stage: TextStage = "point";
  private position: Point2D | null = null;
  private height: number | null = null;
  private rotation = 0;

  // Após o ponto de inserção (altura, rotação e conteúdo), a linha de comando repassa a entrada crua,
  // sem resolver aliases: o conteúdo pode ser qualquer palavra, inclusive nomes de comandos.
  acceptsFreeText(): boolean {
    return this.stage !== "point";
  }

  activate(context: ToolContext): void {
    this.stage = "point";
    this.position = null;
    context.clearPreview();
    context.showMessage("[Text] Specify insertion point");
  }

  deactivate(context: ToolContext): void {
    this.stage = "point";
    this.position = null;
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);

    if (this.stage === "point" || this.stage === "content") {
      // No estágio de conteúdo, um clique recomeça o texto em outro ponto com a mesma altura e rotação.
      return this.acceptInsertionPoint(point, context, this.stage === "content");
    }

    if (this.position === null) {
      return TOOL_RESULT_NONE;
    }

    if (this.stage === "height") {
      const height = distance(this.position, point);

      if (height <= 0) {
        return { type: "error", message: "[Text] Height must be greater than zero." };
      }

      this.height = height;
      return this.promptRotation(context);
    }

    // Estágio de rotação: o ângulo vai do ponto de inserção até o clique (no sistema do mundo).
    if (distance(this.position, point) > 0) {
      this.rotation = Math.atan2(point.y - this.position.y, point.x - this.position.x);
    }

    return this.promptContent(context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);
    const height = this.resolveHeight(context);

    if (this.stage === "point") {
      return this.showPreview(context, point, PREVIEW_SAMPLE, height, this.rotation);
    }

    if (this.position === null) {
      return TOOL_RESULT_NONE;
    }

    if (this.stage === "height") {
      const previewHeight = distance(this.position, point);
      return this.showPreview(context, this.position, PREVIEW_SAMPLE, previewHeight > 0 ? previewHeight : height, this.rotation);
    }

    if (this.stage === "rotation") {
      const rotation = distance(this.position, point) > 0
        ? Math.atan2(point.y - this.position.y, point.x - this.position.x)
        : this.rotation;
      return this.showPreview(context, this.position, PREVIEW_SAMPLE, height, rotation);
    }

    return this.showPreview(context, this.position, PREVIEW_CARET, height, this.rotation);
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      this.activate(context);
      return { type: "cancel" };
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    if (this.stage === "point") {
      const parsed = parseDirectInput(input);

      if (parsed.kind === "absolute") {
        // Coordenadas digitadas estão na unidade de trabalho.
        return this.acceptInsertionPoint(
          { x: parsed.point.x * context.unitScale, y: parsed.point.y * context.unitScale },
          context,
          false
        );
      }

      return parsed.kind === "empty"
        ? TOOL_RESULT_NONE
        : { type: "error", message: "[Text] Invalid point. Use x,y or click on the drawing." };
    }

    if (this.stage === "height") {
      const text = input.trim();

      if (text === "") {
        this.height = this.resolveHeight(context);
        return this.promptRotation(context);
      }

      const value = Number(text);

      if (!Number.isFinite(value) || value <= 0) {
        return { type: "error", message: "[Text] Height must be a number greater than zero." };
      }

      this.height = value * context.unitScale;
      return this.promptRotation(context);
    }

    if (this.stage === "rotation") {
      const text = input.trim();

      if (text !== "") {
        const degrees = Number(text);

        if (!Number.isFinite(degrees)) {
          return { type: "error", message: "[Text] Rotation must be a number of degrees." };
        }

        this.rotation = visualDegreesToWorldRadians(degrees);
      }

      return this.promptContent(context);
    }

    return this.createTextLine(input, context);
  }

  private acceptInsertionPoint(point: Point2D, context: ToolContext, keepSettings: boolean): ToolResult {
    this.position = point;

    if (keepSettings && this.height !== null) {
      return this.promptContent(context);
    }

    this.stage = "height";
    const height = this.resolveHeight(context);
    context.showMessage(`[Text] Specify height <${formatValue(height / context.unitScale)}>`);
    return this.showPreview(context, point, PREVIEW_SAMPLE, height, this.rotation);
  }

  private promptRotation(context: ToolContext): ToolResult {
    this.stage = "rotation";
    context.showMessage(`[Text] Specify rotation angle <${formatValue(worldRadiansToVisualDegrees(this.rotation))}>`);
    return TOOL_RESULT_NONE;
  }

  private promptContent(context: ToolContext): ToolResult {
    this.stage = "content";
    context.showMessage("[Text] Enter text (empty Enter to finish)");

    if (this.position !== null) {
      this.showPreview(context, this.position, PREVIEW_CARET, this.resolveHeight(context), this.rotation);
    }

    return TOOL_RESULT_NONE;
  }

  private createTextLine(input: string, context: ToolContext): ToolResult {
    if (input.trim() === "" || this.position === null) {
      // Enter vazio conclui o texto e volta a pedir um novo ponto de inserção.
      this.stage = "point";
      this.position = null;
      context.clearPreview();
      context.showMessage("[Text] Specify insertion point");
      return { type: "complete" };
    }

    const height = this.resolveHeight(context);
    const entity: TextEntity = {
      id: `text_${crypto.randomUUID()}`,
      layerId: context.document.activeLayerId,
      type: "text",
      position: this.position,
      content: input,
      height,
      ...(this.rotation !== 0 ? { rotation: this.rotation } : {})
    };
    const command = createEntityCommand(entity);

    context.executeCommand(command);
    // A próxima linha começa logo abaixo, como no TEXT do AutoCAD.
    this.position = addVector(this.position, textLineAdvance(height, this.rotation));
    context.showMessage("[Text] Enter next line (empty Enter to finish)");
    this.showPreview(context, this.position, PREVIEW_CARET, height, this.rotation);

    return { type: "command", command };
  }

  private resolveHeight(context: ToolContext): number {
    if (this.height !== null) {
      return this.height;
    }

    // O padrão inicial é a altura de texto do estilo de cota ativo, para textos e cotas ficarem coerentes.
    const document = context.document;
    const activeStyle = document.dimensionStyles?.find((style) => style.id === document.activeDimensionStyleId);
    const styleHeight = activeStyle?.textHeight;

    return styleHeight !== undefined && Number.isFinite(styleHeight) && styleHeight > 0
      ? styleHeight
      : FALLBACK_TEXT_HEIGHT;
  }

  private showPreview(context: ToolContext, position: Point2D, content: string, height: number, rotation: number): ToolResult {
    const preview: CadPreview = {
      type: "ghostEntities",
      entities: [
        {
          id: "preview_text",
          layerId: context.document.activeLayerId,
          type: "text",
          position,
          content,
          height,
          ...(rotation !== 0 ? { rotation } : {})
        }
      ]
    };

    context.setPreview(preview);
    return { type: "preview", preview };
  }
}

// As conversões de ângulo vivem no kernel (cad-geometry); o re-export mantém a API pública do pacote.
export { visualDegreesToWorldRadians, worldRadiansToVisualDegrees };

function formatValue(value: number): string {
  return Number(value.toFixed(4)).toString();
}
