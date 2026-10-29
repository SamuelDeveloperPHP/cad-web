import { createEmptyDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { MoveTool } from "../src";
import { GHOST_PREVIEW_LIMIT, sampleGhostEntities } from "../src/modify/ghostPreview";
import { createMockToolContext, createPointerEvent } from "./testContext";

describe("pré-visualização com seleção grande", () => {
  it("devolve a própria lista quando cabe no limite", () => {
    const items = [1, 2, 3];

    expect(sampleGhostEntities(items)).toBe(items);
  });

  it("amostra de forma uniforme e preserva a ordem acima do limite", () => {
    const items = Array.from({ length: 10_000 }, (_unused, index) => index);
    const sampled = sampleGhostEntities(items, 100);

    expect(sampled).toHaveLength(100);
    expect(sampled[0]).toBe(0);
    expect(sampled[99]).toBe(9900);
    expect([...sampled].sort((a, b) => a - b)).toEqual([...sampled]);
  });

  it("o Move mostra uma amostra, mas o comando atua em todas as entidades selecionadas", () => {
    const count = GHOST_PREVIEW_LIMIT * 3;
    const entities = Array.from({ length: count }, (_unused, index) => ({
      id: `l${index}`,
      layerId: "layer_0",
      type: "line",
      start: { x: index, y: 0 },
      end: { x: index + 1, y: 1 }
    })) as CadEntity[];
    const context = createMockToolContext({
      document: { ...createEmptyDocument("doc_ghost"), entities },
      selection: { entityIds: entities.map((entity) => entity.id) }
    });
    const tool = new MoveTool();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const moved = tool.onPointerMove(createPointerEvent({ x: 5, y: 5 }), context);

    expect(moved.type === "preview" && moved.preview.type === "ghostEntities" ? moved.preview.entities.length : -1).toBe(GHOST_PREVIEW_LIMIT);

    tool.onPointerDown(createPointerEvent({ x: 5, y: 5 }), context);
    const command = context.commands[context.commands.length - 1] as unknown as { entityIds: ReadonlyArray<string> };

    expect(command.entityIds).toHaveLength(count);
  });
});
