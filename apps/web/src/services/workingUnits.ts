import type { CadDocument } from "@cad-web/cad-core";
import { convertUnit } from "@cad-web/cad-geometry";

// Casas decimais na leitura de comprimentos por unidade, para manter ~1 µm de resolução sem excesso de dígitos.
export const LENGTH_DECIMALS: Record<string, number> = {
  um: 1,
  mm: 3,
  cm: 4,
  m: 4,
  km: 6,
  in: 4
};

// A unidade de trabalho é a unidade exibida; o documento continua armazenado na unidade base.
export function workingUnitOf(document: CadDocument): string {
  return document.displayUnit || document.units;
}

// Fator base-por-unidade-de-trabalho (ex.: m→mm = 1000), o mesmo unitScale do ToolContext.
export function workingUnitScale(document: CadDocument): number {
  const scale = convertUnit(1, workingUnitOf(document), document.units);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export type WorkingLengthFormat = Readonly<{
  unit: string;
  // Converte um comprimento da base para texto na unidade de trabalho.
  format(value: number): string;
  // Converte uma área da base (unidade²) para texto na unidade de trabalho².
  formatArea(value: number): string;
  // Converte o texto digitado (unidade de trabalho) para a base; devolve fallback se inválido.
  parse(text: string, fallback: number): number;
}>;

export function workingLengthFormat(document: CadDocument): WorkingLengthFormat {
  const unit = workingUnitOf(document);
  const scale = workingUnitScale(document);
  const decimals = LENGTH_DECIMALS[unit] ?? 3;

  return {
    unit,
    format: (value) => (value / scale).toFixed(decimals),
    formatArea: (value) => (value / (scale * scale)).toFixed(decimals),
    parse: (text, fallback) => {
      const parsed = Number.parseFloat(text);
      return Number.isFinite(parsed) ? parsed * scale : fallback;
    }
  };
}
