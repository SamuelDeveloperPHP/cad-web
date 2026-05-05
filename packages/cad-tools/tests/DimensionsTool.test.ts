import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { DimAlignedTool, DimAngularTool, DimDiameterTool, DimLinearTool, DimRadiusTool } from "../src";
import { createMockToolContext, createPointerEvent } from "./testContext";

describe("Dimension tools", () => {
  it("creates DimLinear using the active dimension style", () => {
    const tool = new DimLinearTool();
    const context = createMockToolContext({ document: createDocument([]) });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    const preview = tool.onPointerMove(createPointerEvent({ x: 5, y: 4 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 4 }), context);

    expect(preview.type).toBe("preview");
    expect(context.commands[0]).toMatchObject({
      type: "CreateEntityCommand",
      entity: {
        type: "dimension",
        dimensionType: "linear",
        dimensionStyleId: "dimstyle_custom"
      }
    });
  });

  it("creates DimAligned by three clicks", () => {
    const tool = new DimAlignedTool();
    const context = createMockToolContext({ document: createDocument([]) });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 3, y: 4 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 6 }), context);

    expect(context.commands[0]).toMatchObject({
      entity: {
        type: "dimension",
        dimensionType: "aligned",
        dimensionStyleId: "dimstyle_custom"
      }
    });
  });

  it("creates DimRadius and DimDiameter from a circle", () => {
    const circle: CadEntity = {
      id: "circle_001",
      layerId: "layer_0",
      type: "circle",
      center: { x: 0, y: 0 },
      radius: 5
    };

    const radiusTool = new DimRadiusTool();
    const radiusContext = createMockToolContext({ document: createDocument([circle]) });
    radiusTool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), radiusContext);
    radiusTool.onPointerMove(createPointerEvent({ x: 10, y: 0 }), radiusContext);
    radiusTool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), radiusContext);

    expect(radiusContext.commands[0]).toMatchObject({
      entity: {
        type: "dimension",
        dimensionType: "radius",
        dimensionStyleId: "dimstyle_custom"
      }
    });

    const diameterTool = new DimDiameterTool();
    const diameterContext = createMockToolContext({ document: createDocument([circle]) });
    diameterTool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), diameterContext);
    diameterTool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), diameterContext);

    expect(diameterContext.commands[0]).toMatchObject({
      entity: {
        type: "dimension",
        dimensionType: "diameter",
        dimensionStyleId: "dimstyle_custom"
      }
    });
  });

  it("creates DimAngular between two non-parallel lines", () => {
    const tool = new DimAngularTool();
    const context = createMockToolContext({
      document: createDocument([
        { id: "line_a", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { id: "line_b", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
      ])
    });

    tool.onPointerDown(createPointerEvent({ x: 5, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 0, y: 5 }), context);
    const preview = tool.onPointerMove(createPointerEvent({ x: 5, y: 5 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 5 }), context);

    expect(preview.type).toBe("preview");
    expect(context.commands[0]).toMatchObject({
      entity: {
        type: "dimension",
        dimensionType: "angular",
        dimensionStyleId: "dimstyle_custom",
        definition: {
          vertex: { x: 0, y: 0 },
          firstPoint: { x: 10, y: 0 },
          secondPoint: { x: 0, y: 10 }
        }
      }
    });
  });

  it("blocks dimension creation on a locked active layer", () => {
    const tool = new DimLinearTool();
    const document = {
      ...createDocument([]),
      layers: [{ id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: true, order: 0 }]
    };
    const context = createMockToolContext({ document });

    tool.onPointerDown(createPointerEvent({ x: 0, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 10, y: 0 }), context);
    tool.onPointerDown(createPointerEvent({ x: 5, y: 4 }), context);

    expect(context.commands).toEqual([]);
  });
});

function createDocument(entities: ReadonlyArray<CadEntity>): CadDocument {
  return {
    ...createEmptyDocument("doc_dimensions"),
    activeDimensionStyleId: "dimstyle_custom",
    dimensionStyles: [
      ...createEmptyDocument("doc_dimensions").dimensionStyles,
      {
        id: "dimstyle_custom",
        name: "Custom",
        textHeight: 16,
        arrowSize: 7,
        extensionOffset: 2,
        extensionOvershoot: 3,
        precision: 1,
        unitSuffix: " mm",
        arrowType: "arrow"
      }
    ],
    entities
  };
}
