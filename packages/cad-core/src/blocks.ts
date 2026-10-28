import {
  affineEllipse,
  curveOfEntity,
  ellipseParamAtPoint,
  ellipsePointAtParam,
  linearPartTimesRotationScale,
  multiplyMatrices,
  normalizeEllipseSweep,
  rotationMatrix,
  transformPoint,
  translationMatrix,
  wrapAngle,
  type Matrix2D,
  type Point2D
} from "@cad-web/cad-geometry";
import type {
  ArcEntity,
  BlockDefinition,
  BlockReferenceEntity,
  CadCommand,
  CadDocument,
  CadEntity,
  CircleEntity,
  EllipseEntity,
  PolylineEntity,
  RectangleEntity,
  TextEntity
} from "./index";

/**
 * Blocos: definições reutilizáveis (document.blocks) e referências a elas (entidade "block").
 *
 * A referência leva o ponto base da definição até `position`, com rotação e escala (X e Y independentes,
 * negativo espelha): p' = position + R(rotation)·S(scaleX, scaleY)·(p − basePoint). A geometria é sempre
 * derivada da definição (expandBlockReference), então desenho, seleção, snaps e envoltório usam as
 * mesmas entidades expandidas. Blocos aninhados compõem as matrizes; ciclos e profundidade excessiva são cortados.
 */

const MAX_DEPTH = 16;
const MAX_EXPANDED_ENTITIES = 200_000;
const EPSILON = 1e-9;
// Camada "0": as entidades do bloco nela herdam a camada da referência (como no AutoCAD).
const INHERIT_LAYER_ID = "layer_0";

export function findBlockDefinition(blocks: ReadonlyArray<BlockDefinition> | undefined, name: string): BlockDefinition | undefined {
  return blocks?.find((block) => block.name === name);
}

export function blockReferenceScale(reference: BlockReferenceEntity): Readonly<{ x: number; y: number }> {
  return { x: reference.scaleX ?? 1, y: reference.scaleY ?? 1 };
}

// Matriz que leva a geometria da definição (coordenadas originais) ao desenho.
export function blockReferenceMatrix(reference: BlockReferenceEntity, definition: BlockDefinition): Matrix2D {
  const scale = blockReferenceScale(reference);
  const linear = multiplyMatrices(
    rotationMatrix(reference.rotation ?? 0),
    { a: scale.x, b: 0, c: 0, d: scale.y, e: 0, f: 0 }
  );

  return multiplyMatrices(
    translationMatrix(reference.position.x, reference.position.y),
    multiplyMatrices(linear, translationMatrix(-definition.basePoint.x, -definition.basePoint.y))
  );
}

/**
 * Decompõe a parte linear (a, b, c, d) em rotação e escalas X/Y (com reflexão em scaleY < 0).
 * null quando há cisalhamento (não representável por rotação + escalas nos eixos locais).
 */
export function decomposeBlockLinear(linear: Readonly<{ a: number; b: number; c: number; d: number }>): Readonly<{ rotation: number; scaleX: number; scaleY: number }> | null {
  const scaleX = Math.hypot(linear.a, linear.b);

  if (scaleX < EPSILON) {
    return null;
  }

  const determinant = linear.a * linear.d - linear.b * linear.c;
  const scaleY = determinant / scaleX;
  const shear = (linear.a * linear.c + linear.b * linear.d) / (scaleX * Math.max(Math.abs(scaleY), EPSILON));

  if (Math.abs(shear) > 1e-6 || Math.abs(scaleY) < EPSILON) {
    return null;
  }

  const rotation = Math.atan2(linear.b, linear.a);
  return { rotation: Math.abs(rotation) < 1e-12 ? 0 : rotation, scaleX, scaleY };
}

/**
 * Referência refletida pela reta de ângulo axisAngle que passa por um ponto do eixo: a posição é refletida e
 * a parte linear passa a F·L. null quando o resultado teria cisalhamento (bloco com escala não uniforme girado).
 */
