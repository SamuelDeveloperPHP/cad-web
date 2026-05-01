import type { CanvasLayerId, CanvasLayerState, ScreenSize } from "./types";

export function configureCanvasForDevicePixelRatio(
  canvas: HTMLCanvasElement,
  cssSize: ScreenSize,
  devicePixelRatio = globalThis.devicePixelRatio || 1
): CanvasRenderingContext2D {
  const context = getCanvas2DContext(canvas);

  canvas.width = Math.max(1, Math.floor(cssSize.width * devicePixelRatio));
  canvas.height = Math.max(1, Math.floor(cssSize.height * devicePixelRatio));
  canvas.style.width = `${cssSize.width}px`;
  canvas.style.height = `${cssSize.height}px`;

  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  return context;
}

export function createCanvasLayer(id: CanvasLayerId, canvas: HTMLCanvasElement): CanvasLayerState {
  return {
    id,
    canvas,
    context: getCanvas2DContext(canvas),
    visible: true
  };
}

export function clearCanvasLayer(layer: CanvasLayerState, screenSize: ScreenSize): void {
  layer.context.clearRect(0, 0, screenSize.width, screenSize.height);
}

function getCanvas2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("CanvasRenderingContext2D is not available.");
  }

  return context;
}
