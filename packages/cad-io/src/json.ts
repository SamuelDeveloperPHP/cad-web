import type { CadDocument, CadEntity } from "@cad-web/cad-core";

export const CAD_IO_APPLICATION = "CAD-WEB";
export const CAD_IO_SCHEMA_VERSION = "1.0.0";

export type CadJsonLayer = Readonly<{
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  opacity?: number;
  order: number;
}>;

export type CadJsonDocument = Readonly<{
  schemaVersion: string;
  application: typeof CAD_IO_APPLICATION;
  id: string;
  unit: CadDocument["units"];
  precision: number;
  metadata: Readonly<Record<string, unknown>>;
  layers: ReadonlyArray<CadJsonLayer>;
  activeLayerId: string;
  entities: ReadonlyArray<CadEntity>;
}>;

export type CadJsonExportOptions = Readonly<{
  precision?: number;
  pretty?: boolean;
}>;

export class CadIoValidationError extends Error {
  constructor(
    message: string,
    readonly path: string
  ) {
    super(`${message} at ${path}`);
    this.name = "CadIoValidationError";
  }
}

export function toCadJsonDocument(document: CadDocument, options: CadJsonExportOptions = {}): CadJsonDocument {
  validateCadDocument(document);

  return {
    schemaVersion: CAD_IO_SCHEMA_VERSION,
    application: CAD_IO_APPLICATION,
    id: document.id,
    unit: document.units,
    precision: options.precision ?? 3,
    metadata: {},
    layers: document.layers,
    activeLayerId: document.activeLayerId,
    entities: document.entities
  };
}

export function serializeCadDocument(document: CadDocument, options: CadJsonExportOptions = {}): string {
  return Array.from(createCadJsonChunks(document, options)).join("");
}

export function* createCadJsonChunks(
  document: CadDocument,
  options: CadJsonExportOptions = {}
): Iterable<string> {
  const nativeDocument = toCadJsonDocument(document, options);
  const indent = options.pretty === false ? "" : "  ";
  const newline = options.pretty === false ? "" : "\n";
  const separator = options.pretty === false ? "," : ",\n";
  const entityPrefix = options.pretty === false ? "" : "  ";

  yield `{${newline}`;
  yield `${indent}"schemaVersion": ${JSON.stringify(nativeDocument.schemaVersion)}${separator}`;
  yield `${indent}"application": ${JSON.stringify(nativeDocument.application)}${separator}`;
  yield `${indent}"id": ${JSON.stringify(nativeDocument.id)}${separator}`;
  yield `${indent}"unit": ${JSON.stringify(nativeDocument.unit)}${separator}`;
  yield `${indent}"precision": ${JSON.stringify(nativeDocument.precision)}${separator}`;
  yield `${indent}"metadata": ${JSON.stringify(nativeDocument.metadata)}${separator}`;
  yield `${indent}"layers": ${JSON.stringify(nativeDocument.layers)}${separator}`;
  yield `${indent}"activeLayerId": ${JSON.stringify(nativeDocument.activeLayerId)}${separator}`;
  yield `${indent}"entities": [${newline}`;

  for (let index = 0; index < nativeDocument.entities.length; index += 1) {
    const entity = nativeDocument.entities[index];

    if (entity === undefined) {
      continue;
    }

    yield `${entityPrefix}${indent}${JSON.stringify(entity)}`;
    yield index === nativeDocument.entities.length - 1 ? newline : separator;
  }

  yield `${indent}]${newline}`;
  yield "}";
}

export function parseCadDocument(source: string): CadDocument {
  return fromCadJsonDocument(JSON.parse(source) as unknown);
}

export function fromCadJsonDocument(source: unknown): CadDocument {
  if (!isRecord(source)) {
    throw new CadIoValidationError("CAD document must be an object", "$");
  }

  if (source.application === CAD_IO_APPLICATION || "unit" in source) {
    return fromNativeCadJsonDocument(source);
  }

  return fromLegacyCadDocument(source);
}

export function validateCadDocument(document: CadDocument): void {
  if (!isRecord(document)) {
    throw new CadIoValidationError("CAD document must be an object", "$");
  }

  assertString(document.schemaVersion, "$.schemaVersion");
  assertString(document.id, "$.id");
  assertUnit(document.units, "$.units");

  if (!Array.isArray(document.entities)) {
    throw new CadIoValidationError("CAD document entities must be an array", "$.entities");
  }

  for (let index = 0; index < document.entities.length; index += 1) {
    validateCadEntity(document.entities[index], `$.entities[${index}]`);
  }
}

