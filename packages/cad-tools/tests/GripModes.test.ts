import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { SelectTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

const LINE: CadEntity = { id: "l", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
const CIRCLE: CadEntity = { id: "c", layerId: "layer_0", type: "circle", center: { x: 50, y: 50 }, radius: 10 };

function setup(entities: ReadonlyArray<CadEntity> = [LINE, CIRCLE], selected: ReadonlyArray<string> = ["l", "c"]) {
  const document: CadDocument = { ...createEmptyDocument("doc_grip_modes"), entities };
  const context = createMockToolContext({ document, selection: { entityIds: [...selected] }, viewport: { origin: { x: 0, y: 0 }, scale: 1 } });
  const tool = new SelectTool();
  return { document, context, tool };
}

const at = (x: number, y: number) => createPointerEvent({ x, y });

// Clica e solta no grip (sem arrastar): o grip fica quente.
function hotGrip(tool: SelectTool, context: ReturnType<typeof setup>["context"], x: number, y: number): void {
  tool.onPointerDown(at(x, y), context);
  tool.onPointerUp(at(x, y), context);
}

function expectPoint(actual: { x: number; y: number }, expected: { x: number; y: number }): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}

describe("grip modes", () => {
  it("cycles Stretch → Move with Space and moves every selected entity, with exact undo", () => {
    const { document, context, tool } = setup();

    hotGrip(tool, context, 0, 0);
    expect(tool.claimsKeyDown(createKeyboardEvent(" "))).toBe(true);
    tool.onKeyDown(createKeyboardEvent(" "), context);
    expect(context.messages.at(-1)).toContain("** MOVE **");
    tool.onPointerMove(at(10, 5), context);
    expect(tool.onPointerDown(at(10, 5), context).type).toBe("complete");

    const command = context.commands[0]!;
    expect(command.type).toBe("ReplaceEntitiesCommand");
    const next = command.execute(document);
    expect(next.entities[0]).toMatchObject({ id: "l", start: { x: 10, y: 5 }, end: { x: 110, y: 5 } });
    expect(next.entities[1]).toMatchObject({ id: "c", center: { x: 60, y: 55 } });
    expect(command.undo(next).entities).toEqual(document.entities);
    expect(context.selection.entityIds).toEqual(["l", "c"]);
  });

  it("rotates by a typed angle in the AutoCAD convention (counterclockwise on screen)", () => {
    const { document, context, tool } = setup([LINE], ["l"]);

    hotGrip(tool, context, 0, 0);
    tool.onCommandInput("ro", context);
    expect(context.messages.at(-1)).toContain("** ROTATE **");
    tool.onCommandInput("90", context);

    // Y do mundo cresce para baixo: 90° anti-horário na tela leva o fim da linha para y = −100.
    expectPoint((context.commands[0]!.execute(document).entities[0] as any).end, { x: 0, y: -100 });
  });

  it("scales by a typed factor and mirrors by a second point, keeping ids", () => {
    const scaled = setup([LINE], ["l"]);
    hotGrip(scaled.tool, scaled.context, 0, 0);
    scaled.tool.onCommandInput("sc", scaled.context);
    expect(scaled.tool.onCommandInput("0", scaled.context).type).toBe("error");
    scaled.tool.onCommandInput("2", scaled.context);
    expectPoint((scaled.context.commands[0]!.execute(scaled.document).entities[0] as any).end, { x: 200, y: 0 });

    const mirrored = setup([LINE], ["l"]);
    hotGrip(mirrored.tool, mirrored.context, 0, 0);
    mirrored.tool.onCommandInput("mi", mirrored.context);
    mirrored.tool.onPointerDown(at(0, 10), mirrored.context);
    const entity = mirrored.context.commands[0]!.execute(mirrored.document).entities[0] as any;
    expect(entity.id).toBe("l");
    expectPoint(entity.end, { x: -100, y: 0 });
  });

  it("makes several copies with the Copy option and keeps the grip hot until Esc", () => {
    const { document, context, tool } = setup([LINE], ["l"]);

    hotGrip(tool, context, 100, 0);
    tool.onCommandInput("move", context);
    tool.onKeyDown(createKeyboardEvent("c"), context);
    expect(context.messages.at(-1)).toContain("** MOVE (multiple) **");
    tool.onPointerDown(at(100, 20), context);
    tool.onPointerUp(at(100, 20), context);
    tool.onPointerDown(at(100, 40), context);

    let current = document;
    for (const command of context.commands) current = command.execute(current);
    expect(current.entities).toHaveLength(3);
    expect(current.entities[0]).toEqual(LINE);
    expect(current.entities.map((entity) => (entity as any).start.y)).toEqual([0, 20, 40]);
    expect(tool.getContextMenu()).not.toBeNull();

    tool.onKeyDown(createKeyboardEvent("Escape"), context);
    expect(tool.getContextMenu()).toBeNull();
  });

  it("uses a new base point chosen with the Base point option", () => {
    const { document, context, tool } = setup([LINE], ["l"]);

    hotGrip(tool, context, 100, 0);
    tool.onCommandInput("mo", context);
    tool.onCommandInput("b", context);
    tool.onPointerDown(at(50, 0), context);
    tool.onPointerUp(at(50, 0), context);
    expect(context.commands).toHaveLength(0);
    tool.onCommandInput("@0,10", context);

    expect(context.commands[0]!.execute(document).entities[0]).toMatchObject({ start: { x: 0, y: 10 }, end: { x: 100, y: 10 } });
  });

  it("offers a context menu with the modes and ignores the right button while a grip is hot", () => {
    const { context, tool } = setup([LINE], ["l"]);

    expect(tool.getContextMenu()).toBeNull();
    hotGrip(tool, context, 100, 0);
    tool.onCommandInput("", context);
    const menu = tool.getContextMenu()!;
    expect(menu.map((item) => item.label)).toEqual(["Stretch", "Move", "Rotate", "Scale", "Mirror", "Base Point", "Copy", "Exit"]);
    expect(menu.find((item) => item.checked)?.command).toBe("move");

    expect(tool.onPointerDown({ ...at(30, 30), button: "secondary" }, context).type).toBe("none");
    expect(context.commands).toHaveLength(0);
    tool.onCommandInput("exit", context);
    expect(tool.getContextMenu()).toBeNull();
  });

  it("keeps vertex options in Stretch only and M switches to Move", () => {
    const polyline: CadEntity = { id: "p", layerId: "layer_0", type: "polyline", closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
    const { context, tool } = setup([polyline], ["p"]);

    hotGrip(tool, context, 10, 0);
    expect(tool.getContextMenu()!.map((item) => item.label)).toContain("Add Vertex");
    expect(tool.claimsKeyDown(createKeyboardEvent("m"))).toBe(true);
    tool.onKeyDown(createKeyboardEvent("m"), context);
    expect(tool.getContextMenu()!.map((item) => item.label)).not.toContain("Add Vertex");
    expect(tool.onKeyDown(createKeyboardEvent("a"), context).type).toBe("error");
    expect(context.messages.at(-1)).toContain("Stretch mode");
  });
});
