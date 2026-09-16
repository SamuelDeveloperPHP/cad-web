import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { FilletTool } from "../src";
import { createMockToolContext, createPointerEvent } from "./testContext";

describe("FilletTool", () => {
  it("creates an arc and trims both selected line branches", () => {
    const tool = new FilletTool();
    const document = createDocument([
      { id: "line_a", layerId: "source", type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
      { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onCommandInput("r=2", context);
    tool.onPointerDown(createPointerEvent({ x: -6, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 6 }), context);
    const nextDocument = context.commands[0].execute(document);
    const lineA = nextDocument.entities.find((entity) => entity.id === "line_a");
    const lineB = nextDocument.entities.find((entity) => entity.id === "line_b");
    const arc = nextDocument.entities.find((entity) => entity.type === "arc");

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({ type: "FilletLineLineCommand" });
    expect(lineA).toMatchObject({ type: "line", end: { y: 0 } });
    expect((lineA as any).end.x).toBeCloseTo(-2);
    expect((lineB as any).start.x).toBeCloseTo(0);
    expect((lineB as any).start.y).toBeCloseTo(2);
    expect(arc).toMatchObject({
      type: "arc",
      layerId: "source",
      radius: 2,
      clockwise: true
    });
    expect((arc as any).center.x).toBeCloseTo(-2);
    expect((arc as any).center.y).toBeCloseTo(2);
  });

  it("previews the fillet before confirmation", () => {
    const tool = new FilletTool();
    const context = createMockToolContext({
      document: createDocument([
        { id: "line_a", layerId: "source", type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
        { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
      ])
    });

    tool.activate(context);
    tool.onCommandInput("2", context);
    tool.onPointerDown(createPointerEvent({ x: -6, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 0, y: 6 }), context);

    expect(result.type).toBe("preview");
    const preview = context.previews.at(-1) as any;
    expect(preview.type).toBe("ghostEntities");
    expect(preview.entities).toHaveLength(3);
    expect(preview.entities[0]).toMatchObject({ type: "line" });
    expect(preview.entities[1]).toMatchObject({ type: "line" });
    expect(preview.entities[2]).toMatchObject({ type: "arc" });
  });

  it("rejects invalid radius input", () => {
    const tool = new FilletTool();
    const context = createMockToolContext();

    tool.activate(context);
    const result = tool.onCommandInput("raio=0", context);

    expect(result.type).toBe("error");
    expect(context.messages).toContain("[Fillet] Radius too large or invalid");
  });

  it("rejects parallel line pairs", () => {
    const tool = new FilletTool();
    const context = createMockToolContext({
      document: createDocument([
        { id: "line_a", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 2 }, end: { x: 10, y: 2 } }
      ])
    });

    tool.activate(context);
    tool.onCommandInput("1", context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 5, y: 2 }), context);

    expect(result.type).toBe("none");
    expect(context.commands).toEqual([]);
    expect(context.messages).toContain("[Fillet] Lines are parallel or invalid");
  });

  it("blocks fillet selection on locked layers", () => {
    const tool = new FilletTool();
    const context = createMockToolContext({
      document: createDocument(
        [{ id: "line_a", layerId: "locked", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }],
        true
      )
    });

    tool.activate(context);
    tool.onCommandInput("1", context);
    const result = tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);

    expect(result.type).toBe("none");
    expect(context.messages).toContain("[Fillet] Layer is locked");
  });

  it("fillets a corner of a rectangle exploding into lines and arc", () => {
    const tool = new FilletTool();
    const document = createDocument([
      { id: "rect_a", layerId: "source", type: "rectangle", x: 0, y: 0, width: 20, height: 10 }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onCommandInput("r=2", context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 20, y: 5 }), context);

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({ type: "FilletCornerCommand" });

    const nextDocument = context.commands[0].execute(document);
    const rect = nextDocument.entities.find((e) => e.id === "rect_a");
    const lines = nextDocument.entities.filter((e) => e.type === "line");
    const arcs = nextDocument.entities.filter((e) => e.type === "arc");

    expect(rect).toBeUndefined();
    expect(lines).toHaveLength(4);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]).toMatchObject({ type: "arc", radius: 2 });
  });

  it("undoes corner fillet restoring the original rectangle", () => {
    const tool = new FilletTool();
    const document = createDocument([
      { id: "rect_a", layerId: "source", type: "rectangle", x: 0, y: 0, width: 20, height: 10 }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onCommandInput("r=2", context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 20, y: 5 }), context);

    const command = context.commands[0];
    const afterExecute = command.execute(document);
    const afterUndo = command.undo(afterExecute);
    const restored = afterUndo.entities.find((e) => e.id === "rect_a");

    expect(restored).toMatchObject({ type: "rectangle", x: 0, y: 0, width: 20, height: 10 });
  });

  it("fillets a corner of a closed polyline", () => {
    const tool = new FilletTool();
    const document = createDocument([
      {
        id: "poly_a", layerId: "source", type: "polyline", closed: true,
        points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }]
      }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onCommandInput("r=3", context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 20, y: 5 }), context);

    expect(result.type).toBe("command");
    expect(context.commands[0]).toMatchObject({ type: "FilletCornerCommand" });

    const nextDocument = context.commands[0].execute(document);
    const poly = nextDocument.entities.find((e) => e.id === "poly_a");
    const lines = nextDocument.entities.filter((e) => e.type === "line");
    const arcs = nextDocument.entities.filter((e) => e.type === "arc");

    expect(poly).toBeUndefined();
    expect(lines).toHaveLength(4);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]).toMatchObject({ type: "arc", radius: 3 });
  });

  it("rejects non-adjacent edges", () => {
    const tool = new FilletTool();
    const document = createDocument([
      { id: "rect_a", layerId: "source", type: "rectangle", x: 0, y: 0, width: 20, height: 10 }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onCommandInput("r=2", context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 10, y: 10 }), context);

    expect(result.type).toBe("none");
    expect(context.messages).toContain("[Fillet] Selected edges are not adjacent");
  });

  it("converts the typed radius by the working unit scale", () => {
    const tool = new FilletTool();
    const document = createDocument([
      { id: "line_a", layerId: "source", type: "line", start: { x: -10, y: 0 }, end: { x: 0, y: 0 } },
      { id: "line_b", layerId: "source", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
    ]);
    // unitScale 10 = trabalhar em cm com base em mm: raio digitado 0.2 cm -> 2 mm.
    const context = createMockToolContext({ document, unitScale: 10 });

    tool.activate(context);
    tool.onCommandInput("0.2", context);
    tool.onPointerDown(createPointerEvent({ x: -6, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 6 }), context);
    const nextDocument = context.commands[0].execute(document);
    const arc = nextDocument.entities.find((entity) => entity.type === "arc");

    expect(result.type).toBe("command");
    expect((arc as any).radius).toBeCloseTo(2);
  });

  it("exposes command aliases", () => {
    expect(new FilletTool().aliases).toEqual(["f", "fillet"]);
  });
});

function createDocument(entities: ReadonlyArray<CadEntity>, lockTargetLayer = false): CadDocument {
  return {
    ...createEmptyDocument("doc_fillet_tool"),
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "source", name: "Source", color: "#00ffff", visible: true, locked: false, order: 1 },
      { id: "locked", name: "Locked", color: "#ff0000", visible: true, locked: lockTargetLayer, order: 2 }
    ],
    activeLayerId: "layer_0",
    entities
  };
}
