import { createEmptyDocument, type CadDocument, type CadEntity, type LineEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { ArrayPolarTool, parseCompactPolarInput } from "../src/modify/ArrayPolarTool";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("ArrayPolarTool", () => {
  it("creates a polar array with 6 items spanning 360 degrees", () => {
    const tool = new ArrayPolarTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 5, y: 0 }, end: { x: 7, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("6", context);
    tool.onCommandInput("360", context);
    tool.onCommandInput("yes", context);
    const result = tool.onCommandInput("", context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]).toMatchObject({ type: "ArrayEntitiesCommand" });

    const nextDocument = context.commands[0].execute(document);
    const lines = nextDocument.entities.filter((entity) => entity.type === "line");
    expect(lines).toHaveLength(6);
  });

  it("accepts a compact input with count and angle", () => {
    const tool = new ArrayPolarTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 5, y: 0 }, end: { x: 7, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);
    tool.onCommandInput("0,0", context);
    tool.onCommandInput("count=4 angle=180", context);
    tool.onCommandInput("yes", context);
    tool.onCommandInput("", context);

    expect(context.commands).toHaveLength(1);
    const nextDocument = context.commands[0].execute(document);
    expect(nextDocument.entities).toHaveLength(4);
  });

  it("rotates entities by default and preserves orientation when rotateItems = no", () => {
    const tool = new ArrayPolarTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 5, y: 0 }, end: { x: 7, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("4", context);
    tool.onCommandInput("360", context);
    tool.onCommandInput("no", context);
    tool.onCommandInput("", context);

    const nextDocument = context.commands[0].execute(document);
    const clones = nextDocument.entities.filter((entity) => entity.id !== "line_a");

    for (const clone of clones) {
      const line = clone as LineEntity;
      // O modo translacional mantem o vetor horizontal original em todas as copias.
      expect(line.end.x - line.start.x).toBeCloseTo(2);
      expect(line.end.y - line.start.y).toBeCloseTo(0);
    }
  });

  it("rejects invalid count below 2", () => {
    const tool = new ArrayPolarTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_a"] },
      document: createDocumentWithEntities([
        { id: "line_a", layerId: "source", type: "line", start: { x: 5, y: 0 }, end: { x: 7, y: 0 } }
      ])
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onCommandInput("1", context);

    expect(result.type).toBe("error");
    expect(context.messages).toContain("[ArrayPolar] Invalid array parameters");
  });

  it("rejects fill angle equal to zero", () => {
    const tool = new ArrayPolarTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_a"] },
      document: createDocumentWithEntities([
        { id: "line_a", layerId: "source", type: "line", start: { x: 5, y: 0 }, end: { x: 7, y: 0 } }
      ])
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("4", context);
    const result = tool.onCommandInput("0", context);

    expect(result.type).toBe("error");
    expect(context.commands).toEqual([]);
  });

  it("blocks polar array on locked source layer", () => {
    const tool = new ArrayPolarTool();
    const document = createDocumentWithEntities(
      [{ id: "line_a", layerId: "locked", type: "line", start: { x: 5, y: 0 }, end: { x: 7, y: 0 } }],
      { lockTargetLayer: true }
    );
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);

    expect(context.messages).toContain("[ArrayPolar] Select objects");
  });

  it("undoes the array command leaving only the original entity", () => {
    const tool = new ArrayPolarTool();
    const document = createDocumentWithEntities([
      { id: "line_a", layerId: "source", type: "line", start: { x: 5, y: 0 }, end: { x: 7, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["line_a"] }
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("3", context);
    tool.onCommandInput("180", context);
    tool.onCommandInput("yes", context);
    tool.onCommandInput("", context);

    const command = context.commands[0];
    const afterExecute = command.execute(document);
    const afterUndo = command.undo(afterExecute);

    expect(afterUndo.entities).toHaveLength(1);
    expect(afterUndo.entities[0]?.id).toBe("line_a");
  });

  it("walks back through phases with Escape", () => {
    const tool = new ArrayPolarTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_a"] },
      document: createDocumentWithEntities([
        { id: "line_a", layerId: "source", type: "line", start: { x: 5, y: 0 }, end: { x: 7, y: 0 } }
      ])
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("3", context);
    tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(context.messages.at(-1)).toBe("[ArrayPolar] Specify count");
  });

  it("exposes command aliases", () => {
    expect(new ArrayPolarTool().aliases).toEqual(["arraypolar", "matrizpolar", "polar"]);
  });
});

describe("parseCompactPolarInput", () => {
  it("parses named compact input with rotate flag", () => {
    expect(parseCompactPolarInput("count=6 angle=360 rotate=yes")).toEqual({
      count: 6,
      fillAngleDegrees: 360,
      rotateItems: true
    });
  });

  it("parses comma-separated input as count and angle", () => {
    expect(parseCompactPolarInput("4,180")).toEqual({
      count: 4,
      fillAngleDegrees: 180
    });
  });

  it("returns null for malformed compact input", () => {
    expect(parseCompactPolarInput("count=4 invalid=10")).toBeNull();
  });
});

function createDocumentWithEntities(
  entities: ReadonlyArray<CadEntity>,
  options: Readonly<{ lockTargetLayer?: boolean }> = {}
): CadDocument {
  const lockTargetLayer = options.lockTargetLayer === true;

  return {
    ...createEmptyDocument("doc_arraypolar_tool"),
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "source", name: "Source", color: "#00ffff", visible: true, locked: lockTargetLayer, order: 1 },
      { id: "locked", name: "Locked", color: "#ff0000", visible: true, locked: lockTargetLayer, order: 2 }
    ],
    activeLayerId: "layer_0",
    entities
  };
}
