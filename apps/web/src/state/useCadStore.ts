import {
  ClearDocumentCommand,
  CommandHistory,
  documentBoundingBox,
  type CadCommand,
  type CadDocument
} from "@cad-web/cad-core";
import { clamp, type Point2D, type SnapResult, type SnapSettings } from "@cad-web/cad-geometry";
import {
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
  createViewport,
  panViewport,
  screenToWorld,
  zoomExtents,
  type ScreenSize,
  type Viewport
} from "@cad-web/cad-renderer";
import {
  ObjectSnapService,
  type CadPreview,
  type ToolContext,
  type ToolKeyboardEvent,
  type ToolPointerEvent,
  type ToolResult
} from "@cad-web/cad-tools";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAD_DOCUMENT_STORAGE_KEY,
  createInitialDocument,
  loadStoredDocument,
  storeDocument
} from "../services/cadDocumentStorage";
import { loadStoredSnapSettings, storeSnapSettings } from "../services/snapSettingsStorage";
import { createWebToolRegistry } from "../tools/toolRegistry";

export type ActiveCadTool = "select" | "line" | "polyline" | "rectangle" | "circle" | "arc" | "ellipse" | "ellipseArc" | "move" | "mirror" | "rotate" | "scale" | "stretch" | "offset" | "trim" | "extend" | "fillet" | "chamfer" | "array" | "arrayPolar" | "arrayPath" | "explode" | "erase" | "pan" | "zoomWindow" | "dimLinear" | "dimAligned" | "dimRadius" | "dimDiameter" | "dimAngular";

const ACTIVE_CAD_TOOLS: ReadonlySet<string> = new Set<ActiveCadTool>([
  "select",
  "line",
  "polyline",
  "rectangle",
  "circle",
  "arc",
  "ellipse",
  "ellipseArc",
  "move",
  "mirror",
  "rotate",
  "scale",
  "stretch",
  "offset",
  "trim",
  "extend",
  "fillet",
  "chamfer",
  "array",
  "arrayPolar",
  "arrayPath",
  "explode",
  "erase",
  "pan",
  "zoomWindow",
  "dimLinear",
  "dimAligned",
  "dimRadius",
  "dimDiameter",
  "dimAngular"
]);

export type CadStore = Readonly<{
  document: CadDocument;
  viewport: Viewport;
  screenSize: ScreenSize;
  activeTool: ActiveCadTool;
  mouseWorld: Point2D;
  selectedEntityIds: ReadonlyArray<string>;
  preview: CadPreview | null;
  snapSettings: SnapSettings;
  snapResult: SnapResult | null;
  canUndo: boolean;
  canRedo: boolean;
  message: string;
  setActiveTool(tool: ActiveCadTool): void;
  setViewport(viewport: Viewport): void;
  setScreenSize(size: ScreenSize): void;
  setZoomScale(scale: number): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomToExtents(): void;
  zoomToWindow(worldBounds: { minX: number; minY: number; maxX: number; maxY: number }): void;
  zoomPrevious(): void;
  setMouseWorld(point: Point2D): void;
  setSnapSettings(settings: SnapSettings): void;
  panByScreenDelta(delta: Point2D): void;
  dispatchPointerDown(event: ToolPointerEvent): void;
  dispatchPointerMove(event: ToolPointerEvent): void;
  dispatchPointerUp(event: ToolPointerEvent): void;
  dispatchKeyDown(event: ToolKeyboardEvent): void;
  clearDocument(): void;
  importDocument(document: CadDocument): void;
  cancelInteraction(): void;
  runCommandLine(command: string): void;
  executeCommand(command: CadCommand): void;
  undo(): void;
  redo(): void;
}>;

