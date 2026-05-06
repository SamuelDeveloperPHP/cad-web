import { createEmptyDocument, type CadDocument, type CadEntity, type EntityId } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { ArrayTool, parseCompactArrayInput } from "../src/modify/ArrayTool";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("ArrayTool", () => {
  it("creates a 3x4 array using sequential prompts and preserves the original entity", () => {
    const tool = new ArrayTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);
    tool.onCommandInput("3", context);
    tool.onCommandInput("4", context);
    tool.onCommandInput("100", context);
    tool.onCommandInput("50", context);
    const result = tool.onCommandInput("", context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]).toMatchObject({ type: "ArrayEntitiesCommand" });

    const nextDocument = context.commands[0].execute(document);
    const ids = nextDocument.entities.map((entity) => entity.id);

    expect(ids).toContain("line_a");
    expect(ids.length).toBe(12);
  });

  it("accepts compact input rows=3 cols=4 dx=100 dy=50", () => {
    const tool = new ArrayTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);
    tool.onCommandInput("rows=3 cols=4 dx=100 dy=50", context);
    tool.onCommandInput("", context);

    expect(context.commands).toHaveLength(1);

    const nextDocument = context.commands[0].execute(document);
    expect(nextDocument.entities).toHaveLength(12);
  });

  it("accepts compact input 3,4,100,50", () => {
    const tool = new ArrayTool();
    const document = createDocumentWithEntities([
      { id: "circle_a", layerId: "source", type: "circle", center: { x: 0, y: 0 }, radius: 4 }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["circle_a"] }
    });

    tool.activate(context);
    tool.onCommandInput("3,4,100,50", context);
    tool.onCommandInput("", context);

    expect(context.commands).toHaveLength(1);

    const nextDocument = context.commands[0].execute(document);
    const circles = nextDocument.entities.filter((entity) => entity.type === "circle");

    expect(circles).toHaveLength(12);
  });

  it("shows preview after all four parameters are provided", () => {
    const tool = new ArrayTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);
    tool.onCommandInput("2", context);
    tool.onCommandInput("2", context);
    tool.onCommandInput("10", context);
    tool.onCommandInput("10", context);

    expect(context.previews.at(-1)).toMatchObject({
      type: "ghostEntities"
    });
  });

  it("rejects spacingX = 0 and spacingY = 0", () => {
    const tool = new ArrayTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);
    tool.onCommandInput("2", context);
    tool.onCommandInput("2", context);
    tool.onCommandInput("0", context);
    tool.onCommandInput("0", context);
    const result = tool.onCommandInput("", context);

    expect(result.type).toBe("error");
    expect(context.commands).toEqual([]);
  });

  it("rejects rows below one", () => {
    const tool = new ArrayTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_a"] },
      document: createDocumentWithEntities([
        { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }
      ])
    });

    tool.activate(context);
    const result = tool.onCommandInput("0", context);

    expect(result.type).toBe("error");
    expect(context.messages).toContain("[Array] Invalid array parameters");
  });

  it("blocks array when the selected entity sits on a locked layer", () => {
    const tool = new ArrayTool();
    const document = createDocumentWithEntities(
      [{ id: "line_a", layerId: "locked", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }],
      { lockTargetLayer: true }
    );
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);

    expect(context.messages).toContain("[Array] Select objects");
  });

  it("requires a second confirmation for arrays above the huge threshold", () => {
    const tool = new ArrayTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);
    tool.onCommandInput("224", context);
    tool.onCommandInput("224", context);
    tool.onCommandInput("1", context);
    tool.onCommandInput("1", context);
    const firstAttempt = tool.onCommandInput("", context);

    expect(firstAttempt.type).toBe("none");
    expect(context.commands).toEqual([]);
    expect(context.messages).toContain("[Array] Large array may affect performance");

    const secondAttempt = tool.onCommandInput("", context);

    expect(secondAttempt.type).toBe("command");
    expect(context.commands).toHaveLength(1);
  });

  it("undoes the array command removing only the cloned entities", () => {
    const tool = new ArrayTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);
    tool.onCommandInput("2", context);
    tool.onCommandInput("3", context);
    tool.onCommandInput("10", context);
    tool.onCommandInput("10", context);
    tool.onCommandInput("", context);

    const command = context.commands[0];
    const afterExecute = command.execute(document);
    const afterUndo = command.undo(afterExecute);

    expect(afterUndo.entities).toHaveLength(1);
    expect(afterUndo.entities[0]?.id).toBe("line_a");
  });

  it("cancels the confirmation step with No keyword", () => {
    const tool = new ArrayTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_a"] },
      document: createDocumentWithEntities([
        { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }
      ])
    });

    tool.activate(context);
    tool.onCommandInput("2", context);
    tool.onCommandInput("2", context);
    tool.onCommandInput("5", context);
    tool.onCommandInput("5", context);
    tool.onCommandInput("no", context);

    expect(context.commands).toEqual([]);
    expect(context.messages.at(-1)).toBe("[Array] Specify rows");
  });

  it("walks back through phases with Escape", () => {
    const tool = new ArrayTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_a"] },
      document: createDocumentWithEntities([
        { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }
      ])
    });

    tool.activate(context);
    tool.onCommandInput("2", context);
    tool.onCommandInput("2", context);
    tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(context.messages.at(-1)).toBe("[Array] Specify columns");
  });

  it("toggles entity selection when activated without prior selection", () => {
    const tool = new ArrayTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);

    expect(context.selection.entityIds).toContain("line_a");

    tool.onCommandInput("", context);

    expect(context.messages.at(-1)).toBe("[Array] Specify rows");
  });

  it("exposes command aliases", () => {
    expect(new ArrayTool().aliases).toEqual(["ar", "array", "matriz"]);
  });
});

describe("parseCompactArrayInput", () => {
  it("parses fully named compact input", () => {
    expect(parseCompactArrayInput("rows=3 cols=4 dx=100 dy=50")).toEqual({
      rows: 3,
      columns: 4,
      spacingX: 100,
      spacingY: 50
    });
  });

  it("parses compact input with portuguese keys", () => {
    expect(parseCompactArrayInput("linhas=2 colunas=5 dx=10 dy=20")).toEqual({
      rows: 2,
      columns: 5,
      spacingX: 10,
      spacingY: 20
    });
  });

  it("parses comma-separated compact input", () => {
    expect(parseCompactArrayInput("3,4,100,50")).toEqual({
      rows: 3,
      columns: 4,
      spacingX: 100,
      spacingY: 50
    });
  });

  it("returns null for malformed compact input", () => {
    expect(parseCompactArrayInput("rows=3 invalid=4")).toBeNull();
    expect(parseCompactArrayInput("3,abc")).toBeNull();
  });
});

function createDocumentWithEntities(
  entities: ReadonlyArray<CadEntity>,
  options: Readonly<{ lockTargetLayer?: boolean }> = {}
): CadDocument {
  const lockTargetLayer = options.lockTargetLayer === true;

  return {
    ...createEmptyDocument("doc_array_tool"),
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "source", name: "Source", color: "#00ffff", visible: true, locked: lockTargetLayer, order: 1 },
      { id: "locked", name: "Locked", color: "#ff0000", visible: true, locked: lockTargetLayer, order: 2 }
    ],
    activeLayerId: "layer_0",
    entities
  };
}

export type _ArrayTestEntityId = EntityId;
