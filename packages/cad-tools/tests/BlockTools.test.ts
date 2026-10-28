import { createEmptyDocument, expandBlockReference, type BlockDefinition, type BlockReferenceEntity, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { BlockTool, ExplodeTool, InsertTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

const LINE_A: CadEntity = { id: "a", layerId: "layer_0", type: "line", start: { x: 10, y: 10 }, end: { x: 20, y: 10 } };
const LINE_B: CadEntity = { id: "b", layerId: "layer_0", type: "line", start: { x: 20, y: 10 }, end: { x: 20, y: 20 } };
const DIMENSION: CadEntity = {
  id: "d", layerId: "layer_0", type: "dimension", dimensionType: "linear",
  definition: { firstPoint: { x: 0, y: 0 }, secondPoint: { x: 5, y: 0 }, dimensionLinePoint: { x: 0, y: 3 }, orientation: "auto" }
};

function documentWith(entities: ReadonlyArray<CadEntity>, blocks?: ReadonlyArray<BlockDefinition>): CadDocument {
  return { ...createEmptyDocument("doc_block_tools"), entities, ...(blocks !== undefined ? { blocks } : {}) };
}

describe("BlockTool", () => {
  function create(entities: ReadonlyArray<CadEntity>, selected: ReadonlyArray<string>, existing?: ReadonlyArray<BlockDefinition>) {
    const document = documentWith(entities, existing);
    const context = createMockToolContext({ document, selection: { entityIds: [...selected] } });
    const tool = new BlockTool();
    tool.activate(context);
    return { document, context, tool };
  }

  it("creates the definition from the selection and swaps it for a reference in one command", () => {
    const { document, context, tool } = create([LINE_A, LINE_B], ["a", "b"]);

    expect(tool.acceptsFreeText()).toBe(false);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);
    // O nome é texto livre: pode coincidir com aliases de comandos.
    expect(tool.acceptsFreeText()).toBe(true);
    const result = tool.onCommandInput("line", context);

    expect(result.type).toBe("command");
    const next = context.commands[0]!.execute(document);
    expect(next.blocks).toEqual([{ name: "line", basePoint: { x: 10, y: 10 }, entities: [LINE_A, LINE_B] }]);
    expect(next.entities).toHaveLength(1);
    expect(next.entities[0]).toMatchObject({ type: "block", blockName: "line", layerId: "layer_0", position: { x: 10, y: 10 } });
    // A aparência não muda: a geometria expandida é a original.
    const expanded = expandBlockReference(next.blocks, next.entities[0] as BlockReferenceEntity);
    expect(expanded.map((entity) => (entity as any).start)).toEqual([{ x: 10, y: 10 }, { x: 20, y: 10 }]);
    expect(context.commands[0]!.undo(next).entities).toEqual(document.entities);
    expect(context.selection.entityIds).toEqual([(next.entities[0] as CadEntity).id]);
  });

  it("accepts a typed base point in the working unit with Y up", () => {
    const { context, tool } = create([LINE_A], ["a"]);

    tool.onCommandInput("1,2", context);
    tool.onCommandInput("Valve", context);

    expect((context.commands[0] as any).definition.basePoint).toEqual({ x: 1, y: -2 });
  });

  it("rejects empty and duplicated names (case-insensitive) without creating anything", () => {
    const existing: BlockDefinition[] = [{ name: "Valve", basePoint: { x: 0, y: 0 }, entities: [] }];
    const { context, tool } = create([LINE_A], ["a"], existing);

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    expect(tool.onCommandInput("  ", context).type).toBe("error");
    expect(tool.onCommandInput("valve", context).type).toBe("error");
    expect(context.messages.at(-1)).toContain("already exists");
    expect(context.commands).toHaveLength(0);
  });

  it("needs a selection, ignores dimensions and cancels with Esc", () => {
    const empty = create([LINE_A], []);
    expect(empty.context.messages.at(-1)).toContain("Select objects first");
    expect(empty.tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), empty.context).type).toBe("none");

    const onlyDimension = create([DIMENSION], ["d"]);
    expect(onlyDimension.context.messages.at(-1)).toContain("Select objects first");

    const mixed = create([LINE_A, DIMENSION], ["a", "d"]);
    mixed.tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), mixed.context);
    mixed.tool.onCommandInput("only_line", mixed.context);
    expect((mixed.context.commands[0] as any).definition.entities).toEqual([LINE_A]);
    expect(mixed.tool.onKeyDown(createKeyboardEvent("Escape"), mixed.context).type).toBe("cancel");
  });
});

