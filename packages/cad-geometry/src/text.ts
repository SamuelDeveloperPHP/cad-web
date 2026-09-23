import type { BoundingBox, Point2D, Vector2D } from "./types";

/**
 * Layout geométrico de texto de uma ou mais linhas, sem depender de fonte real nem de Canvas.
 *
 * Convenções:
 * - `height` é o tamanho da fonte (em) em unidades de desenho, o mesmo critério do texto de cota.
 * - `rotation` é o ângulo da linha de base em radianos no sistema do mundo. Como o eixo Y do mundo
 *   cresce para baixo na tela, o "para cima" do texto é o vetor (sin r, -cos r).
 * - A largura é estimada por uma razão média de caractere. O renderer desenha com a fonte real e
 *   o mesmo ancoramento (alinhamento), então só a extensão horizontal é aproximada; o envoltório
 *   serve para índice espacial, seleção e zoom, onde uma estimativa conservadora é suficiente.
 */

export type TextHorizontalAlign = "left" | "center" | "right";
export type TextVerticalAlign = "baseline" | "bottom" | "middle" | "top";

export type TextGeometry = Readonly<{
  position: Point2D;
  content: string;
  height: number;
  rotation?: number | undefined;
  horizontalAlign?: TextHorizontalAlign | undefined;
  verticalAlign?: TextVerticalAlign | undefined;
}>;

export type TextLineLayout = Readonly<{
  content: string;
  // Ponto de ancoragem da linha na linha de base, no mundo (esquerda, centro ou direita conforme o alinhamento).
  origin: Point2D;
}>;

export type TextLayout = Readonly<{
  lines: ReadonlyArray<TextLineLayout>;
  // Cantos do retângulo envolvente rotacionado, no mundo, em ordem.
  corners: Readonly<[Point2D, Point2D, Point2D, Point2D]>;
  direction: Vector2D;
  up: Vector2D;
  width: number;
  blockHeight: number;
}>;

// Largura média de um caractere em relação ao tamanho da fonte (estimativa conservadora para fontes sans-serif).
export const TEXT_CHAR_WIDTH_RATIO = 0.6;
// Parte do em acima da linha de base (ascendente) e abaixo dela (descendente).
export const TEXT_ASCENT_RATIO = 0.8;
export const TEXT_DESCENT_RATIO = 0.2;
// Distância entre linhas de base consecutivas em relação ao tamanho da fonte.
export const TEXT_LINE_SPACING_RATIO = 1.4;

// A função separa o conteúdo em linhas, aceitando quebras \n e \r\n.
export function splitTextLines(content: string): ReadonlyArray<string> {
  return content.split(/\r?\n/);
}

// A função estima a largura de uma linha pela quantidade de caracteres (code points, não unidades UTF-16).
export function estimateTextLineWidth(line: string, height: number): number {
  return Array.from(line).length * TEXT_CHAR_WIDTH_RATIO * height;
}

// Vetores da linha de base (direção de leitura) e do "para cima" do texto no mundo (Y cresce para baixo).
export function textAxes(rotation = 0): Readonly<{ direction: Vector2D; up: Vector2D }> {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return {
    direction: { x: cos, y: sin },
    up: { x: sin, y: -cos }
  };
}

// Deslocamento, no mundo, de uma linha de base para a próxima (abaixo), usado para continuar o texto na linha seguinte.
export function textLineAdvance(height: number, rotation = 0): Vector2D {
  const { up } = textAxes(rotation);
  const spacing = TEXT_LINE_SPACING_RATIO * height;

  return { x: -up.x * spacing, y: -up.y * spacing };
}

/**
 * A função monta o layout do texto: a origem de cada linha na linha de base e o retângulo envolvente
 * rotacionado. No sistema local, x segue a direção de leitura e y aponta para "cima" do texto.
 */
export function textLayout(text: TextGeometry): TextLayout {
  const height = text.height;
  const lines = splitTextLines(text.content);
  const lineCount = lines.length;
  const spacing = TEXT_LINE_SPACING_RATIO * height;
  const blockHeight = (lineCount - 1) * spacing + (TEXT_ASCENT_RATIO + TEXT_DESCENT_RATIO) * height;
  // Uma linha vazia ainda ocupa a largura de um caractere, para o texto continuar selecionável.
  const width = Math.max(
    TEXT_CHAR_WIDTH_RATIO * height,
    ...lines.map((line) => estimateTextLineWidth(line, height))
  );

  const firstBaseline = firstBaselineOffset(text.verticalAlign ?? "baseline", lineCount, spacing, height, blockHeight);
  const [minX, maxX] = horizontalExtent(text.horizontalAlign ?? "left", width);
  const maxY = firstBaseline + TEXT_ASCENT_RATIO * height;
  const minY = maxY - blockHeight;
  const { direction, up } = textAxes(text.rotation ?? 0);

  const toWorld = (x: number, y: number): Point2D => ({
    x: text.position.x + x * direction.x + y * up.x,
    y: text.position.y + x * direction.y + y * up.y
  });

  return {
    lines: lines.map((content, index) => ({ content, origin: toWorld(0, firstBaseline - index * spacing) })),
    corners: [toWorld(minX, minY), toWorld(maxX, minY), toWorld(maxX, maxY), toWorld(minX, maxY)],
    direction,
    up,
    width,
    blockHeight
  };
}

export function textBoundingBox(text: TextGeometry): BoundingBox {
  const { corners } = textLayout(text);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

/**
 * A função mede a distância do ponto ao retângulo do texto: zero quando o ponto está dentro,
 * o que permite selecionar o texto clicando sobre as letras, e não apenas no contorno.
 */
export function distancePointToText(point: Point2D, text: TextGeometry): number {
  const layout = textLayout(text);
  const origin = layout.corners[0];
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  // Coordenadas locais relativas ao canto inferior esquerdo do bloco.
  const localX = dx * layout.direction.x + dy * layout.direction.y;
  const localY = dx * layout.up.x + dy * layout.up.y;
  const outsideX = Math.max(-localX, 0, localX - layout.width);
  const outsideY = Math.max(-localY, 0, localY - layout.blockHeight);

  return Math.hypot(outsideX, outsideY);
}

function firstBaselineOffset(
  align: TextVerticalAlign,
  lineCount: number,
  spacing: number,
  height: number,
  blockHeight: number
): number {
  if (align === "top") {
    // O topo (ascendente) da primeira linha fica no ponto de inserção.
    return -TEXT_ASCENT_RATIO * height;
  }

  if (align === "middle") {
    // O centro do bloco inteiro fica no ponto de inserção.
    return blockHeight / 2 - TEXT_ASCENT_RATIO * height;
  }

  if (align === "bottom") {
    // A base (descendente) da última linha fica no ponto de inserção.
    return (lineCount - 1) * spacing + TEXT_DESCENT_RATIO * height;
  }

  // Padrão AutoCAD: a linha de base da primeira linha passa pelo ponto de inserção.
  return 0;
}

function horizontalExtent(align: TextHorizontalAlign, width: number): Readonly<[number, number]> {
  if (align === "center") {
    return [-width / 2, width / 2];
  }

  if (align === "right") {
    return [-width, 0];
  }

  return [0, width];
}
