import { rotationMatrix, transformPoint, type BoundingBox } from "@cad-web/cad-geometry";
import type { CadDocument, CadEntity } from "./index";

export function entityBoundingBox(entity: CadEntity): BoundingBox {
  if (entity.type === "line") {
    return {
      minX: Math.min(entity.start.x, entity.end.x),
      minY: Math.min(entity.start.y, entity.end.y),
      maxX: Math.max(entity.start.x, entity.end.x),
      maxY: Math.max(entity.start.y, entity.end.y)
    };
  }

  if (entity.type === "rectangle") {
    if (entity.rotation === undefined || Math.abs(entity.rotation) < 0.0001) {
      return {
        minX: entity.x,
        minY: entity.y,
        maxX: entity.x + entity.width,
        maxY: entity.y + entity.height
      };
    }

    const origin = { x: entity.x, y: entity.y };
    const matrix = rotationMatrix(entity.rotation, origin);
    const corners = [
      origin,
      { x: entity.x + entity.width, y: entity.y },
      { x: entity.x + entity.width, y: entity.y + entity.height },
      { x: entity.x, y: entity.y + entity.height }
    ].map((p) => transformPoint(p, matrix));

    return {
      minX: Math.min(...corners.map((c) => c.x)),
      minY: Math.min(...corners.map((c) => c.y)),
      maxX: Math.max(...corners.map((c) => c.x)),
      maxY: Math.max(...corners.map((c) => c.y))
    };
  }

  if (entity.type === "circle") {
    return {
      minX: entity.center.x - entity.radius,
      minY: entity.center.y - entity.radius,
      maxX: entity.center.x + entity.radius,
      maxY: entity.center.y + entity.radius
    };
  }

  // Fallback seguro para entidades não tratadas
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

export class GridSpatialIndex {
  private readonly cells = new Map<string, Set<CadEntity>>();
  private readonly entityCount = 0;

  constructor(private readonly cellSize: number = 100) {}

  public insert(entity: CadEntity): void {
    const bbox = entityBoundingBox(entity);
    const minCx = Math.floor(bbox.minX / this.cellSize);
    const minCy = Math.floor(bbox.minY / this.cellSize);
    const maxCx = Math.floor(bbox.maxX / this.cellSize);
    const maxCy = Math.floor(bbox.maxY / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = `${cx},${cy}`;
        let cell = this.cells.get(key);
        if (!cell) {
          cell = new Set<CadEntity>();
          this.cells.set(key, cell);
        }
        cell.add(entity);
      }
    }
    
    // Hack de bypass pra TypeScript readonly mutação local (ignorando warnings pq é privado local).
    (this as any).entityCount++;
  }

  public query(bbox: BoundingBox): ReadonlyArray<CadEntity> {
    const minCx = Math.floor(bbox.minX / this.cellSize);
    const minCy = Math.floor(bbox.minY / this.cellSize);
    const maxCx = Math.floor(bbox.maxX / this.cellSize);
    const maxCy = Math.floor(bbox.maxY / this.cellSize);

    const result = new Set<CadEntity>();

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = `${cx},${cy}`;
        const cell = this.cells.get(key);
        if (cell) {
          for (const entity of cell) {
            const eBbox = entityBoundingBox(entity);
            if (
              eBbox.minX <= bbox.maxX &&
              eBbox.maxX >= bbox.minX &&
              eBbox.minY <= bbox.maxY &&
              eBbox.maxY >= bbox.minY
            ) {
              result.add(entity);
            }
          }
        }
      }
    }

    return Array.from(result);
  }
  
  public get size(): number {
    return this.entityCount;
  }
}

// Global WeakMap para cache do documento. Ele se associa ao array `entities` que é imutável!
// Isso impede leak de memória se o Documento for deletado/descartado pelo Garbage Collector.
const spatialIndexCache = new WeakMap<ReadonlyArray<CadEntity>, GridSpatialIndex>();

export function getDocumentSpatialIndex(document: CadDocument): GridSpatialIndex {
  let index = spatialIndexCache.get(document.entities);
  
  if (!index) {
    index = new GridSpatialIndex(100);
    for (const entity of document.entities) {
      index.insert(entity);
    }
    spatialIndexCache.set(document.entities, index);
  }
  
  return index;
}
