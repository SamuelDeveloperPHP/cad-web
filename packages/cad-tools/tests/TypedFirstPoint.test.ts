import { describe, expect, it } from "vitest";
import { ArcTool, CircleTool, LineTool, RectangleTool } from "../src";
import { createMockToolContext } from "./testContext";

// Como no AutoCAD, o primeiro ponto de cada ferramenta de desenho pode ser digitado (x,y na unidade de trabalho).
describe("typed first point", () => {
  it("LineTool accepts x,y for both points", () => {
    const tool = new LineTool();
    const context = createMockToolContext({ unitScale: 10 });

    tool.activate(context);
    tool.onCommandInput("1,2", context);
    const result = tool.onCommandInput("5,2", context);

    expect(result.type).toBe("command");
    expect((context.commands[0] as any).entity).toMatchObject({ start: { x: 10, y: 20 }, end: { x: 50, y: 20 } });
  });

  it("CircleTool accepts x,y for the center", () => {
    const tool = new CircleTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onCommandInput("3,4", context);
    tool.onCommandInput("5", context);

    expect((context.commands[0] as any).entity).toMatchObject({ center: { x: 3, y: 4 }, radius: 5 });
  });

  it("RectangleTool accepts x,y for the first corner", () => {
    const tool = new RectangleTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onCommandInput("10,10", context);
    tool.onCommandInput("20,5", context);

    expect((context.commands[0] as any).entity).toMatchObject({ x: 10, y: 10, width: 20, height: 5 });
  });

  it("ArcTool accepts typed points from the first one", () => {
    const tool = new ArcTool();
    const context = createMockToolContext();

    tool.activate(context);
    tool.onCommandInput("10,0", context);
    tool.onCommandInput("0,10", context);
    const result = tool.onCommandInput("-10,0", context);

    expect(result.type).toBe("command");
    expect((context.commands[0] as any).entity).toMatchObject({ type: "arc" });
    expect((context.commands[0] as any).entity.radius).toBeCloseTo(10);
  });

  it("rejects text that is not a point", () => {
    const tool = new LineTool();
    const context = createMockToolContext();

    tool.activate(context);
    expect(tool.onCommandInput("abc", context).type).toBe("error");
  });
});
