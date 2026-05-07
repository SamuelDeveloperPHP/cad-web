import {
  buildPolarArrayAngles,
  buildRectangularArrayOffsets,
  countPolarArrayCopies,
  countRectangularArrayPositions,
  offsetPoint,
  rotatePointAroundCenter,
  validatePolarArrayParams,
  validateRectangularArrayParams,
  type PolarArrayParams,
  type Point2D,
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

  if (entity.type === "polyline") {
    return {
      ...entity,
      id: newId,
      points: entity.points.map((point) => offsetPoint(point, offset))
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

// O bloco abaixo cobre o caso polar: a copia de cada entidade e rotacionada em torno de um centro escolhido.

export type PolarArrayIdFactory = (sourceEntity: CadEntity, angleRadians: number, sequence: number) => EntityId;

export type RotatedCadEntitiesResult = Readonly<{
  createdEntities: ReadonlyArray<CadEntity>;
  totalNewEntities: number;
  copiesCount: number;
}>;

export function rotateCadEntityAroundCenter(
  entity: CadEntity,
  center: Point2D,
  angleRadians: number,
  newId: EntityId
): CadEntity {
  // O metodo aplica rotacao para todos os tipos suportados, incluindo dimensions ausentes do rotateEntity classico.
  if (entity.type === "line") {
    return {
      ...entity,
      id: newId,
      start: rotatePointAroundCenter(entity.start, center, angleRadians),
      end: rotatePointAroundCenter(entity.end, center, angleRadians)
    };
  }

  if (entity.type === "rectangle") {
    const rotatedOrigin = rotatePointAroundCenter({ x: entity.x, y: entity.y }, center, angleRadians);
    return {
      ...entity,
      id: newId,
      x: rotatedOrigin.x,
      y: rotatedOrigin.y,
      rotation: (entity.rotation || 0) + angleRadians
    };
  }

  if (entity.type === "circle") {
    return {
      ...entity,
      id: newId,
      center: rotatePointAroundCenter(entity.center, center, angleRadians)
    };
  }

  if (entity.type === "arc") {
    return {
      ...entity,
      id: newId,
      center: rotatePointAroundCenter(entity.center, center, angleRadians),
      startAngle: entity.startAngle + angleRadians,
      endAngle: entity.endAngle + angleRadians
    };
  }

  if (entity.type === "polyline") {
    return {
      ...entity,
      id: newId,
      points: entity.points.map((point) => rotatePointAroundCenter(point, center, angleRadians))
    };
  }

  if (entity.type === "dimension") {
    return rotateDimensionAroundCenter(entity, center, angleRadians, newId);
  }

  return entity;
}

function rotateDimensionAroundCenter(
  entity: DimensionEntity,
  center: Point2D,
  angleRadians: number,
  newId: EntityId
): DimensionEntity {
  // O metodo rotaciona todos os pontos relevantes da dimension, preservando textOverride e style.
  const rotate = (point: Point2D): Point2D => rotatePointAroundCenter(point, center, angleRadians);

  if (entity.dimensionType === "linear") {
    const definition = entity.definition as LinearDimensionDef;

    return {
      ...entity,
      id: newId,
      definition: {
        firstPoint: rotate(definition.firstPoint),
        secondPoint: rotate(definition.secondPoint),
        dimensionLinePoint: rotate(definition.dimensionLinePoint),
        // O orientation textual perde sentido sob rotacao arbitraria; o "auto" preserva a leitura visual.
        orientation: "auto"
      }
    };
  }

  if (entity.dimensionType === "aligned") {
    const definition = entity.definition as AlignedDimensionDef;

    return {
      ...entity,
      id: newId,
      definition: {
        firstPoint: rotate(definition.firstPoint),
        secondPoint: rotate(definition.secondPoint),
        dimensionLinePoint: rotate(definition.dimensionLinePoint)
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
        center: rotate(definition.center),
        radius: definition.radius,
        leaderEndPoint: rotate(definition.leaderEndPoint)
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
        center: rotate(definition.center),
        radius: definition.radius,
        leaderEndPoint: rotate(definition.leaderEndPoint)
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
        vertex: rotate(definition.vertex),
        firstPoint: rotate(definition.firstPoint),
        secondPoint: rotate(definition.secondPoint),
        arcPoint: rotate(definition.arcPoint)
      }
    };
  }

  return entity;
}

export type PolarArrayInput = Readonly<{
  center: Point2D;
  params: PolarArrayParams;
  rotateItems?: boolean;
}>;

export function arrayCadEntitiesPolar(
  entities: ReadonlyArray<CadEntity>,
  input: PolarArrayInput,
  idFactory?: PolarArrayIdFactory
): RotatedCadEntitiesResult {
  // O metodo gera todas as copias para a matriz polar sem incluir a posicao original.
  const validation = validatePolarArrayParams(input.params);

  if (!validation.ok) {
    throw new Error(`Invalid polar array params: ${validation.reason}`);
  }

  const angles = buildPolarArrayAngles(input.params);
  const factory = idFactory ?? defaultPolarArrayIdFactory;
  const rotateItems = input.rotateItems !== false;
  const createdEntities: CadEntity[] = [];
  let sequence = 0;

  for (const angle of angles) {
    for (const entity of entities) {
      const newId = factory(entity, angle, sequence);

      if (rotateItems) {
        // O modo padrao rotaciona cada copia em sintonia com o angulo da posicao.
        createdEntities.push(rotateCadEntityAroundCenter(entity, input.center, angle, newId));
      } else {
        // O modo translacional copia mantendo a orientacao original, usando apenas o deslocamento polar.
        createdEntities.push(translateCadEntityWithoutRotation(entity, input.center, angle, newId));
      }

      sequence += 1;
    }
  }

  return {
    createdEntities,
    totalNewEntities: createdEntities.length,
    copiesCount: angles.length
  };
}

export function translateCadEntityWithoutRotation(
  entity: CadEntity,
  center: Point2D,
  angleRadians: number,
  newId: EntityId
): CadEntity {
  // O metodo calcula o deslocamento equivalente a rotacionar o ponto de referencia do entity em torno do centro.
  const reference = referencePointForEntity(entity);
  const rotatedReference = rotatePointAroundCenter(reference, center, angleRadians);
  const offset: Vector2D = {
    x: rotatedReference.x - reference.x,
    y: rotatedReference.y - reference.y
  };

  return cloneCadEntityWithOffset(entity, offset, newId);
}

function referencePointForEntity(entity: CadEntity): Point2D {
  // O metodo escolhe o ponto que define a posicao da entidade no plano para calculos de translate-only.
  if (entity.type === "line") {
    return entity.start;
  }

  if (entity.type === "rectangle") {
    return { x: entity.x, y: entity.y };
  }

  if (entity.type === "circle" || entity.type === "arc") {
    return entity.center;
  }

  if (entity.type === "polyline") {
    // O primeiro vertice serve como ancora para o calculo de deslocamento polar sem rotacao.
    return entity.points[0] ?? { x: 0, y: 0 };
  }

  if (entity.type === "dimension") {
    return referencePointForDimension(entity);
  }

  return { x: 0, y: 0 };
}

function referencePointForDimension(entity: DimensionEntity): Point2D {
  if (entity.dimensionType === "linear" || entity.dimensionType === "aligned") {
    const definition = entity.definition as LinearDimensionDef | AlignedDimensionDef;
    return definition.firstPoint;
  }

  if (entity.dimensionType === "radius" || entity.dimensionType === "diameter") {
    const definition = entity.definition as RadiusDimensionDef | DiameterDimensionDef;
    return definition.center;
  }

  if (entity.dimensionType === "angular") {
    const definition = entity.definition as AngularDimensionDef;
    return definition.vertex;
  }

  return { x: 0, y: 0 };
}

export function estimatePolarArrayEntityCount(
  selectedCount: number,
  params: PolarArrayParams
): number {
  // O calculo prevê o tamanho do array polar antes de criar entidades, util para avisos de performance.
  if (selectedCount <= 0) {
    return 0;
  }

  return selectedCount * countPolarArrayCopies(params);
}

function defaultPolarArrayIdFactory(sourceEntity: CadEntity, _angleRadians: number, sequence: number): EntityId {
  // O gerador padrao adiciona o sufixo polar para diferenciar de outros arrays.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${sourceEntity.type}_arraypolar_${sourceEntity.id}_${sequence}_${crypto.randomUUID()}`;
  }

  return `${sourceEntity.type}_arraypolar_${sourceEntity.id}_${sequence}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}
