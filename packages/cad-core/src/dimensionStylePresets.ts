import type { DimensionStyle } from "./index";

export type DimensionStylePreset = Readonly<{
  id: string;
  name: string;
  description?: string;
  textHeight: number;
  arrowSize: number;
  extensionOffset: number;
  extensionOvershoot: number;
  precision: number;
  unitSuffix: string;
  arrowType: "tick" | "arrow";
  color?: string;
  textColor?: string;
  lineColor?: string;
  scale?: number;
}>;

export type CreateDimensionStyleFromPresetOptions = Readonly<{
  id?: string;
  name?: string;
  existingStyles?: ReadonlyArray<Pick<DimensionStyle, "id" | "name">>;
}>;

export const DIMENSION_STYLE_PRESETS: ReadonlyArray<DimensionStylePreset> = Object.freeze([
  Object.freeze({
    id: "standard",
    name: "Standard",
    description: "General CAD dimension style.",
    arrowType: "tick",
    textHeight: 12,
    arrowSize: 6,
    extensionOffset: 2,
    extensionOvershoot: 3,
    precision: 2,
    unitSuffix: " mm",
    color: "#d8d8d8"
  }),
  Object.freeze({
    id: "architectural",
    name: "Arquitetonico",
    description: "Architectural dimension style with tick marks.",
    arrowType: "tick",
    textHeight: 14,
    arrowSize: 8,
    extensionOffset: 3,
    extensionOvershoot: 4,
    precision: 2,
    unitSuffix: " mm",
    color: "#e6e6e6"
  }),
  Object.freeze({
    id: "mechanical",
    name: "Mecanico",
    description: "Mechanical dimension style with arrow heads.",
    arrowType: "arrow",
    textHeight: 10,
    arrowSize: 5,
    extensionOffset: 2,
    extensionOvershoot: 2,
    precision: 3,
    unitSuffix: " mm",
    color: "#f0f0f0"
  }),
  Object.freeze({
    id: "civil",
    name: "Civil",
    description: "Civil dimension style with centimeter suffix.",
    arrowType: "tick",
    textHeight: 12,
    arrowSize: 7,
    extensionOffset: 3,
    extensionOvershoot: 4,
    precision: 2,
    unitSuffix: " cm",
    color: "#dcdcdc"
  }),
  Object.freeze({
    id: "electrical",
    name: "Eletrico",
    description: "Electrical dimension style with highlighted color.",
    arrowType: "arrow",
    textHeight: 10,
    arrowSize: 5,
    extensionOffset: 2,
    extensionOvershoot: 3,
    precision: 2,
    unitSuffix: " mm",
    color: "#ffe08a"
  }),
  Object.freeze({
    id: "iso",
    name: "ISO",
    description: "ISO-oriented dimension style.",
    arrowType: "arrow",
    textHeight: 10,
    arrowSize: 4,
    extensionOffset: 1.5,
    extensionOvershoot: 2,
    precision: 2,
    unitSuffix: " mm",
    color: "#ffffff"
  }),
  Object.freeze({
    id: "abnt",
    name: "ABNT",
    description: "ABNT-oriented dimension style baseline.",
    arrowType: "tick",
    textHeight: 12,
    arrowSize: 6,
    extensionOffset: 2,
    extensionOvershoot: 3,
    precision: 2,
    unitSuffix: " mm",
    color: "#ffffff"
  })
]);

export function getDimensionStylePresetById(presetId: string): DimensionStylePreset | undefined {
  return DIMENSION_STYLE_PRESETS.find((preset) => preset.id === presetId);
}

export function createDimensionStyleFromPreset(
  presetId: string,
  options: CreateDimensionStyleFromPresetOptions = {}
): DimensionStyle | undefined {
  const preset = getDimensionStylePresetById(presetId);

  if (preset === undefined) {
    return undefined;
  }

  const existingStyles = options.existingStyles ?? [];
  const name = options.name ?? createUniqueStyleName(preset.name, existingStyles);
  const id = options.id ?? createUniqueStyleId(`dimstyle_${preset.id}`, existingStyles);

  return {
    id,
    name,
    presetId: preset.id,
    textHeight: preset.textHeight,
    arrowSize: preset.arrowSize,
    extensionOffset: preset.extensionOffset,
    extensionOvershoot: preset.extensionOvershoot,
    precision: preset.precision,
    unitSuffix: preset.unitSuffix,
    arrowType: preset.arrowType,
    ...(preset.color ? { color: preset.color } : {}),
    ...(preset.textColor ? { textColor: preset.textColor } : {}),
    ...(preset.lineColor ? { lineColor: preset.lineColor } : {}),
    ...(preset.scale !== undefined ? { scale: preset.scale } : {})
  };
}

function createUniqueStyleName(baseName: string, existingStyles: ReadonlyArray<Pick<DimensionStyle, "name">>): string {
  const existingNames = new Set(existingStyles.map((style) => style.name));

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let suffix = 2;
  let candidate = `${baseName} ${suffix}`;

  while (existingNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName} ${suffix}`;
  }

  return candidate;
}

function createUniqueStyleId(baseId: string, existingStyles: ReadonlyArray<Pick<DimensionStyle, "id">>): string {
  const existingIds = new Set(existingStyles.map((style) => style.id));

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}_${suffix}`;

  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}_${suffix}`;
  }

  return candidate;
}
