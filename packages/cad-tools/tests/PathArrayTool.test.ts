import { createEmptyDocument, type CadDocument, type CadEntity, type CircleEntity, type PolylineEntity, type RectangleEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { PathArrayTool } from "../src";
import { createMockToolContext, createPointerEvent } from "./testContext";

describe("PathArrayTool", () => {
  it("creates count copies along an open polyline keeping the original entity intact", () => {
    const tool = new PathArrayTool();
    const document = createDocumentWithEntities([
      { id: "circle_a", layerId: "source", type: "circle", center: { x: 0, y: 0 }, radius: 1 },
      polylinePath()
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["circle_a"] }
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    tool.onCommandInput("5", context);
    tool.onCommandInput("yes", context);
    const result = tool.onCommandInput("", context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]).toMatchObject({ type: "ArrayEntitiesCommand" });

    const nextDocument = context.commands[0].execute(document);
    const circles = nextDocument.entities.filter((entity) => entity.type === "circle");
    expect(circles).toHaveLength(6);
    expect(circles.find((entity) => entity.id === "circle_a")).toBeDefined();
  });

  it("rejects non-polyline entities as path with a clear message", () => {
    const tool = new PathArrayTool();
    const document = createDocumentWithEntities([
      { id: "circle_a", layerId: "source", type: "circle", center: { x: 0, y: 0 }, radius: 1 },
      { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["circle_a"] }
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    // O clique sobre a line nao deve ser aceito como path.
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);

    expect(context.messages).toContain("[PathArray] Select a polyline path");
  });

  it("aligns rectangles to the tangent when alignToTangent is yes", () => {
    const tool = new PathArrayTool();
    const document = createDocumentWithEntities([
      {
        id: "rect_a",
        layerId: "source",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        rotation: 0
      },
      verticalPolylinePath()
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["rect_a"] }
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 5 }), context);
    tool.onCommandInput("3", context);
    tool.onCommandInput("yes", context);
    tool.onCommandInput("", context);

    const nextDocument = context.commands[0].execute(document);
    const rectangles = nextDocument.entities.filter((entity) => entity.type === "rectangle" && entity.id !== "rect_a") as RectangleEntity[];

    for (const rectangle of rectangles) {
      expect(rectangle.rotation).toBeCloseTo(Math.PI / 2);
    }
  });

  it("preserves orientation when alignToTangent is no", () => {
    const tool = new PathArrayTool();
    const document = createDocumentWithEntities([
      {
        id: "rect_a",
        layerId: "source",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        rotation: 0
      },
      verticalPolylinePath()
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["rect_a"] }
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 5 }), context);
    tool.onCommandInput("3", context);
    tool.onCommandInput("no", context);
    tool.onCommandInput("", context);

    const nextDocument = context.commands[0].execute(document);
    const rectangles = nextDocument.entities.filter((entity) => entity.type === "rectangle" && entity.id !== "rect_a") as RectangleEntity[];

    for (const rectangle of rectangles) {
      expect(rectangle.rotation ?? 0).toBeCloseTo(0);
    }
  });

  it("blocks path array when source layer is locked", () => {
    const tool = new PathArrayTool();
    const document = createDocumentWithEntities([
      { id: "circle_locked", layerId: "locked", type: "circle", center: { x: 0, y: 0 }, radius: 1 },
      polylinePath()
    ], { lockSourceLayer: true });
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["circle_locked"] }
    });

    tool.activate(context);

    expect(context.messages).toContain("[PathArray] Select objects");
  });

  it("rejects invalid count values", () => {
    const tool = new PathArrayTool();
    const document = createDocumentWithEntities([
      { id: "circle_a", layerId: "source", type: "circle", center: { x: 0, y: 0 }, radius: 1 },
      polylinePath()
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["circle_a"] }
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    const result = tool.onCommandInput("0", context);

    expect(result.type).toBe("error");
    expect(context.messages).toContain("[PathArray] Invalid count");
  });

  it("does not duplicate start and end on closed polylines", () => {
    const tool = new PathArrayTool();
    const document = createDocumentWithEntities([
      { id: "circle_a", layerId: "source", type: "circle", center: { x: 0, y: 0 }, radius: 1 },
      closedPolylinePath()
    ]);
    const context = createMockToolContext({
      document,
      selection: { entityIds: ["circle_a"] }
    });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 15, y: 0 }), context);
    tool.onCommandInput("4", context);
    tool.onCommandInput("no", context);
    tool.onCommandInput("", context);

    const nextDocument = context.commands[0].execute(document);
    const created = nextDocument.entities.filter((entity) => entity.type === "circle" && entity.id !== "circle_a") as CircleEntity[];
    const positions = new Set(created.map((entity) => `${entity.center.x.toFixed(3)},${entity.center.y.toFixed(3)}`));

    expect(created).toHaveLength(4);
    expect(positions.size).toBe(4);
  });

  it("exposes command aliases", () => {
    expect(new PathArrayTool().aliases).toEqual(["ap", "arraypath", "patharray", "matrizcaminho", "matrizporcaminho"]);
  });
});

function polylinePath(): PolylineEntity {
  return {
    id: "path_a",
    layerId: "path_layer",
    type: "polyline",
    points: [
      { x: 5, y: 0 },
      { x: 25, y: 0 }
    ],
    closed: false
  };
}

function verticalPolylinePath(): PolylineEntity {
  return {
    id: "path_a",
    layerId: "path_layer",
    type: "polyline",
    points: [
      { x: 0, y: 5 },
      { x: 0, y: 25 }
    ],
    closed: false
  };
}

function closedPolylinePath(): PolylineEntity {
  return {
    id: "path_closed",
    layerId: "path_layer",
    type: "polyline",
    points: [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 }
    ],
    closed: true
  };
}

function createDocumentWithEntities(
  entities: ReadonlyArray<CadEntity>,
  options: Readonly<{ lockSourceLayer?: boolean }> = {}
): CadDocument {
  const lockSourceLayer = options.lockSourceLayer === true;

  return {
    ...createEmptyDocument("doc_path_array"),
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "source", name: "Source", color: "#00ffff", visible: true, locked: lockSourceLayer, order: 1 },
      { id: "locked", name: "Locked", color: "#ff0000", visible: true, locked: true, order: 2 },
      { id: "path_layer", name: "Path", color: "#cccccc", visible: true, locked: false, order: 3 }
    ],
    activeLayerId: "layer_0",
    entities
  };
}
