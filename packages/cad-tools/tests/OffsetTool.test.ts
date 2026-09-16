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
