import { createEmptyDocument, type CadDocument, type CadEntity, type SplineEntity } from "@cad-web/cad-core";
import { fitPointsToBezierChain } from "@cad-web/cad-geometry";
import { describe, expect, it } from "vitest";
import { SelectTool, gripEntitiesOfSelection } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

const LINE: CadEntity = { id: "l", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
const CIRCLE: CadEntity = { id: "c", layerId: "layer_0", type: "circle", center: { x: 200, y: 0 }, radius: 20 };
const POLYLINE: CadEntity = { id: "p", layerId: "layer_0", type: "polyline", closed: false, points: [{ x: 0, y: 100 }, { x: 50, y: 100 }, { x: 50, y: 150 }] };
const RECTANGLE: CadEntity = { id: "r", layerId: "layer_0", type: "rectangle", x: 300, y: 0, width: 40, height: 20 };

function setup(entities: ReadonlyArray<CadEntity>, selected: ReadonlyArray<string>) {
  const document: CadDocument = { ...createEmptyDocument("doc_grips"), entities };
  const context = createMockToolContext({ document, selection: { entityIds: [...selected] }, viewport: { origin: { x: 0, y: 0 }, scale: 1 } });
  return { document, context, tool: new SelectTool() };
}

const at = (x: number, y: number) => createPointerEvent({ x, y });

describe("SelectTool entity grips", () => {
  it("drags a line end with one undoable command and keeps the selection", () => {
    const { document, context, tool } = setup([LINE, CIRCLE], ["l", "c"]);

    tool.onPointerDown(at(100, 0), context);
    tool.onPointerMove(at(120, 30), context);
    expect(tool.onPointerUp(at(120, 30), context).type).toBe("complete");

    const next = context.commands[0]!.execute(document);
    expect(next.entities[0]).toMatchObject({ id: "l", start: { x: 0, y: 0 }, end: { x: 120, y: 30 } });
    expect(context.commands[0]!.undo(next).entities).toEqual(document.entities);
    expect(context.selection.entityIds).toEqual(["l", "c"]);
  });

  it("makes a grip hot on click and places it on the next click", () => {
    const { document, context, tool } = setup([CIRCLE], ["c"]);

    tool.onPointerDown(at(220, 0), context);
    tool.onPointerUp(at(220, 0), context);
    expect(context.commands).toHaveLength(0);
    expect(context.messages.at(-1)).toContain("Specify point");

    tool.onPointerMove(at(230, 0), context);
    expect(tool.onPointerDown(at(230, 0), context).type).toBe("complete");
    // O release do clique que confirmou não inicia outra seleção.
    expect(tool.onPointerUp(at(230, 0), context).type).toBe("none");
    expect((context.commands[0]!.execute(document).entities[0] as any).radius).toBe(30);
  });

  it("places a hot grip by typed relative coordinates in the working unit", () => {
    const { document, context, tool } = setup([LINE], ["l"]);

    tool.onPointerDown(at(0, 0), context);
    tool.onPointerUp(at(0, 0), context);
    expect(tool.claimsCommandInput("@5,-10")).toBe(true);
    tool.onCommandInput("@5,-10", context);

    expect(context.commands[0]!.execute(document).entities[0]).toMatchObject({ start: { x: 5, y: -10 }, end: { x: 100, y: 0 } });
  });

  it("adds a polyline vertex with A and places it with a click", () => {
    const { document, context, tool } = setup([POLYLINE], ["p"]);

    tool.onPointerDown(at(50, 100), context);
    tool.onPointerUp(at(50, 100), context);
    expect(tool.claimsKeyDown(createKeyboardEvent("a"))).toBe(true);
    tool.onKeyDown(createKeyboardEvent("a"), context);
    tool.onPointerMove(at(60, 120), context);
    tool.onPointerDown(at(60, 120), context);

    expect((context.commands[0]!.execute(document).entities[0] as any).points).toEqual([
      { x: 0, y: 100 },
      { x: 50, y: 100 },
      { x: 60, y: 120 },
      { x: 50, y: 150 }
    ]);
  });

  it("adds a vertex from a segment midpoint grip while dragging", () => {
    const { document, context, tool } = setup([POLYLINE], ["p"]);

    tool.onPointerDown(at(25, 100), context);
    tool.onPointerMove(at(25, 90), context);
    tool.onKeyDown(createKeyboardEvent("A"), context);
    // O release do arrasto é ignorado; o vértice novo segue o cursor até o clique.
    expect(tool.onPointerUp(at(25, 90), context).type).toBe("none");
    tool.onPointerDown(at(25, 80), context);

    expect((context.commands[0]!.execute(document).entities[0] as any).points[1]).toEqual({ x: 25, y: 80 });
  });

  it("removes a polyline vertex with Delete and a spline fit point with R", () => {
    const { document, context, tool } = setup([POLYLINE], ["p"]);

    tool.onPointerDown(at(50, 100), context);
    tool.onPointerUp(at(50, 100), context);
    expect(tool.claimsKeyDown(createKeyboardEvent("Delete"))).toBe(true);
    tool.onKeyDown(createKeyboardEvent("Delete"), context);
    expect((context.commands[0]!.execute(document).entities[0] as any).points).toEqual([{ x: 0, y: 100 }, { x: 50, y: 150 }]);
    expect(tool.claimsKeyDown(createKeyboardEvent("Delete"))).toBe(false);

    const fitPoints = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
    const spline: SplineEntity = { id: "s", layerId: "layer_0", type: "spline", closed: false, fitPoints, controlPoints: fitPointsToBezierChain(fitPoints, false) };
    const second = setup([spline], ["s"]);
    second.tool.onPointerDown(at(10, 10), second.context);
    second.tool.onPointerUp(at(10, 10), second.context);
    second.tool.onCommandInput("r", second.context);
    const edited = second.context.commands[0]!.execute(second.document).entities[0] as SplineEntity;
    expect(edited.fitPoints).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }]);
  });

  it("explains when a vertex cannot be added or removed and cancels with Esc", () => {
    const { context, tool } = setup([LINE], ["l"]);

    tool.onPointerDown(at(100, 0), context);
    tool.onPointerUp(at(100, 0), context);
    expect(tool.onKeyDown(createKeyboardEvent("a"), context).type).toBe("error");
    expect(context.messages.at(-1)).toContain("Add vertex works on polyline");
    expect(tool.onKeyDown(createKeyboardEvent("Escape"), context).type).toBe("cancel");
    expect(context.commands).toHaveLength(0);
    expect(tool.claimsCommandInput("line")).toBe(false);
  });

  it("keeps a rectangle a rectangle when a corner grip moves", () => {
    const { document, context, tool } = setup([RECTANGLE], ["r"]);

    tool.onPointerDown(at(340, 20), context);
    tool.onPointerUp(at(360, 50), context);

    expect(context.commands[0]!.execute(document).entities[0]).toMatchObject({ type: "rectangle", x: 300, y: 0, width: 60, height: 50 });
  });

  it("lists grip entities of the selection (dimensions only when alone)", () => {
    const { document } = setup([LINE, CIRCLE, POLYLINE, RECTANGLE], []);

    expect(gripEntitiesOfSelection(document, ["l", "c", "p", "r"]).map((entity) => entity.id)).toEqual(["l", "c", "p", "r"]);
  });
});
