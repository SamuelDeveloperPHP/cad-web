import {
  ClearDocumentCommand,
  CommandHistory,
  type CadCommand,
  type CadDocument
} from "@cad-web/cad-core";
import type { Point2D, SnapResult, SnapSettings } from "@cad-web/cad-geometry";
import { createViewport, panViewport, type Viewport } from "@cad-web/cad-renderer";
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

export type ActiveCadTool = "select" | "line" | "rectangle" | "circle" | "move" | "rotate" | "scale" | "offset" | "erase" | "pan";

export type CadStore = Readonly<{
  document: CadDocument;
  viewport: Viewport;
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
    const result = context.snapService.findSnap(event, context);
    setSnapResult(result?.snapped === true ? result : null);
  }, []);

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

      dispatchToActiveTool((toolId, context) => toolRegistry.resolve(toolId)?.onKeyDown(event, context) ?? { type: "none" });
    },
    [dispatchToActiveTool, redo, runEraseTool, setActiveTool, toolRegistry, undo]
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

      if (resolvedTool?.id === "erase") {
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

      if (resolvedTool?.id === "line" || resolvedTool?.id === "rectangle" || resolvedTool?.id === "circle" || resolvedTool?.id === "select" || resolvedTool?.id === "move" || resolvedTool?.id === "rotate" || resolvedTool?.id === "scale") {
        setActiveTool(resolvedTool.id as ActiveCadTool);
      }
    },
    [clearDocument, redo, runEraseTool, setActiveTool, toolRegistry, undo]
  );

  return useMemo(
    () => ({
      document,
      viewport,
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
      viewport
    ]
  );
}
