import type { CadDocument } from "@cad-web/cad-core";
import { parseDxfBuffer, parseJsonDocument } from "./documentParser";
import { parseSvgDocument, serializeCadDocument, serializeCadDocumentToSvg, type DxfImportResult } from "@cad-web/cad-io";

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
  return parseJsonDocument(await file.text());
}

// A análise do DXF roda em um Worker (ver documentParser).
export async function readDxfDocumentFile(file: File): Promise<DxfImportResult> {
  return parseDxfBuffer(await file.arrayBuffer(), `dxf_${Date.now()}`);
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
