import { createEmptyDocument, type TextEntity } from "@cad-web/cad-core";
import { TEXT_LINE_SPACING_RATIO } from "@cad-web/cad-geometry";
import { describe, expect, it } from "vitest";
import { TextTool, visualDegreesToWorldRadians, worldRadiansToVisualDegrees } from "../src";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";

function createdText(context: ReturnType<typeof createMockToolContext>, index = 0): TextEntity {
  const command = context.commands[index];
  if (command === undefined) {
    throw new Error("no command");
  }
  const next = command.execute(context.document);
  return next.entities.at(-1) as TextEntity;
}

describe("TextTool", () => {
  it("creates a text with typed height, default rotation and content", () => {
    const tool = new TextTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 20 }), context);
    tool.onCommandInput("5", context);
    tool.onCommandInput("", context);
    expect(tool.acceptsFreeText()).toBe(true);
    const result = tool.onCommandInput("Planta baixa", context);

    expect(result.type).toBe("command");
    expect(createdText(context)).toMatchObject({
      type: "text",
      layerId: "layer_0",
      position: { x: 10, y: 20 },
      content: "Planta baixa",
      height: 5
    });
    expect(createdText(context).rotation).toBeUndefined();
  });

  it("continues on the next line below and finishes on empty Enter", () => {
    const tool = new TextTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("10", context);
    tool.onCommandInput("", context);
    tool.onCommandInput("Linha 1", context);
    tool.onCommandInput("Linha 2", context);
    const finish = tool.onCommandInput("", context);

    expect(context.commands).toHaveLength(2);
    expect(createdText(context, 1).position.x).toBeCloseTo(0);
    // A linha seguinte fica abaixo na tela (Y do mundo cresce para baixo).
    expect(createdText(context, 1).position.y).toBeCloseTo(TEXT_LINE_SPACING_RATIO * 10);
    expect(finish.type).toBe("complete");
    expect(tool.acceptsFreeText()).toBe(false);
  });

  it("converts the typed height by the working unit scale", () => {
    const tool = new TextTool();
    // unitScale 1000 = trabalhar em metros com base em mm: 0.5 m -> 500 mm.
    const context = createMockToolContext({ unitScale: 1000 });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("0.5", context);
    tool.onCommandInput("", context);
    tool.onCommandInput("Cota", context);

    expect(createdText(context).height).toBe(500);
  });

  it("converts the typed rotation from visual degrees to world radians", () => {
    const tool = new TextTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("2", context);
    tool.onCommandInput("90", context);
    tool.onCommandInput("Norte", context);

    // 90° visual (para cima) = −π/2 no mundo com Y para baixo.
    expect(createdText(context).rotation).toBeCloseTo(-Math.PI / 2);
  });

  it("takes height and rotation from clicks", () => {
    const tool = new TextTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 3, y: 4 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 10 }), context);
    tool.onCommandInput("Clique", context);

    expect(createdText(context).height).toBeCloseTo(5);
    expect(createdText(context).rotation).toBeCloseTo(Math.PI / 2);
  });

  it("accepts a typed insertion point in the working unit", () => {
    const tool = new TextTool();
    const context = createMockToolContext({ unitScale: 10 });

    tool.activate(context);
    tool.onCommandInput("1,2", context);
    tool.onCommandInput("", context);
    tool.onCommandInput("", context);
    tool.onCommandInput("Ponto", context);

    expect(createdText(context).position).toEqual({ x: 10, y: 20 });
  });

  it("defaults the height to the active dimension style text height", () => {
    const tool = new TextTool();
    const context = createMockToolContext({ document: createEmptyDocument("doc_text") });

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("", context);
    tool.onCommandInput("", context);
    tool.onCommandInput("Padrão", context);

    expect(createdText(context).height).toBe(12);
  });

  it("keeps typed content verbatim, including words that are command aliases", () => {
    const tool = new TextTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("1", context);
    tool.onCommandInput("", context);
    tool.onCommandInput("zoom", context);

    expect(createdText(context).content).toBe("zoom");
  });

  it("rejects an invalid height", () => {
    const tool = new TextTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);

    expect(tool.onCommandInput("-3", context).type).toBe("error");
    expect(tool.onCommandInput("abc", context).type).toBe("error");
  });

  it("previews a ghost text while picking the insertion point", () => {
    const tool = new TextTool();
    const context = createMockToolContext();

    tool.activate(context);
    const result = tool.onPointerMove(createPointerEvent({ x: 7, y: 8 }), context);

    expect(result.type).toBe("preview");
    const preview = context.previews.at(-1) as any;
    expect(preview.entities[0]).toMatchObject({ type: "text", position: { x: 7, y: 8 } });
  });

  it("cancels with Escape back to the insertion point stage", () => {
    const tool = new TextTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onCommandInput("1", context);
    tool.onCommandInput("", context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(tool.acceptsFreeText()).toBe(false);
    expect(context.commands).toHaveLength(0);
  });

  it("converts angles between the visual and world conventions", () => {
    expect(visualDegreesToWorldRadians(0)).toBe(0);
    expect(visualDegreesToWorldRadians(90)).toBeCloseTo(-Math.PI / 2);
    expect(worldRadiansToVisualDegrees(-Math.PI / 2)).toBeCloseTo(90);
    expect(worldRadiansToVisualDegrees(Math.PI / 2)).toBeCloseTo(270);
    expect(worldRadiansToVisualDegrees(0)).toBe(0);
  });

  it("exposes command aliases", () => {
    expect(new TextTool().aliases).toEqual(["dt", "text", "texto", "dtext"]);
  });
});