export function mirrorBlockReference(reference: BlockReferenceEntity, reflection: Matrix2D): BlockReferenceEntity | null {
  const scale = blockReferenceScale(reference);
  const rotation = rotationMatrix(reference.rotation ?? 0);
  const linear = {
    a: reflection.a * rotation.a * scale.x + reflection.c * rotation.b * scale.x,
    b: reflection.b * rotation.a * scale.x + reflection.d * rotation.b * scale.x,
    c: reflection.a * rotation.c * scale.y + reflection.c * rotation.d * scale.y,
    d: reflection.b * rotation.c * scale.y + reflection.d * rotation.d * scale.y
  };
  const decomposed = decomposeBlockLinear(linear);

  if (decomposed === null) {
    return null;
  }

  const { rotation: newRotation, scaleX, scaleY } = decomposed;
  const { rotation: _rotation, scaleX: _scaleX, scaleY: _scaleY, ...rest } = reference;

  return {
    ...rest,
    position: transformPoint(reference.position, reflection),
    ...(Math.abs(newRotation) > 1e-12 ? { rotation: newRotation } : {}),
    ...(Math.abs(scaleX - 1) > 1e-12 ? { scaleX } : {}),
    ...(Math.abs(scaleY - 1) > 1e-12 ? { scaleY } : {})
  };
}

// ------------------------------------------------------------------------------------------------
// Transformação de entidades por matriz afim
// ------------------------------------------------------------------------------------------------

type Linear = Readonly<{ a: number; b: number; c: number; d: number }>;

function applyLinear(linear: Linear, x: number, y: number): Point2D {
  return { x: linear.a * x + linear.c * y, y: linear.b * x + linear.d * y };
}

function isSimilarity(linear: Linear): boolean {
  const first = Math.hypot(linear.a, linear.b);
  const second = Math.hypot(linear.c, linear.d);
  const scale = Math.max(first, second, EPSILON);
  return Math.abs(linear.a * linear.c + linear.b * linear.d) <= 1e-9 * scale * scale && Math.abs(first - second) <= 1e-9 * scale;
}

function determinantOf(linear: Linear): number {
  return linear.a * linear.d - linear.b * linear.c;
}

/**
 * Imagem da entidade pela matriz. Círculos e arcos viram elipses sob escala não uniforme; retângulos
 * viram polylines quando perdem os ângulos retos; cotas não são suportadas (null).
 * Os ids e demais campos (camada, cor, estilo) são preservados.
 */
export function transformEntityByMatrix(entity: CadEntity, matrix: Matrix2D): CadEntity | null {
  const map = (point: Point2D) => transformPoint(point, matrix);
  const linear: Linear = { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d };

  switch (entity.type) {
    case "line":
      return { ...entity, start: map(entity.start), end: map(entity.end) };
    case "polyline":
      return { ...entity, points: entity.points.map(map) };
    case "spline":
      return {
        ...entity,
        controlPoints: entity.controlPoints.map(map),
        ...(entity.fitPoints !== undefined ? { fitPoints: entity.fitPoints.map(map) } : {})
      };
    case "rectangle":
      return transformRectangle(entity, matrix, linear);
    case "circle":
      return transformCircle(entity, matrix, linear);
    case "arc":
      return transformArc(entity, matrix, linear);
    case "ellipse":
      return transformEllipse(entity, matrix);
    case "text":
      return transformText(entity, matrix, linear);
    case "dimension":
    case "block":
      return null;
  }
}

