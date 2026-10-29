import type { CadDocument, CadEntity } from "@cad-web/cad-core";
import { parseCadDocument, parseDxfDocumentWithReport, type DxfImportReport } from "@cad-web/cad-io";

/**
 * Worker que interpreta documentos fora da thread principal: DXF importado e JSON recarregado do IndexedDB. A
 * análise de arquivos de dezenas de MB levava segundos de tarefa contínua e congelava a interface. O worker só
 * chama o cad-io (sem DOM, sem React).
 *
 * O resultado volta em partes: um cabeçalho (documento sem entidades, mais o relatório do DXF) e lotes de entidades.
 * Uma única mensagem com milhões de objetos levaria centenas de milissegundos para ser desserializada na thread
 * principal; em lotes, cada desserialização é curta e a interface respira entre elas.
 */
export type DocumentParseRequest = Readonly<
  | { kind: "dxf"; buffer: ArrayBuffer; documentId: string }
  | { kind: "json"; source: string }
>;
export type DocumentParseResponse = Readonly<
  | { kind: "header"; document: CadDocument; report: DxfImportReport | null }
  | { kind: "entities"; entities: ReadonlyArray<CadEntity> }
  | { kind: "done" }
  | { kind: "error"; message: string }
>;

// Entidades por mensagem: equilibra o número de mensagens e a duração de cada desserialização.
const ENTITIES_PER_MESSAGE = 2000;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DocumentParseRequest>) => void) | null;
  postMessage: (message: DocumentParseResponse) => void;
};

scope.onmessage = (event) => {
  try {
    const request = event.data;
    let document: CadDocument;
    let report: DxfImportReport | null = null;

    if (request.kind === "dxf") {
      const result = parseDxfDocumentWithReport(new Uint8Array(request.buffer), { documentId: request.documentId });
      document = result.document;
      report = result.report;
    } else {
      document = parseCadDocument(request.source);
    }

    scope.postMessage({ kind: "header", document: { ...document, entities: [] }, report });

    for (let start = 0; start < document.entities.length; start += ENTITIES_PER_MESSAGE) {
      scope.postMessage({ kind: "entities", entities: document.entities.slice(start, start + ENTITIES_PER_MESSAGE) });
    }

    scope.postMessage({ kind: "done" });
  } catch (error) {
    scope.postMessage({ kind: "error", message: error instanceof Error ? error.message : "Unexpected error while reading the file." });
  }
};
