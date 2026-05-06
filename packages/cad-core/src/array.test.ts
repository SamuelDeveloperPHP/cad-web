import { describe, expect, it } from "vitest";
import {
  ArrayEntitiesCommand,
  arrayCadEntitiesRectangular,
  cloneCadEntityWithOffset,
  createEmptyDocument,
  estimateArrayEntityCount,
  type CadDocument,
  type CadEntity,
  type CircleEntity,
  type DimensionEntity,
  type LineEntity
} from "./index";

describe("cloneCadEntityWithOffset", () => {
  it("clones a line shifting both endpoints and assigns a new id", () => {
    const line: LineEntity = {
      id: "line_a",
      layerId: "layer_0",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 }
    };

    const clone = cloneCadEntityWithOffset(line, { x: 3, y: 4 }, "line_a_copy");

    expect(clone.id).toBe("line_a_copy");
    expect(clone).toMatchObject({
      type: "line",
      layerId: "layer_0",
      start: { x: 3, y: 4 },
      end: { x: 13, y: 4 }
    });
    // O metodo nao deve preservar referencia para a entidade original.
    expect(clone).not.toBe(line);
  });

  it("preserves color, lineThickness and lineType when present", () => {
    const line: LineEntity = {
      id: "line_b",
      layerId: "layer_0",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      color: "#ff0000",
      lineThickness: 2,
      lineType: "dashed"
    };

    const clone = cloneCadEntityWithOffset(line, { x: 1, y: 1 }, "line_b_copy");

    expect(clone).toMatchObject({
      color: "#ff0000",
      lineThickness: 2,
      lineType: "dashed"
    });
  });

  it("clones a circle shifting only the center", () => {
    const circle: CircleEntity = {
      id: "circle_a",
      layerId: "layer_0",
      type: "circle",
      center: { x: 5, y: 5 },
      radius: 4
    };

    const clone = cloneCadEntityWithOffset(circle, { x: 10, y: 0 }, "circle_a_copy");

    expect(clone).toMatchObject({
      type: "circle",
      center: { x: 15, y: 5 },
      radius: 4
    });
  });

  it("clones a linear dimension shifting all definition points", () => {
    const dimension: DimensionEntity = {
      id: "dim_a",
      layerId: "layer_0",
      type: "dimension",
      dimensionType: "linear",
      dimensionStyleId: "dimstyle_standard",
      definition: {
        firstPoint: { x: 0, y: 0 },
        secondPoint: { x: 10, y: 0 },
        dimensionLinePoint: { x: 5, y: 5 },
        orientation: "horizontal"
      }
    };

    const clone = cloneCadEntityWithOffset(dimension, { x: 100, y: 50 }, "dim_a_copy");

    expect(clone).toMatchObject({
      id: "dim_a_copy",
      type: "dimension",
      dimensionStyleId: "dimstyle_standard",
      definition: {
        firstPoint: { x: 100, y: 50 },
        secondPoint: { x: 110, y: 50 },
        dimensionLinePoint: { x: 105, y: 55 },
        orientation: "horizontal"
      }
    });
  });

  it("clones a radius dimension shifting center and leader", () => {
    const dimension: DimensionEntity = {
      id: "dim_radius",
      layerId: "layer_0",
      type: "dimension",
      dimensionType: "radius",
      definition: {
        targetEntityId: "circle_a",
        center: { x: 0, y: 0 },
        radius: 5,
        leaderEndPoint: { x: 10, y: 10 }
      }
    };

    const clone = cloneCadEntityWithOffset(dimension, { x: 4, y: 4 }, "dim_radius_copy");

    expect(clone).toMatchObject({
      definition: {
        targetEntityId: "circle_a",
        center: { x: 4, y: 4 },
        radius: 5,
        leaderEndPoint: { x: 14, y: 14 }
      }
    });
  });

  it("clones an angular dimension shifting all four reference points", () => {
    const dimension: DimensionEntity = {
      id: "dim_angular",
      layerId: "layer_0",
      type: "dimension",
      dimensionType: "angular",
      definition: {
        vertex: { x: 0, y: 0 },
        firstPoint: { x: 10, y: 0 },
        secondPoint: { x: 0, y: 10 },
        arcPoint: { x: 5, y: 5 }
      }
    };

    const clone = cloneCadEntityWithOffset(dimension, { x: 100, y: 0 }, "dim_angular_copy");

    expect(clone).toMatchObject({
      definition: {
        vertex: { x: 100, y: 0 },
        firstPoint: { x: 110, y: 0 },
        secondPoint: { x: 100, y: 10 },
        arcPoint: { x: 105, y: 5 }
      }
    });
  });
});

