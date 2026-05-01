import type { CadDocument, LineEntity } from "@cad-web/cad-core";
import type { Point2D } from "@cad-web/cad-geometry";
import { createViewport, panViewport, type Viewport } from "@cad-web/cad-renderer";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CAD_DOCUMENT_STORAGE_KEY,
  createInitialDocument,
  loadStoredDocument,
  storeDocument
} from "../services/cadDocumentStorage";

export type ActiveCadTool = "select" | "line" | "pan";

export type LineDraft = Readonly<{
  start: Point2D;
  current: Point2D;
}>;

export type CadStore = Readonly<{
  document: CadDocument;
  viewport: Viewport;
  activeTool: ActiveCadTool;
  mouseWorld: Point2D;
  selectedEntityIds: ReadonlyArray<string>;
  lineDraft: LineDraft | null;
  setActiveTool(tool: ActiveCadTool): void;
  setViewport(viewport: Viewport): void;
  setMouseWorld(point: Point2D): void;
  panByScreenDelta(delta: Point2D): void;
  handleLineClick(point: Point2D): void;
  setLinePreview(point: Point2D): void;
  selectEntity(entityId: string | null): void;
  eraseSelection(): void;
  clearDocument(): void;
  importDocument(document: CadDocument): void;
  cancelInteraction(): void;
  runCommandLine(command: string): void;
}>;

export function useCadStore(): CadStore {
  const [document, setDocument] = useState<CadDocument>(() => loadStoredDocument() ?? createInitialDocument());
  const [viewport, setViewport] = useState<Viewport>(() => createViewport({ x: -50, y: -30 }, 8));
  const [activeTool, setActiveToolState] = useState<ActiveCadTool>("select");
  const [mouseWorld, setMouseWorld] = useState<Point2D>({ x: 0, y: 0 });
  const [selectedEntityIds, setSelectedEntityIds] = useState<ReadonlyArray<string>>([]);
  const [lineDraft, setLineDraft] = useState<LineDraft | null>(null);

  useEffect(() => {
    storeDocument(document);
  }, [document]);

  const setActiveTool = useCallback((tool: ActiveCadTool) => {
    setLineDraft(null);
    setActiveToolState(tool);
  }, []);

  const panByScreenDelta = useCallback((delta: Point2D) => {
    setViewport((current) => panViewport(current, delta));
  }, []);

  const handleLineClick = useCallback((point: Point2D) => {
    setSelectedEntityIds([]);
    setLineDraft((current) => {
      if (current === null) {
        return { start: point, current: point };
      }

      const line = createLineEntity(current.start, point);
      setDocument((documentValue) => ({
        ...documentValue,
        entities: [...documentValue.entities, line]
      }));

      return null;
    });
  }, []);

  const setLinePreview = useCallback((point: Point2D) => {
    setLineDraft((current) => (current === null ? null : { ...current, current: point }));
  }, []);

  const selectEntity = useCallback((entityId: string | null) => {
    setSelectedEntityIds(entityId === null ? [] : [entityId]);
  }, []);

  const eraseSelection = useCallback(() => {
    setDocument((documentValue) => ({
      ...documentValue,
      entities: documentValue.entities.filter((entity) => !selectedEntityIds.includes(entity.id))
    }));
    setSelectedEntityIds([]);
  }, [selectedEntityIds]);

  const clearDocument = useCallback(() => {
    setDocument(createInitialDocument());
    setSelectedEntityIds([]);
    setLineDraft(null);
    localStorage.removeItem(CAD_DOCUMENT_STORAGE_KEY);
  }, []);

  const importDocument = useCallback((nextDocument: CadDocument) => {
    setDocument(nextDocument);
    setSelectedEntityIds([]);
    setLineDraft(null);
  }, []);

  const cancelInteraction = useCallback(() => {
    setLineDraft(null);
    setSelectedEntityIds([]);
  }, []);

  const runCommandLine = useCallback(
    (command: string) => {
      const normalizedCommand = command.trim().toLowerCase();

      // O MVP resolve apenas aliases locais ate as ferramentas concretas migrarem para cad-tools.
      if (normalizedCommand === "l" || normalizedCommand === "line") {
        setActiveTool("line");
      } else if (normalizedCommand === "select" || normalizedCommand === "sel") {
        setActiveTool("select");
      } else if (normalizedCommand === "pan" || normalizedCommand === "p") {
        setActiveTool("pan");
      } else if (normalizedCommand === "clear") {
        clearDocument();
      }
    },
    [clearDocument, setActiveTool]
  );

  return useMemo(
    () => ({
      document,
      viewport,
      activeTool,
      mouseWorld,
      selectedEntityIds,
      lineDraft,
      setActiveTool,
      setViewport,
      setMouseWorld,
      panByScreenDelta,
      handleLineClick,
      setLinePreview,
      selectEntity,
      eraseSelection,
      clearDocument,
      importDocument,
      cancelInteraction,
      runCommandLine
    }),
    [
      activeTool,
      cancelInteraction,
      clearDocument,
      document,
      eraseSelection,
      handleLineClick,
      importDocument,
      lineDraft,
      mouseWorld,
      panByScreenDelta,
      runCommandLine,
      selectEntity,
      selectedEntityIds,
      setActiveTool,
      setLinePreview,
      viewport
    ]
  );
}

function createLineEntity(start: Point2D, end: Point2D): LineEntity {
  return {
    id: `line_${crypto.randomUUID()}`,
    layerId: "default",
    type: "line",
    start,
    end
  };
}