function fromNativeCadJsonDocument(source: Record<string, unknown>): CadDocument {
  assertString(source.schemaVersion, "$.schemaVersion");

  if (source.application !== CAD_IO_APPLICATION) {
    throw new CadIoValidationError("CAD document application must be CAD-WEB", "$.application");
  }

  assertString(source.id, "$.id");
  assertUnit(source.unit, "$.unit");

  if (!Array.isArray(source.entities)) {
    throw new CadIoValidationError("CAD document entities must be an array", "$.entities");
  }

  const document: CadDocument = {
    schemaVersion: source.schemaVersion,
    id: source.id,
    units: source.unit,
    layers: (source.layers as ReadonlyArray<CadJsonLayer>) ?? createFallbackLayers(source.entities as ReadonlyArray<CadEntity>),
    activeLayerId: (source.activeLayerId as string) ?? "layer_0",
    entities: source.entities as ReadonlyArray<CadEntity>
  };

  validateCadDocument(document);

  return document;
}

function fromLegacyCadDocument(source: Record<string, unknown>): CadDocument {
  assertString(source.schemaVersion, "$.schemaVersion");
  assertString(source.id, "$.id");
  assertUnit(source.units, "$.units");

  if (!Array.isArray(source.entities)) {
    throw new CadIoValidationError("CAD document entities must be an array", "$.entities");
  }

  const entities = source.entities as ReadonlyArray<CadEntity>;
  const document: CadDocument = {
    schemaVersion: source.schemaVersion,
    id: source.id,
    units: source.units,
    layers: createFallbackLayers(entities),
    activeLayerId: "layer_0",
    entities: entities.map((e) => ({ ...e, layerId: e.layerId || "layer_0" }))
  };

  validateCadDocument(document);

  return document;
}

function createFallbackLayers(entities: ReadonlyArray<CadEntity>): ReadonlyArray<CadJsonLayer> {
  const layerIds = new Set(entities.map((entity) => entity.layerId || "layer_0"));
  layerIds.add("layer_0");

  const normalizedLayerIds = [...layerIds].sort();

  return normalizedLayerIds.map((id, index) => ({
    id,
    name: id === "layer_0" ? "Layer 0" : id,
    color: "#ffffff",
    visible: true,
    locked: false,
    order: index
  }));
}

function validateCadEntity(entity: CadEntity | undefined, path: string): void {
  if (!isRecord(entity)) {
    throw new CadIoValidationError("CAD entity must be an object", path);
  }

  assertString(entity.id, `${path}.id`);
  assertString(entity.layerId, `${path}.layerId`);

  if (entity.type === "line") {
    validatePoint(entity.start, `${path}.start`);
    validatePoint(entity.end, `${path}.end`);
    return;
  }

  if (entity.type === "rectangle") {
    assertFiniteNumber(entity.x, `${path}.x`);
    assertFiniteNumber(entity.y, `${path}.y`);
    assertFiniteNumber(entity.width, `${path}.width`);
    assertFiniteNumber(entity.height, `${path}.height`);

    if (entity.rotation !== undefined) {
      assertFiniteNumber(entity.rotation, `${path}.rotation`);
    }

    return;
  }

  if (entity.type === "circle") {
    validatePoint(entity.center, `${path}.center`);
    assertPositiveNumber(entity.radius, `${path}.radius`);
    return;
  }

  if (entity.type === "dimension") {
    assertString((entity as any).dimensionType, `${path}.dimensionType`);
    if (!isRecord((entity as any).definition)) {
      throw new CadIoValidationError("CAD dimension definition must be an object", `${path}.definition`);
    }
    const def = (entity as any).definition;
    validatePoint(def.firstPoint, `${path}.definition.firstPoint`);
    validatePoint(def.secondPoint, `${path}.definition.secondPoint`);
    validatePoint(def.dimensionLinePoint, `${path}.definition.dimensionLinePoint`);
    return;
  }

  throw new CadIoValidationError(`CAD entity type '${entity.type}' is not supported by this schema`, `${path}.type`);
}

function validatePoint(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw new CadIoValidationError("Point must be an object", path);
  }

  assertFiniteNumber(value.x, `${path}.x`);
  assertFiniteNumber(value.y, `${path}.y`);
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CadIoValidationError("Value must be a non-empty string", path);
  }
}

function assertUnit(value: unknown, path: string): asserts value is CadDocument["units"] {
  if (value !== "mm" && value !== "cm" && value !== "m" && value !== "in") {
    throw new CadIoValidationError("CAD unit is not supported", path);
  }
}

function assertFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CadIoValidationError("Value must be a finite number", path);
  }
}

function assertPositiveNumber(value: unknown, path: string): asserts value is number {
  assertFiniteNumber(value, path);

  if (value <= 0) {
    throw new CadIoValidationError("Value must be greater than zero", path);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
