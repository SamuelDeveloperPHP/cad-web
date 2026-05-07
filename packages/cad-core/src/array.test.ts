import { describe, expect, it } from "vitest";
import {
  ArrayEntitiesCommand,
  arrayCadEntitiesPolar,
  arrayCadEntitiesRectangular,
  buildPathArrayEntities,
  cloneCadEntityWithOffset,
  createEmptyDocument,
  estimateArrayEntityCount,
  estimatePathArrayEntityCount,
  estimatePolarArrayEntityCount,
  rotateCadEntityAroundCenter,
  transformEntityForPathArray,
  type ArcEntity,
  type CadDocument,
  type CadEntity,
  type CircleEntity,
  type DimensionEntity,
  type LineEntity,
  type PolylineEntity,
  type RectangleEntity
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

describe("rotateCadEntityAroundCenter", () => {
  it("rotates a line by 90 degrees around the origin", () => {
    const line: LineEntity = {
      id: "line_a",
      layerId: "layer_0",
      type: "line",
      start: { x: 1, y: 0 },
      end: { x: 5, y: 0 }
    };

    const rotated = rotateCadEntityAroundCenter(line, { x: 0, y: 0 }, Math.PI / 2, "line_a_rot") as LineEntity;

    expect(rotated.id).toBe("line_a_rot");
    expect(rotated.start.x).toBeCloseTo(0);
    expect(rotated.start.y).toBeCloseTo(1);
    expect(rotated.end.x).toBeCloseTo(0);
    expect(rotated.end.y).toBeCloseTo(5);
  });

  it("rotates an arc preserving its sweep but offsetting start/end angles", () => {
    const arc: ArcEntity = {
      id: "arc_a",
      layerId: "layer_0",
      type: "arc",
      center: { x: 5, y: 0 },
      radius: 2,
      startAngle: 0,
      endAngle: Math.PI / 2,
      clockwise: false
    };

    const rotated = rotateCadEntityAroundCenter(arc, { x: 0, y: 0 }, Math.PI, "arc_a_rot") as ArcEntity;

    expect(rotated.center.x).toBeCloseTo(-5);
    expect(rotated.center.y).toBeCloseTo(0);
    expect(rotated.startAngle).toBeCloseTo(Math.PI);
    expect(rotated.endAngle).toBeCloseTo(Math.PI + Math.PI / 2);
  });

  it("rotates a rectangle accumulating the rotation angle", () => {
    const rectangle: RectangleEntity = {
      id: "rect_a",
      layerId: "layer_0",
      type: "rectangle",
      x: 5,
      y: 0,
      width: 4,
      height: 2,
      rotation: 0.1
    };

    const rotated = rotateCadEntityAroundCenter(rectangle, { x: 0, y: 0 }, Math.PI / 2, "rect_a_rot") as RectangleEntity;

    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(5);
    expect(rotated.rotation).toBeCloseTo(0.1 + Math.PI / 2);
  });

  it("rotates a linear dimension shifting all definition points", () => {
    const dimension: DimensionEntity = {
      id: "dim_a",
      layerId: "layer_0",
      type: "dimension",
      dimensionType: "linear",
      definition: {
        firstPoint: { x: 1, y: 0 },
        secondPoint: { x: 4, y: 0 },
        dimensionLinePoint: { x: 2.5, y: 1 },
        orientation: "horizontal"
      }
    };

    const rotated = rotateCadEntityAroundCenter(dimension, { x: 0, y: 0 }, Math.PI / 2, "dim_a_rot") as DimensionEntity;
    const definition = rotated.definition as { firstPoint: { x: number; y: number } };

    expect(rotated.id).toBe("dim_a_rot");
    expect(definition.firstPoint.x).toBeCloseTo(0);
    expect(definition.firstPoint.y).toBeCloseTo(1);
  });
});

describe("arrayCadEntitiesPolar", () => {
  it("creates count - 1 rotated copies for a full circle", () => {
    const line: LineEntity = {
      id: "line_a",
      layerId: "layer_0",
      type: "line",
      start: { x: 5, y: 0 },
      end: { x: 7, y: 0 }
    };

    const result = arrayCadEntitiesPolar([line], {
      center: { x: 0, y: 0 },
      params: { count: 4, fillAngleRadians: Math.PI * 2 }
    });

    expect(result.totalNewEntities).toBe(3);
    expect(result.copiesCount).toBe(3);

    const firstCopy = result.createdEntities[0] as LineEntity;
    expect(firstCopy.start.x).toBeCloseTo(0);
    expect(firstCopy.start.y).toBeCloseTo(5);
    expect(firstCopy.end.x).toBeCloseTo(0);
    expect(firstCopy.end.y).toBeCloseTo(7);
  });

  it("does not duplicate the origin entity id", () => {
    const line: LineEntity = {
      id: "line_origin",
      layerId: "layer_0",
      type: "line",
      start: { x: 5, y: 0 },
      end: { x: 7, y: 0 }
    };

    const result = arrayCadEntitiesPolar([line], {
      center: { x: 0, y: 0 },
      params: { count: 4, fillAngleRadians: Math.PI * 2 }
    });

    const ids = result.createdEntities.map((entity) => entity.id);
    expect(ids).not.toContain("line_origin");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves the original orientation when rotateItems is false", () => {
    const line: LineEntity = {
      id: "line_a",
      layerId: "layer_0",
      type: "line",
      start: { x: 5, y: 0 },
      end: { x: 7, y: 0 }
    };

    const result = arrayCadEntitiesPolar(
      [line],
      {
        center: { x: 0, y: 0 },
        params: { count: 4, fillAngleRadians: Math.PI * 2 },
        rotateItems: false
      }
    );

    const firstCopy = result.createdEntities[0] as LineEntity;

    // O modo translacional preserva a forma horizontal mas posiciona em torno do centro.
    expect(firstCopy.end.x - firstCopy.start.x).toBeCloseTo(2);
    expect(firstCopy.end.y - firstCopy.start.y).toBeCloseTo(0);
  });

  it("respects a partial fill angle with count - 1 intervals", () => {
    const circle: CircleEntity = {
      id: "circle_a",
      layerId: "layer_0",
      type: "circle",
      center: { x: 5, y: 0 },
      radius: 1
    };

    const result = arrayCadEntitiesPolar([circle], {
      center: { x: 0, y: 0 },
      params: { count: 3, fillAngleRadians: Math.PI }
    });

    expect(result.copiesCount).toBe(2);

    const last = result.createdEntities[1] as CircleEntity;
    expect(last.center.x).toBeCloseTo(-5);
    expect(last.center.y).toBeCloseTo(0);
  });

  it("rejects invalid params", () => {
    expect(() =>
      arrayCadEntitiesPolar([], {
        center: { x: 0, y: 0 },
        params: { count: 1, fillAngleRadians: Math.PI }
      })
    ).toThrow();
  });
});

describe("estimatePolarArrayEntityCount", () => {
  it("multiplies selected count by count - 1", () => {
    expect(estimatePolarArrayEntityCount(2, { count: 6, fillAngleRadians: Math.PI * 2 })).toBe(10);
  });

  it("returns zero when no entities are selected", () => {
    expect(estimatePolarArrayEntityCount(0, { count: 6, fillAngleRadians: Math.PI * 2 })).toBe(0);
  });
});

describe("transformEntityForPathArray", () => {
  it("translates without rotating when alignToTangent is false", () => {
    const line: LineEntity = {
      id: "line_a",
      layerId: "layer_0",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 }
    };

    const result = transformEntityForPathArray(
      line,
      {
        basePoint: { x: 0, y: 0 },
        samplePoint: { x: 10, y: 5 },
        rotationRadians: 0
      },
      "line_a_path_0"
    ) as LineEntity;

    expect(result.id).toBe("line_a_path_0");
    expect(result.start).toEqual({ x: 10, y: 5 });
    expect(result.end).toEqual({ x: 15, y: 5 });
  });

  it("rotates around the basePoint and then translates to samplePoint", () => {
    const line: LineEntity = {
      id: "line_a",
      layerId: "layer_0",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 }
    };

    const result = transformEntityForPathArray(
      line,
      {
        basePoint: { x: 0, y: 0 },
        samplePoint: { x: 0, y: 10 },
        rotationRadians: Math.PI / 2
      },
      "line_a_path_1"
    ) as LineEntity;

    expect(result.start.x).toBeCloseTo(0);
    expect(result.start.y).toBeCloseTo(10);
    expect(result.end.x).toBeCloseTo(0);
    expect(result.end.y).toBeCloseTo(15);
  });
});

