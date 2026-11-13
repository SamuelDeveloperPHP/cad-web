import { resolveDimensionStyle, type CadDocument, type DimensionEntity, type TextEntity } from "@cad-web/cad-core";
import { estimateTextLineWidth, textLayout, buildLinearDimensionGeometry, buildAlignedDimensionGeometry, buildRadiusDimensionGeometry, buildDiameterDimensionGeometry, buildAngularDimensionGeometry, type Point2D } from "@cad-web/cad-geometry";
import { worldToScreen } from "./viewport";
import type { Viewport } from "./types";

// Abaixo desta altura de fonte em pixels o texto da cota é omitido: ficaria ilegível e a medição/desenho é cara.
export const LOD_DIMENSION_TEXT_MIN_PX = 5;
// Abaixo desta altura de fonte em pixels a entidade de texto é desenhada como traços (greeking).
export const LOD_TEXT_MIN_PX = 4;
// Fonte padrão do texto, a mesma do texto de cota.
export const DEFAULT_TEXT_FONT = "Arial, sans-serif";

/**
 * Desenha uma cota com o estado de traço (cor, espessura e tracejado) já configurado no contexto pelo chamador.
 * A cota é um desenho composto (linhas de extensão, guia, terminadores e texto) e por isso não entra nos lotes de traço.
 */