describe("InsertTool", () => {
  const BLOCKS: BlockDefinition[] = [
    { name: "Valve", basePoint: { x: 0, y: 0 }, entities: [{ id: "v", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }] }
  ];

  function start() {
    const document = documentWith([], BLOCKS);
    const context = createMockToolContext({ document });
    const tool = new InsertTool();
    tool.activate(context);
    return { document, context, tool };
  }

  it("explains when the drawing has no blocks", () => {
    const context = createMockToolContext({ document: documentWith([]) });
    new InsertTool().activate(context);

    expect(context.messages.at(-1)).toContain("No blocks");
  });

  it("claims the block name, previews at the cursor and inserts repeatedly until Esc", () => {
    const { document, context, tool } = start();

    expect(tool.claimsCommandInput("valve")).toBe(true);
    expect(tool.onCommandInput("nope", context).type).toBe("error");
    tool.onCommandInput("valve", context);
    expect(context.messages.at(-1)).toContain('"Valve"');

    const moved = tool.onPointerMove(createPointerEvent({ x: 5, y: 7 }), context);
    expect(moved.type).toBe("preview");
    expect((context.previews.at(-1) as any).entities[0]).toMatchObject({ type: "block", blockName: "Valve", position: { x: 5, y: 7 } });

    tool.onPointerDown(createPointerEvent({ x: 5, y: 7 }), context);
    tool.onPointerDown(createPointerEvent({ x: 30, y: 7 }), context);
    let current = document;
    for (const command of context.commands) current = command.execute(current);
    expect(current.entities.map((entity) => (entity as BlockReferenceEntity).position)).toEqual([{ x: 5, y: 7 }, { x: 30, y: 7 }]);
    expect(current.entities.every((entity) => entity.layerId === document.activeLayerId)).toBe(true);
    expect(tool.onKeyDown(createKeyboardEvent("Escape"), context).type).toBe("cancel");
  });

  it("applies scale and rotation options (AutoCAD angle convention) and typed points with Y up", () => {
    const { document, context, tool } = start();

    tool.onCommandInput("Valve", context);
    expect(tool.claimsCommandInput("s=2")).toBe(true);
    expect(tool.claimsCommandInput("sx 3")).toBe(true);
    expect(tool.claimsCommandInput("line")).toBe(false);
    tool.onCommandInput("s=2", context);
    tool.onCommandInput("sy=-1", context);
    tool.onCommandInput("r=90", context);
    expect(tool.onCommandInput("s=0", context).type).toBe("error");
    tool.onCommandInput("10,20", context);

    const inserted = context.commands[0]!.execute(document).entities[0] as BlockReferenceEntity;
    expect(inserted).toMatchObject({ position: { x: 10, y: -20 }, scaleX: 2, scaleY: -1 });
    // 90° anti-horário na tela: rotação do mundo −π/2.
    expect(inserted.rotation).toBeCloseTo(-Math.PI / 2, 12);
  });

  it("starts directly on the preset block from the blocks panel", () => {
    const document = documentWith([], BLOCKS);
    const context = createMockToolContext({ document });
    const tool = new InsertTool();

    tool.presetBlock("Valve");
    tool.activate(context);

    expect(context.messages.at(-1)).toContain('"Valve"');
    // O preset vale uma vez: a próxima ativação volta a pedir o nome.
    tool.activate(context);
    expect(context.messages.at(-1)).toContain("Enter the block name");
  });
});

describe("ExplodeTool with blocks", () => {
  it("explodes one level and keeps nested blocks as references", () => {
    const inner: BlockDefinition = { name: "inner", basePoint: { x: 0, y: 0 }, entities: [{ id: "i", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }] };
    const outer: BlockDefinition = {
      name: "outer",
      basePoint: { x: 0, y: 0 },
      entities: [
        { id: "o", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 4 } },
        { id: "n", layerId: "layer_0", type: "block", blockName: "inner", position: { x: 2, y: 0 }, scaleX: 3 }
      ]
    };
    const reference: BlockReferenceEntity = { id: "r", layerId: "layer_0", type: "block", blockName: "outer", position: { x: 100, y: 100 }, scaleX: 2, scaleY: 2 };
    const document = documentWith([reference], [inner, outer]);
    const context = createMockToolContext({ document, selection: { entityIds: ["r"] } });

    new ExplodeTool().activate(context);

    const next = context.commands[0]!.execute(document);
    expect(next.entities).toHaveLength(2);
    expect(next.entities.find((entity) => entity.type === "line")).toMatchObject({ start: { x: 100, y: 100 }, end: { x: 100, y: 108 } });
    expect(next.entities.find((entity) => entity.type === "block")).toMatchObject({ blockName: "inner", position: { x: 104, y: 100 }, scaleX: 6, scaleY: 2 });
    expect(next.blocks).toHaveLength(2);
    expect(context.commands[0]!.undo(next).entities).toEqual([reference]);
  });
});