function transformRectangle(entity: RectangleEntity, matrix: Matrix2D, linear: Linear): CadEntity {
  const rotation = entity.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const origin = transformPoint({ x: entity.x, y: entity.y }, matrix);
  const width = applyLinear(linear, cos * entity.width, sin * entity.width);
  const height = applyLinear(linear, -sin * entity.height, cos * entity.height);
  const widthLength = Math.hypot(width.x, width.y);
  const heightLength = Math.hypot(height.x, height.y);

  if (Math.abs(width.x * height.x + width.y * height.y) > 1e-9 * Math.max(widthLength * heightLength, EPSILON)) {
    // Cisalhado: deixa de ser retângulo.
    const points = [
      origin,
      { x: origin.x + width.x, y: origin.y + width.y },
      { x: origin.x + width.x + height.x, y: origin.y + width.y + height.y },
      { x: origin.x + height.x, y: origin.y + height.y }
    ];
    const { x: _x, y: _y, width: _w, height: _h, rotation: _r, type: _t, ...rest } = entity;
    return { ...rest, type: "polyline", points, closed: true } as PolylineEntity;
  }

  // Com reflexão, a altura passa a apontar para o lado oposto de rot90(largura): a origem muda para o outro canto.
  const mirrored = determinantOf(linear) < 0;
  const base = mirrored ? { x: origin.x + height.x, y: origin.y + height.y } : origin;
  const angle = Math.atan2(width.y, width.x);

  return {
    ...entity,
    x: base.x,
    y: base.y,
    width: widthLength,
    height: heightLength,
    rotation: Math.abs(angle) < 1e-12 ? 0 : angle
  };
}

function transformCircle(entity: CircleEntity, matrix: Matrix2D, linear: Linear): CadEntity {
  const center = transformPoint(entity.center, matrix);

  if (isSimilarity(linear)) {
    return { ...entity, center, radius: entity.radius * Math.hypot(linear.a, linear.b) };
  }

  const image = affineEllipse(center, applyScale(linear, entity.radius, entity.radius));
  const { radius: _radius, type: _type, ...rest } = entity;
  return { ...rest, type: "ellipse", center, radiusX: image.radiusX, radiusY: image.radiusY, rotation: image.rotation } as EllipseEntity;
}

function applyScale(linear: Linear, scaleX: number, scaleY: number): Linear {
  return { a: linear.a * scaleX, b: linear.b * scaleX, c: linear.c * scaleY, d: linear.d * scaleY };
}

function transformArc(entity: ArcEntity, matrix: Matrix2D, linear: Linear): CadEntity {
  const center = transformPoint(entity.center, matrix);
  const { span } = curveOfEntity(entity);
  const sweep = span?.sweep ?? Math.PI * 2;
  const start = span?.start ?? 0;
  const pointAt = (angle: number): Point2D => transformPoint({ x: entity.center.x + entity.radius * Math.cos(angle), y: entity.center.y + entity.radius * Math.sin(angle) }, matrix);

  if (isSimilarity(linear)) {
    const angleOf = (angle: number) => {
      const point = pointAt(angle);
      return Math.atan2(point.y - center.y, point.x - center.x);
    };
    // O arco é descrito por (início, fim, sentido); a reflexão inverte o sentido e a imagem do trecho
    // [start, start + sweep] (crescente no mundo) é percorrida no sentido oposto.
    const from = angleOf(start);
    const to = angleOf(start + sweep);
    const reflected = determinantOf(linear) < 0;

    return {
      ...entity,
      center,
      radius: entity.radius * Math.hypot(linear.a, linear.b),
      startAngle: reflected ? to : from,
      endAngle: reflected ? from : to,
      clockwise: true
    };
  }

  const image = affineEllipse(center, applyScale(linear, entity.radius, entity.radius));
  const params = orderedParams(center, image.radiusX, image.radiusY, image.rotation, [pointAt(start), pointAt(start + sweep / 2), pointAt(start + sweep)]);
  const { radius: _radius, startAngle: _s, endAngle: _e, clockwise: _c, type: _t, ...rest } = entity;

  return { ...rest, type: "ellipse", center, radiusX: image.radiusX, radiusY: image.radiusY, rotation: image.rotation, startAngle: params.start, endAngle: params.end } as EllipseEntity;
}

