# MVP 3.7.2 — Zoom completo (Window, Previous, In/Out)

## Objetivo

Completar o conjunto de zoom do editor, somando ao zoom por roda, ao zoom digitado e ao zoom extents (MVP 3.7.1) as operações que faltavam para um fluxo de CAD: Zoom Window, Zoom Previous e Zoom In/Out.

## O que foi adicionado

1. **Zoom Window.** Enquadra uma região retangular escolhida na tela. Ativa-se pelo botão `Win` na barra de status ou pelo comando `zw` (`zoomwindow`). O usuário arrasta um retângulo sobre o desenho; ao soltar, a região é enquadrada e a ferramenta volta para Select. `Esc` cancela o modo.
2. **Zoom Previous.** Restaura o enquadramento anterior. Botão `Prev` na barra de status ou comando `zp` (`zoomprev`, `zoomprevious`). O store mantém uma pilha com até 30 viewports, empilhando o estado antes de cada zoom discreto (digitado, in/out, extents, window).
3. **Zoom In / Zoom Out.** Botões `+` e `−` na barra de status ampliam ou reduzem em passos de 1,25×, mantendo fixo o centro da tela.

O zoom pela roda do mouse e o zoom digitado continuam funcionando.

## Arquivos

### Criados

- `docs/MVP 3.7.2 — Zoom completo (Window, Previous, In-Out).md`

### Alterados

- `apps/web/src/state/useCadStore.ts`: pilha de histórico de viewport (`viewportHistoryRef`, `pushViewportHistory`); métodos `zoomIn`, `zoomOut`, `zoomToWindow`, `zoomPrevious`; `zoomWindow` como modo especial de `ActiveCadTool` (igual ao `pan`); comandos `zw`/`zp` e `Esc` para sair do modo.
- `apps/web/src/components/cad/CadCanvas.tsx`: modo de arrasto do Zoom Window com retângulo em overlay; converte os cantos de tela em mundo e chama `zoomToWindow`.
- `apps/web/src/components/cad/CadStatusBar.tsx`: botões `−`, `+`, `Fit`, `Win` e `Prev` no controle de zoom.
- `apps/web/src/components/cad/CadEditor.tsx`: liga os novos callbacks.
- `apps/web/src/components/cad/CadCommandLine.tsx`: prompt do modo Zoom Window.
- `apps/web/src/styles/globals.css`: estilo do retângulo de Zoom Window e dos botões de passo.

## Decisões técnicas

- **Zoom Window como modo, não como ferramenta CAD.** Assim como o `pan`, o Zoom Window não altera o documento nem gera comando; é um modo de `activeTool` tratado diretamente no canvas. Isso mantém a regra de que ferramentas de `cad-tools` só produzem comandos de documento.
- **Retângulo em overlay.** O retângulo de arrasto é um `div` posicionado sobre o canvas, não um desenho no canvas, evitando repintura a cada movimento do ponteiro.
- **Reuso do `zoomExtents`.** O Zoom Window converte os dois cantos de tela em mundo e reaproveita `zoomExtents` do `cad-renderer` com margem pequena, sem duplicar matemática de viewport.
- **Histórico só de zooms discretos.** A pilha do Zoom Previous não registra cada passo da roda nem o pan contínuo, apenas os zooms discretos, o que reproduz o comportamento esperado de "voltar ao enquadramento anterior".

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
```

Na entrega: 405 testes passando. Teste de navegador com Playwright confirmou: `−`/`+` alternando 800% → 640% → 800%; Zoom Window com retângulo de arrasto ampliando a região e voltando para Select; Zoom Previous restaurando o enquadramento anterior; comandos `zw` e `z`; `Esc` saindo do modo Zoom Window (com o foco fora de campos de texto); nenhum erro de página.

## Teste manual

1. Clique em `Win` (ou digite `zw`). O cursor entra no modo Zoom Window.
2. Arraste um retângulo sobre uma região do desenho. Ao soltar, a região enche a tela.
3. Clique em `Prev` (ou digite `zp`). Volta ao enquadramento anterior.
4. Use `+` e `−` para ampliar e reduzir em passos.
5. Ative `Win` e pressione `Esc`: o modo é cancelado e volta para Select.
6. Combine com `Fit` e com o zoom digitado; cada operação pode ser desfeita com `Prev`.

## Próximos passos recomendados

- Retomar o roadmap em `MVP 3.8 — StretchTool`.
- Opcional: atalho de teclado dedicado para Zoom Previous e indicador visual do modo Zoom Window.
