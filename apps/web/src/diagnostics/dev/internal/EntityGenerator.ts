import type { CadEntity, EntityId } from "@cad-web/cad-core";

function generateRandomId(): string {
  return `gen_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

// Simple seeded random number generator
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

export type EntityGeneratorOptions = {
  count: number;
  mode: "grid" | "random";
  seed?: number;
  startX?: number;
  startY?: number;
  spacing?: number;
};

export function generateEntities(options: EntityGeneratorOptions): ReadonlyArray<CadEntity> {
  if (options.mode === "grid") {
    return generateGridEntities(options);
  } else {
    return generateRandomEntities(options);
  }
}

function generateGridEntities(options: EntityGeneratorOptions): ReadonlyArray<CadEntity> {
  const { count, startX = 0, startY = 0, spacing = 50 } = options;
  const entities: CadEntity[] = [];
  const columns = Math.ceil(Math.sqrt(count));

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const x = startX + col * spacing;
    const y = startY + row * spacing;

    const typeRnd = i % 3;
    if (typeRnd === 0) {
      entities.push({
        id: generateRandomId(),
        layerId: "default",
        type: "line",
        start: { x, y },
        end: { x: x + spacing * 0.8, y: y + spacing * 0.8 }
      });
    } else if (typeRnd === 1) {
      entities.push({
        id: generateRandomId(),
        layerId: "default",
        type: "rectangle",
        x,
        y,
        width: spacing * 0.8,
        height: spacing * 0.6
      });
    } else {
      entities.push({
        id: generateRandomId(),
        layerId: "default",
        type: "circle",
        center: { x: x + spacing * 0.4, y: y + spacing * 0.4 },
        radius: spacing * 0.4
      });
    }
  }

  return entities;
}

function generateRandomEntities(options: EntityGeneratorOptions): ReadonlyArray<CadEntity> {
  const { count, seed = 12345 } = options;
  const entities: CadEntity[] = [];
  const rnd = new SeededRandom(seed);

  // Distribute entities across a broad area
  const areaSize = Math.sqrt(count) * 50;

  for (let i = 0; i < count; i++) {
    const x = rnd.nextRange(-areaSize, areaSize);
    const y = rnd.nextRange(-areaSize, areaSize);
    const size = rnd.nextRange(10, 100);
    const typeRnd = Math.floor(rnd.nextRange(0, 3));

    if (typeRnd === 0) {
      entities.push({
        id: generateRandomId(),
        layerId: "default",
        type: "line",
        start: { x, y },
        end: { x: x + size, y: y + size }
      });
    } else if (typeRnd === 1) {
      entities.push({
        id: generateRandomId(),
        layerId: "default",
        type: "rectangle",
        x,
        y,
        width: size,
        height: size * 0.8,
        rotation: rnd.nextRange(0, Math.PI * 2)
      });
    } else {
      entities.push({
        id: generateRandomId(),
        layerId: "default",
        type: "circle",
        center: { x, y },
        radius: size / 2
      });
    }
  }

  return entities;
}
