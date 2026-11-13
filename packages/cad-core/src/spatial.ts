import {
  buildAlignedDimensionGeometry,
  buildAngularDimensionGeometry,
  arcBoundingBox,
  bezierChainBoundingBox,
  ellipseArcBoundingBox,
  buildDiameterDimensionGeometry,
  buildLinearDimensionGeometry,
  buildRadiusDimensionGeometry,
  rotationMatrix,
  textBoundingBox,
  transformPoint,
  type BoundingBox,
  type Point2D
} from "@cad-web/cad-geometry";
import { expandBlockReference } from "./blocks";
import type { BlockDefinition, BlockReferenceEntity, CadDocument, CadEntity, DimensionEntity, DimensionStyle } from "./index";

/**
 * A função calcula o retângulo envolvente de todas as entidades do documento.
 * O resultado une os bounding boxes individuais e serve, por exemplo, para o zoom que
 * centraliza o desenho. Quando o documento não possui entidades a função devolve null.
 */
export function documentBoundingBox(document: CadDocument): BoundingBox | null {
  let bounds: BoundingBox | null = null;

  for (const entity of document.entities) {
    const entityBounds = entityBoundingBox(entity, document.blocks);

    if (bounds === null) {
      bounds = entityBounds;
      continue;
    }

    bounds = {
      minX: Math.min(bounds.minX, entityBounds.minX),
      minY: Math.min(bounds.minY, entityBounds.minY),
      maxX: Math.max(bounds.maxX, entityBounds.maxX),
      maxY: Math.max(bounds.maxY, entityBounds.maxY)
    };
  }

  return bounds;
}

// O cache associa cada entidade imutável ao seu envoltório. Como as entidades nunca são mutadas,
// mover/editar produz um novo objeto e a entrada anterior é naturalmente descartada pelo coletor.
const boundingBoxCache = new WeakMap<CadEntity, BoundingBox>();
// Referências de bloco dependem da definição: o cache guarda também a definição usada.
const blockBoundingBoxCache = new WeakMap<BlockReferenceEntity, Readonly<{ definition: BlockDefinition | undefined; box: BoundingBox }>>();

// A função devolve o envoltório da entidade, calculando-o uma única vez por objeto e reaproveitando o cache.
// O envoltório retornado é compartilhado (imutável por convenção): os chamadores apenas leem, nunca alteram.
// Referências de bloco precisam das definições (blocks) para o envoltório da geometria expandida.
export function entityBoundingBox(entity: CadEntity, blocks?: ReadonlyArray<BlockDefinition>): BoundingBox {
  if (entity.type === "block") {
    return blockReferenceBoundingBox(entity, blocks);
  }

  const cached = boundingBoxCache.get(entity);
  if (cached !== undefined) {
    return cached;
  }

  const box = computeEntityBoundingBox(entity);
  boundingBoxCache.set(entity, box);
  return box;
}

function blockReferenceBoundingBox(reference: BlockReferenceEntity, blocks: ReadonlyArray<BlockDefinition> | undefined): BoundingBox {
  const definition = blocks?.find((block) => block.name === reference.blockName);
  const cached = blockBoundingBoxCache.get(reference);

  if (cached !== undefined && cached.definition === definition) {
    return cached.box;
  }

  let box: BoundingBox | null = null;

  for (const entity of expandBlockReference(blocks, reference)) {
    const entityBounds = entityBoundingBox(entity, blocks);
    box = box === null
      ? entityBounds
      : {
          minX: Math.min(box.minX, entityBounds.minX),
          minY: Math.min(box.minY, entityBounds.minY),
          maxX: Math.max(box.maxX, entityBounds.maxX),
          maxY: Math.max(box.maxY, entityBounds.maxY)
        };
  }

  // Definição ausente ou vazia: caixa mínima no ponto de inserção, para a referência continuar selecionável.
  const resolved = box ?? { minX: reference.position.x - 1, minY: reference.position.y - 1, maxX: reference.position.x + 1, maxY: reference.position.y + 1 };
  blockBoundingBoxCache.set(reference, { definition, box: resolved });
  return resolved;
}

