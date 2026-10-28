/**
 * Cores do DXF: Índice de Cor do AutoCAD (ACI, 1–255) e cor verdadeira (24 bits).
 * O desenho usa fundo escuro: o preto e o ACI 7 ("branco/preto" conforme o fundo) viram branco.
 */

const BASIC_COLORS: Readonly<Record<number, string>> = {
  1: "#ff0000",
  2: "#ffff00",
  3: "#00ff00",
  4: "#00ffff",
  5: "#0000ff",
  6: "#ff00ff",
  7: "#ffffff",
  8: "#808080",
  9: "#c0c0c0"
};

const GRAYS: ReadonlyArray<string> = ["#333333", "#5b5b5b", "#848484", "#adadad", "#d6d6d6", "#ffffff"];

function toHex(value: number): string {
  // A tabela do AutoCAD trunca (255 × 0,5 = 127), não arredonda.
  return Math.max(0, Math.min(255, Math.floor(value + 1e-9))).toString(16).padStart(2, "0");
}

function hsvToHex(hue: number, saturation: number, value: number): string {
  const chroma = value * saturation;
  const sector = (hue / 60) % 6;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1 ? [chroma, x, 0]
    : sector < 2 ? [x, chroma, 0]
    : sector < 3 ? [0, chroma, x]
    : sector < 4 ? [0, x, chroma]
    : sector < 5 ? [x, 0, chroma]
    : [chroma, 0, x];
  const offset = value - chroma;

  return `#${toHex((red + offset) * 255)}${toHex((green + offset) * 255)}${toHex((blue + offset) * 255)}`;
}

/**
 * Cor (#rrggbb) de um índice ACI: 1–9 fixos, 10–249 pela grade de 24 matizes (15° cada) × 5 níveis de brilho ×
 * 2 saturações (par = cheia, ímpar = metade), 250–255 em tons de cinza. null para 0 (ByBlock), 256 (ByLayer) e inválidos.
 */
export function aciToHex(index: number): string | null {
  if (!Number.isInteger(index) || index <= 0 || index >= 256) {
    return null;
  }

  const basic = BASIC_COLORS[index];

  if (basic !== undefined) {
    return basic;
  }

  if (index >= 250) {
    return GRAYS[index - 250] ?? null;
  }

  const offset = index - 10;
  const hue = Math.floor(offset / 10) * 15;
  const position = offset % 10;
  const values = [1, 0.65, 0.5, 0.3, 0.15];

  return hsvToHex(hue, position % 2 === 0 ? 1 : 0.5, values[Math.floor(position / 2)]!);
}

// Cor verdadeira (código 420/421): inteiro 0xRRGGBB. Preto vira branco (fundo escuro).
export function trueColorToHex(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    return null;
  }

  return value === 0 ? "#ffffff" : `#${value.toString(16).padStart(6, "0")}`;
}
