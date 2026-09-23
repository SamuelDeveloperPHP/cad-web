import { entityBoundingBox, getDocumentSpatialIndex, resolveDimensionStyle, type CadDocument, type TextEntity } from "@cad-web/cad-core";
import { estimateTextLineWidth, textLayout, rotationMatrix, transformPoint, ellipseArcPoints, buildLinearDimensionGeometry, buildAlignedDimensionGeometry, buildRadiusDimensionGeometry, buildDiameterDimensionGeometry, buildAngularDimensionGeometry, type Point2D } from "@cad-web/cad-geometry";
import { screenToWorld, worldToScreen } from "./viewport";
import { DEFAULT_RENDER_STYLE, type RenderStyle, type Viewport } from "./types";

// Abaixo deste tamanho em pixels a entidade é colapsada em um ponto (LOD), poupando a montagem da geometria.
const LOD_DOT_THRESHOLD_PX = 1.5;
// Abaixo desta altura de fonte em pixels o texto da cota é omitido: ficaria ilegível e a medição/desenho é cara.
const LOD_DIMENSION_TEXT_MIN_PX = 5;
// Abaixo desta altura de fonte em pixels a entidade de texto é desenhada como traços (greeking).
const LOD_TEXT_MIN_PX = 4;
// Fonte padrão do texto, a mesma do texto de cota.
export const DEFAULT_TEXT_FONT = "Arial, sans-serif";

export type RenderStats = {
  visibleEntities: number;
  renderedEntities: number;
  totalEntities: number;
  indexQueryTimeMs: number;
  renderTimeMs: number;
};

