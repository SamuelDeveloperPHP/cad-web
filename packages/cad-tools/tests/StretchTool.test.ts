import { describe, expect, it } from "vitest";
import { StretchTool } from "../src/modify/StretchTool";
import { createKeyboardEvent, createMockToolContext, createPointerEvent } from "./testContext";
import type { CadDocument, LineEntity } from "@cad-web/cad-core";

// O documento de teste tem line_001 de (0,0) a (100,0) na layer_0.
function selectRightHalfWindow(tool: StretchTool, context: ReturnType<typeof createMockToolContext>): void {
  // Janela cobrindo x de 40 a 140, y de -20 a 20 (contém o extremo direito da linha).
  tool.onPointerDown(createPointerEvent({ x: 40, y: -20 }), context);
  tool.onPointerDown(createPointerEvent({ x: 140, y: 20 }), context);
}

describe("StretchTool", () => {
  it("asks for the first window corner on activation", () => {
    const tool = new StretchTool();
    const context = createMockToolContext();

    tool.activate(context);

    expect(tool.aliases).toEqual(["s", "stretch", "esticar"]);
    expect(context.messages.at(-1)).toBe("Specify first corner of stretch window.");
  });

  it("shows a crossing selection box while dragging the window", () => {
    const tool = new StretchTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 40, y: -20 }), context);
    const result = tool.onPointerMove(createPointerEvent({ x: 140, y: 20 }), context);

    expect(result.type).toBe("preview");
    if (result.type === "preview") {
      expect(result.preview.type).toBe("selectionBox");
    }
  });

  it("previews the stretched geometry after picking the base point", () => {
    const tool = new StretchTool();
    const context = createMockToolContext();

    tool.activate(context);
    selectRightHalfWindow(tool, context);
    expect(context.messages.at(-1)).toContain("Specify base point.");

    tool.onPointerDown(createPointerEvent({ x: 100, y: 0 }), context);
    const preview = tool.onPointerMove(createPointerEvent({ x: 120, y: 10 }), context);

    expect(preview.type).toBe("preview");
    if (preview.type === "preview" && preview.preview.type === "ghostEntities") {
      const ghost = preview.preview.entities[0] as LineEntity;
      // O extremo direito (100,0) está na janela e se move; o esquerdo (0,0) fica.
      expect(ghost.start).toEqual({ x: 0, y: 0 });
      expect(ghost.end).toEqual({ x: 120, y: 10 });
    } else {
      expect.fail("Preview should be ghostEntities");
    }
  });

  it("emits a StretchEntitiesCommand moving only the endpoint inside the window", () => {
    const tool = new StretchTool();
    const context = createMockToolContext();

    tool.activate(context);
    selectRightHalfWindow(tool, context);
    tool.onPointerDown(createPointerEvent({ x: 100, y: 0 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 130, y: 0 }), context);

    expect(result.type).toBe("command");
    expect(context.commands).toHaveLength(1);
    expect(context.commands[0]?.type).toBe("StretchEntitiesCommand");

    const updated = (context.commands[0] as any).updatedEntities[0] as LineEntity;
    expect(updated.start).toEqual({ x: 0, y: 0 });
    expect(updated.end).toEqual({ x: 130, y: 0 });
  });

  it("reports an empty window", () => {
    const tool = new StretchTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onPointerDown(createPointerEvent({ x: 40, y: -20 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 40, y: -20 }), context);

    expect(result.type).toBe("error");
    expect(context.commands).toHaveLength(0);
  });

  it("reports when the window has no entities", () => {
    const tool = new StretchTool();
    const context = createMockToolContext();

    tool.activate(context);
    // Janela longe da linha (y bem acima).
    tool.onPointerDown(createPointerEvent({ x: 40, y: 500 }), context);
    const result = tool.onPointerDown(createPointerEvent({ x: 140, y: 520 }), context);

    expect(result.type).toBe("error");
    expect(context.commands).toHaveLength(0);
  });

  it("cancels with Escape without emitting a command", () => {
    const tool = new StretchTool();
    const context = createMockToolContext();

    tool.activate(context);
    selectRightHalfWindow(tool, context);
    const result = tool.onKeyDown(createKeyboardEvent("Escape"), context);

    expect(result.type).toBe("cancel");
    expect(context.commands).toEqual([]);
    expect(context.previews.at(-1)).toBeNull();
  });
});