function transformEllipse(entity: EllipseEntity, matrix: Matrix2D): CadEntity {
  const center = transformPoint(entity.center, matrix);
  const image = affineEllipse(center, linearPartTimesRotationScale(matrix, entity.rotation, entity.radiusX, entity.radiusY));
  const base = { ...entity, center, radiusX: image.radiusX, radiusY: image.radiusY, rotation: image.rotation };

  if (entity.startAngle === undefined || entity.endAngle === undefined) {
    return base;
  }

  const { start, sweep } = normalizeEllipseSweep(entity.startAngle, entity.endAngle);
  const pointAt = (param: number) => transformPoint(ellipsePointAtParam(entity.center, entity.radiusX, entity.radiusY, entity.rotation, param), matrix);
  const params = orderedParams(center, image.radiusX, image.radiusY, image.rotation, [pointAt(start), pointAt(start + sweep / 2), pointAt(start + sweep)]);

  return { ...base, startAngle: params.start, endAngle: params.end };
}

// Parâmetros (crescentes) na elipse resultante dos três pontos do trecho, na ordem em que o trecho é percorrido.
function orderedParams(center: Point2D, radiusX: number, radiusY: number, rotation: number, [from, middle, to]: readonly [Point2D, Point2D, Point2D]): Readonly<{ start: number; end: number }> {
  const paramFrom = ellipseParamAtPoint(center, radiusX, radiusY, rotation, from);
  const paramMiddle = ellipseParamAtPoint(center, radiusX, radiusY, rotation, middle);
  const paramTo = ellipseParamAtPoint(center, radiusX, radiusY, rotation, to);
  const increasing = wrapAngle(paramMiddle - paramFrom) <= wrapAngle(paramTo - paramFrom);

  return increasing ? { start: paramFrom, end: paramTo } : { start: paramTo, end: paramFrom };
}

function transformText(entity: TextEntity, matrix: Matrix2D, linear: Linear): CadEntity {
  const rotation = entity.rotation ?? 0;
  const baseline = applyLinear(linear, Math.cos(rotation), Math.sin(rotation));
  const up = applyLinear(linear, -Math.sin(rotation), Math.cos(rotation));
  const angle = Math.atan2(baseline.y, baseline.x);

  return {
    ...entity,
    position: transformPoint(entity.position, matrix),
    height: entity.height * Math.hypot(up.x, up.y),
    ...(Math.abs(angle) > 1e-12 || entity.rotation !== undefined ? { rotation: Math.abs(angle) < 1e-12 ? 0 : angle } : {})
  };
}

// ------------------------------------------------------------------------------------------------
// Expansão
// ------------------------------------------------------------------------------------------------

type ExpansionCacheEntry = Readonly<{ definition: BlockDefinition; entities: ReadonlyArray<CadEntity> }>;

const expansionCache = new WeakMap<BlockReferenceEntity, ExpansionCacheEntry>();

/**
 * Entidades da definição transformadas para a posição da referência (ids `${referência}~${id}`; as da camada "0"
 * herdam a camada da referência). Blocos aninhados são expandidos recursivamente. O resultado é cacheado por
 * referência (imutável) e pela definição usada; cotas dentro de blocos são ignoradas.
 */
export function expandBlockReference(blocks: ReadonlyArray<BlockDefinition> | undefined, reference: BlockReferenceEntity): ReadonlyArray<CadEntity> {
  const definition = findBlockDefinition(blocks, reference.blockName);

  if (definition === undefined) {
    return [];
  }

  const cached = expansionCache.get(reference);

  if (cached !== undefined && cached.definition === definition) {
    return cached.entities;
  }

  const budget = { remaining: MAX_EXPANDED_ENTITIES };
  const entities: CadEntity[] = [];
  expandInto(blocks, definition, reference, blockReferenceMatrix(reference, definition), reference.id, reference.layerId, 0, [reference.blockName], budget, entities);
  expansionCache.set(reference, { definition, entities });
  return entities;
}

