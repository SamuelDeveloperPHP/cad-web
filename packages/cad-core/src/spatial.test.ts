import { describe, expect, it } from "vitest";
import { GridSpatialIndex, entityBoundingBox } from "./spatial";
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
    const index = new GridSpatialIndex(100);
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
    const index = new GridSpatialIndex(100);
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
    const endBuild = performance.now();
    
    const startQuery = performance.now();
    const result = index.query({ minX: 5000, minY: 5000, maxX: 5500, maxY: 5500 });
    const endQuery = performance.now();
    
    // Testes de CI podem ser lentos, mas 100k n deve demorar mais de 1000ms
    expect(endBuild - startBuild).toBeLessThan(1000);
    expect(endQuery - startQuery).toBeLessThan(100);
    expect(result.length).toBeGreaterThan(0);
  });
});
