import type { EllipseEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { EllipseArcTool } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

describe("EllipseArcTool", () => {
  it("creates an elliptical arc from center, axes and start/end angle points", () => {
    const tool = new EllipseArcTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context); // centro
    tool.onPointerDown(createPointerEvent({ x: 30, y: 0 }), context); // eixo maior
    tool.onPointerDown(createPointerEvent({ x: 0, y: 10 }), context); // semi-eixo menor
    tool.onPointerDown(createPointerEvent({ x: 30, y: 0 }), context); // ponto do ângulo inicial (param 0)
    const result = tool.onPointerDown(createPointerEvent({ x: 0, y: 10 }), context); // ângulo final (param π/2)

    expect(result.type).toBe("command");
    const entity = (context.commands[0] as any).entity as EllipseEntity;
    expect(entity.type).toBe("ellipse");
    expect(entity.radiusX).toBeCloseTo(30, 6);
    expect(entity.radiusY).toBeCloseTo(10, 6);
    expect(entity.startAngle).toBeCloseTo(0, 6);
    expect(entity.endAngle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("previews the arc while dragging the end angle", () => {
    const tool = new EllipseArcTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 30, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 10 }), context);
    tool.onPointerDown(createPointerEvent({ x: 30, y: 0 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 0, y: 10 }), context);

    expect(result.type).toBe("preview");
    const preview = result.type === "preview" ? result.preview : null;
    const ghost = preview?.type === "ghostEntities" ? (preview.entities[0] as EllipseEntity) : null;
    expect(ghost?.startAngle).toBeCloseTo(0, 6);
    expect(ghost?.endAngle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("cancels on Escape without emitting a command", () => {
    const tool = new EllipseArcTool();
    const context = createMockToolContext();

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
  });
});