function expandInto(
  blocks: ReadonlyArray<BlockDefinition> | undefined,
  definition: BlockDefinition,
  _reference: BlockReferenceEntity,
  matrix: Matrix2D,
  idPrefix: string,
  layerId: string,
  depth: number,
  path: ReadonlyArray<string>,
  budget: { remaining: number },
  out: CadEntity[]
): void {
  for (const entity of definition.entities) {
    if (budget.remaining <= 0) {
      return;
    }

    const inheritedLayer = entity.layerId === INHERIT_LAYER_ID || entity.layerId === "" ? layerId : entity.layerId;

    if (entity.type === "block") {
      const nested = findBlockDefinition(blocks, entity.blockName);

      // Ciclos (A contém A) e profundidade excessiva são cortados.
      if (nested === undefined || depth + 1 >= MAX_DEPTH || path.includes(entity.blockName)) {
        continue;
      }

      expandInto(blocks, nested, entity, multiplyMatrices(matrix, blockReferenceMatrix(entity, nested)), `${idPrefix}~${entity.id}`, inheritedLayer, depth + 1, [...path, entity.blockName], budget, out);
      continue;
    }

    const transformed = transformEntityByMatrix(entity, matrix);

    if (transformed === null) {
      continue;
    }

    out.push({ ...transformed, id: `${idPrefix}~${entity.id}`, layerId: inheritedLayer } as CadEntity);
    budget.remaining -= 1;
  }
}

/**
 * Explode de um nível (como o EXPLODE do AutoCAD): as entidades da definição transformadas para o desenho,
 * com ids novos de makeId; blocos aninhados continuam sendo referências (a própria matriz é recomposta; só
 * quando ela deixaria de ser representável, o aninhado é expandido). Cotas da definição são ignoradas.
 */
export function explodeBlockReference(
  blocks: ReadonlyArray<BlockDefinition> | undefined,
  reference: BlockReferenceEntity,
  makeId: (source: CadEntity, index: number) => string
): ReadonlyArray<CadEntity> {
  const definition = findBlockDefinition(blocks, reference.blockName);

  if (definition === undefined) {
    return [];
  }

  const matrix = blockReferenceMatrix(reference, definition);
  const results: CadEntity[] = [];

  definition.entities.forEach((entity, index) => {
    const layerId = entity.layerId === INHERIT_LAYER_ID || entity.layerId === "" ? reference.layerId : entity.layerId;
    const id = makeId(entity, index);

    if (entity.type === "block") {
      const nested = findBlockDefinition(blocks, entity.blockName);

      if (nested === undefined) {
        return;
      }

      const scale = blockReferenceScale(entity);
      const nestedLinear = multiplyMatrices(matrix, multiplyMatrices(rotationMatrix(entity.rotation ?? 0), { a: scale.x, b: 0, c: 0, d: scale.y, e: 0, f: 0 }));
      const decomposed = decomposeBlockLinear(nestedLinear);

      if (decomposed !== null) {
        const { rotation: _r, scaleX: _sx, scaleY: _sy, ...rest } = entity;
        results.push({
          ...rest,
          id,
          layerId,
          position: transformPoint(entity.position, matrix),
          ...(Math.abs(decomposed.rotation) > 1e-12 ? { rotation: decomposed.rotation } : {}),
          ...(Math.abs(decomposed.scaleX - 1) > 1e-12 ? { scaleX: decomposed.scaleX } : {}),
          ...(Math.abs(decomposed.scaleY - 1) > 1e-12 ? { scaleY: decomposed.scaleY } : {})
        });
        return;
      }

      // Sem representação como referência: expande o aninhado e usa ids derivados.
      const expanded: CadEntity[] = [];
      expandInto(blocks, nested, entity, multiplyMatrices(matrix, blockReferenceMatrix(entity, nested)), id, layerId, 1, [reference.blockName, entity.blockName], { remaining: MAX_EXPANDED_ENTITIES }, expanded);
      results.push(...expanded);
      return;
    }

    const transformed = transformEntityByMatrix(entity, matrix);

    if (transformed !== null) {
      results.push({ ...transformed, id, layerId } as CadEntity);
    }
  });

  return results;
}

// ------------------------------------------------------------------------------------------------
// Comandos
// ------------------------------------------------------------------------------------------------

