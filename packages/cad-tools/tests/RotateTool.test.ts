import { describe, expect, it } from "vitest";
import { RotateTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("RotateTool", () => {
  it("requires selected entities", () => {
    const tool = new RotateTool();
    const context = createMockToolContext();

    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);

    expect(result).toEqual({
      type: "error",
      message: "Rotate requires selected entities."
    });
  });

  it("creates ghost preview after base point", () => {
    const tool = new RotateTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 0, y: 10 }), context);

    // Angle of (0, 10) relative to (0, 0) is PI/2
    const angleRadians = Math.PI / 2;

    expect(result.type).toBe("preview");
    if (result.type === "preview" && result.preview.type === "ghostEntities") {
      const line = result.preview.entities[0] as any;
      expect(line.start.x).toBeCloseTo(0, 5); // Original: 0, 0 -> Rotated: 0, 0
      expect(line.start.y).toBeCloseTo(0, 5);
      expect(line.end.x).toBeCloseTo(-0, 5); // Original: 100, 0 -> Rotated: 0, 100
      expect(line.end.y).toBeCloseTo(100, 5);
    } else {
      expect.fail("Preview should be ghostEntities");
    }
  });

  it("generates RotateEntitiesCommand on destination click", () => {
    const tool = new RotateTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("RotateEntitiesCommand");
    expect(context.commands[0]).toMatchObject({
      entityIds: ["line_001"],
      pivot: { x: 0, y: 0 },
      angleRadians: 0
    });
  });

  it("interprets a typed angle in the AutoCAD convention (counterclockwise on screen)", () => {
    const context = createMockToolContext({ selection: { entityIds: ["line_001"] } });
    const tool = new RotateTool();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("90", context);
    const counterclockwise = context.commands[0]!.execute(context.document).entities[0] as any;

    // O Y do mundo cresce para baixo: 90° anti-horário na tela leva o fim da linha (100, 0) para (0, −100).
    expect(context.commands[0]).toMatchObject({ angleRadians: -Math.PI / 2 });
    expect(counterclockwise.end.x).toBeCloseTo(0, 9);
    expect(counterclockwise.end.y).toBeCloseTo(-100, 9);

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("-90", context);
    const clockwise = context.commands[1]!.execute(context.document).entities[0] as any;
    expect(clockwise.end.y).toBeCloseTo(100, 9);

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    expect(tool.onCommandInput("90abc", context).type).toBe("none");
    expect(context.commands).toHaveLength(2);
  });

  it("cancels without emitting command", () => {
    const tool = new RotateTool();
    const context = createMockToolContext({
      selection: { entityIds: ["line_001"] }
    });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
    expect(context.previews.at(-1)).toBeNull();
  });
});
