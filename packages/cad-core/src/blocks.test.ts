import { rotationMatrix, scaleMatrix, reflectionMatrix, transformPoint, type Point2D } from "@cad-web/cad-geometry";
import { describe, expect, it } from "vitest";
import {
  CreateBlockCommand,
  DeleteBlockDefinitionCommand,
  blockIsReferenced,
  createEmptyDocument,
  decomposeBlockLinear,
  entityBoundingBox,
  expandBlockReference,
  getDocumentSpatialIndex,
  mirrorEntity,
  moveEntity,
  rotateEntity,
  scaleEntity,
  stretchEntity,
  transformEntityByMatrix,
  type BlockDefinition,
  type BlockReferenceEntity,
  type CadDocument,
  type CadEntity,
  type LineEntity
} from "./index";

const line = (id: string, start: Point2D, end: Point2D, layerId = "layer_0"): LineEntity => ({ id, layerId, type: "line", start, end });

const VALVE: BlockDefinition = {
  name: "valve",
  basePoint: { x: 10, y: 10 },
  entities: [line("l1", { x: 10, y: 10 }, { x: 20, y: 10 }), line("l2", { x: 20, y: 10 }, { x: 20, y: 20 }, "pipes")]
};

const reference = (extra: Partial<BlockReferenceEntity> = {}): BlockReferenceEntity => ({
  id: "r1",
  layerId: "equipment",
  type: "block",
  blockName: "valve",
  position: { x: 100, y: 50 },
  ...extra
});

function endpoints(entities: ReadonlyArray<CadEntity>): Point2D[] {
  return entities.flatMap((entity) => (entity.type === "line" ? [entity.start, entity.end] : []));
}

function expectPoints(actual: ReadonlyArray<Point2D>, expected: ReadonlyArray<Point2D>): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index]!.x, 9);
    expect(point.y).toBeCloseTo(expected[index]!.y, 9);
  });
}

describe("expandBlockReference", () => {
  it("moves the base point to the position and keeps the layer rules", () => {
    const expanded = expandBlockReference([VALVE], reference());

    expectPoints(endpoints(expanded), [{ x: 100, y: 50 }, { x: 110, y: 50 }, { x: 110, y: 50 }, { x: 110, y: 60 }]);
    // Camada "0" herda a da referência; as demais mantêm a própria.
    expect(expanded.map((entity) => entity.layerId)).toEqual(["equipment", "pipes"]);
    expect(expanded.map((entity) => entity.id)).toEqual(["r1~l1", "r1~l2"]);
  });

  it("applies rotation and scales (including a mirroring negative scale) around the base point", () => {
    const rotated = expandBlockReference([VALVE], reference({ rotation: Math.PI / 2, scaleX: 2 }));
    // (20,10) − base = (10,0) → escala 2 → (20,0) → gira 90° (mundo, Y para baixo) → (0,20).
    expectPoints(endpoints(rotated).slice(0, 2), [{ x: 100, y: 50 }, { x: 100, y: 70 }]);

    const mirrored = expandBlockReference([VALVE], reference({ scaleX: -1 }));
    expectPoints(endpoints(mirrored).slice(0, 2), [{ x: 100, y: 50 }, { x: 90, y: 50 }]);
  });

  it("expands nested blocks by composing matrices and cuts cycles", () => {
    const outer: BlockDefinition = {
      name: "outer",
      basePoint: { x: 0, y: 0 },
      entities: [{ id: "inner_ref", layerId: "layer_0", type: "block", blockName: "valve", position: { x: 5, y: 0 }, scaleX: 2, scaleY: 2 }]
    };
    const expanded = expandBlockReference([VALVE, outer], { ...reference({ blockName: "outer", position: { x: 0, y: 0 } }), layerId: "layer_0" });

    expectPoints(endpoints(expanded).slice(0, 2), [{ x: 5, y: 0 }, { x: 25, y: 0 }]);
    expect(expanded[0]!.id).toBe("r1~inner_ref~l1");

    const loop: BlockDefinition = {
      name: "loop",
      basePoint: { x: 0, y: 0 },
      entities: [line("a", { x: 0, y: 0 }, { x: 1, y: 0 }), { id: "self", layerId: "layer_0", type: "block", blockName: "loop", position: { x: 0, y: 0 } }]
    };
    expect(expandBlockReference([loop], reference({ blockName: "loop" }))).toHaveLength(1);
    expect(expandBlockReference([], reference())).toEqual([]);
  });

  it("caches the expansion per reference and definition", () => {
    const ref = reference();
    expect(expandBlockReference([VALVE], ref)).toBe(expandBlockReference([VALVE], ref));
    expect(expandBlockReference([{ ...VALVE }], ref)).not.toBe(expandBlockReference([VALVE], ref));
  });
});

