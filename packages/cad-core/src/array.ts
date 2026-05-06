import {
  buildRectangularArrayOffsets,
  countRectangularArrayPositions,
  offsetPoint,
  validateRectangularArrayParams,
  type RectangularArrayParams,
  type Vector2D
} from "@cad-web/cad-geometry";
import type {
  AlignedDimensionDef,
  AngularDimensionDef,
  CadEntity,
  DiameterDimensionDef,
  DimensionEntity,
  EntityId,
  LinearDimensionDef,
  RadiusDimensionDef
} from "./index";

// O modulo orquestra a criacao de copias de entidades CAD em uma matriz retangular,
// reaproveitando o gerador de offsets puros do cad-geometry.

export type ArrayIdFactory = (sourceEntity: CadEntity, offset: Vector2D, sequence: number) => EntityId;

export type ArrayCadEntitiesResult = Readonly<{
  createdEntities: ReadonlyArray<CadEntity>;
  totalNewEntities: number;
  offsetsCount: number;
}>;

export function cloneCadEntityWithOffset(
  entity: CadEntity,
  offset: Vector2D,
  newId: EntityId
): CadEntity {
  // O metodo gera uma nova entidade com o mesmo estilo da origem, mas com geometria deslocada e id novo.
  if (entity.type === "line") {
    return {
      ...entity,
      id: newId,
      start: offsetPoint(entity.start, offset),
      end: offsetPoint(entity.end, offset)
    };
  }

  if (entity.type === "rectangle") {
    return {
      ...entity,
      id: newId,
      x: entity.x + offset.x,
      y: entity.y + offset.y
    };
  }

  if (entity.type === "circle") {
    return {
      ...entity,
      id: newId,
      center: offsetPoint(entity.center, offset)
    };
  }

  if (entity.type === "arc") {
    return {
      ...entity,
      id: newId,
      center: offsetPoint(entity.center, offset)
    };
  }

  if (entity.type === "dimension") {
    return cloneDimensionWithOffset(entity, offset, newId);
  }

  // O fallback retorna a entidade inalterada para qualquer tipo futuro nao suportado.
  return entity;
}

function cloneDimensionWithOffset(
  entity: DimensionEntity,
  offset: Vector2D,
  newId: EntityId
): DimensionEntity {
  // O metodo desloca todos os pontos relevantes da definicao mantendo o estilo e textOverride.
  if (entity.dimensionType === "linear") {
    const definition = entity.definition as LinearDimensionDef;

    return {
      ...entity,
      id: newId,
      definition: {
        firstPoint: offsetPoint(definition.firstPoint, offset),
        secondPoint: offsetPoint(definition.secondPoint, offset),
        dimensionLinePoint: offsetPoint(definition.dimensionLinePoint, offset),
        orientation: definition.orientation
      }
    };
  }

  if (entity.dimensionType === "aligned") {
    const definition = entity.definition as AlignedDimensionDef;

    return {
      ...entity,
      id: newId,
      definition: {
        firstPoint: offsetPoint(definition.firstPoint, offset),
        secondPoint: offsetPoint(definition.secondPoint, offset),
        dimensionLinePoint: offsetPoint(definition.dimensionLinePoint, offset)
      }
    };
  }

  if (entity.dimensionType === "radius") {
    const definition = entity.definition as RadiusDimensionDef;

    return {
      ...entity,
      id: newId,
      definition: {
        ...(definition.targetEntityId !== undefined ? { targetEntityId: definition.targetEntityId } : {}),
        center: offsetPoint(definition.center, offset),
        radius: definition.radius,
        leaderEndPoint: offsetPoint(definition.leaderEndPoint, offset)
      }
    };
  }

  if (entity.dimensionType === "diameter") {
    const definition = entity.definition as DiameterDimensionDef;

    return {
      ...entity,
      id: newId,
      definition: {
        ...(definition.targetEntityId !== undefined ? { targetEntityId: definition.targetEntityId } : {}),
        center: offsetPoint(definition.center, offset),
        radius: definition.radius,
        leaderEndPoint: offsetPoint(definition.leaderEndPoint, offset)
      }
    };
  }

  if (entity.dimensionType === "angular") {
    const definition = entity.definition as AngularDimensionDef;

    return {
      ...entity,
      id: newId,
      definition: {
        ...(definition.firstLineId !== undefined ? { firstLineId: definition.firstLineId } : {}),
        ...(definition.secondLineId !== undefined ? { secondLineId: definition.secondLineId } : {}),
        vertex: offsetPoint(definition.vertex, offset),
        firstPoint: offsetPoint(definition.firstPoint, offset),
        secondPoint: offsetPoint(definition.secondPoint, offset),
        arcPoint: offsetPoint(definition.arcPoint, offset)
      }
    };
  }

  return entity;
}

export function arrayCadEntitiesRectangular(
  entities: ReadonlyArray<CadEntity>,
  params: RectangularArrayParams,
  idFactory?: ArrayIdFactory
): ArrayCadEntitiesResult {
  // O metodo gera todas as copias para a matriz retangular sem incluir a posicao original.
  const validation = validateRectangularArrayParams(params);

  if (!validation.ok) {
    throw new Error(`Invalid rectangular array params: ${validation.reason}`);
  }

  const offsets = buildRectangularArrayOffsets({ ...params, includeOrigin: false });
  const factory = idFactory ?? defaultArrayIdFactory;
  const createdEntities: CadEntity[] = [];
  let sequence = 0;

  for (const offset of offsets) {
    for (const entity of entities) {
      const newId = factory(entity, offset, sequence);
      createdEntities.push(cloneCadEntityWithOffset(entity, offset, newId));
      sequence += 1;
    }
  }

  return {
    createdEntities,
    totalNewEntities: createdEntities.length,
    offsetsCount: offsets.length
  };
}

export function estimateArrayEntityCount(
  selectedCount: number,
  params: RectangularArrayParams
): number {
  // O calculo prevê o tamanho do array antes de criar entidades, util para avisos de performance.
  if (selectedCount <= 0) {
    return 0;
  }

  return selectedCount * countRectangularArrayPositions(params);
}

function defaultArrayIdFactory(sourceEntity: CadEntity, _offset: Vector2D, sequence: number): EntityId {
  // O gerador padrao combina tipo, id de origem, sequencia e crypto.randomUUID quando disponivel.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${sourceEntity.type}_array_${sourceEntity.id}_${sequence}_${crypto.randomUUID()}`;
  }

  return `${sourceEntity.type}_array_${sourceEntity.id}_${sequence}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}