export function useCadStore(): CadStore {
  const toolRegistry = useMemo(() => createWebToolRegistry(), []);
  const [document, setDocument] = useState<CadDocument>(() => loadStoredDocument() ?? createInitialDocument());
  const [history] = useState(() => new CommandHistory(document));
  const [viewport, setViewport] = useState<Viewport>(() => createViewport({ x: -50, y: -30 }, 8));
  const [screenSize, setScreenSize] = useState<ScreenSize>({ width: 1, height: 1 });
  const viewportHistoryRef = useRef<Viewport[]>([]);
  const [activeTool, setActiveToolState] = useState<ActiveCadTool>("select");
  const [mouseWorld, setMouseWorld] = useState<Point2D>({ x: 0, y: 0 });
  const [selectedEntityIds, setSelectedEntityIds] = useState<ReadonlyArray<string>>([]);
  const [preview, setPreview] = useState<CadPreview | null>(null);
  const [snapSettings, setSnapSettingsState] = useState<SnapSettings>(() => loadStoredSnapSettings());
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
  const [message, setMessageState] = useState<string>("");
  const messageTimeoutRef = useRef<number | null>(null);

  const showMessage = useCallback((msg: string) => {
    setMessageState(msg);
    if (messageTimeoutRef.current !== null) {
      window.clearTimeout(messageTimeoutRef.current);
    }
    messageTimeoutRef.current = window.setTimeout(() => setMessageState(""), 3000);
  }, []);

  const [historyAvailability, setHistoryAvailability] = useState(() => ({
    canUndo: history.canUndo,
    canRedo: history.canRedo
  }));
  const snapService = useMemo(() => new ObjectSnapService(snapSettings), [snapSettings]);

  const setSnapSettings = useCallback((settings: SnapSettings) => {
    setSnapSettingsState(settings);
    setSnapResult(null);
  }, []);

  useEffect(() => {
    storeDocument(document);
  }, [document]);

  useEffect(() => {
    storeSnapSettings(snapSettings);
  }, [snapSettings]);

  const publishDocument = useCallback((nextDocument: CadDocument) => {
    setDocument(nextDocument);
    setHistoryAvailability({
      canUndo: history.canUndo,
      canRedo: history.canRedo
    });
  }, [history]);

  const applyCommand = useCallback(
    (command: CadCommand) => {
      publishDocument(history.execute(command));
    },
    [history, publishDocument]
  );

  const createToolContext = useCallback(
    (): ToolContext => ({
      document,
      selection: { entityIds: selectedEntityIds },
      viewport,
      snapService,
      commandBus: {
        execute: applyCommand
      },
      orthoMode: false,
      units: document.units,
      precision: 3,
      setPreview,
      clearPreview: () => setPreview(null),
      selectEntities: setSelectedEntityIds,
      clearSelection: () => setSelectedEntityIds([]),
      executeCommand: applyCommand,
      showMessage,
      requestNumericInput: () => undefined,
      cancelCurrentTool: () => setPreview(null)
    }),
    [applyCommand, document, selectedEntityIds, snapService, viewport]
  );

  const updateSnapResultFromPointer = useCallback((event: ToolPointerEvent, context: ToolContext) => {
    // O marcador de snap também considera a geometria em andamento da ferramenta ativa (ex.: fechar polyline).
    const tool = toolRegistry.resolve(activeTool);
    const extraEntities = tool?.getSnapEntities?.() ?? [];
    // O ponto de referência da ferramenta ativa habilita os marcadores de perpendicular e tangente.
    const referencePoint = tool?.getSnapReferencePoint?.() ?? undefined;
    const result = context.snapService.findSnap(event, context, extraEntities, referencePoint);
    setSnapResult(result?.snapped === true ? result : null);
  }, [activeTool, toolRegistry]);

  const processToolResult = useCallback((result: ToolResult) => {
    if (result.type === "preview") {
      setPreview(result.preview);
      return;
    }

    if (result.type === "cancel" || result.type === "complete") {
      setPreview(null);
    }
  }, []);

  const undo = useCallback(() => {
    publishDocument(history.undo());
    setPreview(null);
    setSnapResult(null);
  }, [history, publishDocument]);

  const redo = useCallback(() => {
    publishDocument(history.redo());
    setPreview(null);
    setSnapResult(null);
  }, [history, publishDocument]);

  const setActiveTool = useCallback(
    (tool: ActiveCadTool) => {
      const context = createToolContext();

      if (activeTool !== "pan") {
        toolRegistry.resolve(activeTool)?.deactivate(context);
      }

      setPreview(null);
      setSnapResult(null);
      setActiveToolState(tool);

      if (tool !== "pan") {
        toolRegistry.resolve(tool)?.activate(context);
      }
    },
    [activeTool, createToolContext, toolRegistry]
  );

  const dispatchToActiveTool = useCallback(
    (dispatch: (toolId: ActiveCadTool, context: ToolContext) => ToolResult) => {
      if (activeTool === "pan") {
        return;
      }

      const context = createToolContext();
      processToolResult(dispatch(activeTool, context));
    },
    [activeTool, createToolContext, processToolResult]
  );

  const panByScreenDelta = useCallback((delta: Point2D) => {
    setViewport((current) => panViewport(current, delta));
  }, []);

  // O histórico guarda o viewport anterior a cada zoom discreto para alimentar o Zoom Previous.
  const pushViewportHistory = useCallback((previous: Viewport) => {
    const history = viewportHistoryRef.current;
    const last = history[history.length - 1];

    // Evita empilhar viewports idênticos consecutivos e limita o tamanho do histórico.
    if (last !== undefined && last.scale === previous.scale && last.origin.x === previous.origin.x && last.origin.y === previous.origin.y) {
      return;
    }

    history.push(previous);

    if (history.length > 30) {
      history.shift();
    }
  }, []);

  const setZoomScale = useCallback(
    (nextScale: number) => {
      // O zoom manual mantém fixo o ponto de mundo que está no centro da tela, evitando saltos de posição.
      setViewport((current) => {
        pushViewportHistory(current);
        const clampedScale = clamp(nextScale, MIN_VIEWPORT_SCALE, MAX_VIEWPORT_SCALE);
        const screenCenter = { x: screenSize.width / 2, y: screenSize.height / 2 };
        const worldCenter = screenToWorld(screenCenter, current);

        return {
          scale: clampedScale,
          origin: {
            x: worldCenter.x - screenCenter.x / clampedScale,
            y: worldCenter.y - screenCenter.y / clampedScale
          }
        };
      });
    },
    [pushViewportHistory, screenSize]
  );

  const zoomIn = useCallback(() => {
    setViewport((current) => {
      pushViewportHistory(current);
      const clampedScale = clamp(current.scale * 1.25, MIN_VIEWPORT_SCALE, MAX_VIEWPORT_SCALE);
      const screenCenter = { x: screenSize.width / 2, y: screenSize.height / 2 };
      const worldCenter = screenToWorld(screenCenter, current);

      return {
        scale: clampedScale,
        origin: {
          x: worldCenter.x - screenCenter.x / clampedScale,
          y: worldCenter.y - screenCenter.y / clampedScale
        }
      };
    });
  }, [pushViewportHistory, screenSize]);

  const zoomOut = useCallback(() => {
    setViewport((current) => {
      pushViewportHistory(current);
      const clampedScale = clamp(current.scale / 1.25, MIN_VIEWPORT_SCALE, MAX_VIEWPORT_SCALE);
      const screenCenter = { x: screenSize.width / 2, y: screenSize.height / 2 };
      const worldCenter = screenToWorld(screenCenter, current);

      return {
        scale: clampedScale,
        origin: {
          x: worldCenter.x - screenCenter.x / clampedScale,
          y: worldCenter.y - screenCenter.y / clampedScale
        }
      };
    });
  }, [pushViewportHistory, screenSize]);

  const zoomToExtents = useCallback(() => {
    const bounds = documentBoundingBox(document);

    setViewport((current) => {
      pushViewportHistory(current);

      if (bounds === null) {
        // Sem entidades, o zoom retorna ao enquadramento padrão do documento novo.
        return createViewport({ x: -50, y: -30 }, 8);
      }

      return zoomExtents({ bounds, screenSize, paddingPixels: 48 });
    });
  }, [document, pushViewportHistory, screenSize]);

  const zoomToWindow = useCallback(
    (worldBounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
      // O Zoom Window enquadra o retângulo escolhido; caixas muito pequenas são ignoradas para evitar zoom exagerado acidental.
      const width = worldBounds.maxX - worldBounds.minX;
      const height = worldBounds.maxY - worldBounds.minY;

      if (!(width > 1e-6) || !(height > 1e-6)) {
        return;
      }

      setViewport((current) => {
        pushViewportHistory(current);
        return zoomExtents({ bounds: worldBounds, screenSize, paddingPixels: 8 });
      });
    },
    [pushViewportHistory, screenSize]
  );

  const zoomPrevious = useCallback(() => {
    const previous = viewportHistoryRef.current.pop();

    if (previous !== undefined) {
      setViewport(previous);
    }
  }, []);

  const dispatchPointerDown = useCallback(
    (event: ToolPointerEvent) => {
      dispatchToActiveTool((toolId, context) => {
        updateSnapResultFromPointer(event, context);
        return toolRegistry.resolve(toolId)?.onPointerDown(event, context) ?? { type: "none" };
      });
    },
    [dispatchToActiveTool, toolRegistry, updateSnapResultFromPointer]
  );

  const dispatchPointerMove = useCallback(
    (event: ToolPointerEvent) => {
      dispatchToActiveTool((toolId, context) => {
        updateSnapResultFromPointer(event, context);
        return toolRegistry.resolve(toolId)?.onPointerMove(event, context) ?? { type: "none" };
      });
    },
    [dispatchToActiveTool, toolRegistry, updateSnapResultFromPointer]
  );

  const dispatchPointerUp = useCallback(
    (event: ToolPointerEvent) => {
      dispatchToActiveTool((toolId, context) => {
        updateSnapResultFromPointer(event, context);
        return toolRegistry.resolve(toolId)?.onPointerUp(event, context) ?? { type: "none" };
      });
    },
    [dispatchToActiveTool, toolRegistry, updateSnapResultFromPointer]
  );

  const runEraseTool = useCallback(
    (event: ToolKeyboardEvent) => {
      const context = createToolContext();
      processToolResult(toolRegistry.resolve("erase")?.onKeyDown(event, context) ?? { type: "none" });
      setSelectedEntityIds([]);
    },
    [createToolContext, processToolResult, toolRegistry]
  );

  const dispatchKeyDown = useCallback(
    (event: ToolKeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeTool === "zoomWindow") {
          // Esc encerra o modo Zoom Window e volta para a seleção.
          setActiveTool("select");
          return;
        }

        // A ferramenta ativa cancela sua operação em andamento (reset interno e limpeza do preview).
        if (activeTool !== "pan") {
          dispatchToActiveTool((toolId, context) => toolRegistry.resolve(toolId)?.onKeyDown(event, context) ?? { type: "none" });
        }

        // Fora da Select, o Esc encerra o comando: devolve o controle à ferramenta Select e libera o objeto.
        // Na própria Select, o Esc já é tratado em estágios pela ferramenta (cancela grip, cancela janela, limpa seleção).
        if (activeTool !== "select") {
          setActiveTool("select");
          setSelectedEntityIds([]);
        }

        setPreview(null);
        setSnapResult(null);
        return;
      }

      if (event.key === "Delete") {
        runEraseTool(event);
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        undo();
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        redo();
        return;
      }

      if (event.key.toLowerCase() === "l") {
        setActiveTool("line");
        return;
      }

      if (event.key.toLowerCase() === "m") {
        setActiveTool("move");
        return;
      }

      if (event.key.toLowerCase() === "o") {
        setActiveTool("offset");
        return;
      }

      if (event.key.toLowerCase() === "t") {
        setActiveTool("trim");
        return;
      }

      if (event.key.toLowerCase() === "f") {
        setActiveTool("fillet");
        return;
      }

      dispatchToActiveTool((toolId, context) => toolRegistry.resolve(toolId)?.onKeyDown(event, context) ?? { type: "none" });
    },
    [activeTool, dispatchToActiveTool, redo, runEraseTool, setActiveTool, toolRegistry, undo]
  );

  const clearDocument = useCallback(() => {
    applyCommand(new ClearDocumentCommand());
    setSelectedEntityIds([]);
    setPreview(null);
    setSnapResult(null);
    localStorage.removeItem(CAD_DOCUMENT_STORAGE_KEY);
  }, [applyCommand]);

  const importDocument = useCallback((nextDocument: CadDocument) => {
    history.replaceDocument(nextDocument);
    publishDocument(nextDocument);
    setSelectedEntityIds([]);
    setPreview(null);
    setSnapResult(null);
  }, [history, publishDocument]);

  const cancelInteraction = useCallback(() => {
    const context = createToolContext();

    if (activeTool !== "pan") {
      toolRegistry.resolve(activeTool)?.deactivate(context);
    }

    setSelectedEntityIds([]);
    setPreview(null);
    setSnapResult(null);
  }, [activeTool, createToolContext, toolRegistry]);

  const runCommandLine = useCallback(
    (command: string) => {
      const normalizedCommand = command.trim().toLowerCase();
      const resolvedTool = toolRegistry.resolve(normalizedCommand);

      if (["clear", "cls", "limpar", "limpartela", "clearall"].includes(normalizedCommand)) {
        if (document.entities.length === 0) {
          showMessage("Nenhuma entidade para limpar.");
        } else {
          clearDocument();
          showMessage("Desenho limpo.");
        }
        return;
      }

      if (normalizedCommand === "u" || normalizedCommand === "undo") {
        undo();
        return;
      }

      if (normalizedCommand === "redo") {
        redo();
        return;
      }

      if (normalizedCommand === "pan" || normalizedCommand === "p") {
        setActiveTool("pan");
        return;
      }

      if (["z", "za", "ze", "zoom", "zoomall", "zoomextents"].includes(normalizedCommand)) {
        zoomToExtents();
        showMessage("Zoom ajustado ao desenho.");
        return;
      }

      if (["zw", "zoomwindow", "zoomwin"].includes(normalizedCommand)) {
        setActiveTool("zoomWindow");
        showMessage("Zoom Window: arraste um retângulo na área de desenho.");
        return;
      }

      if (["zp", "zoomprev", "zoomprevious"].includes(normalizedCommand)) {
        zoomPrevious();
        showMessage("Zoom anterior restaurado.");
        return;
      }

      if (resolvedTool?.id === "erase" && activeTool !== "erase") {
        runEraseTool({
          key: "Enter",
          code: "Enter",
          repeat: false,
          shiftKey: false,
          ctrlKey: false,
          altKey: false,
          metaKey: false
        });
        return;
      }

      if (resolvedTool !== null && isActiveCadTool(resolvedTool.id)) {
        setActiveTool(resolvedTool.id);
        return;
      }

      if (activeTool !== "pan") {
        const context = createToolContext();
        processToolResult(toolRegistry.resolve(activeTool)?.onCommandInput(command, context) ?? { type: "none" });
      }
    },
    [activeTool, clearDocument, createToolContext, document.entities.length, processToolResult, redo, runEraseTool, setActiveTool, showMessage, toolRegistry, undo, zoomToExtents, zoomPrevious]
  );

  return useMemo(
    () => ({
      document,
      viewport,
      screenSize,
      activeTool,
      mouseWorld,
      selectedEntityIds,
      preview,
      snapSettings,
      snapResult,
      canUndo: historyAvailability.canUndo,
      canRedo: historyAvailability.canRedo,
      message,
      setActiveTool,
      setViewport,
      setScreenSize,
      setZoomScale,
      zoomIn,
      zoomOut,
      zoomToExtents,
      zoomToWindow,
      zoomPrevious,
      setMouseWorld,
      setSnapSettings,
      panByScreenDelta,
      dispatchPointerDown,
      dispatchPointerMove,
      dispatchPointerUp,
      dispatchKeyDown,
      clearDocument,
      importDocument,
      cancelInteraction,
      runCommandLine,
      executeCommand: applyCommand,
      undo,
      redo
    }),
    [
      activeTool,
      cancelInteraction,
      clearDocument,
      dispatchKeyDown,
      dispatchPointerDown,
      dispatchPointerMove,
      dispatchPointerUp,
      document,
      applyCommand,
      historyAvailability.canRedo,
      historyAvailability.canUndo,
      importDocument,
      mouseWorld,
      panByScreenDelta,
      preview,
      runCommandLine,
      selectedEntityIds,
      setActiveTool,
      snapSettings,
      snapResult,
      message,
      showMessage,
      undo,
      redo,
      viewport,
      screenSize,
      setZoomScale,
      zoomIn,
      zoomOut,
      zoomToExtents,
      zoomToWindow,
      zoomPrevious
    ]
  );
}

function isActiveCadTool(toolId: string): toolId is ActiveCadTool {
  return ACTIVE_CAD_TOOLS.has(toolId);
}
