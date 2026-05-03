import type { CadDocument } from "@cad-web/cad-core";
import { parseCadDocument, serializeCadDocument } from "@cad-web/cad-io";

export const CAD_DOCUMENT_STORAGE_KEY = "cad-web:mvp-document";

export function createInitialDocument(): CadDocument {
  return {
    schemaVersion: "1.0.0",
    id: "local-mvp-document",
    units: "mm",
    entities: [
      {
        id: "line_seed_001",
        layerId: "default",
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
