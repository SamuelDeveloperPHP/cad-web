# MVP 3.7.1 — Controles de Zoom (digitar e centralizar)

## Objetivo

Além do zoom pela roda do mouse, permitir digitar o zoom manualmente e centralizar o desenho na tela. Ajuste de UX pedido fora da sequência do roadmap; o slot 3.8 permanece com o StretchTool.

## O que foi adicionado

1. **Digitar o zoom.** O valor de Zoom na barra de status virou um campo editável. O usuário digita a porcentagem e confirma com Enter; o zoom ajusta mantendo fixo o ponto de mundo que está no centro da tela. Entrada inválida volta ao valor atual. `Esc` no campo cancela a edição.
2. **Centralizar o projeto (zoom extents).** Um botão `Fit` na barra de status e os comandos `z`, `za`, `ze`, `zoom`, `zoomall` e `zoomextents` enquadram todas as entidades centralizadas, com margem. Com o desenho vazio, o zoom volta ao enquadramento padrão do documento.

O "zoom" é a escala do viewport, em pixels por unidade de mundo; a barra mostra `escala × 100` como porcentagem (escala 8 aparece como 800%). Digitar 100 corresponde a 1 pixel por unidade.

## Arquivos

### Criados

- `packages/cad-core/src/documentBounds.test.ts`
- `docs/MVP 3.7.1 — Controles de Zoom (digitar e centralizar).md`

### Alterados

- `packages/cad-core/src/spatial.ts`: `documentBoundingBox`, que une os bounding boxes de todas as entidades (null quando vazio).
- `apps/web/src/state/useCadStore.ts`: estado `screenSize`, métodos `setScreenSize`, `setZoomScale` (zoom sobre o centro) e `zoomToExtents`, e o wiring dos comandos de zoom na linha de comando.
- `apps/web/src/components/cad/CadCanvas.tsx`: reporta o tamanho da tela ao store.
- `apps/web/src/components/cad/CadStatusBar.tsx`: componente `ZoomControl` (campo editável + botão `Fit`).
- `apps/web/src/components/cad/CadEditor.tsx`: liga os callbacks de zoom.
- `apps/web/src/styles/globals.css`: estilo do campo de zoom.

## Funções

```ts
documentBoundingBox(document): BoundingBox | null   // cad-core/spatial
```

A ferramenta reaproveita `zoomExtents` e `screenToWorld` do `cad-renderer`, que já existiam.

## Decisão técnica

O zoom extents precisa do tamanho da tela para calcular a escala que enquadra o desenho.
Esse tamanho vivia apenas no `CadCanvas`; agora ele é reportado ao store, que passa a
oferecer `setZoomScale` e `zoomToExtents` de forma centralizada, sem cálculo geométrico
dentro de componente React (o cálculo de limites está em `cad-core` e a matemática de
viewport em `cad-renderer`).

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-core src/documentBounds.test.ts
npm run test --workspaces --if-present
```

Na entrega: 405 testes passando. Teste de navegador com Playwright confirmou: digitar
800 → 200 → 35 no campo; `Fit` e o comando `z` produzindo o mesmo enquadramento (todas
as entidades); uma única entidade centralizada preenchendo a área com margem; entrada
inválida revertendo ao valor atual; nenhum erro de página.

## Teste manual

1. Desenhe algumas entidades espalhadas.
2. Clique no campo de Zoom na barra de status, digite `50` e Enter. O zoom vai para 50%.
3. Digite um valor inválido e Enter: o campo volta ao valor atual.
4. Clique em `Fit`. Todas as entidades aparecem centralizadas com margem.
5. Apague tudo e clique em `Fit`: o zoom volta ao enquadramento padrão.
6. Digite `z` na linha de comando: mesmo efeito do `Fit`.
7. Use a roda do mouse: o zoom pelo ponteiro continua funcionando.

## Próximos passos recomendados

- `Zoom Window` (enquadrar uma região retangular escolhida com dois cliques).
- `Zoom Previous` (voltar ao enquadramento anterior).
- Retomar o roadmap em `MVP 3.8 — StretchTool`.
