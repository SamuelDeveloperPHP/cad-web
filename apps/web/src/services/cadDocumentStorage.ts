import type { CadDocument } from "@cad-web/cad-core";
import { parseCadDocument, serializeCadDocument } from "@cad-web/cad-io";

export const CAD_DOCUMENT_STORAGE_KEY = "cad-web:mvp-document";

export function createInitialDocument(): CadDocument {
  const standardStyle = {
    id: "dimstyle_standard",
    name: "Standard",
    textHeight: 12,
    arrowSize: 6,
    extensionOffset: 2,
    extensionOvershoot: 3,
    precision: 2,
    unitSuffix: " mm",
    arrowType: "tick" as const,
    isDefault: true
  };

  return {
    schemaVersion: "1.0.0",
    id: "local-mvp-document",
    units: "mm",
    layers: [
      {
        id: "layer_0",
        name: "Layer 0",
        color: "#ffffff",
        visible: true,
        locked: false,
        order: 0
      }
    ],
    activeLayerId: "layer_0",
    dimensionStyles: [standardStyle],
    activeDimensionStyleId: "dimstyle_standard",
    entities: [
      {
        id: "line_seed_001",
        layerId: "layer_0",
        type: "line",
        start: { x: 0, y: 0 },
        end: { x: 80, y: 35 }
      }
    ]
  };
}

export function loadStoredDocument(): CadDocument | null {
  const source = localStorage.getItem(CAD_DOCUMENT_STORAGE_KEY);

  if (source === null) {
    return null;
  }

  try {
    return parseCadDocument(source);
  } catch {
    localStorage.removeItem(CAD_DOCUMENT_STORAGE_KEY);
    return null;
  }
}

export function storeDocument(document: CadDocument): void {
  localStorage.setItem(CAD_DOCUMENT_STORAGE_KEY, serializeCadDocument(document));
}
