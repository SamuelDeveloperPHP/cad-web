import { CAD_EPSILON } from "./constants";
import type { Point2D, Vector2D } from "./types";

// O modulo expoe utilidades puras para gerar matrizes retangulares de entidades CAD.
// As funcoes nao dependem do React, do renderer nem do command pattern e podem ser testadas isoladamente.

export type RectangularArrayParams = Readonly<{
  rows: number;
  columns: number;
  spacingX: number;
  spacingY: number;
  includeOrigin?: boolean;
}>;

export type RectangularArrayValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

export function validateRectangularArrayParams(
  params: RectangularArrayParams,
  epsilon = CAD_EPSILON
): RectangularArrayValidation {
  // O metodo aplica todas as regras geometricas do MVP em um unico lugar para evitar duplicacao.
  if (!Number.isInteger(params.rows) || params.rows < 1) {
    return { ok: false, reason: "Rows must be a positive integer." };
  }

  if (!Number.isInteger(params.columns) || params.columns < 1) {
    return { ok: false, reason: "Columns must be a positive integer." };
  }

  if (!Number.isFinite(params.spacingX) || !Number.isFinite(params.spacingY)) {
    return { ok: false, reason: "Spacing must be finite numbers." };
  }

  if (Math.abs(params.spacingX) <= epsilon && Math.abs(params.spacingY) <= epsilon) {
    return { ok: false, reason: "At least one spacing must be non-zero." };
  }

  return { ok: true };
}

export function buildRectangularArrayOffsets(params: RectangularArrayParams): ReadonlyArray<Vector2D> {
  // O algoritmo percorre as celulas da matriz e gera o offset de cada posicao em ordem natural.
  const validation = validateRectangularArrayParams(params);

  if (!validation.ok) {
    throw new Error(`Invalid rectangular array params: ${validation.reason}`);
  }

  const includeOrigin = params.includeOrigin === true;
  const offsets: Vector2D[] = [];

  for (let row = 0; row < params.rows; row += 1) {
    for (let column = 0; column < params.columns; column += 1) {
      // O offset original e omitido por padrao porque a entidade origem ja existe no documento.
      if (!includeOrigin && row === 0 && column === 0) {
        continue;
      }

      // O calculo soma zero para normalizar -0 em 0 e evitar surpresas em comparacoes futuras.
      offsets.push({
        x: column * params.spacingX + 0,
        y: row * params.spacingY + 0
      });
    }
  }

  return offsets;
}

export function countRectangularArrayPositions(params: RectangularArrayParams): number {
  // O calculo retorna o total de novas posicoes (excluindo a origem) para auxiliar avisos de performance.
  const validation = validateRectangularArrayParams(params);

  if (!validation.ok) {
    return 0;
  }

  return params.rows * params.columns - 1;
}

export function offsetPoint(point: Point2D, offset: Vector2D): Point2D {
  // O metodo soma o offset a um Point2D imutavel preservando a forma original.
  return { x: point.x + offset.x, y: point.y + offset.y };
}