describe("buildPathArrayEntities", () => {
  it("creates count copies along an open polyline keeping the original entity intact", () => {
    const circle: CircleEntity = {
      id: "circle_origin",
      layerId: "layer_0",
      type: "circle",
      center: { x: 0, y: 0 },
      radius: 1
    };

    const polyline: PolylineEntity = {
      id: "path_a",
      layerId: "layer_0",
      type: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      closed: false
    };

    const result = buildPathArrayEntities([circle], {
      polyline,
      params: { count: 5, basePoint: { x: 0, y: 0 }, alignToTangent: false }
    });

    expect(result.totalNewEntities).toBe(5);
    expect(result.samplesCount).toBe(5);
    expect(result.createdEntities.map((entity) => entity.id)).not.toContain("circle_origin");

    const lastCircle = result.createdEntities[4] as CircleEntity;
    expect(lastCircle.center.x).toBeCloseTo(10);
    expect(lastCircle.center.y).toBeCloseTo(0);
  });

  it("aligns rectangles to the tangent when alignToTangent is true", () => {
    const rectangle: RectangleEntity = {
      id: "rect_origin",
      layerId: "layer_0",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      rotation: 0
    };

    const polyline: PolylineEntity = {
      id: "path_b",
      layerId: "layer_0",
      type: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 10 }
      ],
      closed: false
    };

    const result = buildPathArrayEntities([rectangle], {
      polyline,
      params: { count: 2, basePoint: { x: 0, y: 0 }, alignToTangent: true }
    });

    const firstRect = result.createdEntities[0] as RectangleEntity;
    expect(firstRect.rotation).toBeCloseTo(Math.PI / 2);
  });

  it("does not duplicate start/end on closed polylines", () => {
    const circle: CircleEntity = {
      id: "circle_origin",
      layerId: "layer_0",
      type: "circle",
      center: { x: 0, y: 0 },
      radius: 1
    };

    const polyline: PolylineEntity = {
      id: "path_closed",
      layerId: "layer_0",
      type: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 }
      ],
      closed: true
    };

    const result = buildPathArrayEntities([circle], {
      polyline,
      params: { count: 4, basePoint: { x: 0, y: 0 }, alignToTangent: false }
    });

    const positions = result.createdEntities.map((entity) => (entity as CircleEntity).center);
    const uniquePositions = new Set(positions.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`));

    expect(uniquePositions.size).toBe(4);
  });

  it("preserves layerId on cloned entities", () => {
    const line: LineEntity = {
      id: "line_origin",
      layerId: "custom_layer",
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 }
    };

    const polyline: PolylineEntity = {
      id: "path_layer",
      layerId: "layer_0",
      type: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 }
      ],
      closed: false
    };

    const result = buildPathArrayEntities([line], {
      polyline,
      params: { count: 3, basePoint: { x: 0, y: 0 }, alignToTangent: false }
    });

    for (const entity of result.createdEntities) {
      expect(entity.layerId).toBe("custom_layer");
    }
  });

  it("rejects invalid params", () => {
    const polyline: PolylineEntity = {
      id: "path_x",
      layerId: "layer_0",
      type: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      ],
      closed: false
    };

    expect(() =>
      buildPathArrayEntities([], {
        polyline,
        params: { count: 3, basePoint: { x: 0, y: 0 }, alignToTangent: true }
      })
    ).toThrow();
  });
});

describe("estimatePathArrayEntityCount", () => {
  it("multiplies the selected count by the path count", () => {
    expect(
      estimatePathArrayEntityCount(2, { count: 5, basePoint: { x: 0, y: 0 }, alignToTangent: true })
    ).toBe(10);
  });

  it("returns zero for invalid configuration", () => {
    expect(
      estimatePathArrayEntityCount(0, { count: 5, basePoint: { x: 0, y: 0 }, alignToTangent: true })
    ).toBe(0);
  });
});
