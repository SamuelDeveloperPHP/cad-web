import type { CadDocument, EntityId } from "@cad-web/cad-core";
import type { Point2D } from "@cad-web/cad-geometry";
import type {
  CadCommand,
  CadPreview,
  NumericInputRequest,
  SelectionState,
  SnapService,
  ToolContext,
  ViewportState
} from "../src";

export type MockToolContext = ToolContext &
  Readonly<{
    commands: CadCommand[];
    messages: string[];
    numericRequests: NumericInputRequest[];
    previews: Array<CadPreview | null>;
  }>;

export function createMockToolContext(
  overrides: Partial<Readonly<{
    document: CadDocument;
    selection: SelectionState;
    viewport: ViewportState;
    snapService: SnapService;
  }>> = {}
): MockToolContext {
  const commands: CadCommand[] = [];
  const messages: string[] = [];
  const numericRequests: NumericInputRequest[] = [];
  const previews: Array<CadPreview | null> = [];
  let selection = overrides.selection ?? { entityIds: [] };

  const context: MockToolContext = {
    document: overrides.document ?? createDocument(),
    get selection() {
      return selection;
    },
    viewport: overrides.viewport ?? { origin: { x: 0, y: 0 }, scale: 10 },
    snapService:
      overrides.snapService ??
      {
        findSnap: () => null
      },
    commandBus: {
      execute: (command) => {
        commands.push(command);
      }
    },
    orthoMode: false,
    units: "mm",
    precision: 3,
    commands,
    messages,
    numericRequests,
    previews,
    setPreview: (preview) => {
      previews.push(preview);
    },
    clearPreview: () => {
      previews.push(null);
    },
    selectEntities: (ids) => {
      selection = { entityIds: ids };
    },
    clearSelection: () => {
      selection = { entityIds: [] };
    },
    executeCommand: (command) => {
      commands.push(command);
    },
    showMessage: (message) => {
      messages.push(message);
    },
    requestNumericInput: (options) => {
      numericRequests.push(options);
    },
    cancelCurrentTool: () => {
      messages.push("cancelCurrentTool");
    }
  };

  return context;
}

export function createPointerEvent(worldPoint: Point2D) {
  return {
    worldPoint,
    screenPoint: worldPoint,
    button: "primary" as const,
    pointerId: 1,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false
  };
}

export function createKeyboardEvent(key: string) {
  return {
    key,
    code: key,
    repeat: false,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false
  };
}

function createDocument(): CadDocument {
  return {
    schemaVersion: "1.0.0",
    id: "doc_test",
    units: "mm",
    layers: [{ id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 }],
    activeLayerId: "layer_0",
    entities: [
      {
        id: "line_001" as EntityId,
        layerId: "layer_0",
        type: "line",
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 }
      }
    ]
  };
}
