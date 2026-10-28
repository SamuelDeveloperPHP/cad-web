import type { CadDocument } from "@cad-web/cad-core";
import { parseCadDocument, parseDxfDocumentWithReport, parseSvgDocument, serializeCadDocument, serializeCadDocumentToSvg, type DxfImportResult } from "@cad-web/cad-io";

export function downloadCadDocument(document: CadDocument): void {
  const blob = new Blob([serializeCadDocument(document)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = documentCreateDownloadAnchor(url, "cad-web-drawing.json");

  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadSvgDocument(document: CadDocument): void {
  const blob = new Blob([serializeCadDocumentToSvg(document)], {
    type: "image/svg+xml"
  });
  const url = URL.createObjectURL(blob);
  const anchor = documentCreateDownloadAnchor(url, "cad-web-drawing.svg");

  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readCadDocumentFile(file: File): Promise<CadDocument> {
  return parseCadDocument(await file.text());
}

// DXF ASCII (R12 e 2000+): a decodificação (UTF-8 ou página de código ANSI) é feita pelo importador.
export async function readDxfDocumentFile(file: File): Promise<DxfImportResult> {
  return parseDxfDocumentWithReport(new Uint8Array(await file.arrayBuffer()), { documentId: `dxf_${Date.now()}` });
}

export async function readSvgDocumentFile(file: File): Promise<CadDocument> {
  return parseSvgDocument(await file.text());
}

function documentCreateDownloadAnchor(url: string, filename: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";

  return anchor;
}