describe("arrayCadEntitiesRectangular", () => {
  it("produces (rows*columns - 1) * entities new entities", () => {
    const line: LineEntity = {
      id: "line_a",
      layerId: "layer_0",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 }
    };
    const circle: CircleEntity = {
      id: "circle_a",
      layerId: "layer_0",
      type: "circle",
      center: { x: 0, y: 0 },
      radius: 1
    };

    const result = arrayCadEntitiesRectangular([line, circle], {
      rows: 3,
      columns: 4,
      spacingX: 10,
      spacingY: 5
    });

    expect(result.totalNewEntities).toBe(22);
    expect(result.offsetsCount).toBe(11);
  });

  it("does not duplicate the origin entity", () => {
    const line: LineEntity = {
      id: "line_origin",
      layerId: "layer_0",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 }
    };

    const result = arrayCadEntitiesRectangular([line], {
      rows: 2,
      columns: 2,
      spacingX: 10,
      spacingY: 10
    });

    const ids = result.createdEntities.map((entity) => entity.id);

    expect(result.totalNewEntities).toBe(3);
    expect(ids).not.toContain("line_origin");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves layerId on cloned entities", () => {
    const line: LineEntity = {
      id: "line_layered",
      layerId: "custom_layer",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 }
    };

    const result = arrayCadEntitiesRectangular([line], {
      rows: 2,
      columns: 1,
      spacingX: 0,
      spacingY: 5
    });

    for (const entity of result.createdEntities) {
      expect(entity.layerId).toBe("custom_layer");
    }
  });

  it("uses a custom id factory when provided", () => {
    const line: LineEntity = {
      id: "line_custom",
      layerId: "layer_0",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 }
    };

    const result = arrayCadEntitiesRectangular(
      [line],
      { rows: 2, columns: 2, spacingX: 1, spacingY: 1 },
      (entity, _offset, sequence) => `custom_${entity.id}_${sequence}`
    );

    expect(result.createdEntities.map((entity) => entity.id)).toEqual([
      "custom_line_custom_0",
      "custom_line_custom_1",
      "custom_line_custom_2"
    ]);
  });

  it("rejects invalid params", () => {
    expect(() =>
      arrayCadEntitiesRectangular([], { rows: 0, columns: 2, spacingX: 1, spacingY: 1 })
    ).toThrow();
  });
});

describe("estimateArrayEntityCount", () => {
  it("multiplies the selected count by the new positions", () => {
    expect(estimateArrayEntityCount(3, { rows: 4, columns: 5, spacingX: 1, spacingY: 1 })).toBe(57);
  });

  it("returns zero when there are no selected entities", () => {
    expect(estimateArrayEntityCount(0, { rows: 4, columns: 5, spacingX: 1, spacingY: 1 })).toBe(0);
  });
});

describe("ArrayEntitiesCommand", () => {
  it("inserts created entities on execute and removes them on undo", () => {
    const document = createEmptyDocument("doc_array");
    const original: LineEntity = {
      id: "line_origin",
      layerId: "layer_0",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 }
    };
    const documentWithOriginal: CadDocument = {
      ...document,
      entities: [original]
    };

    const created: ReadonlyArray<CadEntity> = [
      { ...original, id: "line_clone_a", start: { x: 10, y: 0 }, end: { x: 15, y: 0 } },
      { ...original, id: "line_clone_b", start: { x: 20, y: 0 }, end: { x: 25, y: 0 } }
    ];

    const command = new ArrayEntitiesCommand(["line_origin"], created);
    const afterExecute = command.execute(documentWithOriginal);

    expect(afterExecute.entities.map((entity) => entity.id)).toEqual([
      "line_origin",
      "line_clone_a",
      "line_clone_b"
    ]);

    const afterUndo = command.undo(afterExecute);

    expect(afterUndo.entities.map((entity) => entity.id)).toEqual(["line_origin"]);
  });

  it("ignores duplicate inserts on redo", () => {
    const document = createEmptyDocument("doc_array_redo");
    const original: LineEntity = {
      id: "line_a",
      layerId: "layer_0",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 }
    };
    const initial: CadDocument = { ...document, entities: [original] };

    const created: ReadonlyArray<CadEntity> = [
      { ...original, id: "line_a_copy_1", start: { x: 5, y: 0 }, end: { x: 6, y: 0 } }
    ];

    const command = new ArrayEntitiesCommand(["line_a"], created);
    const onceExecuted = command.execute(initial);
    const twiceExecuted = command.execute(onceExecuted);

    expect(twiceExecuted.entities.length).toBe(2);
  });
});
