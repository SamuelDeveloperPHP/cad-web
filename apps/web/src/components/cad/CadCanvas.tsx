import type { Point2D } from "@cad-web/cad-geometry";
import { distancePointToSegment } from "@cad-web/cad-geometry";
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
    renderLinePreview(context, cad);
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

    if (cad.activeTool === "line") {
      cad.handleLineClick(worldPoint);
      return;
    }

    if (cad.activeTool === "select") {
      cad.selectEntity(findNearestLineId(worldPoint, cad));
    }
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

    if (cad.activeTool === "line") {
      cad.setLinePreview(worldPoint);
    }
  };

  return (
    <div ref={hostRef} className="cad-canvas-host">
      <canvas
        ref={canvasRef}
        className="cad-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          panStateRef.current = null;
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

function findNearestLineId(worldPoint: Point2D, cad: CadStore): string | null {
  const toleranceWorld = 8 / cad.viewport.scale;
  let nearestId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity of cad.document.entities) {
    if (entity.type !== "line") {
      continue;
    }

    const candidateDistance = distancePointToSegment(worldPoint, entity.start, entity.end);

    if (candidateDistance <= toleranceWorld && candidateDistance < nearestDistance) {
      nearestDistance = candidateDistance;
      nearestId = entity.id;
    }
  }

  return nearestId;
}

function renderSelectedEntities(context: CanvasRenderingContext2D, cad: CadStore): void {
  context.save();
  context.strokeStyle = "#22c55e";
  context.lineWidth = 2;

  for (const entity of cad.document.entities) {
    if (entity.type !== "line" || !cad.selectedEntityIds.includes(entity.id)) {
      continue;
    }

    const start = worldToScreen(entity.start, cad.viewport);
    const end = worldToScreen(entity.end, cad.viewport);

    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  context.restore();
}

function renderLinePreview(context: CanvasRenderingContext2D, cad: CadStore): void {
  if (cad.lineDraft === null) {
    return;
  }

  const start = worldToScreen(cad.lineDraft.start, cad.viewport);
  const end = worldToScreen(cad.lineDraft.current, cad.viewport);

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
