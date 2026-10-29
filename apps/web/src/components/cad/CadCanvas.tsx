import { convertUnit, type Point2D } from "@cad-web/cad-geometry";
import {
  configureCanvasForDevicePixelRatio,
  DEFAULT_RENDER_STYLE,
  DocumentRenderJob,
  renderAngleArc2D,
  renderAxisLines2D,
  renderCursorGuides2D,
  renderDocument2D,
  renderDimensionGrips2D,
  renderGrid2D,
  renderSnapMarker2D,
  renderEntityGrips2D,
  screenToWorld,
  worldToScreen,
  zoomViewportAtScreenPoint,
  type ScreenSize
} from "@cad-web/cad-renderer";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { CadStore } from "../../state/useCadStore";
import { createToolPointerEvent } from "../../tools/toolEvents";
import { cadDiagnostics } from "../../diagnostics/CadDiagnosticsService";
import type { ToolMenuItem } from "@cad-web/cad-tools";
import type { CadEntity } from "@cad-web/cad-core";
import { CadContextMenu } from "./CadContextMenu";
import { ProgressiveLayer } from "./progressiveLayer";
import { DynamicInputOverlay } from "./DynamicInputOverlay";
import {
  buildDynamicSubmission,
  computeDynamicMetrics,
  dynamicFieldCount,
  dynamicInputModeForTool,
  type DynamicInputDraft
} from "./dynamicInput";

const EMPTY_DRAFT: DynamicInputDraft = ["", ""];

type CadCanvasProps = Readonly<{
  cad: CadStore;
}>;

