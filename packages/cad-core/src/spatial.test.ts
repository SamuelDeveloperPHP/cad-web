import { describe, expect, it } from "vitest";
import { SpatialIndex, entityBoundingBox, getEntityById } from "./spatial";
import type { CadEntity } from "./index";

describe("spatial index", () => {
  it("calculates bounding box for lines", () => {
    const line: CadEntity = {
      type: "line",
      id: "1",
      layerId: "0",
      start: { x: 10, y: 20 },
      end: { x: 30, y: 5 }
    };
    const bbox = entityBoundingBox(line);
    expect(bbox).toEqual({ minX: 10, minY: 5, maxX: 30, maxY: 20 });
  });

  it("calculates bounding box for unrotated rectangles", () => {
    const rect: CadEntity = {
      type: "rectangle",
      id: "2",
      layerId: "0",
      x: 10,
      y: 10,
      width: 50,
      height: 20
    };
    const bbox = entityBoundingBox(rect);
    expect(bbox).toEqual({ minX: 10, minY: 10, maxX: 60, maxY: 30 });
  });

  it("calculates bounding box for circles", () => {
    const circle: CadEntity = {
      type: "circle",
      id: "3",
      layerId: "0",
      center: { x: 50, y: 50 },
      radius: 10
    };
    const bbox = entityBoundingBox(circle);
    expect(bbox).toEqual({ minX: 40, minY: 40, maxX: 60, maxY: 60 });
  });

  it("calculates bounding box for dimensions away from origin", () => {
    const dimension: CadEntity = {
      type: "dimension",
      id: "dim_1",
      layerId: "0",
      dimensionType: "radius",
      definition: {
        center: { x: 500, y: 500 },
        radius: 20,
        leaderEndPoint: { x: 550, y: 500 }
      }
    };

    const bbox = entityBoundingBox(dimension);

    expect(bbox.minX).toBeLessThanOrEqual(500);
    expect(bbox.maxX).toBeGreaterThanOrEqual(550);
    expect(bbox.minY).toBeLessThan(500);
    expect(bbox.maxY).toBeGreaterThan(500);
  });

  it("inserts and queries entities correctly", () => {
    const index = new SpatialIndex();
    const e1: CadEntity = { type: "line", id: "1", layerId: "0", start: { x: 10, y: 10 }, end: { x: 20, y: 20 } };
    const e2: CadEntity = { type: "line", id: "2", layerId: "0", start: { x: 150, y: 150 }, end: { x: 160, y: 160 } };
    
    index.insert(e1);
    index.insert(e2);

    const q1 = index.query({ minX: 0, minY: 0, maxX: 50, maxY: 50 });
    expect(q1).toContain(e1);
    expect(q1).not.toContain(e2);

    const q2 = index.query({ minX: 100, minY: 100, maxX: 200, maxY: 200 });
    expect(q2).not.toContain(e1);
    expect(q2).toContain(e2);
  });
});

