import {
  buildAlignedDimensionGeometry,
  buildAngularDimensionGeometry,
  arcBoundingBox,
  buildDiameterDimensionGeometry,
  buildLinearDimensionGeometry,
  buildRadiusDimensionGeometry,
  rotationMatrix,
  transformPoint,
  type BoundingBox,
  type Point2D
} from "@cad-web/cad-geometry";
import type { CadDocument, CadEntity, DimensionEntity, DimensionStyle } from "./index";

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

  if (entity.type === "arc") {
    return arcBoundingBox(entity);
  }

  if (entity.type === "polyline") {
    return polylineBoundingBox(entity.points);
  }

  // O fallback mantem entidades desconhecidas consultaveis sem quebrar o indice.
  if (entity.type === "dimension") {
    return dimensionBoundingBox(entity);
  }

  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function polylineBoundingBox(points: ReadonlyArray<Point2D>): BoundingBox {
  // O calculo cobre todos os vertices da polyline; segmentos retos nunca extrapolam o envoltorio dos vertices.
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return { minX, minY, maxX, maxY };
}

function dimensionBoundingBox(entity: DimensionEntity): BoundingBox {
  const style = createSpatialDimensionStyle(entity);
  let visualPoints: ReadonlyArray<Point2D> = [];

  if (entity.dimensionType === "linear") {
    visualPoints = buildLinearDimensionGeometry(entity.definition as any, style).visualPoints;
  } else if (entity.dimensionType === "aligned") {
    visualPoints = buildAlignedDimensionGeometry(entity.definition as any, style).visualPoints;
  } else if (entity.dimensionType === "radius") {
    visualPoints = buildRadiusDimensionGeometry(entity.definition as any, style).visualPoints;
  } else if (entity.dimensionType === "diameter") {
    visualPoints = buildDiameterDimensionGeometry(entity.definition as any, style).visualPoints;
  } else if (entity.dimensionType === "angular") {
    visualPoints = buildAngularDimensionGeometry(entity.definition as any, style).visualPoints;
  }

  if (visualPoints.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return boundsFromPoints(visualPoints, Math.max(style.textHeight, style.arrowSize));
}

function createSpatialDimensionStyle(entity: DimensionEntity): DimensionStyle {
  return {
    id: "dimstyle_spatial",
    name: "Spatial",
    textHeight: 12,
    arrowSize: 6,
    extensionOffset: 2,
    extensionOvershoot: 3,
    precision: 2,
    unitSuffix: entity.dimensionType === "angular" ? "\u00b0" : " mm",
    arrowType: "tick",
    ...(entity.style || {}),
    ...(entity.styleOverride || {})
  };
}

function boundsFromPoints(points: ReadonlyArray<Point2D>, padding: number): BoundingBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding
  };
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
    
    // A construcao local usa mutacao interna privada para reduzir custo de alocacao.
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

// O cache global associa cada array imutavel de entidades ao indice espacial.
// O WeakMap permite descarte pelo coletor quando o documento deixa de existir.
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
