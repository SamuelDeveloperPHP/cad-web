import type { CadDocument } from "@cad-web/cad-core";
import { clearCanvasLayer } from "./canvas";
import { renderDocument2D } from "./entities";
import { computeAdaptiveGrid, renderGrid2D } from "./grid";
import type { CanvasLayerState, RenderStyle, ScreenSize, Viewport } from "./types";

export type CanvasRendererLayers = Readonly<{
  base: CanvasLayerState;
  entities: CanvasLayerState;
  preview?: CanvasLayerState;
  interaction?: CanvasLayerState;
}>;

export type RenderFrameInput = Readonly<{
  document: CadDocument;
  viewport: Viewport;
  screenSize: ScreenSize;
  layers: CanvasRendererLayers;
  style?: RenderStyle;
}>;

export function renderFrame2D(input: RenderFrameInput): void {
  const grid = computeAdaptiveGrid(input.viewport, input.screenSize);

  clearCanvasLayer(input.layers.base, input.screenSize);
  clearCanvasLayer(input.layers.entities, input.screenSize);

  // O renderer separa grid e entidades para permitir cache estatico no futuro.
  renderGrid2D(input.layers.base.context, input.viewport, input.screenSize, grid);
  renderDocument2D(input.layers.entities.context, input.document, input.viewport, input.style);
}