export function renderDocument2D(
  context: CanvasRenderingContext2D,
  document: CadDocument,
  viewport: Viewport,
  style: RenderStyle = DEFAULT_RENDER_STYLE
): RenderStats {
  const renderStartTime = performance.now();
  context.save();
  applyStrokeStyle(context, style);

  const canvasWidth = context.canvas.width;
  const canvasHeight = context.canvas.height;
  
  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
  const bottomRight = screenToWorld({ x: canvasWidth, y: canvasHeight }, viewport);
  
  const viewportBounds = {
    minX: topLeft.x,
    minY: topLeft.y,
    maxX: bottomRight.x,
    maxY: bottomRight.y
  };

  const indexStartTime = performance.now();
  const spatialIndex = getDocumentSpatialIndex(document);
  const visibleEntities = spatialIndex.query(viewportBounds);
  const indexQueryTimeMs = performance.now() - indexStartTime;
  let renderedEntities = 0;

  const layerMap = new Map(document.layers.map(l => [l.id, l]));

  for (const entity of visibleEntities) {
    const layer = layerMap.get(entity.layerId || "layer_0");
    if (layer && !layer.visible) continue;

    // LOD: entidades que ocupam menos de ~1.5px são desenhadas como um ponto, sem montar a geometria completa.
    // Como o envoltório já foi calculado (e cacheado) no culling, esta verificação é praticamente gratuita.
    const bounds = entityBoundingBox(entity);
    const screenExtent = Math.max(
      (bounds.maxX - bounds.minX) * viewport.scale,
      (bounds.maxY - bounds.minY) * viewport.scale
    );

    if (screenExtent < LOD_DOT_THRESHOLD_PX) {
      const centerScreen = worldToScreen(
        { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
        viewport
      );
      context.fillStyle =
        style.overrideStroke === true
          ? style.strokeColor
          : entity.color || layer?.color || style.strokeColor;
      context.fillRect(centerScreen.x, centerScreen.y, 1, 1);
      renderedEntities += 1;
      continue;
    }

    if (style.overrideStroke === true) {
      // O modo de destaque força cor, espessura e tracejado do estilo, ignorando os da entidade.
      context.strokeStyle = style.strokeColor;
      context.lineWidth = style.lineWidth;
      context.setLineDash(style.lineDash !== undefined ? [...style.lineDash] : []);
    } else {
      context.strokeStyle = entity.color || layer?.color || style.strokeColor;
      context.lineWidth = entity.lineThickness !== undefined ? entity.lineThickness : style.lineWidth;

      if (entity.lineType === "dashed") {
        context.setLineDash([8, 6]);
      } else if (entity.lineType === "dotted") {
        context.setLineDash([2, 4]);
      } else {
        context.setLineDash([]);
      }
    }
    if (entity.type === "line") {
      const start = worldToScreen(entity.start, viewport);
      const end = worldToScreen(entity.end, viewport);

      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    } else if (entity.type === "rectangle") {
      let p1: Point2D = { x: entity.x, y: entity.y };
      let p2: Point2D = { x: entity.x + entity.width, y: entity.y };
      let p3: Point2D = { x: entity.x + entity.width, y: entity.y + entity.height };
      let p4: Point2D = { x: entity.x, y: entity.y + entity.height };

      if (entity.rotation) {
        const matrix = rotationMatrix(entity.rotation, p1);
        p1 = transformPoint(p1, matrix);
        p2 = transformPoint(p2, matrix);
        p3 = transformPoint(p3, matrix);
        p4 = transformPoint(p4, matrix);
      }

      const sp1 = worldToScreen(p1, viewport);
      const sp2 = worldToScreen(p2, viewport);
      const sp3 = worldToScreen(p3, viewport);
      const sp4 = worldToScreen(p4, viewport);

      context.beginPath();
      context.moveTo(sp1.x, sp1.y);
      context.lineTo(sp2.x, sp2.y);
      context.lineTo(sp3.x, sp3.y);
      context.lineTo(sp4.x, sp4.y);
      context.closePath();
      context.stroke();
    } else if (entity.type === "circle") {
      const center = worldToScreen(entity.center, viewport);
      const radiusScreen = entity.radius * viewport.scale;

      context.beginPath();
      context.arc(center.x, center.y, radiusScreen, 0, Math.PI * 2);
      context.stroke();
    } else if (entity.type === "arc") {
      const center = worldToScreen(entity.center, viewport);
      const radiusScreen = entity.radius * viewport.scale;

      context.beginPath();
      context.arc(center.x, center.y, radiusScreen, entity.startAngle, entity.endAngle, !entity.clockwise);
      context.stroke();
    } else if (entity.type === "ellipse") {
      const isArc = entity.startAngle !== undefined && entity.endAngle !== undefined;

      if (isArc) {
        // O arco de elipse é traçado por amostragem, o que mantém render, envoltório e hit-test coerentes.
        const points = ellipseArcPoints(
          {
            type: "ellipse",
            center: entity.center,
            radiusX: entity.radiusX,
            radiusY: entity.radiusY,
            rotation: entity.rotation,
            startAngle: entity.startAngle,
            endAngle: entity.endAngle
          },
          Math.max(48, Math.ceil(Math.max(entity.radiusX, entity.radiusY) * viewport.scale))
        );

        context.beginPath();
        points.forEach((point, index) => {
          const screenPoint = worldToScreen(point, viewport);
          if (index === 0) {
            context.moveTo(screenPoint.x, screenPoint.y);
          } else {
            context.lineTo(screenPoint.x, screenPoint.y);
          }
        });
        context.stroke();
      } else {
        // A elipse completa usa a API nativa do Canvas; a escala converte os semi-eixos para pixels.
        // Como worldToScreen não espelha os eixos, a rotação é aplicada sem inverter o sinal.
        const center = worldToScreen(entity.center, viewport);
        const radiusXScreen = entity.radiusX * viewport.scale;
        const radiusYScreen = entity.radiusY * viewport.scale;

        context.beginPath();
        context.ellipse(center.x, center.y, radiusXScreen, radiusYScreen, entity.rotation, 0, Math.PI * 2);
        context.stroke();
      }
    } else if (entity.type === "polyline") {
      // O renderer percorre os vertices em ordem; quando closed o path fecha do ultimo ao primeiro.
      if (entity.points.length >= 2) {
        const firstPoint = entity.points[0];
        if (firstPoint !== undefined) {
          context.beginPath();
          const start = worldToScreen(firstPoint, viewport);
          context.moveTo(start.x, start.y);

          for (let index = 1; index < entity.points.length; index += 1) {
            const vertex = entity.points[index];
            if (vertex === undefined) {
              continue;
            }
            const screenPoint = worldToScreen(vertex, viewport);
            context.lineTo(screenPoint.x, screenPoint.y);
          }

          if (entity.closed) {
            context.closePath();
          }

          context.stroke();
        }
      }
    } else if (entity.type === "dimension") {
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
    } else if (entity.type === "text") {
      renderTextEntity(context, entity, viewport);
    }
    renderedEntities += 1;
  }

  context.restore();

  return {
    visibleEntities: visibleEntities.length,
    renderedEntities,
    totalEntities: document.entities.length,
    indexQueryTimeMs,
    renderTimeMs: performance.now() - renderStartTime
  };
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
 * Desenha uma entidade de texto usando o layout do kernel (origem de cada linha na linha de base e
 * alinhamento), de modo que ancoragem, envoltório e hit-test coincidam com o que aparece na tela.
 * Abaixo de LOD_TEXT_MIN_PX o texto vira traços na linha média ("greeking"), mais barato e ainda
 * indicando onde há texto.
 */
function renderTextEntity(context: CanvasRenderingContext2D, entity: TextEntity, viewport: Viewport): void {
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

function applyStrokeStyle(context: CanvasRenderingContext2D, style: RenderStyle): void {
  context.strokeStyle = style.strokeColor;
  context.lineWidth = style.lineWidth;
}
