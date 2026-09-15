import { convertUnit } from "@cad-web/cad-geometry";

// O módulo converte entre o fator interno do viewport (pixels por unidade de mundo) e a escala de
// engenharia exibida ao usuário (1:N para desenhos reduzidos, N:1 para ampliados).
//
// A escala 1:1 é ancorada em 96 dpi nominais (padrão CSS): 1 polegada = 96 px = 25,4 mm, ou seja
// ~3,7795 px por milímetro. A precisão física real (impressão 1:1 de verdade) depende de calibrar o
// monitor e pertence à etapa de plotagem; aqui o valor serve como referência de navegação honesta.
export const NOMINAL_PX_PER_MM = 96 / 25.4;

// A função devolve o scale (px por unidade de mundo) que corresponde à escala 1:1 para a unidade dada.
export function scaleForOneToOne(units: string): number {
  const mmPerUnit = convertUnit(1, units, "mm");
  return mmPerUnit * NOMINAL_PX_PER_MM;
}

// A função transforma o scale interno na razão de escala (scale / scaleAt1:1); >1 amplia, <1 reduz.
export function scaleToRatio(scale: number, units: string): number {
  const base = scaleForOneToOne(units);
  return base > 0 ? scale / base : scale;
}

// A função formata a razão como rótulo de engenharia: "2:1" (ampliado), "1:50" (reduzido), "1:1".
export function formatZoomScaleLabel(scale: number, units: string): string {
  const ratio = scaleToRatio(scale, units);

  if (!Number.isFinite(ratio) || ratio <= 0) {
    return "1:1";
  }

  if (ratio >= 1) {
    return `${formatRatioSide(ratio)}:1`;
  }

  return `1:${formatRatioSide(1 / ratio)}`;
}

// A função interpreta a entrada do usuário e devolve o scale correspondente, ou null se inválida.
// Aceita "1:50", "2:1", "50:1" e um número solto (multiplicador da escala 1:1: "2" = 2:1, "0.5" = 1:2).
export function parseZoomScaleInput(input: string, units: string): number | null {
  const text = input.trim().replace(",", ".");
  const base = scaleForOneToOne(units);

  const ratioMatch = text.match(/^(\d*\.?\d+)\s*:\s*(\d*\.?\d+)$/);

  if (ratioMatch) {
    const a = Number.parseFloat(ratioMatch[1]!);
    const b = Number.parseFloat(ratioMatch[2]!);

    if (a > 0 && b > 0) {
      return base * (a / b);
    }

    return null;
  }

  const numberMatch = text.match(/^(\d*\.?\d+)$/);

  if (numberMatch) {
    const value = Number.parseFloat(numberMatch[1]!);
    return value > 0 ? base * value : null;
  }

  return null;
}

// A função arredonda um lado da razão para uma leitura limpa: inteiro a partir de 10, senão 1 casa.
function formatRatioSide(value: number): string {
  if (value >= 10) {
    return String(Math.round(value));
  }

  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
