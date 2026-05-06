export const COMMAND_ALIASES = {
  select: ["sel", "select"],
  move: ["m", "move"],
  rotate: ["ro", "rotate"],
  scale: ["sc", "scale"],
  trim: ["tr", "trim"],
  extend: ["ex", "extend"],
  mirror: ["mi", "mirror"],
  fillet: ["f", "fillet"],
  chamfer: ["cha", "chamfer"],
  offset: ["o", "offset"],
  array: ["ar", "array", "matriz"],
  explode: ["x", "explode"],
  erase: ["e", "erase"],
  dimLinear: ["dli", "dimlinear"],
  dimAligned: ["dal", "dimaligned"],
  dimRadius: ["dra", "dimradius"],
  dimDiameter: ["ddi", "dimdiameter"],
  dimAngular: ["dan", "dimangular"],
  measure: ["mea", "measure"],
  undo: ["u", "undo"],
  redo: ["redo"],
  zoomExtents: ["z", "za", "zoom", "zoomall"],
  clear: ["clear", "cls", "limpar", "limpartela", "clearall"]
} as const;

export type CommandId = keyof typeof COMMAND_ALIASES;

export function normalizeCommandInput(input: string): string {
  return input.trim().toLowerCase();
}
