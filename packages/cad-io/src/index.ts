import type { CadDocument } from "@cad-web/cad-core";

export function serializeCadDocument(document: CadDocument): string {
  return JSON.stringify(document, null, 2);
}

export function parseCadDocument(source: string): CadDocument {
  return JSON.parse(source) as CadDocument;
}