export function renderDimensionEntity(
  context: CanvasRenderingContext2D,
  document: CadDocument,
  entity: DimensionEntity,
  viewport: Viewport
): void {
  const resolvedStyle = resolveDimensionStyle(document, entity as any);

  // A cota usa a cor sobrescrita quando o estilo a define.
  if (resolvedStyle.lineColor) {
    context.strokeStyle = resolvedStyle.lineColor;
  } else if (resolvedStyle.color) {
    context.strokeStyle = resolvedStyle.color;
  }

  const defaultStyle = {
    textHeight: resolvedStyle.textHeight ?? 12,
    arrowSize: resolvedStyle.arrowSize ?? 6,
    extensionOffset: resolvedStyle.extensionOffset ?? 2,
    extensionOvershoot: resolvedStyle.extensionOvershoot ?? 3,
    precision: resolvedStyle.precision ?? 2,
    unitSuffix: resolvedStyle.unitSuffix ?? " mm",
    arrowType: resolvedStyle.arrowType ?? "tick",
  };

  let geom: any;
  if (entity.dimensionType === "linear") {
    geom = buildLinearDimensionGeometry(entity.definition as any, defaultStyle, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "aligned") {
    geom = buildAlignedDimensionGeometry(entity.definition as any, defaultStyle, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "radius") {
    geom = buildRadiusDimensionGeometry(entity.definition as any, defaultStyle, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "diameter") {
    geom = buildDiameterDimensionGeometry(entity.definition as any, defaultStyle, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "angular") {
    geom = buildAngularDimensionGeometry(entity.definition as any, defaultStyle);
  }

  // O renderizador desenha linhas de extensao quando a geometria as fornece.
  if (geom.extensionLine1 && geom.extensionLine2) {
    const ext1Start = worldToScreen(geom.extensionLine1.start, viewport);
    const ext1End = worldToScreen(geom.extensionLine1.end, viewport);
    const ext2Start = worldToScreen(geom.extensionLine2.start, viewport);
    const ext2End = worldToScreen(geom.extensionLine2.end, viewport);

    context.beginPath();
    context.moveTo(ext1Start.x, ext1Start.y);
    context.lineTo(ext1End.x, ext1End.y);
    context.moveTo(ext2Start.x, ext2Start.y);
    context.lineTo(ext2End.x, ext2End.y);
    context.stroke();
  }

  // O renderizador desenha a linha guia quando a geometria a fornece.
  if (geom.leaderLine) {
    const leaderStart = worldToScreen(geom.leaderLine.start, viewport);
    const leaderEnd = worldToScreen(geom.leaderLine.end, viewport);
    
    context.beginPath();
    context.moveTo(leaderStart.x, leaderStart.y);
    context.lineTo(leaderEnd.x, leaderEnd.y);
    context.stroke();
  }

  let dimStart: any;
  let dimEnd: any;

  // O renderizador desenha a linha de cota ou o arco angular.
  if (entity.dimensionType === "angular") {
    const center = worldToScreen(geom.arcCenter, viewport);
    const radius = geom.radius * viewport.scale;
    context.beginPath();
    // O Canvas recebe angulos em radianos no sistema visual atual.
    context.arc(center.x, center.y, radius, -geom.startAngle, -geom.endAngle, geom.sweepFlag === 0);
    context.stroke();
    
    dimStart = worldToScreen(geom.arcStart, viewport);
    dimEnd = worldToScreen(geom.arcEnd, viewport);
  } else {
    dimStart = worldToScreen(geom.dimensionLine.start, viewport);
    dimEnd = worldToScreen(geom.dimensionLine.end, viewport);
    
    context.beginPath();
    context.moveTo(dimStart.x, dimStart.y);
    context.lineTo(dimEnd.x, dimEnd.y);
    context.stroke();
  }

  const tickSizeScreen = defaultStyle.arrowSize * viewport.scale;

  if (defaultStyle.arrowType === "tick") {
    // O renderizador desenha marcas arquitetonicas em 45 graus nas extremidades.
    const tickDx = tickSizeScreen * 0.5;
    const tickDy = tickSizeScreen * 0.5;

    context.beginPath();
    if (entity.dimensionType !== "radius") {
      context.moveTo(dimStart.x - tickDx, dimStart.y + tickDy);
      context.lineTo(dimStart.x + tickDx, dimStart.y - tickDy);
    }
    context.moveTo(dimEnd.x - tickDx, dimEnd.y + tickDy);
    context.lineTo(dimEnd.x + tickDx, dimEnd.y - tickDy);
    // As marcas usam traco levemente mais espesso.
    const oldLineWidth = context.lineWidth;
    context.lineWidth = oldLineWidth * 1.5;
    context.stroke();
    context.lineWidth = oldLineWidth;
  } else if (defaultStyle.arrowType !== "none") {
    // Seta cheia, seta aberta ou ponto: o terminador aponta para a extremidade, vindo do lado oposto.
    const arrowType = defaultStyle.arrowType;
    const drawTerminator = (point: Point2D, opposite: Point2D) => {
      drawDimensionTerminator(context, arrowType, point, opposite, tickSizeScreen);
    };

    if (entity.dimensionType === "radius") {
      drawTerminator(dimEnd, dimStart);
    } else {
      drawTerminator(dimStart, dimEnd);
      drawTerminator(dimEnd, dimStart);
    }
  }

  // O renderizador desenha o texto da cota, omitindo-o quando ficaria pequeno demais para ser legível (LOD).
  const fontSizeScreen = defaultStyle.textHeight * viewport.scale;

  if (fontSizeScreen >= LOD_DIMENSION_TEXT_MIN_PX) {
    const textPos = worldToScreen(geom.textPosition, viewport);
    const textVal = entity.textOverride || geom.formattedText;

    context.save();
    context.translate(textPos.x, textPos.y);
    context.rotate(geom.textRotation);

    context.font = `${fontSizeScreen}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";

    // O fundo do texto preserva legibilidade sem ocultar demais o desenho.
    const textMetrics = context.measureText(textVal);
    const textWidth = textMetrics.width;
    const padding = fontSizeScreen * 0.1; // O padding reduzido evita excesso de mascara.

    context.fillStyle = "rgba(17, 19, 21, 0.85)"; // A opacidade reduzida mantem o fundo discreto.
    context.fillRect(-textWidth/2 - padding, -fontSizeScreen/2 - padding, textWidth + padding*2, fontSizeScreen + padding*2);

    context.fillStyle = resolvedStyle.textColor || context.strokeStyle;
    context.fillText(textVal, 0, 0);

    context.restore();
  }
}

/**
 * Desenha um terminador de cota (seta cheia, seta aberta ou ponto) na extremidade point, com o corpo
 * voltado para opposite. As medidas estão em pixels de tela.
 */
function drawDimensionTerminator(
  context: CanvasRenderingContext2D,
  arrowType: "arrow" | "open" | "dot",
  point: Point2D,
  opposite: Point2D,
  sizeScreen: number
): void {
  if (arrowType === "dot") {
    context.beginPath();
    context.arc(point.x, point.y, sizeScreen * 0.25, 0, Math.PI * 2);
    context.fillStyle = context.strokeStyle;
    context.fill();
    return;
  }

  const dirX = opposite.x - point.x;
  const dirY = opposite.y - point.y;
  const len = Math.hypot(dirX, dirY);
  if (len === 0) return;
  const nx = dirX / len;
  const ny = dirY / len;
  const arrowLen = sizeScreen;
  const arrowWidth = sizeScreen * 0.3;
  const left = { x: point.x + nx * arrowLen - ny * arrowWidth, y: point.y + ny * arrowLen + nx * arrowWidth };
  const right = { x: point.x + nx * arrowLen + ny * arrowWidth, y: point.y + ny * arrowLen - nx * arrowWidth };

  context.beginPath();
  context.moveTo(left.x, left.y);
  context.lineTo(point.x, point.y);
  context.lineTo(right.x, right.y);

  if (arrowType === "arrow") {
    context.closePath();
    context.fillStyle = context.strokeStyle;
    context.fill();
  } else {
    // A seta aberta é só o contorno em "V", sem preenchimento.
    context.stroke();
  }
}

// Famílias genéricas do CSS não levam aspas; nomes de fonte com espaço precisam delas.
const GENERIC_FONT_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);

export function cssFontFamily(fontFamily: string | undefined): string {
  const name = (fontFamily ?? "").trim();

  if (name === "") {
    return DEFAULT_TEXT_FONT;
  }

  if (GENERIC_FONT_FAMILIES.has(name.toLowerCase())) {
    return name;
  }

  return `"${name.replace(/["\\]/g, "")}", sans-serif`;
}

/**
 * Acrescenta ao caminho atual os traços do texto pequeno demais para ser legível ("greeking"): uma linha na altura
 * média de cada linha de texto. O chamador define cor e espessura e traça o caminho (em lote com outros textos).
 */
export function appendTextGreekingPath(context: CanvasRenderingContext2D, entity: TextEntity, viewport: Viewport): void {
  const layout = textLayout(entity);
  const align = entity.horizontalAlign ?? "left";

  for (const line of layout.lines) {
    const width = estimateTextLineWidth(line.content, entity.height);
    if (width <= 0) continue;
    const startOffset = align === "center" ? -width / 2 : align === "right" ? -width : 0;
    // A linha média fica a ~0,35 da altura acima da linha de base.
    const lift = entity.height * 0.35;
    const start = {
      x: line.origin.x + layout.direction.x * startOffset + layout.up.x * lift,
      y: line.origin.y + layout.direction.y * startOffset + layout.up.y * lift
    };
    const end = { x: start.x + layout.direction.x * width, y: start.y + layout.direction.y * width };
    const startScreen = worldToScreen(start, viewport);
    const endScreen = worldToScreen(end, viewport);
    context.moveTo(startScreen.x, startScreen.y);
    context.lineTo(endScreen.x, endScreen.y);
  }
}

/**
 * Desenha uma entidade de texto usando o layout do kernel (origem de cada linha na linha de base e
 * alinhamento), de modo que ancoragem, envoltório e hit-test coincidam com o que aparece na tela.
 * Abaixo de LOD_TEXT_MIN_PX o texto vira traços na linha média ("greeking"), mais barato e ainda
 * indicando onde há texto.
 */
export function renderTextEntity(context: CanvasRenderingContext2D, entity: TextEntity, viewport: Viewport): void {
  const layout = textLayout(entity);
  const fontSizeScreen = entity.height * viewport.scale;
  const rotation = entity.rotation ?? 0;
  const align = entity.horizontalAlign ?? "left";

  context.save();
  context.setLineDash([]);
  context.fillStyle = context.strokeStyle;

  if (fontSizeScreen < LOD_TEXT_MIN_PX) {
    context.lineWidth = 1;
    context.beginPath();
    appendTextGreekingPath(context, entity, viewport);
    context.stroke();
    context.restore();
    return;
  }

  const style = `${entity.italic === true ? "italic " : ""}${entity.bold === true ? "bold " : ""}`;
  context.font = `${style}${fontSizeScreen}px ${cssFontFamily(entity.fontFamily)}`;
  context.textAlign = align;
  context.textBaseline = "alphabetic";

  for (const line of layout.lines) {
    if (line.content === "") continue;
    const origin = worldToScreen(line.origin, viewport);
    context.save();
    context.translate(origin.x, origin.y);
    // O mundo não é espelhado na tela (Y para baixo em ambos), então a rotação é aplicada sem inverter o sinal.
    if (rotation !== 0) context.rotate(rotation);
    context.fillText(line.content, 0, 0);
    context.restore();
  }

  context.restore();
}
