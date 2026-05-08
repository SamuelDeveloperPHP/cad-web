import {
  ExplodeEntitiesCommand,
  type CadDocument,
  type CadEntity,
  type EntityId,
  type ExplodeEntityPair,
  type LineEntity,
  type PolylineEntity,
  type RectangleEntity
} from "@cad-web/cad-core";
import { explodePolylineToLines, explodeRectangleToLines, type SegmentGeometry } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";

// O modulo descreve a ferramenta interativa Explode, que converte entidades compostas (rectangle e polyline)
// em LineEntity primitivas, preservando layer e estilo. O fluxo segue o padrao das demais ferramentas:
// maquina de estados simples, geracao de comando apenas na confirmacao.

type ExplodePhase = "selecting_objects" | "execute_explode";

export class ExplodeTool implements CadTool {
  readonly id = "explode";
  readonly name = "Explode";
  readonly aliases = ["x", "explode", "explodir"];

  private phase: ExplodePhase = "selecting_objects";

  activate(context: ToolContext): void {
    // O metodo executa imediatamente se houver selecao valida, senao pede selecao.
    this.phase = "selecting_objects";
    context.clearPreview();

    if (context.selection.entityIds.length > 0) {
      this.runExplode(context);
      return;
    }

    context.showMessage("[Explode] Select objects");
  }

  deactivate(context: ToolContext): void {
    this.phase = "selecting_objects";
    context.clearPreview();
  }

  onPointerDown(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    // O Explode nao reage a cliques diretos: ele depende da selecao corrente do documento.
    return TOOL_RESULT_NONE;
  }

  onPointerMove(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      context.clearPreview();
      context.showMessage("[Explode] Cancelled");
      return { type: "cancel" };
    }

    if (event.key === "Enter") {
      return this.runExplode(context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    // O Explode aceita Enter (input vazio) para confirmar a operacao com a selecao atual.
    if (input.trim().length === 0) {
      return this.runExplode(context);
    }

    return TOOL_RESULT_NONE;
  }

  private runExplode(context: ToolContext): ToolResult {
    if (context.selection.entityIds.length === 0) {
      context.showMessage("[Explode] Select objects");
      return TOOL_RESULT_NONE;
    }

    const layerMap = new Map(context.document.layers.map((layer) => [layer.id, layer]));
    const selected = collectSelectedEntities(context.document, context.selection.entityIds);
    const explosions: ExplodeEntityPair[] = [];
    let lockedCount = 0;
    let unsupportedCount = 0;

    for (const entity of selected) {
      const layer = layerMap.get(entity.layerId || "layer_0");

      if (layer?.locked === true) {
        // O agente conta entidades bloqueadas para informar o usuario sem abortar o restante da operacao.
        lockedCount += 1;
        continue;
      }

      if (layer?.visible === false) {
        // O agente ignora entidades em layers invisiveis para nao quebrar a UX padrao.
        continue;
      }

      const pair = explodeEntityToPair(entity);

      if (pair === null) {
        unsupportedCount += 1;
        continue;
      }

      explosions.push(pair);
    }

    if (explosions.length === 0) {
      // O fluxo da prioridade a layer locked porque normalmente sinaliza acao corretiva imediata.
      if (lockedCount > 0) {
        context.showMessage("[Explode] Layer is locked");
        return { type: "error", message: "[Explode] Layer is locked" };
      }

      context.showMessage("[Explode] Nothing to explode");
      return { type: "error", message: "[Explode] Nothing to explode" };
    }

    if (unsupportedCount > 0 || lockedCount > 0) {
      // O aviso discreto e exibido quando parte da selecao foi ignorada, sem bloquear o sucesso parcial.
      context.showMessage("[Explode] Some entities are not supported");
    }

    const command = new ExplodeEntitiesCommand(explosions);
    context.executeCommand(command);

    // O fluxo seleciona as linhas resultantes para que o usuario possa encadear edicoes.
    const resultIds = explosions.flatMap((pair) => pair.resultEntities.map((entity) => entity.id));
    context.selectEntities(resultIds);
    context.clearPreview();
    this.phase = "selecting_objects";

    return { type: "command", command };
  }
}

function collectSelectedEntities(document: CadDocument, ids: ReadonlyArray<EntityId>): ReadonlyArray<CadEntity> {
  const seen = new Set<EntityId>();
  const result: CadEntity[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }

    const entity = document.entities.find((candidate) => candidate.id === id);

    if (entity === undefined) {
      continue;
    }

    seen.add(id);
    result.push(entity);
  }

  return result;
}

function explodeEntityToPair(entity: CadEntity): ExplodeEntityPair | null {
  // O metodo decide se o tipo da entidade e suportado e gera o par original/resultado para o command.
  if (entity.type === "rectangle") {
    return explodeRectangle(entity);
  }

  if (entity.type === "polyline") {
    return explodePolyline(entity);
  }

  return null;
}

function explodeRectangle(entity: RectangleEntity): ExplodeEntityPair | null {
  const segments = explodeRectangleToLines({
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height,
    ...(entity.rotation !== undefined ? { rotation: entity.rotation } : {})
  });

  if (segments.length === 0) {
    return null;
  }

  return {
    originalEntity: entity,
    resultEntities: segments.map((segment, index) => buildLineEntity(entity, segment, index))
  };
}

function explodePolyline(entity: PolylineEntity): ExplodeEntityPair | null {
  const segments = explodePolylineToLines({ points: entity.points, closed: entity.closed });

  if (segments.length === 0) {
    return null;
  }

  return {
    originalEntity: entity,
    resultEntities: segments.map((segment, index) => buildLineEntity(entity, segment, index))
  };
}

function buildLineEntity(
  source: RectangleEntity | PolylineEntity,
  segment: SegmentGeometry,
  index: number
): LineEntity {
  // O metodo monta a LineEntity preservando layer e propriedades visuais seguras da origem.
  const baseEntity: LineEntity = {
    id: createExplodeLineId(source.id, index),
    layerId: source.layerId || "layer_0",
    type: "line",
    start: segment.start,
    end: segment.end
  };

  return {
    ...baseEntity,
    ...(source.color !== undefined ? { color: source.color } : {}),
    ...(source.lineThickness !== undefined ? { lineThickness: source.lineThickness } : {}),
    ...(source.lineType !== undefined ? { lineType: source.lineType } : {})
  };
}

function createExplodeLineId(sourceId: EntityId, index: number): EntityId {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `line_explode_${sourceId}_${index}_${crypto.randomUUID()}`;
  }

  return `line_explode_${sourceId}_${index}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}
