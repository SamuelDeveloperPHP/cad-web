# MVP 3.27 — Performance de produção

## Objetivo

Desenhos de **50–70 mil objetos** (plantas importadas de DXF, bibliotecas inteiras de blocos) precisam continuar fluidos: pan e zoom a 60 fps, seleção total, mover/apagar/desfazer sem congelar, importação e reabertura sem tarefa longa na thread principal. Este MVP não é um ajuste pontual: troca o índice espacial, o pipeline de desenho e o fluxo de interação do app, e inclui um **laboratório de medição** reproduzível para provar cada ganho.

## Resultado

Medições do `scripts/perf/browser-bench.mjs` em Chromium headless com canvas por **software** (pior caso: sem GPU), build de produção, antes (código do MVP 3.26) e depois. "Bloqueado" é a soma das tarefas longas (> 50 ms) da thread principal na fase; "p95" é o intervalo entre quadros.

**Perfil `cluster`** — 66 668 objetos em 40 salas densas (o desenho típico de planta):

| Fase | Antes | Depois |
| --- | --- | --- |
| Importar DXF | 2,3 s bloqueado (tarefa de 1,5 s) | 0,2 s bloqueado (maior tarefa 138 ms; o parse roda em Worker) |
| Pan (40 passos) | 8,3 s bloqueado, 38 tarefas longas, p95 233 ms | 0 s bloqueado, p95 16,8 ms (60 fps) |
| Zoom pela roda (12 passos) | 1,7 s bloqueado, p95 167 ms | 0 s bloqueado, p95 16,8 ms |
| Selecionar tudo (janela) | 43 s bloqueado (tarefa de 15 s) | 0,1 s |
| Mover o mouse com tudo selecionado | **34 s por movimento** | 22 ms por movimento |
| Pré-visualização do Move (tudo selecionado) | ≈ 370 ms por movimento | ≈ 46 ms por movimento |
| Executar Move com tudo selecionado | 6,5 s | 0,2 s |
| Desfazer / Apagar / Desfazer | — | 0,06 s / 0,05 s / 0,05 s |

**Perfil `random`** — 66 668 objetos espalhados em 4 000 × 4 000 mm (zoom total = janela de snap com milhares de entidades):

| Fase | Antes | Depois |
| --- | --- | --- |
| Importar DXF | 2,5 s bloqueado | 0,3 s bloqueado |
| Pan (40 passos) | **39 s bloqueado** (tarefa de 13,8 s) | 0 s bloqueado, p95 33 ms |
| Zoom pela roda | 4,7 s bloqueado | 0 s bloqueado |
| Mover o mouse sem seleção | **11,7 s por movimento** (snap O(k²)) | 20 ms por movimento |
| Selecionar tudo | 62 s bloqueado | 0,2 s |
| Mover o mouse com tudo selecionado | 23,7 s por movimento | 36 ms por movimento |
| Pan com tudo selecionado | a página encerrou durante a fase | 0,2 s bloqueado |

**Perfil `utm`** — 26 668 objetos com coordenadas de 10⁹ mm e linhas de 5 000 000 de comprimento (o pior caso da grade antiga):

| Fase | Antes | Depois |
| --- | --- | --- |
| Importar DXF | **47 s bloqueado** (uma tarefa de 45,7 s: cada linha longa entrava em dezenas de milhares de células) | 0,17 s bloqueado |
| Pan | não terminou em mais de 8 min (a grade percorria bilhões de células por quadro) | 0 s bloqueado |
| Seleção total, mouse, Move, Undo, Apagar | — (não alcançado) | todos sem tarefa longa; mouse 8–14 ms |

Comparação visual (screenshots do app antigo e do novo): o desenho de exemplo é **idêntico pixel a pixel**; no desenho denso de 50 mil objetos 98 998 contra 99 025 pixels acesos (Fit), com 2,5 % dos pixels diferentes por causa da ordem de desenho entre cores e da decimação.

## O que mudou

### 1. Índice espacial R-tree empacotado (`cad-core/src/spatial.ts`)

