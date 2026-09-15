import type { EllipseEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { EllipseTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("EllipseTool", () => {
  it("creates an ellipse from center, major axis and minor axis clicks", () => {
    const tool = new EllipseTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context); // centro
    tool.onPointerDown(createPointerEvent({ x: 40, y: 0 }), context); // fim do eixo maior
    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 15 }), context); // semi-eixo menor

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("CreateEntityCommand");

    const entity = (context.commands[0] as any).entity as EllipseEntity;
    expect(entity.type).toBe("ellipse");
    expect(entity.center).toEqual({ x: 0, y: 0 });
    expect(entity.radiusX).toBeCloseTo(40, 6);
    expect(entity.radiusY).toBeCloseTo(15, 6);
    expect(entity.rotation).toBeCloseTo(0, 6);
  });

  it("captures the major axis rotation from the second point", () => {
    const tool = new EllipseTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 30 }), context); // eixo maior vertical
    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context); // semi-eixo menor

    const entity = (context.commands[0] as any).entity as EllipseEntity;
    expect(entity.radiusX).toBeCloseTo(30, 6);
    expect(entity.radiusY).toBeCloseTo(10, 6);
    expect(entity.rotation).toBeCloseTo(Math.PI / 2, 6);
  });

  it("previews a ghost ellipse while dragging the minor axis", () => {
    const tool = new EllipseTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 40, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 0, y: 12 }), context);

    expect(result.type).toBe("preview");
    const preview = result.type === "preview" ? result.preview : null;
    const ghost = preview?.type === "ghostEntities" ? (preview.entities[0] as EllipseEntity) : null;
    expect(ghost?.type).toBe("ellipse");
    expect(ghost?.radiusY).toBeCloseTo(12, 6);
  });

  it("uses the typed distance as the exact minor semi-axis regardless of cursor angle", () => {
    const tool = new EllipseTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context); // centro
    tool.onPointerDown(createPointerEvent({ x: 40, y: 0 }), context); // eixo maior horizontal
    // O cursor está numa direção oblíqua (não perpendicular), mas o valor digitado deve valer na íntegra.
    tool.onPointerMove(createPointerEvent({ x: 20, y: 20 }), context);
    const result = tool.onCommandInput("15", context);

    expect(result.type).toBe("command");
    const entity = (context.commands[0] as any).entity as EllipseEntity;
    expect(entity.radiusX).toBeCloseTo(40, 6);
    expect(entity.radiusY).toBeCloseTo(15, 6);
    expect(entity.rotation).toBeCloseTo(0, 6);
  });

  it("uses the typed polar distance as the exact minor semi-axis", () => {
    const tool = new EllipseTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 40, y: 0 }), context);
    tool.onPointerMove(createPointerEvent({ x: 10, y: 3 }), context);
    const result = tool.onCommandInput("@15<80", context);

    expect(result.type).toBe("command");
    const entity = (context.commands[0] as any).entity as EllipseEntity;
    expect(entity.radiusY).toBeCloseTo(15, 6);
  });

  it("cancels on Escape without emitting a command", () => {
    const tool = new EllipseTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
    expect(context.previews.at(-1)).toBeNull();
  });
});
