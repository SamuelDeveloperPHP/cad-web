import type { Point2D } from "@cad-web/cad-geometry";
import {
  configureCanvasForDevicePixelRatio,
  renderDocument2D,
  renderGrid2D,
  screenToWorld,
  worldToScreen,
  zoomViewportAtScreenPoint
} from "@cad-web/cad-renderer";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { CadStore } from "../../state/useCadStore";
import { createToolPointerEvent } from "../../tools/toolEvents";

type CadCanvasProps = Readonly<{
  cad: CadStore;
}>;

export function CadCanvas({ cad }: CadCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<Readonly<{ active: boolean; lastScreen: Point2D }> | null>(null);
  const [screenSize, setScreenSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry === undefined) {
        return;
      }

      setScreenSize({
        width: Math.max(1, Math.floor(entry.contentRect.width)),
        height: Math.max(1, Math.floor(entry.contentRect.height))
      });
    });

    resizeObserver.observe(host);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    const context = configureCanvasForDevicePixelRatio(canvas, screenSize);
    context.clearRect(0, 0, screenSize.width, screenSize.height);
    renderGrid2D(context, cad.viewport, screenSize);
    renderDocument2D(context, cad.document, cad.viewport);
    renderSelectedEntities(context, cad);
    renderPreview(context, cad);
  }, [cad, screenSize]);

  const toScreenPoint = (event: ReactMouseEvent<HTMLCanvasElement>): Point2D => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const updateMouse = (screenPoint: Point2D) => {
    cad.setMouseWorld(screenToWorld(screenPoint, cad.viewport));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screenPoint = toScreenPoint(event);
    const worldPoint = screenToWorld(screenPoint, cad.viewport);
    updateMouse(screenPoint);

    if (event.button === 1 || cad.activeTool === "pan") {
      event.currentTarget.setPointerCapture(event.pointerId);
      panStateRef.current = { active: true, lastScreen: screenPoint };
      return;
    }

    cad.dispatchPointerDown(
      createToolPointerEvent({
        worldPoint,
        screenPoint,
        button: event.button,
        pointerId: event.pointerId,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey
      })
    );
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screenPoint = toScreenPoint(event);
    const worldPoint = screenToWorld(screenPoint, cad.viewport);
    updateMouse(screenPoint);

    if (panStateRef.current?.active === true) {
      const deltaScreen = {
        x: screenPoint.x - panStateRef.current.lastScreen.x,
        y: screenPoint.y - panStateRef.current.lastScreen.y
      };

      panStateRef.current = { active: true, lastScreen: screenPoint };
      cad.panByScreenDelta(deltaScreen);
      return;
    }

    cad.dispatchPointerMove(
      createToolPointerEvent({
        worldPoint,
        screenPoint,
        button: event.button,
        pointerId: event.pointerId,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey
      })
    );
  };

  return (
    <div ref={hostRef} className="cad-canvas-host">
      <canvas
        ref={canvasRef}
        className="cad-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          const screenPoint = toScreenPoint(event);
          const worldPoint = screenToWorld(screenPoint, cad.viewport);

          panStateRef.current = null;
          cad.dispatchPointerUp(
            createToolPointerEvent({
              worldPoint,
              screenPoint,
              button: event.button,
              pointerId: event.pointerId,
              shiftKey: event.shiftKey,
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              metaKey: event.metaKey
            })
          );
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onWheel={(event) => {
          event.preventDefault();
          const screenPoint = toScreenPoint(event);
          const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
          cad.setViewport(zoomViewportAtScreenPoint(cad.viewport, screenPoint, factor));
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}

function renderSelectedEntities(context: CanvasRenderingContext2D, cad: CadStore): void {
  const selectedEntities = cad.document.entities.filter((entity) => cad.selectedEntityIds.includes(entity.id));
  
  if (selectedEntities.length === 0) {
    return;
  }

  context.save();
  renderDocument2D(context, { ...cad.document, entities: selectedEntities }, cad.viewport, {
    strokeColor: "#22c55e",
    lineWidth: 2
  });
  context.restore();
}

function renderPreview(context: CanvasRenderingContext2D, cad: CadStore): void {
  if (cad.preview === null) {
    return;
  }

  if (cad.preview.type === "rubberBand") {
    renderRubberBandPreview(context, cad, cad.preview.from, cad.preview.to);
  }

  if (cad.preview.type === "ghostEntities") {
    renderGhostEntitiesPreview(context, cad, cad.preview.entities);
  }
}

function renderRubberBandPreview(
  context: CanvasRenderingContext2D,
  cad: CadStore,
  from: Point2D,
  to: Point2D
): void {
  const start = worldToScreen(from, cad.viewport);
  const end = worldToScreen(to, cad.viewport);

  context.save();
  context.strokeStyle = "#f59e0b";
  context.lineWidth = 1.5;
  context.setLineDash([8, 6]);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

function renderGhostEntitiesPreview(
  context: CanvasRenderingContext2D,
  cad: CadStore,
  entities: CadStore["document"]["entities"]
): void {
  if (entities.length === 0) {
    return;
  }

  context.save();
  context.globalAlpha = 0.65;
  context.setLineDash([10, 6]);
  
  renderDocument2D(context, { ...cad.document, entities }, cad.viewport, {
    strokeColor: "#f59e0b",
    lineWidth: 1.5
  });

  context.restore();
}
