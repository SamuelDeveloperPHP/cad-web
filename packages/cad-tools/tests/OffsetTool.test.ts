import { createEmptyDocument, type CadDocument, type CadEntity, type LineEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { OffsetTool } from "../src";
import { createMockToolContext, createPointerEvent } from "./testContext";

function createDocument(entities: ReadonlyArray<CadEntity>): CadDocument {
  return {
    ...createEmptyDocument("doc_offset_tool"),
    layers: [{ id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 }],
    activeLayerId: "layer_0",
    entities
  };
}

describe("OffsetTool", () => {
  it("offsets a line by the typed distance in the base unit", () => {
    const tool = new OffsetTool();
    const document = createDocument([
      { id: "line_a", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }
    ]);
    const context = createMockToolContext({ document });

    tool.activate(context);
    tool.onCommandInput("10", context);                                   // distância 10 (mm)
    tool.onPointerDown(createPointerEvent({ x: 50, y: 0 }), context);      // seleciona a linha
    tool.onPointerDown(createPointerEvent({ x: 50, y: 20 }), context);     // lado +Y

    const created = context.commands[0].execute(document).entities.find((e) => e.id !== "line_a") as LineEntity;
    expect(created.type).toBe("line");
    expect(created.start.y).toBeCloseTo(10);
  });

  it("converts the typed offset distance by the working unit scale", () => {
    const tool = new OffsetTool();
    const document = createDocument([
      { id: "line_a", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }
    ]);
    // unitScale 10 = cm: distância digitada 1 cm -> 10 mm.
    const context = createMockToolContext({ document, unitScale: 10 });

    tool.activate(context);
    tool.onCommandInput("1", context);
    tool.onPointerDown(createPointerEvent({ x: 50, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 50, y: 20 }), context);

    const created = context.commands[0].execute(document).entities.find((e) => e.id !== "line_a") as LineEntity;
    expect(created.start.y).toBeCloseTo(10);
  });
});

describe("OffsetTool with curves", () => {
  it("offsets an ellipse into a closed spline and an arc into a larger arc", async () => {
    const { createEmptyDocument } = await import("@cad-web/cad-core");
    const { OffsetTool } = await import("../src");
    const { createMockToolContext, createPointerEvent } = await import("./testContext");
    const document = {
      ...createEmptyDocument("doc_offset_curves"),
      entities: [
        { id: "el", layerId: "layer_0", type: "ellipse" as const, center: { x: 0, y: 0 }, radiusX: 40, radiusY: 20, rotation: 0, color: "#ff0000" },
        { id: "arc", layerId: "layer_0", type: "arc" as const, center: { x: 200, y: 0 }, radius: 10, startAngle: 0, endAngle: 1, clockwise: true }
      ]
    };
    const context = createMockToolContext({ document, viewport: { origin: { x: 0, y: 0 }, scale: 1 } });
    const tool = new OffsetTool();

    tool.activate(context);
    tool.onCommandInput("5", context);
    tool.onPointerDown(createPointerEvent({ x: 40, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 100, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 210, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 300, y: 0 }), context);

    // A paralela da elipse vira spline fechada (cadeia de Béziers), como no AutoCAD.
    const spline = (context.commands[0] as any).entity;
    expect(spline).toMatchObject({ type: "spline", closed: true, color: "#ff0000" });
    expect(spline.controlPoints[0].x).toBeCloseTo(45);
    expect(spline.controlPoints.at(-1)).toEqual(spline.controlPoints[0]);
    expect((context.commands[1] as any).entity).toMatchObject({ type: "arc", radius: 15, startAngle: 0, endAngle: 1 });
  });
});