describe("spatial index performance benchmark", () => {
  it("builds and queries index for 100k entities in reasonable time", () => {
    const index = new SpatialIndex();
    const startBuild = performance.now();
    for (let i = 0; i < 100000; i++) {
      const startX = Math.random() * 10000;
      const startY = Math.random() * 10000;
      index.insert({
        type: "line",
        id: `line_${i}`,
        layerId: "0",
        start: { x: startX, y: startY },
        end: { x: startX + 10, y: startY + 10 }
      });
    }
    // A árvore é montada de forma preguiçosa na primeira consulta: a montagem entra no tempo de construção.
    index.query({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    const endBuild = performance.now();
    
    const startQuery = performance.now();
    const result = index.query({ minX: 5000, minY: 5000, maxX: 5500, maxY: 5500 });
    const endQuery = performance.now();
    
    // Testes de CI podem ser lentos, mas 100k n deve demorar mais de 1000ms
    expect(endBuild - startBuild).toBeLessThan(1000);
    expect(endQuery - startQuery).toBeLessThan(100);
    expect(result.length).toBeGreaterThan(0);
  });

  it("reaproveita o envoltório cacheado para a mesma entidade (identidade)", () => {
    const line: CadEntity = {
      type: "line",
      id: "cache_1",
      layerId: "0",
      start: { x: 0, y: 0 },
      end: { x: 40, y: 30 }
    };

    const first = entityBoundingBox(line);
    const second = entityBoundingBox(line);

    // A segunda chamada devolve exatamente a mesma referência: prova de que o cache foi usado.
    expect(second).toBe(first);
    expect(first).toEqual({ minX: 0, minY: 0, maxX: 40, maxY: 30 });
  });

  it("recalcula o envoltório quando a entidade é um novo objeto (imutabilidade)", () => {
    const before: CadEntity = {
      type: "line",
      id: "cache_2",
      layerId: "0",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 10 }
    };
    // Mover uma entidade cria um novo objeto; o envoltório deve refletir a nova posição.
    const after: CadEntity = { ...before, start: { x: 100, y: 100 }, end: { x: 110, y: 110 } };

    expect(entityBoundingBox(before)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(entityBoundingBox(after)).toEqual({ minX: 100, minY: 100, maxX: 110, maxY: 110 });
  });
});

describe("R-tree spatial index", () => {
  // Gerador pseudoaleatório determinístico (mulberry32) para os testes serem reproduzíveis.
  function random(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeLines(count: number, seed: number, origin = 0, spread = 5000, maxLength = 200): CadEntity[] {
    const next = random(seed);
    return Array.from({ length: count }, (_unused, index) => {
      const x = origin + next() * spread;
      const y = origin + next() * spread;
      return { type: "line", id: `l${index}`, layerId: "0", start: { x, y }, end: { x: x + (next() - 0.5) * maxLength, y: y + (next() - 0.5) * maxLength } } as CadEntity;
    });
  }

  function bruteForce(entities: ReadonlyArray<CadEntity>, window: { minX: number; minY: number; maxX: number; maxY: number }): CadEntity[] {
    return entities.filter((entity) => {
      const box = entityBoundingBox(entity);
      return box.minX <= window.maxX && box.maxX >= window.minX && box.minY <= window.maxY && box.maxY >= window.minY;
    });
  }

  function indexOf(entities: ReadonlyArray<CadEntity>): SpatialIndex {
    const index = new SpatialIndex();
    for (const entity of entities) index.insert(entity);
    return index;
  }

  it("devolve exatamente o mesmo conjunto da busca linear, na ordem do documento", () => {
    const entities = makeLines(5000, 7);
    const index = indexOf(entities);
    const next = random(99);

    for (let round = 0; round < 60; round += 1) {
      const x = next() * 5000;
      const y = next() * 5000;
      const size = next() * (round % 3 === 0 ? 4000 : 300);
      const window = { minX: x, minY: y, maxX: x + size, maxY: y + size };

      expect(index.query(window)).toEqual(bruteForce(entities, window));
    }
  });

  it("não duplica entidades longas que atravessam muitas regiões", () => {
    const entities: CadEntity[] = [
      { type: "line", id: "long", layerId: "0", start: { x: -1_000_000, y: 0 }, end: { x: 1_000_000, y: 10 } },
      ...makeLines(300, 3)
    ];
    const result = indexOf(entities).query({ minX: -500_000, minY: -5, maxX: 500_000, maxY: 5 });

    expect(result.filter((entity) => entity.id === "long")).toHaveLength(1);
  });

  it("funciona com coordenadas georreferenciadas enormes", () => {
    const entities = makeLines(2000, 11, 7_000_000_000, 20_000_000, 5_000_000);
    const index = indexOf(entities);
    const window = { minX: 7_005_000_000, minY: 7_005_000_000, maxX: 7_008_000_000, maxY: 7_008_000_000 };

    expect(index.query(window)).toEqual(bruteForce(entities, window));
    expect(index.query({ minX: 0, minY: 0, maxX: 100, maxY: 100 })).toHaveLength(0);
  });

  it("aceita inserções depois de uma consulta (reconstrução preguiçosa)", () => {
    const index = new SpatialIndex();
    const first: CadEntity = { type: "line", id: "a", layerId: "0", start: { x: 0, y: 0 }, end: { x: 10, y: 10 } };
    const second: CadEntity = { type: "line", id: "b", layerId: "0", start: { x: 5, y: 5 }, end: { x: 15, y: 15 } };

    index.insert(first);
    expect(index.query({ minX: 0, minY: 0, maxX: 20, maxY: 20 })).toEqual([first]);

    index.insert(second);
    expect(index.query({ minX: 0, minY: 0, maxX: 20, maxY: 20 })).toEqual([first, second]);
    expect(index.size).toBe(2);
  });

  it("trata índice vazio, janela invertida e envoltório inválido", () => {
    const index = new SpatialIndex();

    expect(index.query({ minX: -1, minY: -1, maxX: 1, maxY: 1 })).toEqual([]);
    expect(index.bounds()).toBeNull();

    index.insert({ type: "line", id: "nan", layerId: "0", start: { x: Number.NaN, y: 0 }, end: { x: 1, y: 1 } });
    index.insert({ type: "line", id: "ok", layerId: "0", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } });

    expect(index.size).toBe(1);
    expect(index.query({ minX: 5, minY: 5, maxX: 0, maxY: 0 })).toEqual([]);
    expect(index.bounds()).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
  });

  it("consulta 100 mil entidades em milissegundos e constrói em tempo razoável", () => {
    const entities = makeLines(100_000, 5, 0, 100_000, 50);
    const startBuild = performance.now();
    const index = indexOf(entities);
    index.query({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    const build = performance.now() - startBuild;

    const startQuery = performance.now();
    for (let round = 0; round < 50; round += 1) {
      index.query({ minX: round * 1000, minY: round * 1000, maxX: round * 1000 + 2000, maxY: round * 1000 + 2000 });
    }
    const query = (performance.now() - startQuery) / 50;

    expect(build).toBeLessThan(2000);
    expect(query).toBeLessThan(20);
  });
});

describe("getEntityById", () => {
  const first: CadEntity = { type: "line", id: "dup", layerId: "0", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
  const second: CadEntity = { type: "line", id: "dup", layerId: "0", start: { x: 5, y: 5 }, end: { x: 6, y: 6 } };
  const other: CadEntity = { type: "line", id: "other", layerId: "0", start: { x: 2, y: 2 }, end: { x: 3, y: 3 } };

  it("resolve o id em O(1) e prefere a primeira ocorrência, como find()", () => {
    const document = { entities: [first, other, second] };

    expect(getEntityById(document, "dup")).toBe(first);
    expect(getEntityById(document, "other")).toBe(other);
    expect(getEntityById(document, "missing")).toBeUndefined();
  });

  it("reflete um novo array de entidades (documento imutável)", () => {
    const before = { entities: [first] };
    const after = { entities: [second] };

    expect(getEntityById(before, "dup")).toBe(first);
    expect(getEntityById(after, "dup")).toBe(second);
  });
});