function computeEntityBoundingBox(entity: CadEntity): BoundingBox {
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

  if (entity.type === "ellipse") {
    // ellipseArcBoundingBox cobre tanto a elipse completa quanto o recorte de arco.
    return ellipseArcBoundingBox({
      type: "ellipse",
      center: entity.center,
      radiusX: entity.radiusX,
      radiusY: entity.radiusY,
      rotation: entity.rotation,
      startAngle: entity.startAngle,
      endAngle: entity.endAngle
    });
  }

  if (entity.type === "polyline") {
    return polylineBoundingBox(entity.points);
  }

  if (entity.type === "spline") {
    // Envoltório exato da cadeia de Béziers (extremos pelas raízes da derivada).
    return bezierChainBoundingBox(entity.controlPoints);
  }

  if (entity.type === "text") {
    // O envoltório do texto usa o layout estimado (largura média por caractere) já rotacionado.
    return textBoundingBox(entity);
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

// Número máximo de filhos por nó do R-tree empacotado: 16 equilibra a profundidade e o custo de varrer um nó.
const RTREE_NODE_SIZE = 16;

/**
 * Índice espacial R-tree empacotado (STR, Sort-Tile-Recursive) em arrays tipados. As entidades entram por
 * insert() e a árvore é montada de uma só vez, de forma preguiçosa, na primeira consulta; depois disso o índice
 * é somente leitura. Diferente da grade fixa anterior, o custo não depende do tamanho das entidades nem da
 * magnitude das coordenadas (desenhos georreferenciados em UTM) e cada entidade aparece uma única vez no
 * resultado, que sai na ordem de inserção (a ordem de desenho do documento).
 */
export class SpatialIndex {
  private entities: CadEntity[] = [];
  private boxes: number[] = [];
  // Níveis da árvore: levels[0] são as folhas (cada uma cobre até RTREE_NODE_SIZE itens de `order`);
  // o nível k+1 agrupa RTREE_NODE_SIZE nós consecutivos do nível k. Cada nó guarda minX, minY, maxX, maxY.
  private levels: Float64Array[] = [];
  private order: Uint32Array = new Uint32Array(0);
  private itemBoxes = new Float64Array(0);
  private built = true;

  // As definições servem ao envoltório das referências de bloco no momento da inserção.
  constructor(private readonly blocks?: ReadonlyArray<BlockDefinition>) {}

  public insert(entity: CadEntity, blocks?: ReadonlyArray<BlockDefinition>): void {
    const bbox = entityBoundingBox(entity, blocks ?? this.blocks);

    // Envoltórios inválidos (NaN/infinito) nunca intersectam uma janela e ficam fora da árvore.
    if (!Number.isFinite(bbox.minX + bbox.minY + bbox.maxX + bbox.maxY)) {
      return;
    }

    this.entities.push(entity);
    this.boxes.push(bbox.minX, bbox.minY, bbox.maxX, bbox.maxY);
    this.built = false;
  }

  public get size(): number {
    return this.entities.length;
  }

  // Envoltório de todo o conteúdo indexado, ou null quando o índice está vazio.
  public bounds(): BoundingBox | null {
    this.ensureBuilt();
    const root = this.levels[this.levels.length - 1];

    if (root === undefined || this.entities.length === 0) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let node = 0; node < root.length; node += 4) {
      minX = Math.min(minX, root[node]!);
      minY = Math.min(minY, root[node + 1]!);
      maxX = Math.max(maxX, root[node + 2]!);
      maxY = Math.max(maxY, root[node + 3]!);
    }

    return { minX, minY, maxX, maxY };
  }

  // Entidades cujo envoltório cruza a janela, na ordem de inserção.
  public query(bbox: BoundingBox): ReadonlyArray<CadEntity> {
    const ordinals = this.queryOrdinals(bbox);
    const result = new Array<CadEntity>(ordinals.length);

    for (let index = 0; index < ordinals.length; index += 1) {
      result[index] = this.entities[ordinals[index]!]!;
    }

    return result;
  }

  // Posições (ordem de inserção) das entidades que cruzam a janela, em ordem crescente.
  public queryOrdinals(bbox: BoundingBox): Uint32Array {
    this.ensureBuilt();

    if (this.entities.length === 0 || !(bbox.minX <= bbox.maxX) || !(bbox.minY <= bbox.maxY)) {
      return new Uint32Array(0);
    }

    const { minX, minY, maxX, maxY } = bbox;
    const found: number[] = [];
    const top = this.levels.length - 1;
    // Pilha explícita de (nível, nó): evita recursão e alocação de closures.
    const stack: number[] = [];

    for (let node = 0; node < this.levels[top]!.length / 4; node += 1) {
      stack.push(top, node);
    }

    while (stack.length > 0) {
      const node = stack.pop()!;
      const level = stack.pop()!;
      const nodeBoxes = this.levels[level]!;
      const offset = node * 4;

      if (nodeBoxes[offset]! > maxX || nodeBoxes[offset + 2]! < minX || nodeBoxes[offset + 1]! > maxY || nodeBoxes[offset + 3]! < minY) {
        continue;
      }

      const firstChild = node * RTREE_NODE_SIZE;

      if (level === 0) {
        const lastChild = Math.min(firstChild + RTREE_NODE_SIZE, this.order.length);

        for (let slot = firstChild; slot < lastChild; slot += 1) {
          const item = this.order[slot]!;
          const box = item * 4;

          if (this.itemBoxes[box]! <= maxX && this.itemBoxes[box + 2]! >= minX && this.itemBoxes[box + 1]! <= maxY && this.itemBoxes[box + 3]! >= minY) {
            found.push(item);
          }
        }
      } else {
        const childCount = this.levels[level - 1]!.length / 4;
        const lastChild = Math.min(firstChild + RTREE_NODE_SIZE, childCount);

        for (let child = firstChild; child < lastChild; child += 1) {
          stack.push(level - 1, child);
        }
      }
    }

    const result = Uint32Array.from(found);
    // A ordem da árvore é espacial; a do documento (ordem de desenho) é restaurada ordenando as posições.
    result.sort();
    return result;
  }

  private ensureBuilt(): void {
    if (this.built) {
      return;
    }

    const count = this.entities.length;
    const itemBoxes = Float64Array.from(this.boxes);
    this.itemBoxes = itemBoxes;
    this.order = packItems(itemBoxes, count);
    this.levels = [];

    // Folhas: o envoltório de cada grupo consecutivo de RTREE_NODE_SIZE itens ordenados.
    const leafCount = Math.max(1, Math.ceil(count / RTREE_NODE_SIZE));
    let current = new Float64Array(leafCount * 4);

    for (let leaf = 0; leaf < leafCount; leaf += 1) {
      writeUnion(current, leaf, (add) => {
        const end = Math.min((leaf + 1) * RTREE_NODE_SIZE, count);

        for (let slot = leaf * RTREE_NODE_SIZE; slot < end; slot += 1) {
          add(itemBoxes, this.order[slot]!);
        }
      });
    }

    this.levels.push(current);

    while (current.length / 4 > 1) {
      const children = current;
      const parentCount = Math.ceil(children.length / 4 / RTREE_NODE_SIZE);
      const parents = new Float64Array(parentCount * 4);

      for (let parent = 0; parent < parentCount; parent += 1) {
        writeUnion(parents, parent, (add) => {
          const end = Math.min((parent + 1) * RTREE_NODE_SIZE, children.length / 4);

          for (let child = parent * RTREE_NODE_SIZE; child < end; child += 1) {
            add(children, child);
          }
        });
      }

      this.levels.push(parents);
      current = parents;
    }

    this.built = true;
  }
}

// Une os envoltórios acumulados por `collect` e grava o resultado no nó `node` de `target`.
function writeUnion(target: Float64Array, node: number, collect: (add: (source: Float64Array, index: number) => void) => void): void {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  collect((source, index) => {
    const offset = index * 4;
    if (source[offset]! < minX) minX = source[offset]!;
    if (source[offset + 1]! < minY) minY = source[offset + 1]!;
    if (source[offset + 2]! > maxX) maxX = source[offset + 2]!;
    if (source[offset + 3]! > maxY) maxY = source[offset + 3]!;
  });

  const offset = node * 4;
  target[offset] = minX;
  target[offset + 1] = minY;
  target[offset + 2] = maxX;
  target[offset + 3] = maxY;
}

// STR: ordena por X do centro, fatia em faixas verticais e ordena cada faixa por Y do centro.
function packItems(itemBoxes: Float64Array, count: number): Uint32Array {
  const order = new Uint32Array(count);
  const centerX = new Float64Array(count);
  const centerY = new Float64Array(count);

  for (let item = 0; item < count; item += 1) {
    order[item] = item;
    centerX[item] = itemBoxes[item * 4]! + itemBoxes[item * 4 + 2]!;
    centerY[item] = itemBoxes[item * 4 + 1]! + itemBoxes[item * 4 + 3]!;
  }

  if (count <= RTREE_NODE_SIZE) {
    return order;
  }

  order.sort((left, right) => centerX[left]! - centerX[right]!);

  const leafCount = Math.ceil(count / RTREE_NODE_SIZE);
  const sliceCount = Math.ceil(Math.sqrt(leafCount));
  const sliceSize = sliceCount * RTREE_NODE_SIZE;

  for (let start = 0; start < count; start += sliceSize) {
    order.subarray(start, Math.min(start + sliceSize, count)).sort((left, right) => centerY[left]! - centerY[right]!);
  }

  return order;
}

// Índice id → entidade por array imutável de entidades. Resolve ids em O(1) (em vez de find() linear), o que torna
// lineares as operações sobre seleções grandes (mover, apagar, girar...). Com ids repetidos vale a primeira ocorrência.
const entityByIdCache = new WeakMap<ReadonlyArray<CadEntity>, ReadonlyMap<string, CadEntity>>();

export function getEntityById(document: Pick<CadDocument, "entities">, id: string): CadEntity | undefined {
  let byId = entityByIdCache.get(document.entities);

  if (byId === undefined) {
    const built = new Map<string, CadEntity>();

    for (const entity of document.entities) {
      if (!built.has(entity.id)) {
        built.set(entity.id, entity);
      }
    }

    byId = built;
    entityByIdCache.set(document.entities, byId);
  }

  return byId.get(id);
}

// O cache global associa cada array imutavel de entidades ao indice espacial.
// O WeakMap permite descarte pelo coletor quando o documento deixa de existir.
// As definições de bloco entram na validade do cache: editar uma definição invalida o índice.
const spatialIndexCache = new WeakMap<ReadonlyArray<CadEntity>, Readonly<{ blocks: ReadonlyArray<BlockDefinition> | undefined; index: SpatialIndex }>>();

export function getDocumentSpatialIndex(document: CadDocument): SpatialIndex {
  const cached = spatialIndexCache.get(document.entities);

  if (cached !== undefined && cached.blocks === document.blocks) {
    return cached.index;
  }

  const index = new SpatialIndex(document.blocks);

  for (const entity of document.entities) {
    index.insert(entity, document.blocks);
  }

  spatialIndexCache.set(document.entities, { blocks: document.blocks, index });
  return index;
}
