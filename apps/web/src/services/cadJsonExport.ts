import type { CadDocument } from "@cad-web/cad-core";
import { parseCadDocument } from "./cadDocumentStorage";

export function downloadCadDocument(document: CadDocument): void {
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = documentCreateDownloadAnchor(url);

  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readCadDocumentFile(file: File): Promise<CadDocument> {
  return parseCadDocument(await file.text());
}

function documentCreateDownloadAnchor(url: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "cad-web-drawing.json";
  anchor.rel = "noopener";

  return anchor;
}