- `SpatialIndex` (STR — Sort-Tile-Recursive) em arrays tipados `Float64Array`/`Uint32Array`, montado de uma vez na primeira consulta. Substitui a grade fixa de células de 100 unidades, que degradava com entidades longas (cada uma entrava em milhares de células) e com coordenadas georreferenciadas (UTM com 10⁹ mm).
- Cada entidade aparece **uma vez** no resultado e a consulta devolve na **ordem do documento** (ordem de desenho); `queryOrdinals` devolve as posições, `bounds()` o envoltório total.
- Envoltórios inválidos (NaN/∞) ficam fora da árvore. O cache por array de entidades agora também depende de `document.blocks`: editar uma definição de bloco invalida o índice.
- `getEntityById(document, id)`: mapa id → entidade em cache por array imutável (primeira ocorrência vence, como `find`). Troca os `entities.find(...)` dentro de laços sobre a seleção (Move, Rotate, Scale, Erase, Explode, Array, Array Polar, Path Array), que eram O(N·M).

### 2. Renderer em lote por estilo, com orçamento de tempo (`cad-renderer/src/renderJob.ts`)

- `DocumentRenderJob`: **coleta** (índice espacial + camadas + LOD) → **agrupa por estilo** (cor, espessura, tracejado) → desenha cada grupo com **um caminho e um `stroke()` por lote de até 1 500 formas** → pontos do LOD (um `fillStyle` por cor) → cotas e textos legíveis um a um. Antes: um `stroke()`, `strokeStyle`, `lineWidth` e `setLineDash` por entidade.
- `step(orçamentoMs)` avança por fatias e devolve `true` ao terminar; `cancel()` restaura o contexto. `renderDocument2D` continua existindo (síncrono, usado por previews e testes) e é só `job.step()`.
- Transformação mundo→tela inline (sem alocar pontos); arcos, círculos e elipses recebem `moveTo` no ponto inicial para não ligar formas do mesmo lote; **decimação de polylines** (vértices a menos de 0,4 px do último desenhado são descartados; primeiro e último são mantidos); `screenSize` em pixels CSS para o culling (antes usava pixels do dispositivo).
- `RenderStats` ganhou `strokeCalls`, `dotEntities`, `decimatedVertices`, `steps` e `complete`.
- **Ordem de desenho**: dentro de uma mesma fatia, os grupos de estilo são desenhados na ordem em que aparecem no documento e, dentro do grupo, na ordem do documento; cotas e textos legíveis ficam por cima. Sobreposições entre cores diferentes podem mudar de camada visual em relação ao desenho individual anterior (o resultado é igual ao AutoCAD sem *draw order* explícito).

### 3. Camadas progressivas no app (`apps/web/.../progressiveLayer.ts`, `CadCanvas.tsx`)

- **Buffer duplo**: o desenho novo acontece num canvas fora da tela, em fatias de 9 ms por quadro, e só é copiado para o canvas visível quando termina — nunca aparece um quadro pela metade.
- **Proxy de interação**: enquanto o desenho novo não termina (pan/zoom em desenho grande), o bitmap antigo é reposicionado por `transform: translate() scale()` na GPU para acompanhar o viewport; um pedido novo cancela o desenho em andamento, então só o estado final é desenhado em alta qualidade. Em desenhos pequenos o desenho termina no primeiro quadro e o comportamento é idêntico ao anterior.
- **Camada de seleção em cache** (canvas próprio entre a base e o overlay): o destaque verde tracejado não é mais redesenhado a cada movimento do mouse; só quando documento, seleção ou viewport mudam. A lista de entidades selecionadas é memoizada para o índice espacial da seleção também ficar em cache. O overlay dinâmico (mira, grips, preview, snap) ficou leve.
- Remove o `selectedEntityIds.includes` por entidade (O(N·M): 34 s por movimento do mouse com tudo selecionado) e o equivalente no painel de propriedades.

### 4. Snap e pré-visualizações em desenho denso

- **Snap** (`ObjectSnapService`): no máximo 48 entidades (as mais próximas do cursor, pelo envoltório) entram no cálculo; a interseção compara só as **primitivas dentro da janela de tolerância** do cursor (`snap.ts` — exato, pois candidatos fora da tolerância eram descartados) e tem orçamento de 250 mil testes segmento × segmento (mais próximas primeiro). O custo era quadrático no número de entidades e no de segmentos de polylines/splines.
- **Pré-visualização do Move/Rotate/Scale/Mirror**: acima de 3 000 entidades o fantasma mostra uma amostra uniforme da seleção (`modify/ghostPreview.ts`); o comando continua atuando em todas.

### 5. Importação e persistência fora da thread principal

