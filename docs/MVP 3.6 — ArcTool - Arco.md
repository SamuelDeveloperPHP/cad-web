# MVP 3.6 — ArcTool (Arco)

## Objetivo

Permitir que o usuário desenhe arcos diretamente. A `ArcEntity` já existia desde o MVP 2.9 (Fillet) e já era suportada por renderer, JSON, SVG, snaps, hit testing, índice espacial e Properties Panel; faltava a ferramenta de desenho.

## Comandos

- `a`
- `arc`
- `arco`

Dentro da ferramenta, pela linha de comando:

- `ce`, `center` ou `centro`: muda para o modo centro/início/fim.
- `3p`, `3points` ou `3pontos`: volta para o modo três pontos (padrão).

A letra `c` isolada não é usada porque é alias do CircleTool e a linha de comando trocaria de ferramenta.

## Modos

### Três pontos (padrão)

1. Clique no ponto inicial.
2. Mova o mouse: aparece rubber band do início ao cursor.
3. Clique em um ponto sobre o arco.
4. Mova o mouse: aparece o arco fantasma que passa pelos três pontos.
5. Clique no ponto final. O arco é criado.

O centro é o circuncentro do triângulo; o sentido é escolhido de modo que o ponto intermediário fique sobre o arco.

### Centro, início e fim

1. Digite `ce` antes do primeiro clique.
2. Clique no centro.
3. Clique no ponto inicial (define o raio).
4. Clique no ponto final. O ponto é projetado sobre a circunferência; o arco percorre ângulos crescentes (`clockwise: true` na convenção do documento, equivalente ao sentido anti-horário do AutoCAD com Y para cima).

### Cancelamento e erros

- `Esc` cancela, limpa o preview e volta ao modo três pontos.
- Pontos colineares ou coincidentes: a ferramenta descarta o último ponto, mantém os dois primeiros e mostra o motivo.
- Tentar trocar de modo após o primeiro ponto retorna erro; é preciso `Esc` antes.

## Arquivos

### Criados

- `packages/cad-tools/src/draw/ArcTool.ts`
- `packages/cad-tools/tests/ArcTool.test.ts`
- `docs/MVP 3.6 — ArcTool - Arco.md`

### Alterados

- `packages/cad-geometry/src/arc.ts`: `computeArcFromThreePoints`, `computeArcFromCenterStartEnd`, tipo `ArcConstructionResult`.
- `packages/cad-geometry/src/arc.test.ts`: 8 testes novos (arco por três pontos acima e abaixo da corda, arco descentralizado, colineares, coincidentes, centro/início/fim, raio zero, varredura zero).
- `packages/cad-tools/src/index.ts`: export da ferramenta.
- `packages/cad-tools/src/command-line/CommandAliases.ts`: aliases `a`, `arc`, `arco`.
- `apps/web/src/tools/toolRegistry.ts`, `apps/web/src/state/useCadStore.ts`, `apps/web/src/components/cad/CadRibbon.tsx`, `CadToolbar.tsx`, `CadCommandLine.tsx`, `CadStatusBar.tsx`: integração do botão Arc (ícone `Rainbow`), tipo `ActiveCadTool`, prompt e rótulo.
- `CLAUDE.md`: estado do projeto.

## Funções geométricas

```ts
computeArcFromThreePoints(start, middle, end, epsilon?): ArcConstructionResult
computeArcFromCenterStartEnd(center, start, end, clockwise?, epsilon?): ArcConstructionResult
```

Ambas retornam `{ ok: true, arc }` ou `{ ok: false, reason }` e nunca lançam exceção.

## Comando

A ferramenta emite `CreateEntityCommand` com uma `ArcEntity` na layer ativa; undo e redo passam pelo `CommandHistory` já existente.

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-geometry src/arc.test.ts
npx vitest run --root packages/cad-tools tests/ArcTool.test.ts
npm run test --workspaces --if-present
```

Resultado na entrega: 378 testes passando em 42 arquivos. Teste de navegador com Playwright confirmou: arco por três pontos criado, contador de entidades atualizado, Ctrl+Z e Ctrl+Y funcionando, modo `ce` criando arco, snap de endpoint ativo durante o desenho, nenhum erro de página.

## Teste manual

1. Ative Arc pela toolbar, ribbon ou digitando `a`.
2. Clique três pontos não alinhados. Confirme o arco.
3. Selecione o arco e verifique centro, raio e ângulos no Properties Panel.
4. Ctrl+Z e Ctrl+Y.
5. Digite `a`, depois `ce`. Clique centro, início e fim.
6. Clique três pontos alinhados: deve aparecer "Points are collinear." sem criar entidade.
7. Teste snap endpoint e midpoint no arco criado.
8. Export JSON, Clear, Import JSON: o arco volta.
9. Export SVG: o arco aparece.
10. Bloqueie a layer e confirme que o comando é recusado.

## Próximos passos recomendados

- `MVP 3.7 — MirrorTool` (o alias `mi`/`mirror` já está reservado em `CommandAliases.ts`).
- Entrada numérica no modo centro (raio e ângulo pela linha de comando).
- Modo início/fim/raio, comum em desenho mecânico.