/**
 * Cria a definição de bloco e troca as entidades de origem por uma única referência (como o BLOCK do AutoCAD),
 * na posição da primeira entidade. Uma operação de histórico: o undo restaura as entidades, nas posições
 * originais, e remove a definição.
 */
export class CreateBlockCommand implements CadCommand {
  readonly type = "CreateBlockCommand";
  readonly description: string;
  // Entidades removidas e as posições originais, registradas no execute (o undo as devolve a elas).
  private removed: ReadonlyArray<Readonly<{ index: number; entity: CadEntity }>> = [];
  private addedDefinition = false;

  constructor(
    readonly definition: BlockDefinition,
    readonly sourceEntityIds: ReadonlyArray<string>,
    readonly reference: BlockReferenceEntity | null
  ) {
    this.description = `Creates block ${definition.name}.`;
  }

  get id(): string {
    return `cmd_create_block_${this.definition.name}`;
  }

  execute(document: CadDocument): CadDocument {
    const blocks = document.blocks ?? [];
    this.addedDefinition = findBlockDefinition(blocks, this.definition.name) === undefined;
    const sourceIds = new Set(this.sourceEntityIds);
    this.removed = document.entities.flatMap((entity, index) => (sourceIds.has(entity.id) ? [{ index, entity }] : []));
    const remaining = document.entities.filter((entity) => !sourceIds.has(entity.id));
    const insertionIndex = Math.min(this.removed[0]?.index ?? remaining.length, remaining.length);
    const entities = this.reference === null
      ? remaining
      : [...remaining.slice(0, insertionIndex), this.reference, ...remaining.slice(insertionIndex)];

    return { ...document, blocks: this.addedDefinition ? [...blocks, this.definition] : blocks, entities };
  }

  undo(document: CadDocument): CadDocument {
    const entities: CadEntity[] = this.reference === null ? [...document.entities] : document.entities.filter((entity) => entity.id !== this.reference!.id);

    // As posições originais crescem: inserir em ordem crescente reconstrói a lista original.
    for (const { index, entity } of this.removed) {
      entities.splice(Math.min(index, entities.length), 0, entity);
    }

    const blocks = document.blocks ?? [];

    return {
      ...document,
      blocks: this.addedDefinition ? blocks.filter((block) => block.name !== this.definition.name) : blocks,
      entities
    };
  }
}

// Remove uma definição sem referências (o chamador valida o uso); o undo a restaura na mesma posição.
export class DeleteBlockDefinitionCommand implements CadCommand {
  readonly type = "DeleteBlockDefinitionCommand";
  readonly description: string;
  private removedIndex = -1;

  constructor(readonly definition: BlockDefinition) {
    this.description = `Deletes block ${definition.name}.`;
  }

  get id(): string {
    return `cmd_delete_block_${this.definition.name}`;
  }

  execute(document: CadDocument): CadDocument {
    const blocks = document.blocks ?? [];
    this.removedIndex = blocks.findIndex((block) => block.name === this.definition.name);

    return this.removedIndex === -1 ? document : { ...document, blocks: blocks.filter((block) => block.name !== this.definition.name) };
  }

  undo(document: CadDocument): CadDocument {
    const blocks = document.blocks ?? [];

    if (findBlockDefinition(blocks, this.definition.name) !== undefined) {
      return document;
    }

    const index = this.removedIndex === -1 ? blocks.length : Math.min(this.removedIndex, blocks.length);
    return { ...document, blocks: [...blocks.slice(0, index), this.definition, ...blocks.slice(index)] };
  }
}

// Nomes de blocos que referenciam (direta ou indiretamente) a definição: serve para recusar ciclos e remoções em uso.
export function blockIsReferenced(document: CadDocument, name: string): boolean {
  const usesName = (entities: ReadonlyArray<CadEntity>) => entities.some((entity) => entity.type === "block" && entity.blockName === name);

  return usesName(document.entities) || (document.blocks ?? []).some((block) => block.name !== name && usesName(block.entities));
}
