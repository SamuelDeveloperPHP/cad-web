import type { BoundingBox, Point2D } from "@cad-web/cad-geometry";

export type ScreenSize = Readonly<{
  width: number;
  height: number;
}>;

export type Viewport = Readonly<{
  origin: Point2D;
  scale: number;
}>;

export type Viewport2D = Viewport;

export type CanvasLayerId = "base" | "entities" | "preview" | "interaction";

export type CanvasLayerState = Readonly<{
  id: CanvasLayerId;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  visible: boolean;
}>;

export type RendererBackend = "canvas2d" | "webgl" | "webgpu";

export type RendererCapabilities = Readonly<{
  backend: RendererBackend;
  supportsStaticLayerCache: boolean;
  supportsWorkerRendering: boolean;
  supportsGpuBatching: boolean;
}>;

export type RenderStyle = Readonly<{
  strokeColor: string;
  fillColor?: string;
  lineWidth: number;
  selectedStrokeColor: string;
  previewStrokeColor: string;
}>;

export type GridLine = Readonly<{
  orientation: "vertical" | "horizontal";
  worldCoordinate: number;
  major: boolean;
}>;

export type AdaptiveGrid = Readonly<{
  minorStep: number;
  majorStep: number;
  lines: ReadonlyArray<GridLine>;
}>;

export type ZoomExtentsOptions = Readonly<{
  bounds: BoundingBox;
  screenSize: ScreenSize;
  paddingPixels: number;
}>;

export const DEFAULT_RENDER_STYLE: RenderStyle = {
  strokeColor: "#d1d5db",
  lineWidth: 1,
  selectedStrokeColor: "#38bdf8",
  previewStrokeColor: "#f59e0b"
};
