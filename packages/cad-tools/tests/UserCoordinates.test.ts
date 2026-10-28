import { createEmptyDocument, type CadDocument, type CadEntity, type LineEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { ArrayPolarTool, ArrayTool, PathArrayTool, RectangleTool, userOffsetToWorld, userPointToWorld } from "../src";
import { createMockToolContext, createPointerEvent } from "./testContext";

// Coordenadas digitadas seguem o AutoCAD: X para a direita e Y para CIMA na tela. O documento guarda o Y
// do Canvas (para baixo), então o Y digitado troca de sinal ao entrar no documento.
describe("typed coordinates (Y up)", () => {
  it("converts user points and offsets to the world frame and scales by the working unit", () => {
    expect(userPointToWorld({ x: 3, y: 4 }, 10)).toEqual({ x: 30, y: -40 });
    expect(userOffsetToWorld({ x: -2, y: -5 })).toEqual({ x: -2, y: 5 });
    // Sem -0 quando o Y digitado é zero.
    expect(Object.is(userPointToWorld({ x: 1, y: 0 }).y, 0)).toBe(true);
  });

  it("makes typed rectangle dimensions grow up and to the right, and negative ones down and to the left", () => {
    const up = new RectangleTool();
    const upContext = createMockToolContext();
    up.onPointerDown(createPointerEvent({ x: 0, y: 0 }), upContext);
    up.onCommandInput("40,30", upContext);
    expect((upContext.commands[0] as any).entity).toMatchObject({ x: 0, y: -30, width: 40, height: 30 });

    const down = new RectangleTool();
    const downContext = createMockToolContext();
    down.onPointerDown(createPointerEvent({ x: 0, y: 0 }), downContext);
    down.onCommandInput("-40,-30", downContext);
    expect((downContext.commands[0] as any).entity).toMatchObject({ x: -40, y: 0, width: 40, height: 30 });
  });

  it("uses Y up for the polar array center and the path array base point, in the working unit", () => {
    const line: CadEntity = { id: "a", layerId: "layer_0", type: "line", start: { x: 5, y: 0 }, end: { x: 7, y: 0 } };
    const document: CadDocument = { ...createEmptyDocument("doc_user_coordinates"), entities: [line] };
    const context = createMockToolContext({ document, selection: { entityIds: ["a"] }, unitScale: 10 });
    const tool = new ArrayPolarTool();

    tool.activate(context);
    tool.onCommandInput("1,2", context);
    tool.onCommandInput("count=2 angle=180", context);
    tool.onCommandInput("yes", context);
    tool.onCommandInput("", context);

    // Centro (1,2) mm×10 → mundo (10, −20); a cópia a 180° leva o ponto (5,0) a (15, −40).
    const copy = context.commands[0]!.execute(document).entities.find((entity) => entity.id !== "a") as LineEntity;
    expect(copy.start.x).toBeCloseTo(15, 9);
    expect(copy.start.y).toBeCloseTo(-40, 9);

    const pathTool = new PathArrayTool();
    const pathContext = createMockToolContext({ document, selection: { entityIds: ["a"] }, unitScale: 10 });
    pathTool.activate(pathContext);
    expect(() => pathTool.onCommandInput("1,2", pathContext)).not.toThrow();
  });

  it("makes positive row spacing in the rectangular array climb on screen", () => {
    const line: CadEntity = { id: "a", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } };
    const document: CadDocument = { ...createEmptyDocument("doc_array_rows"), entities: [line] };
    const context = createMockToolContext({ document, selection: { entityIds: ["a"] } });
    const tool = new ArrayTool();

    tool.activate(context);
    tool.onCommandInput("rows=2 cols=1 dx=10 dy=50", context);
    tool.onCommandInput("", context);

    const copies = context.commands[0]!.execute(document).entities.filter((entity) => entity.id !== "a") as LineEntity[];
    expect(copies).toHaveLength(1);
    // Segunda linha 50 acima na tela: Y do mundo −50.
    expect(copies[0]!.start.y).toBeCloseTo(-50, 9);
  });
});