- `workers/documentParse.worker.ts` + `services/documentParser.ts`: o DXF importado e o JSON recarregado do IndexedDB são analisados num **Web Worker**; o resultado volta em lotes de 2 000 entidades (uma única mensagem de milhões de objetos levava ~700 ms para desserializar). Sem `Worker` (testes) cai para a thread principal.
- Gravação: `serializeDocumentCooperatively` cede o controle a cada ~8 ms, usa JSON compacto e o debounce cresce com o tamanho do desenho (500 ms + 1 ms a cada 20 entidades, até 5 s).

## Laboratório de performance

```bash
# 1. Gera desenhos de teste determinísticos (random | cluster | utm)
node scripts/perf/generate-dxf.mjs /tmp/cluster-50k.dxf 50000 cluster
node scripts/perf/generate-dxf.mjs /tmp/random-50k.dxf 50000 random
node scripts/perf/generate-dxf.mjs /tmp/utm-20k.dxf 20000 utm

# 2. Sobe o app (build de produção) e roda o benchmark no navegador
npm run build --workspace @cad-web/web && npm run preview --workspace @cad-web/web -- --port 5175
CAD_URL=http://127.0.0.1:5175/ node scripts/perf/browser-bench.mjs /tmp/cluster-50k.dxf rotulo saida.json
# BENCH_MOVES=12 (movimentos do mouse), BENCH_PROFILE="Move: preview" (perfil de CPU de uma fase),
# PLAYWRIGHT_MODULE / CHROMIUM_PATH para usar um Playwright/Chromium já instalado.
```

- `generate-dxf.mjs`: mistura de linhas, círculos, arcos, polylines com bulge, textos, blocos (rotacionados), polylines de 200 vértices e splines em 10 camadas; o perfil `utm` usa coordenadas de 10⁹ mm e 1 em 50 linhas com 5 000 000 de comprimento (o pior caso da grade antiga).
- `browser-bench.mjs`: importa, faz pan/zoom, mouse, seleciona tudo, mouse e pan com seleção, pré-visualização do Move, executa Move/Undo/Apagar/Undo e recarrega; por fase mede intervalos entre quadros (p50/p95/máx), tarefas longas (> 50 ms) e latência por movimento do mouse.

## Arquivos

- `packages/cad-core/src/spatial.ts` (`SpatialIndex`, `getEntityById`), testes em `spatial.test.ts` (R-tree × busca linear, coordenadas enormes, ordem do documento, 100 mil entidades).
- `packages/cad-renderer/src/renderJob.ts` (+ `renderJob.test.ts`, 10 testes), `entities.ts` (cota e texto exportados), `index.ts`.
- `packages/cad-geometry/src/snap.ts` (janela e orçamento da interseção), `snap.test.ts`.
- `packages/cad-tools/src/snaps/ObjectSnapService.ts`, `modify/ghostPreview.ts` e `modify/{Move,Rotate,Scale,Mirror,Erase,Explode,Array,ArrayPolar,PathArray}Tool.ts`; testes `ObjectSnapService.test.ts`, `GhostPreview.test.ts`.
- `apps/web/src/components/cad/{CadCanvas.tsx,progressiveLayer.ts,CadPropertiesPanel.tsx}`, `workers/documentParse.worker.ts`, `services/{documentParser,cadDocumentStorage,cadJsonExport}.ts`, `styles/globals.css`.
- `scripts/perf/{generate-dxf.mjs,browser-bench.mjs}`.

## Fora de escopo (próximos passos)

- Renderização em `OffscreenCanvas` num Worker e/ou WebGL/WebGPU (o desenho já é um job cancelável, o que facilita a mudança).
- Persistência incremental por entidade (hoje regrava o documento inteiro, de forma cooperativa).
- Pré-visualização do Move com *bitmap* deslocado e sem amostragem; seleção por janela direto no índice espacial para a seleção total.

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. Gere `cluster-50k.dxf` (comando acima) e importe com **Importar → DXF**: a interface não congela e o desenho aparece enquadrado.
2. Faça pan (botão do meio) e zoom (roda): o desenho acompanha o mouse e se refina quando você para.
3. Selecione tudo com uma janela: o destaque verde tracejado aparece sem travar; mova o mouse com a seleção ativa.
4. Execute **Move** com tudo selecionado: o fantasma mostra uma amostra da seleção; ao confirmar, tudo se move. `Ctrl+Z` desfaz.
5. Recarregue a página: o desenho volta do IndexedDB sem congelar.
