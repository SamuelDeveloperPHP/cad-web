import {
  createEmptyDocument,
  type CadDocument,
  type CadEntity,
  type LineEntity,
  type PolylineEntity,
  type RectangleEntity
} from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { ExplodeTool } from "../src";
import { createKeyboardEvent, createMockToolContext } from "./testContext";

describe("ExplodeTool", () => {
  it("explodes a rectangle into 4 lines preserving layer and style", () => {
    const tool = new ExplodeTool();
    const document = createDocumentWithEntities([
      {
        id: "rect_a",
        layerId: "source",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 10,
        height: 5,
        color: "#ff0000",
        lineThickness: 2
      }
    ]);
    const context = createMockToolContext({ document, selection: { entityIds: ["rect_a"] } });

    tool.activate(context);

    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]).toMatchObject({ type: "ExplodeEntitiesCommand" });

    const nextDocument = context.commands[0].execute(document);
    const lines = nextDocument.entities.filter((entity): entity is LineEntity => entity.type === "line");
    expect(lines).toHaveLength(4);
    expect(nextDocument.entities.find((entity) => entity.id === "rect_a")).toBeUndefined();

    for (const line of lines) {
      expect(line.layerId).toBe("source");
      expect(line.color).toBe("#ff0000");
      expect(line.lineThickness).toBe(2);
    }
  });

  it("explodes an open polyline into N-1 lines", () => {
    const tool = new ExplodeTool();
    const document = createDocumentWithEntities([
      {
        id: "pl_a",
        layerId: "source",
        type: "polyline",
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
          { x: 0, y: 5 }
        ],
        closed: false
      }
    ]);
    const context = createMockToolContext({ document, selection: { entityIds: ["pl_a"] } });

    tool.activate(context);

    const nextDocument = context.commands[0].execute(document);
    const lines = nextDocument.entities.filter((entity) => entity.type === "line");
    expect(lines).toHaveLength(3);
  });

  it("explodes a closed polyline into N lines with the closing segment", () => {
    const tool = new ExplodeTool();
    const document = createDocumentWithEntities([
      {
        id: "pl_b",
        layerId: "source",
        type: "polyline",
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
          { x: 0, y: 5 }
        ],
        closed: true
      }
    ]);
    const context = createMockToolContext({ document, selection: { entityIds: ["pl_b"] } });

    tool.activate(context);

    const nextDocument = context.commands[0].execute(document);
    const lines = nextDocument.entities.filter((entity) => entity.type === "line");
    expect(lines).toHaveLength(4);
  });

  it("undoes the explode restoring the original entity", () => {
    const tool = new ExplodeTool();
    const document = createDocumentWithEntities([
      {
        id: "rect_a",
        layerId: "source",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 10,
        height: 5
      }
    ]);
    const context = createMockToolContext({ document, selection: { entityIds: ["rect_a"] } });

    tool.activate(context);
    const command = context.commands[0];
    const afterExecute = command.execute(document);
    const afterUndo = command.undo(afterExecute);

    expect(afterUndo.entities).toHaveLength(1);
    expect(afterUndo.entities[0]?.id).toBe("rect_a");
    expect(afterUndo.entities[0]?.type).toBe("rectangle");
  });

  it("blocks explode when the source layer is locked and reports it", () => {
    const tool = new ExplodeTool();
    const document = createDocumentWithEntities(
      [
        {
          id: "rect_locked",
          layerId: "locked",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 5,
          height: 5
        }
      ],
      { lockSourceLayer: true }
    );
    const context = createMockToolContext({ document, selection: { entityIds: ["rect_locked"] } });

    tool.activate(context);

    expect(context.commands).toEqual([]);
    expect(context.messages).toContain("[Explode] Layer is locked");
  });

  it("ignores unsupported entities without removing them", () => {
    const tool = new ExplodeTool();
    const document = createDocumentWithEntities([
      { id: "circle_a", layerId: "source", type: "circle", center: { x: 0, y: 0 }, radius: 3 }
    ]);
    const context = createMockToolContext({ document, selection: { entityIds: ["circle_a"] } });

    tool.activate(context);

    expect(context.commands).toEqual([]);
    expect(context.messages).toContain("[Explode] Nothing to explode");
  });

  it("explodes supported entities and reports unsupported ones in the same selection", () => {
    const tool = new ExplodeTool();
    const document = createDocumentWithEntities([
      { id: "rect_a", layerId: "source", type: "rectangle", x: 0, y: 0, width: 5, height: 5 },
      { id: "circle_a", layerId: "source", type: "circle", center: { x: 100, y: 100 }, radius: 3 }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["rect_a", "circle_a"] }
    });

    tool.activate(context);

    expect(context.commands).toHaveLength(1);
    expect(context.messages).toContain("[Explode] Some entities are not supported");

    const nextDocument = context.commands[0].execute(document);
    const lines = nextDocument.entities.filter((entity) => entity.type === "line");
    expect(lines).toHaveLength(4);
    expect(nextDocument.entities.find((entity) => entity.id === "circle_a")).toBeDefined();
  });

  it("nudges the user with the prompt when Enter is pressed without selection", () => {
    const tool = new ExplodeTool();
    const document = createDocumentWithEntities([]);
    const context = createMockToolContext({ document });

    tool.activate(context);

    expect(context.messages).toContain("[Explode] Select objects");

    const result = tool.onKeyDown(createKeyboardEvent("Enter"), context);

    expect(result.type).toBe("none");
    expect(context.commands).toEqual([]);
    expect(context.messages.filter((message) => message === "[Explode] Select objects").length).toBeGreaterThanOrEqual(2);
  });

  it("exposes command aliases", () => {
    expect(new ExplodeTool().aliases).toEqual(["x", "explode", "explodir"]);
  });
});

function createDocumentWithEntities(
  entities: ReadonlyArray<CadEntity>,
  options: Readonly<{ lockSourceLayer?: boolean }> = {}
): CadDocument {
  const lockSourceLayer = options.lockSourceLayer === true;

  return {
    ...createEmptyDocument("doc_explode"),
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "source", name: "Source", color: "#00ffff", visible: true, locked: lockSourceLayer, order: 1 },
      { id: "locked", name: "Locked", color: "#ff0000", visible: true, locked: true, order: 2 }
    ],
    activeLayerId: "layer_0",
    entities
  };
}

export type _ExplodeTestEntity = RectangleEntity | PolylineEntity;