export function CadCanvas({ cad }: CadCanvasProps) {
  // O render é dividido em dois canvases empilhados: a base estática (grade + documento) e o overlay
  // dinâmico (seleção, grips, preview e marcador de snap). Assim, mover o mouse ou desenhar um preview
  // redesenha apenas o overlay, sem repintar todo o documento — o gargalo do zoom aberto com muitas entidades.
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // A base (grade + documento) e o destaque da seleção são camadas progressivas: desenhadas em fatias de tempo
  // num buffer de trás e copiadas para o canvas visível só quando prontas.
  const baseLayerRef = useRef<ProgressiveLayer | null>(null);
  const selectionLayerRef = useRef<ProgressiveLayer | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<Readonly<{ active: boolean; lastScreen: Point2D }> | null>(null);
  // O retângulo do Zoom Window é mantido em estado para desenhar um overlay enquanto o usuário arrasta.
  const [zoomWindowBox, setZoomWindowBox] = useState<Readonly<{ start: Point2D; current: Point2D }> | null>(null);
  // Menu de contexto da ferramenta ativa (ex.: modos do grip), aberto com o botão direito.
  const [contextMenu, setContextMenu] = useState<Readonly<{ x: number; y: number; items: ReadonlyArray<ToolMenuItem> }> | null>(null);
  // O ref mantém o store atual acessível dentro de listeners nativos e callbacks de animação.
  const cadRef = useRef(cad);
  cadRef.current = cad;

  // A entrada dinâmica captura as teclas globalmente (o usuário digita sem clicar num campo); os rascunhos
  // dos dois campos e o campo ativo ficam neste estado, espelhado em refs para o listener de teclado.
  const [dynDraft, setDynDraft] = useState<DynamicInputDraft>(EMPTY_DRAFT);
  const [dynActiveField, setDynActiveField] = useState<0 | 1>(0);
  const dynDraftRef = useRef(dynDraft);
  dynDraftRef.current = dynDraft;
  const dynActiveFieldRef = useRef(dynActiveField);
  dynActiveFieldRef.current = dynActiveField;

  const [screenSize, setScreenSize] = useState<ScreenSize>({ width: 1, height: 1 });
  const screenSizeRef = useRef(screenSize);
  screenSizeRef.current = screenSize;

  // O identificador do frame pendente permite coalescer várias mudanças de estado em um único desenho por frame.
  const overlayFrameRef = useRef<number | null>(null);

  // Pede o desenho da base para o documento/viewport atuais (cancela o que estiver em andamento).
  const scheduleBaseDraw = useCallback(() => {
    const layer = baseLayerRef.current;

    if (layer === null) {
      return;
    }

    const store = cadRef.current;
    const screen = screenSizeRef.current;

    layer.request(store.viewport, (context) => {
      renderGrid2D(context, store.viewport, screen);
      return new DocumentRenderJob(context, store.document, store.viewport, DEFAULT_RENDER_STYLE, { screenSize: screen });
    });
  }, []);

  // Pede o desenho do destaque da seleção; só reage a documento, seleção e viewport (não ao movimento do mouse).
  const scheduleSelectionDraw = useCallback(() => {
    const layer = selectionLayerRef.current;

    if (layer === null) {
      return;
    }

    const store = cadRef.current;
    const screen = screenSizeRef.current;

    layer.request(store.viewport, (context) => {
      const selected = selectedEntitiesOf(store.document.entities, store.selectedEntityIds);

      if (selected.length === 0) {
        return null;
      }

      return new DocumentRenderJob(context, { ...store.document, entities: selected }, store.viewport, SELECTION_RENDER_STYLE, { screenSize: screen });
    });
  }, []);

  const scheduleOverlayDraw = useCallback(() => {
    if (overlayFrameRef.current !== null) {
      return;
    }

    overlayFrameRef.current = requestAnimationFrame(() => {
      overlayFrameRef.current = null;
      const canvas = overlayCanvasRef.current;
      if (canvas !== null) {
        drawOverlayLayer(canvas, cadRef.current, screenSizeRef.current);
      }
    });
  }, []);

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

  // O tamanho da tela é reportado ao store para que o zoom manual e o zoom extents saibam centralizar.
  useEffect(() => {
    cad.setScreenSize(screenSize);
  }, [cad, screenSize]);

  // As camadas progressivas existem enquanto o componente estiver montado; ao desmontar, o desenho em andamento é cancelado.
  useLayoutEffect(() => {
    const base = baseCanvasRef.current;
    const selection = selectionCanvasRef.current;

    if (base === null || selection === null) {
      return;
    }

    baseLayerRef.current = new ProgressiveLayer(base, (stats) => cadDiagnostics.reportFrame(stats));
    selectionLayerRef.current = new ProgressiveLayer(selection);

    return () => {
      baseLayerRef.current?.dispose();
      selectionLayerRef.current?.dispose();
      baseLayerRef.current = null;
      selectionLayerRef.current = null;
    };
  }, []);

  // Redimensionar os canvases (que zera o bitmap e reaplica a escala do DPR) só acontece quando o tamanho muda,
  // e não a cada frame; em seguida todas as camadas são redesenhadas.
  useEffect(() => {
    const overlay = overlayCanvasRef.current;

    baseLayerRef.current?.resize(screenSize);
    selectionLayerRef.current?.resize(screenSize);

    if (overlay !== null) {
      configureCanvasForDevicePixelRatio(overlay, screenSize);
    }

    scheduleBaseDraw();
    scheduleSelectionDraw();
    scheduleOverlayDraw();
  }, [screenSize, scheduleBaseDraw, scheduleSelectionDraw, scheduleOverlayDraw]);

  // A base é repintada apenas quando o documento ou o viewport mudam (edição, pan, zoom). O pedido é feito em
  // useLayoutEffect para a transformação CSS de acompanhamento valer já no quadro em que o viewport mudou.
  useLayoutEffect(() => {
    scheduleBaseDraw();
  }, [cad.document, cad.viewport, scheduleBaseDraw]);

  // O destaque da seleção também é uma camada em cache: não é redesenhado a cada movimento do mouse.
  useLayoutEffect(() => {
    scheduleSelectionDraw();
  }, [cad.document, cad.viewport, cad.selectedEntityIds, scheduleSelectionDraw]);

  // O overlay (mira, grips, preview, snap) é leve e repintado a cada interação.
  useEffect(() => {
    scheduleOverlayDraw();
  }, [
    cad.document,
    cad.viewport,
    cad.selectedEntityIds,
    cad.preview,
    cad.snapResult,
    // A mira do cursor segue o ponteiro, então o overlay precisa reagir ao movimento do mouse e às preferências de guias.
    cad.mouseWorld,
    cad.guideSettings,
    scheduleOverlayDraw
  ]);

  useEffect(() => {
    return () => {
      // Ao cancelar o frame pendente é essencial zerar o ref: caso contrário, num remonte
      // (por exemplo o duplo-mount do StrictMode em dev) o agendador veria um id não-nulo e
      // abortaria o agendamento para sempre, deixando o canvas em branco.
      if (overlayFrameRef.current !== null) {
        cancelAnimationFrame(overlayFrameRef.current);
        overlayFrameRef.current = null;
      }
    };
  }, []);

  // Ao sair do modo Zoom Window (por exemplo com Esc ou trocando de ferramenta), o retângulo em andamento é descartado.
  useEffect(() => {
    if (cad.activeTool !== "zoomWindow" && zoomWindowBox !== null) {
      setZoomWindowBox(null);
    }
  }, [cad.activeTool, zoomWindowBox]);

  // Sempre que o ponto de referência muda (novo segmento/vértice) ou a entrada dinâmica é desligada, os rascunhos
  // são limpos para o próximo ponto começar em branco.
  const dynamicInputActive = cad.guideSettings.dynamicInput && cad.activeToolReferencePoint !== null;
  useEffect(() => {
    setDynDraft(EMPTY_DRAFT);
    setDynActiveField(0);
  }, [cad.activeToolReferencePoint, dynamicInputActive]);

  // A entrada dinâmica captura as teclas na fase de captura, antes do encaminhamento à ferramenta, para o usuário
  // digitar distância/ângulo/raio direto sem precisar dar foco em nenhum campo (como no AutoCAD).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const store = cadRef.current;

      if (!(store.guideSettings.dynamicInput && store.activeToolReferencePoint !== null)) {
        return;
      }

      // Se o usuário está digitando num campo real (linha de comando), a entrada dinâmica não intercepta.
      const target = event.target as HTMLElement | null;
      if (target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      // Atalhos com modificadores (Ctrl+Z etc.) passam adiante sem interferência.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const mode = dynamicInputModeForTool(store.activeTool);
      const twoFields = dynamicFieldCount(mode) === 2;

      if (event.key === "Tab") {
        if (twoFields) {
          event.preventDefault();
          event.stopPropagation();
          setDynActiveField((current) => (current === 0 ? 1 : 0));
        }
        return;
      }

      if (event.key === "Enter") {
        const draft = dynDraftRef.current;
        const hasText = draft[0] !== "" || draft[1] !== "";

        // Sem texto digitado, o Enter segue para a ferramenta: finaliza a polyline ou confirma a linha no cursor.
        // Só interceptamos quando há valores digitados para aplicar.
        if (!hasText) {
          return;
        }

        const reference = store.activeToolReferencePoint;
        if (reference === null) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const unitScale = convertUnit(1, store.document.displayUnit || store.document.units, store.document.units);
        const metrics = computeDynamicMetrics(reference, store.mouseWorld, unitScale);
        const submission = buildDynamicSubmission(mode, draft, metrics);

        if (submission !== null) {
          store.runCommandLine(submission);
        }

        setDynDraft(EMPTY_DRAFT);
        setDynActiveField(0);
        return;
      }

      if (event.key === "Escape") {
        // Com texto digitado, o Esc só limpa; vazio, deixa o Esc encerrar o comando (tratado no CadEditor).
        if (dynDraftRef.current[0] !== "" || dynDraftRef.current[1] !== "") {
          event.preventDefault();
          event.stopPropagation();
          setDynDraft(EMPTY_DRAFT);
          setDynActiveField(0);
        }
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        setDynDraft((current) => updateDraftField(current, dynActiveFieldRef.current, (text) => text.slice(0, -1)));
        return;
      }

      // Caracteres imprimíveis aceitos nos campos numéricos: dígitos, ponto e sinal de menos.
      if (event.key.length === 1 && /[0-9.\-]/.test(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        setDynDraft((current) => updateDraftField(current, dynActiveFieldRef.current, (text) => text + event.key));
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  // O zoom pela roda usa um listener nativo não passivo; assim o preventDefault é aceito e não gera o aviso
  // "Unable to preventDefault inside passive event listener invocation" que o onWheel do React causa.
  useEffect(() => {
    const canvas = overlayCanvasRef.current;

    if (canvas === null) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const store = cadRef.current;
      store.setViewport(zoomViewportAtScreenPoint(store.viewport, screenPoint, factor));
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  const toScreenPoint = (event: ReactMouseEvent<HTMLCanvasElement>): Point2D => {
    const canvas = overlayCanvasRef.current;

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

    if (cad.activeTool === "zoomWindow" && event.button === 0) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setZoomWindowBox({ start: screenPoint, current: screenPoint });
      return;
    }

    if (event.button === 0) {
      event.currentTarget.setPointerCapture(event.pointerId);
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

    if (zoomWindowBox !== null) {
      setZoomWindowBox({ start: zoomWindowBox.start, current: screenPoint });
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
    <div ref={hostRef} className={`cad-canvas-host ${cad.activeTool === "zoomWindow" ? "zoom-window-mode" : ""}`}>
      <canvas ref={baseCanvasRef} className="cad-canvas cad-canvas-base" />
      <canvas ref={selectionCanvasRef} className="cad-canvas cad-canvas-selection" />
      <canvas
        ref={overlayCanvasRef}
        className="cad-canvas cad-canvas-overlay"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          const screenPoint = toScreenPoint(event);
          const worldPoint = screenToWorld(screenPoint, cad.viewport);

          panStateRef.current = null;

          if (zoomWindowBox !== null) {
            // Ao soltar, converte os dois cantos de tela em mundo e enquadra a região; depois volta ao Select.
            const cornerA = screenToWorld(zoomWindowBox.start, cad.viewport);
            const cornerB = screenToWorld(screenPoint, cad.viewport);
            setZoomWindowBox(null);
            cad.zoomToWindow({
              minX: Math.min(cornerA.x, cornerB.x),
              minY: Math.min(cornerA.y, cornerB.y),
              maxX: Math.max(cornerA.x, cornerB.x),
              maxY: Math.max(cornerA.y, cornerB.y)
            });
            cad.setActiveTool("select");

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            return;
          }

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
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          const items = cad.getActiveToolContextMenu();
          const host = hostRef.current;

          if (items === null || items.length === 0 || host === null) {
            setContextMenu(null);
            return;
          }

          const bounds = host.getBoundingClientRect();
          setContextMenu({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, items });
        }}
      />
      {contextMenu !== null && (
        <CadContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onSelect={(item) => {
            setContextMenu(null);
            cad.runCommandLine(item.command);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
      {zoomWindowBox !== null && (
        <div
          className="cad-zoom-window-rect"
          style={{
            left: Math.min(zoomWindowBox.start.x, zoomWindowBox.current.x),
            top: Math.min(zoomWindowBox.start.y, zoomWindowBox.current.y),
            width: Math.abs(zoomWindowBox.current.x - zoomWindowBox.start.x),
            height: Math.abs(zoomWindowBox.current.y - zoomWindowBox.start.y)
          }}
        />
      )}
      {dynamicInputActive && cad.activeToolReferencePoint !== null && (
        <DynamicInputOverlay
          mode={dynamicInputModeForTool(cad.activeTool)}
          referencePoint={cad.activeToolReferencePoint}
          cursorWorld={cad.mouseWorld}
          viewport={cad.viewport}
          draft={dynDraft}
          activeField={dynActiveField}
          unitScale={convertUnit(1, cad.document.displayUnit || cad.document.units, cad.document.units)}
          unitLabel={cad.document.displayUnit || cad.document.units}
        />
      )}
    </div>
  );
}

// A função devolve um novo par de rascunhos com o campo indicado transformado pela função dada.
function updateDraftField(
  draft: DynamicInputDraft,
  field: 0 | 1,
  transform: (text: string) => string
): DynamicInputDraft {
  if (field === 0) {
    return [transform(draft[0]), draft[1]];
  }

  return [draft[0], transform(draft[1])];
}

// A função desenha a camada de overlay: destaque de seleção, grips de cota, preview e marcador de snap ativo.
function drawOverlayLayer(canvas: HTMLCanvasElement, cad: CadStore, screenSize: ScreenSize): void {
  const context = canvas.getContext("2d");

  if (context === null) {
    return;
  }

  context.clearRect(0, 0, screenSize.width, screenSize.height);

  // As guias visuais ficam ao fundo do overlay, sob a seleção, o preview e o marcador de snap.
  if (cad.guideSettings.axisLines) {
    renderAxisLines2D(context, cad.viewport, screenSize);
  }

  if (cad.guideSettings.cursorGuides) {
    renderCursorGuides2D(context, worldToScreen(cad.mouseWorld, cad.viewport), screenSize);
  }

  renderDimensionGrips2D(context, cad.document, cad.selectedEntityIds, cad.viewport);
  // Os grips das entidades só são editáveis na ferramenta Select; nas demais ferramentas eles não aparecem.
  if (cad.activeTool === "select") {
    renderEntityGrips2D(context, cad.document, cad.selectedEntityIds, cad.viewport);
  }
  renderPreview(context, cad);
  renderActiveSnapMarker(context, cad);

  if (cad.guideSettings.dynamicInput && cad.activeToolReferencePoint !== null) {
    renderAngleArc2D(context, cad.activeToolReferencePoint, cad.mouseWorld, cad.viewport);
  }
}

// Estilo do destaque da seleção: verde tracejado, sobrescrevendo cor, espessura e tipo de linha das entidades.
const SELECTION_RENDER_STYLE = {
  strokeColor: "#22c55e",
  lineWidth: 2,
  overrideStroke: true,
  lineDash: [6, 4]
} as const;

// As entidades selecionadas, na ordem do documento, memoizadas pelos arrays de entrada. A identidade estável do
// resultado mantém o índice espacial da seleção em cache enquanto documento e seleção não mudam (pan e zoom).
let selectedCache: Readonly<{ entities: ReadonlyArray<CadEntity>; ids: ReadonlyArray<string>; result: ReadonlyArray<CadEntity> }> | null = null;

function selectedEntitiesOf(entities: ReadonlyArray<CadEntity>, ids: ReadonlyArray<string>): ReadonlyArray<CadEntity> {
  if (selectedCache !== null && selectedCache.entities === entities && selectedCache.ids === ids) {
    return selectedCache.result;
  }

  const wanted = new Set(ids);
  const result = ids.length === 0 ? [] : entities.filter((entity) => wanted.has(entity.id));
  selectedCache = { entities, ids, result };
  return result;
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

  if (cad.preview.type === "snapMarker") {
    renderSnapMarker2D(context, worldToScreen(cad.preview.point, cad.viewport), cad.preview.snapType);
  }

  if (cad.preview.type === "selectionBox") {
    renderSelectionBoxPreview(context, cad, cad.preview.start, cad.preview.end, cad.preview.mode);
  }
}

function renderSelectionBoxPreview(
  context: CanvasRenderingContext2D,
  cad: CadStore,
  start: Point2D,
  end: Point2D,
  mode: "window" | "crossing"
): void {
  const a = worldToScreen(start, cad.viewport);
  const b = worldToScreen(end, cad.viewport);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  // A janela (esquerda->direita) usa azul com borda contínua; o cruzamento (direita->esquerda) usa verde tracejado.
  const color = mode === "window" ? "#38bdf8" : "#22c55e";

  context.save();
  context.fillStyle = mode === "window" ? "rgba(56, 189, 248, 0.12)" : "rgba(34, 197, 94, 0.12)";
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.setLineDash(mode === "window" ? [] : [6, 4]);
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);
  context.restore();
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

function renderActiveSnapMarker(context: CanvasRenderingContext2D, cad: CadStore): void {
  if (cad.snapResult?.snapped !== true || cad.snapResult.candidate === undefined) {
    return;
  }

  renderSnapMarker2D(
    context,
    worldToScreen(cad.snapResult.point, cad.viewport),
    cad.snapResult.candidate.type
  );
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