describe("transformEntityByMatrix", () => {
  it("keeps circles under similarity and turns them into ellipses under non-uniform scale", () => {
    const circle: CadEntity = { id: "c", layerId: "layer_0", type: "circle", center: { x: 1, y: 1 }, radius: 2 };

    expect(transformEntityByMatrix(circle, scaleMatrix(3))).toMatchObject({ type: "circle", center: { x: 3, y: 3 }, radius: 6 });
    const ellipse = transformEntityByMatrix(circle, scaleMatrix(3, 1)) as any;
    expect(ellipse).toMatchObject({ type: "ellipse", id: "c" });
    expect(ellipse.radiusX).toBeCloseTo(6, 9);
    expect(ellipse.radiusY).toBeCloseTo(2, 9);
  });

  it("keeps arcs as arcs under reflection with the same image points", () => {
    const arc: CadEntity = { id: "a", layerId: "layer_0", type: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI / 2, clockwise: true };
    const matrix = reflectionMatrix({ x: 0, y: 0 }, { x: 1, y: 0 });
    const mirrored = transformEntityByMatrix(arc, matrix) as any;
    const endpointsOf = (entity: any) => {
      const point = (angle: number) => ({ x: entity.center.x + entity.radius * Math.cos(angle), y: entity.center.y + entity.radius * Math.sin(angle) });
      return [point(entity.startAngle), point(entity.endAngle)];
    };
    const [from, to] = endpointsOf(mirrored);
    const expected = [transformPoint({ x: 5, y: 0 }, matrix), transformPoint({ x: 0, y: 5 }, matrix)];

    // As pontas da imagem são as imagens das pontas (em qualquer ordem), e o arco continua o menor trecho de 90°.
    const sameSet = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
    expect((sameSet(from!, expected[0]!) && sameSet(to!, expected[1]!)) || (sameSet(from!, expected[1]!) && sameSet(to!, expected[0]!))).toBe(true);
  });

  it("turns an arc into an elliptical arc under non-uniform scale", () => {
    const arc: CadEntity = { id: "a", layerId: "layer_0", type: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI / 2, clockwise: true };
    const result = transformEntityByMatrix(arc, scaleMatrix(2, 1)) as any;

    expect(result.type).toBe("ellipse");
    expect(result.radiusX).toBeCloseTo(10, 9);
    expect(result.radiusY).toBeCloseTo(5, 9);
    expect(Math.abs(result.endAngle - result.startAngle)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("keeps rectangles under rotation and reflection and falls back to a polyline when sheared", () => {
    const rectangle: CadEntity = { id: "r", layerId: "layer_0", type: "rectangle", x: 0, y: 0, width: 10, height: 4 };

    expect(transformEntityByMatrix(rectangle, rotationMatrix(Math.PI / 2))).toMatchObject({ type: "rectangle", width: 10, height: 4 });
    const reflected = transformEntityByMatrix(rectangle, reflectionMatrix({ x: 0, y: 0 }, { x: 1, y: 0 })) as any;
    expect(reflected).toMatchObject({ type: "rectangle", x: 0, y: -4, width: 10, height: 4 });
    const sheared = transformEntityByMatrix(rectangle, { a: 1, b: 0, c: 1, d: 1, e: 0, f: 0 });
    expect(sheared).toMatchObject({ type: "polyline", closed: true });
  });

  it("ignores dimensions", () => {
    const dimension: CadEntity = {
      id: "d", layerId: "layer_0", type: "dimension", dimensionType: "linear",
      definition: { firstPoint: { x: 0, y: 0 }, secondPoint: { x: 1, y: 0 }, dimensionLinePoint: { x: 0, y: 1 }, orientation: "auto" }
    };
    expect(transformEntityByMatrix(dimension, scaleMatrix(2))).toBeNull();
  });
});

describe("block reference transforms", () => {
  const blocks = [VALVE];
  const base = reference({ rotation: 0.3, scaleX: 1.5, scaleY: 1.5 });
  const expandedPoints = (ref: BlockReferenceEntity) => endpoints(expandBlockReference(blocks, ref));

  it("moves, rotates and scales the reference like its expanded geometry", () => {
    const original = expandedPoints(base);

    expectPoints(expandedPoints(moveEntity(base, { x: 7, y: -3 }) as BlockReferenceEntity), original.map((p) => ({ x: p.x + 7, y: p.y - 3 })));
    const pivot = { x: 30, y: 20 };
    const rotation = rotationMatrix(1, pivot);
    expectPoints(expandedPoints(rotateEntity(base, pivot, 1) as BlockReferenceEntity), original.map((p) => transformPoint(p, rotation)));
    const scaling = scaleMatrix(2, 2, pivot);
    expectPoints(expandedPoints(scaleEntity(base, pivot, 2) as BlockReferenceEntity), original.map((p) => transformPoint(p, scaling)));
  });

  it("mirrors the reference like its expanded geometry, even with non-uniform scale", () => {
    const axisStart = { x: 0, y: 20 };
    const axisEnd = { x: 10, y: 35 };
    const matrix = reflectionMatrix(axisStart, axisEnd);
    const mirrored = mirrorEntity(base, axisStart, axisEnd) as BlockReferenceEntity;

    expectPoints(expandedPoints(mirrored), expandedPoints(base).map((p) => transformPoint(p, matrix)));
    // Reflexão e rotação comutam (com sinal): o espelho de uma escala não uniforme girada continua representável.
    const skewed = reference({ rotation: 0.4, scaleX: 3, scaleY: 1 });
    expectPoints(expandedPoints(mirrorEntity(skewed, axisStart, axisEnd) as BlockReferenceEntity), expandedPoints(skewed).map((p) => transformPoint(p, matrix)));
    // Só um cisalhamento (que nenhuma operação do CAD produz sobre uma referência) não é decomponível.
    expect(decomposeBlockLinear({ a: 1, b: 0, c: 1, d: 1 })).toBeNull();
  });

  it("stretches only when the insertion point is inside the window", () => {
    const window = { minX: 90, minY: 40, maxX: 110, maxY: 60 };

    expect(stretchEntity(base, window, { x: 5, y: 0 })).toMatchObject({ position: { x: 105, y: 50 } });
    expect(stretchEntity(base, { minX: 0, minY: 0, maxX: 10, maxY: 10 }, { x: 5, y: 0 })).toBe(base);
  });
});

describe("block bounds and spatial index", () => {
  it("uses the expanded geometry for the bounding box and the spatial index", () => {
    const document: CadDocument = { ...createEmptyDocument("doc_blocks"), blocks: [VALVE], entities: [reference()] };

    expect(entityBoundingBox(document.entities[0]!, document.blocks)).toEqual({ minX: 100, minY: 50, maxX: 110, maxY: 60 });
    expect(getDocumentSpatialIndex(document).query({ minX: 105, minY: 55, maxX: 106, maxY: 56 })).toHaveLength(1);
    expect(getDocumentSpatialIndex(document).query({ minX: 0, minY: 0, maxX: 10, maxY: 10 })).toHaveLength(0);
  });

  it("keeps a selectable minimal box when the definition is missing", () => {
    const box = entityBoundingBox(reference({ blockName: "missing" }), []);
    expect(box.minX).toBeLessThan(100);
    expect(box.maxX).toBeGreaterThan(100);
  });
});

describe("block commands", () => {
  const a = line("a", { x: 0, y: 0 }, { x: 1, y: 0 });
  const b = line("b", { x: 5, y: 5 }, { x: 6, y: 5 });
  const c = line("c", { x: 9, y: 9 }, { x: 9, y: 10 });
  const document: CadDocument = { ...createEmptyDocument("doc_create_block"), entities: [a, b, c] };

  it("replaces the sources by a reference in one step and restores everything on undo", () => {
    const definition: BlockDefinition = { name: "pair", basePoint: { x: 0, y: 0 }, entities: [a, c] };
    const ref = reference({ id: "ref_pair", blockName: "pair", position: { x: 0, y: 0 } });
    const command = new CreateBlockCommand(definition, ["a", "c"], ref);

    const next = command.execute(document);
    expect(next.blocks).toEqual([definition]);
    expect(next.entities.map((entity) => entity.id)).toEqual(["ref_pair", "b"]);
    const undone = command.undo(next);
    expect(undone.entities).toEqual(document.entities);
    expect(undone.blocks).toEqual([]);
    // Redo: a mesma instância refaz o resultado.
    expect(command.execute(undone).entities.map((entity) => entity.id)).toEqual(["ref_pair", "b"]);
  });

  it("deletes a definition and restores it at the same position", () => {
    const other: BlockDefinition = { name: "other", basePoint: { x: 0, y: 0 }, entities: [] };
    const withBlocks: CadDocument = { ...document, blocks: [VALVE, other], entities: [reference()] };
    const command = new DeleteBlockDefinitionCommand(VALVE);

    expect(command.execute(withBlocks).blocks).toEqual([other]);
    expect(command.undo(command.execute(withBlocks)).blocks).toEqual([VALVE, other]);
    expect(blockIsReferenced(withBlocks, "valve")).toBe(true);
    expect(blockIsReferenced(withBlocks, "other")).toBe(false);
  });
});
