import type { CadDocument, CadEntity } from "@cad-web/cad-core";
import { parseCadDocument, parseDxfDocumentWithReport, type DxfImportReport, type DxfImportResult } from "@cad-web/cad-io";
import type { DocumentParseRequest, DocumentParseResponse } from "../workers/documentParse.worker";

/**
 * Análise de documentos fora da thread principal (Web Worker). Sem Worker (testes, ambientes antigos) a análise
 * cai para a thread principal com o mesmo resultado.
 */
function parseInWorker(request: DocumentParseRequest, transfer: Transferable[]): Promise<Readonly<{ document: CadDocument; report: DxfImportReport | null }>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/documentParse.worker.ts", import.meta.url), { type: "module" });
    let header: Extract<DocumentParseResponse, { kind: "header" }> | null = null;
    const entities: CadEntity[] = [];

    const fail = (message: string) => {
      worker.terminate();
      reject(new Error(message));
    };

    worker.onmessage = (event: MessageEvent<DocumentParseResponse>) => {
      const message = event.data;

      if (message.kind === "header") {
        header = message;
      } else if (message.kind === "entities") {
        for (const entity of message.entities) {
          entities.push(entity);
        }
      } else if (message.kind === "done" && header !== null) {
        worker.terminate();
        resolve({ document: { ...header.document, entities }, report: header.report });
      } else if (message.kind === "error") {
        fail(message.message);
      }
    };
    worker.onerror = (event) => fail(event.message || "The document parser worker failed.");

    worker.postMessage(request, transfer);
  });
}

// DXF ASCII (R12 e 2000+): a decodificação (UTF-8 ou página de código ANSI) é feita pelo importador.
export async function parseDxfBuffer(buffer: ArrayBuffer, documentId: string): Promise<DxfImportResult> {
  if (typeof Worker === "undefined") {
    return parseDxfDocumentWithReport(new Uint8Array(buffer), { documentId });
  }

  // O buffer é transferido (sem cópia) para o worker.
  const { document, report } = await parseInWorker({ kind: "dxf", buffer, documentId }, [buffer]);

  if (report === null) {
    throw new Error("The DXF import worker returned no report.");
  }

  return { document, report };
}

// JSON nativo (documento persistido ou arquivo aberto).
export async function parseJsonDocument(source: string): Promise<CadDocument> {
  if (typeof Worker === "undefined") {
    return parseCadDocument(source);
  }

  return (await parseInWorker({ kind: "json", source }, [])).document;
}
