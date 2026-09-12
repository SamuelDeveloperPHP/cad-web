# MVP 3.8.1 — Seleção por área, snap de fechamento e Stretch vinculado

## Objetivo

Três melhorias de interação pedidas em conjunto:

1. Fazer o snap funcionar durante o desenho da Polyline, inclusive sobre os próprios vértices em andamento, para o usuário fechar a figura mirando o primeiro ponto (endpoint, center, nearest).
2. Adicionar seleção por área ao comando Select, com caixa fantasma durante o arrasto e entidades selecionadas exibidas em traço tracejado.
3. Vincular o Stretch à seleção por área: a janela do Stretch destaca (tracejado) as entidades apanhadas.

## 1. Snap durante a Polyline

Antes, o snap só enxergava entidades já confirmadas, então não havia marcador ao voltar sobre o primeiro ponto da polyline em andamento e não dava para fechar a figura visualmente.

Agora a ferramenta ativa pode oferecer entidades de snap da geometria em andamento. A Polyline expõe seus vértices atuais; ao aproximar o cursor do primeiro ponto aparece o marcador Endpoint e o clique fecha exatamente ali. O snap sobre entidades existentes (endpoint, midpoint, center, nearest) continua funcionando.

Mecanismo: o contrato `CadTool` ganhou o método opcional `getSnapEntities()`; o `SnapService.findSnap` e o `resolveSnappedPoint` aceitam entidades extras; a store passa os snaps da ferramenta ativa ao atualizar o marcador. É reutilizável por outras ferramentas de desenho.

## 2. Seleção por área (Select)

O comando Select passou a distinguir clique de arrasto:

- **Clique** (sem arrastar): seleciona a entidade sob o cursor; clicar no vazio limpa a seleção.
- **Arrasto da esquerda para a direita** (janela): seleciona apenas as entidades totalmente contidas. Caixa azul com borda contínua.
- **Arrasto da direita para a esquerda** (cruzamento): seleciona tudo que a caixa cruzar. Caixa verde tracejada.

Durante o arrasto aparece a caixa fantasma. Ao soltar, as entidades selecionadas são desenhadas em verde tracejado. `Esc` cancela o arrasto ou limpa a seleção.

A decisão de seleção acontece no release do ponteiro, o que permitiu separar clique de arrasto sem quebrar a edição de grips de cota.

## 3. Stretch vinculado à seleção por área

Ao fechar a janela do Stretch, as entidades apanhadas passam a ficar selecionadas e são exibidas em verde tracejado, ligando visualmente o Stretch ao mesmo mecanismo de seleção por área. A caixa do Stretch agora também é desenhada (o tipo de preview `selectionBox` não era renderizado antes).

## Arquivos

### Criados

- `packages/cad-tools/src/selection/boxSelection.ts` (helper de entidades na caixa)
- `docs/MVP 3.8.1 — Seleção por área, snap de fechamento e Stretch vinculado.md`

### Alterados

- `packages/cad-tools/src/contracts/CadTool.ts`: método opcional `getSnapEntities()`.
- `packages/cad-tools/src/contracts/ToolContext.ts`: `SnapService.findSnap` aceita `extraEntities`.
- `packages/cad-tools/src/snaps/ObjectSnapService.ts`: mescla as entidades extras; `resolveSnappedPoint` repassa.
- `packages/cad-tools/src/draw/PolylineTool.ts`: `getSnapEntities` e uso dos próprios vértices no snap.
- `packages/cad-tools/src/selection/SelectTool.ts`: seleção por clique e por caixa (janela/cruzamento), decisão no release.
- `packages/cad-tools/src/modify/StretchTool.ts`: seleciona os candidatos da janela como feedback.
- `packages/cad-tools/src/index.ts`: export de `boxSelection`.
- `packages/cad-renderer/src/types.ts` e `entities.ts`: `RenderStyle` ganha `overrideStroke` e `lineDash` para forçar o destaque tracejado.
- `apps/web/src/components/cad/CadCanvas.tsx`: seleção tracejada e desenho da caixa `selectionBox`.
- `apps/web/src/state/useCadStore.ts`: marcador de snap considera a geometria da ferramenta ativa.
- `packages/cad-tools/tests/SelectTool.test.ts`: testes de clique e de caixa (janela e cruzamento).
- `CLAUDE.md`: estado do projeto.

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
```

Na entrega: 423 testes passando. Teste de navegador com Playwright confirmou: marcador Endpoint sobre o primeiro ponto da polyline em andamento e fechamento por snap; caixa de seleção durante o arrasto; entidades selecionadas em verde tracejado; janela seleciona só entidades contidas e cruzamento seleciona as que toca; Stretch destacando os candidatos da janela; nenhum erro de página.

## Teste manual

1. **Polyline**: desenhe três pontos, volte com o cursor sobre o primeiro ponto. Aparece o marcador Endpoint; clique para fechar a figura.
2. **Select janela**: com o comando Select, arraste da esquerda para a direita cobrindo entidades inteiras. Elas ficam tracejadas.
3. **Select cruzamento**: arraste da direita para a esquerda cruzando entidades. Tudo que a caixa toca é selecionado.
4. **Clique**: clique numa borda para selecionar uma entidade; clique no vazio para limpar.
5. **Stretch**: ative Stretch e arraste a janela; os candidatos ficam tracejados antes de você escolher o ponto base.

## Próximos passos recomendados

- Seleção aditiva com Shift.
- Interseção geométrica real (hoje o cruzamento usa o retângulo envolvente da entidade).
- Retomar o roadmap em `MVP 3.9 — EllipseTool`.
