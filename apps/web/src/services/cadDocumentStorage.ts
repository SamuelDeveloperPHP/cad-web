import type { CadDocument } from "@cad-web/cad-core";
import { parseCadDocument, serializeCadDocument } from "@cad-web/cad-io";

// A chave legada em localStorage é mantida apenas para migração e como fallback quando não há IndexedDB.
export const CAD_DOCUMENT_STORAGE_KEY = "cad-web:mvp-document";

const IDB_NAME = "cad-web";
const IDB_STORE = "documents";
const IDB_DOCUMENT_KEY = "mvp-document";
const IDB_VERSION = 1;

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

// A função sinaliza se o ambiente oferece IndexedDB, evitando quebrar em contextos sem o recurso.
function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

// A função abre (e cria na primeira vez) o banco IndexedDB usado para guardar o documento.
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// A função grava um valor serializado no IndexedDB de forma assíncrona.
async function idbPut(key: string, value: string): Promise<void> {
  const db = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// A função lê um valor serializado do IndexedDB; retorna null quando a chave não existe.
async function idbGet(key: string): Promise<string | null> {
  const db = await openDatabase();

  try {
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const request = tx.objectStore(IDB_STORE).get(key);
      request.onsuccess = () => {
        const value = request.result;
        resolve(typeof value === "string" ? value : null);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

// A função remove a chave do documento no IndexedDB.
async function idbDelete(key: string): Promise<void> {
  const db = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// A função lê de forma síncrona o documento legado guardado em localStorage (usada na hidratação inicial e na migração).
export function loadStoredDocument(): CadDocument | null {
  let source: string | null = null;

  try {
    source = localStorage.getItem(CAD_DOCUMENT_STORAGE_KEY);
  } catch {
    return null;
  }

  if (source === null) {
    return null;
  }

  try {
    return parseCadDocument(source);
  } catch {
    try {
      localStorage.removeItem(CAD_DOCUMENT_STORAGE_KEY);
    } catch {
      // A limpeza é melhor esforço; um erro aqui não impede o carregamento do documento.
    }
    return null;
  }
}

// A função carrega o documento persistido priorizando o IndexedDB e recorrendo ao localStorage legado.
export async function loadPersistedDocument(): Promise<CadDocument | null> {
  if (isIndexedDbAvailable()) {
    try {
      const raw = await idbGet(IDB_DOCUMENT_KEY);
      if (raw !== null) {
        return parseCadDocument(raw);
      }
    } catch {
      // Falha no IndexedDB cai para o documento legado em localStorage.
    }
  }

  return loadStoredDocument();
}

// A função persiste o documento no IndexedDB, escapando da cota de ~5MB do localStorage.
// A serialização (potencialmente cara) fica fora do caminho de interação por acontecer no agendador com debounce.
export async function persistDocument(document: CadDocument): Promise<void> {
  const serialized = serializeCadDocument(document);

  if (isIndexedDbAvailable()) {
    await idbPut(IDB_DOCUMENT_KEY, serialized);
    // A cópia legada em localStorage é descartada: estoura a cota em documentos grandes e não é mais a fonte da verdade.
    try {
      localStorage.removeItem(CAD_DOCUMENT_STORAGE_KEY);
    } catch {
      // A remoção é melhor esforço.
    }
    return;
  }

  // Sem IndexedDB, tenta o localStorage como fallback; documentos grandes podem estourar a cota.
  try {
    localStorage.setItem(CAD_DOCUMENT_STORAGE_KEY, serialized);
  } catch {
    // Documento grande demais para o fallback síncrono; a gravação é ignorada em vez de derrubar a aplicação.
  }
}

// A função apaga o documento persistido em ambas as camadas de armazenamento.
export async function clearPersistedDocument(): Promise<void> {
  if (isIndexedDbAvailable()) {
    try {
      await idbDelete(IDB_DOCUMENT_KEY);
    } catch {
      // A limpeza do IndexedDB é melhor esforço.
    }
  }

  try {
    localStorage.removeItem(CAD_DOCUMENT_STORAGE_KEY);
  } catch {
    // A limpeza do localStorage é melhor esforço.
  }
}

export type DocumentPersister = Readonly<{
  schedule(document: CadDocument): void;
  flush(): Promise<void>;
  dispose(): void;
}>;

// A fábrica cria um gravador com debounce: agrupa rajadas de edições em uma única gravação assíncrona.
export function createDocumentPersister(delayMs = 500): DocumentPersister {
  let timer: number | null = null;
  let pending: CadDocument | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const run = () => {
    timer = null;
    const document = pending;
    pending = null;

    if (document === null) {
      return;
    }

    inFlight = persistDocument(document).catch(() => {
      // A persistência é melhor esforço; uma falha não deve interromper a edição.
    });
  };

  return {
    schedule(document: CadDocument): void {
      pending = document;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(run, delayMs);
    },
    flush(): Promise<void> {
      if (timer !== null) {
        window.clearTimeout(timer);
        run();
      }
      return inFlight;
    },
    dispose(): void {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }
  };
}
