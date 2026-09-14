# MVP 3.14 — Performance 1 — Persistência IndexedDB e render em requestAnimationFrame

## Objetivo

Primeiro MVP de performance, focado nos dois maiores gargalos medidos no benchmark de 50k entidades:

1. **Persistência bloqueante em localStorage** — `JSON.stringify` de todo o documento (~330 ms / ~9 MB para 50k) a cada edição, síncrono, e sujeito à cota de ~5 MB do localStorage → `QuotaExceededError` (crash de produção).
2. **Render síncrono sem coalescência** — cada mudança de estado (inclusive cada `pointermove`) repintava todo o documento de forma síncrona no mesmo canvas; no zoom aberto com muitas entidades, cada movimento de mouse pagava o render completo (~90 ms).

Este MVP mexe apenas em `apps/web` (frontend); não toca no kernel nem no backend.

## Parte 1 — Persistência assíncrona (IndexedDB + debounce)

- A gravação do documento saiu do localStorage síncrono para o **IndexedDB assíncrono**, escapando da cota de ~5 MB.
- Um **gravador com debounce** (`createDocumentPersister`, 500 ms) agrupa rajadas de edições em uma única escrita, executada **fora do caminho de interação** (a serialização acontece no timer, não no commit de cada edição).
- A carga passou a ser **assíncrona e com hidratação única**: `loadPersistedDocument` prioriza o IndexedDB e **migra** o documento legado do localStorage; após a hidratação, a chave legada do localStorage é descartada (era a origem do estouro de cota).
- A pendência é **descarregada imediatamente** ao ocultar a aba (`visibilitychange`) ou sair da página (`pagehide`), evitando perder a última edição.
- `clearDocument` limpa ambas as camadas (IndexedDB e localStorage legado).

Compatibilidade: usuários com documento em localStorage continuam abrindo sem "flash" (o valor legado ainda é lido de forma síncrona no boot) e são migrados para o IndexedDB na primeira gravação. Ambientes sem IndexedDB caem para o localStorage como fallback (com o mesmo limite de cota de antes).

## Parte 2 — Render em duas camadas com requestAnimationFrame

- O canvas único virou **dois canvases empilhados**:
  - **Base** (`cad-canvas-base`): grade + documento completo. É a etapa cara; só é repintada quando **documento ou viewport** mudam (edição, pan, zoom).
  - **Overlay** (`cad-canvas-overlay`): destaque de seleção, grips de cota, preview (rubber band / ghost) e marcador de snap. Repintado a cada interação, **sem repintar o documento**.
- Os desenhos são agendados em **`requestAnimationFrame`** e **coalescidos**: várias mudanças de estado no mesmo frame geram um único desenho por camada (limite ao refresh do display).
- O redimensionamento dos canvases (que zera o bitmap e reaplica a escala do DPR) só ocorre quando o tamanho muda — não mais a cada frame.
- Toda a interação de ponteiro (clique, arraste, roda, captura) acontece pelo overlay, que fica no topo; a base tem `pointer-events: none`.

Ganho principal: mover o mouse, snap e preview no zoom aberto passam a repintar **apenas o overlay** (barato), sem pagar o render de todo o documento a cada movimento.

## Arquivos

### Alterados

- `apps/web/src/services/cadDocumentStorage.ts`: camada IndexedDB (`openDatabase`, `idbGet/idbPut/idbDelete`), `loadPersistedDocument` (com migração do legado), `persistDocument`, `clearPersistedDocument` e `createDocumentPersister` (debounce). `loadStoredDocument` mantido para o boot síncrono e a migração.
- `apps/web/src/state/useCadStore.ts`: hidratação única do documento persistido; gravação com debounce após a hidratação; flush em `visibilitychange`/`pagehide`; `clearDocument` limpa ambas as camadas.
- `apps/web/src/components/cad/CadCanvas.tsx`: dois canvases (base/overlay), funções `drawBaseLayer`/`drawOverlayLayer`, agendamento em `requestAnimationFrame` com coalescência e efeitos por dependência (base: documento/viewport; overlay: seleção/preview/snap).
- `apps/web/src/styles/globals.css`: empilhamento das camadas (`cad-canvas-base`/`cad-canvas-overlay`).

## Decisões técnicas

- **IndexedDB sem Web Worker (por ora).** A serialização ainda roda na main thread, mas agora com debounce e fora do commit de edição; escapar da cota e tirar a escrita do caminho síncrono já remove o crash e a maior parte do custo percebido. Mover a serialização para um Worker fica para um MVP seguinte.
- **String serializada no IndexedDB.** Reusa `serializeCadDocument`/`parseCadDocument` do `cad-io`, mantendo idênticas a validação e a migração de schema.
- **Duas camadas em vez de dirty rects.** Separar estático (documento) de dinâmico (overlay) é a menor mudança que elimina o render do documento a cada `pointermove`, sem reescrever o pipeline do renderer.
- **`requestAnimationFrame` com refs.** As funções de desenho leem o estado mais recente via ref, e o agendamento só ocorre se não houver frame pendente — garantindo coalescência sem desenhar estado obsoleto.
- **Fronteiras preservadas.** O `cad-renderer` continua apenas lendo geometria; a orquestração de camadas e persistência é responsabilidade do `apps/web`.

## Testes

```bash
npx tsc -b                                   # build/typecheck dos pacotes
cd apps/web && npx tsc --noEmit              # typecheck do app web
npm run build                                # build de produção do web
npm run test --workspaces --if-present       # suíte completa (Vitest)
```

### Roteiro de teste manual

1. Desenhe algumas entidades e recarregue a página: o desenho volta (carregado do IndexedDB).
2. Abra o DevTools → Application → IndexedDB → `cad-web` → `documents`: a chave `mvp-document` guarda o documento; a chave legada `cad-web:mvp-document` do localStorage some após a primeira gravação.
3. Com muitas entidades, mova o mouse no zoom aberto: o marcador de snap e o preview respondem sem repintar todo o desenho (apenas o overlay atualiza).
4. `clear` na linha de comando limpa o desenho e a persistência (IndexedDB e localStorage).

## Próximos passos (roadmap de performance)

- **Performance 2**: cache de `entityBoundingBox` (WeakMap) e LOD (nível de detalhe) para tornar o zoom aberto praticável.
- **Performance 3**: render em WebGL com instancing (salto para 500k+ entidades).
- **Performance 4**: geometria/serialização em Web Workers (tirar a serialização da main thread).
