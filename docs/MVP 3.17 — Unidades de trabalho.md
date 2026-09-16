# MVP 3.17 — Unidades de trabalho (input e leitura na unidade escolhida)

## Objetivo

Fazer a unidade selecionada no rodapé ser a **unidade de trabalho**: o que o usuário **digita** e o que o app **mostra ao vivo** passam a ser interpretados/exibidos nessa unidade, enquanto a geometria continua **armazenada em mm** (unidade base). Assim, com a unidade em `m`, digitar `5` cria 5 m; a distância na entrada dinâmica aparece em m; e nada muda no arquivo salvo nem no kernel.

Complementa o item 1 (leitura X/Y já convertida) e o MVP das cotas (que já convertem via `formatMeasurement`).

## Conceito central

- **Unidade base (armazenamento):** `document.units` = `mm`. Toda geometria continua em mm — sem migração de arquivos, sem risco no undo/redo/serialização.
- **Unidade de trabalho (lente):** `document.displayUnit`. Governa entrada e exibição.
- **Fator de conversão:** `unitScale = convertUnit(1, displayUnit, document.units)` (mm por unidade de trabalho). Ex.: `m→mm` = 1000, `in→mm` = 25,4.
  - Digitou (trabalho) → base: `valorMm = valorDigitado × unitScale`.
  - Base → exibição (trabalho): `valorTrabalho = valorMm ÷ unitScale`.

## Comportamento

- Com unidade `m`: digitar distância `5` numa linha → segmento de 5000 mm; `@10,20` → (10 m, 20 m); `@10<45` → 10 m na direção 45°.
- A **entrada dinâmica** mostra distância/largura/altura/raio na unidade de trabalho (o ângulo continua em graus, sem unidade).
- O **prompt numérico** de raio do Fillet / distância do Chamfer passa a ser na unidade de trabalho.
- Coordenadas absolutas digitadas (`x,y`) são interpretadas na unidade de trabalho.
- **Ângulos** nunca convertem (sempre graus).
- Trocar a unidade **não reescala** a geometria existente (só muda a lente de entrada/leitura), como o INSUNITS do AutoCAD.

## Arquitetura (decisão principal)

Converter **na fronteira texto→geometria**, passando um `unitScale` numérico pelo `ToolContext` (não acopla React ao kernel — é só um número):

1. `ToolContext` ganha `unitScale: number` (além do `units`/`precision` que já existem).
2. `resolveDirectInput(result, referencePoint, cursorDirection, unitScale = 1)` multiplica por `unitScale`: distância, offset relativo, distância polar e coordenadas absolutas — antes de virar ponto em mm. Ângulo intacto.
3. Cada tool passa `context.unitScale` na chamada de `resolveDirectInput`.
4. `CircleTool.parseRadius` e `RectangleTool.parseDimensions` multiplicam o valor por `unitScale`.
5. Entrada dinâmica: `computeDynamicMetrics` divide os deltas (mm) por `unitScale` → distância/dx/dy em unidade de trabalho; `buildDynamicSubmission` emite valores de trabalho; o tool reconverte. Round-trip consistente.

## Arquivos

### Alterados — `packages/cad-tools`

- `src/contracts/ToolContext.ts`: adicionar `unitScale: number`.
- `src/draw/directInput.ts`: `resolveDirectInput` recebe `unitScale` e aplica a distâncias/coords (não ao ângulo).
- `src/draw/LineTool.ts`, `ArcTool.ts`, `EllipseTool.ts`, `EllipseArcTool.ts`, `PolylineTool.ts`: passar `context.unitScale`.
- `src/draw/CircleTool.ts`, `RectangleTool.ts`: aplicar `unitScale` no `parseRadius`/`parseDimensions`.

### Alterados — `apps/web`

- `src/state/useCadStore.ts`: `createToolContext` calcula `unitScale = convertUnit(1, displayUnit, document.units)`.
- `src/components/cad/dynamicInput.ts`: `computeDynamicMetrics`/`dynamicPlaceholders`/`buildDynamicSubmission` cientes de `unitScale`.
- `src/components/cad/DynamicInputOverlay.tsx` + `CadCanvas.tsx`: repassar `unitScale` e exibir o sufixo da unidade nos campos.
- `src/components/cad/CadCommandLine.tsx`: prompts mostrando a unidade de trabalho.

## Decisões técnicas

- **Base fixa em mm.** Kernel e arquivos permanecem em mm; a unidade de trabalho é só uma lente de fronteira → sem migração e sem tocar em tolerância (`CAD_EPSILON` continua em mm).
- **`unitScale` numérico no contexto.** Mantém a regra "kernel não depende de React": os tools recebem um número, não a lógica de unidades.
- **Ângulo sempre em graus.** Só comprimentos convertem.
- **Sem reescala ao trocar unidade.** Coerente com AutoCAD; evita surpresa de geometria "pulando".
- **Precisão por unidade** reaproveitando o mapa criado no item 1.

## Fora de escopo (futuro)

- Mudar a **unidade base** do documento (armazenar em unidade ≠ mm) e migração de schema.
- Grid métrico/imperial e snap por grade na unidade de trabalho.
- Escala 1:1 fisicamente calibrada (plotagem).

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. Unidade `m`: desenhar linha digitando `5` → conferir 5000 mm no JSON.
2. `@2,1` no Rectangle → 2000×1000 mm.
3. Circle `40` → raio 40000 mm.
4. Entrada dinâmica mostrando o valor em `m` (distância) e ângulo em graus.
5. Repetir em `cm`/`in` e conferir os fatores (×10, ×25,4).
6. Trocar de unidade não move a geometria já desenhada.
