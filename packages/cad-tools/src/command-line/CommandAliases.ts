export const COMMAND_ALIASES = {
  select: ["sel", "select"],
  move: ["m", "move"],
  rotate: ["ro", "rotate"],
  scale: ["sc", "scale"],
  trim: ["tr", "trim"],
  mirror: ["mi", "mirror"],
  fillet: ["f", "fillet"],
  chamfer: ["cha", "chamfer"],
  offset: ["o", "offset"],
  array: ["ar", "array"],
  explode: ["x", "explode"],
  erase: ["e", "erase"],
  dimLinear: ["dli", "dimlinear"],
  dimRadius: ["dra", "dimradius"],
  dimDiameter: ["ddi", "dimdiameter"],
  dimAngular: ["dan", "dimangular"],
  measure: ["mea", "measure"],
  undo: ["u", "undo"],
  redo: ["redo"],
  zoomExtents: ["z", "za", "zoom", "zoomall"]
} as const;

export type CommandId = keyof typeof COMMAND_ALIASES;

export function normalizeCommandInput(input: string): string {
  return input.trim().toLowerCase();
}
