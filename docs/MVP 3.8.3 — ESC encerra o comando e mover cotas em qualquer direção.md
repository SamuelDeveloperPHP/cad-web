# MVP 3.8.3 — ESC encerra o comando e mover cotas em qualquer direção

## Objetivo

Corrigir dois pontos relatados no uso real:

1. **Esc encerra a ferramenta.** Ao selecionar uma ferramenta, aplicá-la e apertar `Esc`, o comando é encerrado, o objeto é liberado da atuação da ferramenta e o controle volta para a ferramenta **Select**.
2. **Mover cotas em qualquer direção.** A cota (dimension) passa a se mover nos eixos +X, +Y, −X e −Y como qualquer outra entidade, junto com o comando **Move** (e demais comandos que reutilizam a translação de entidades).

## Comportamento

### Esc → Select

- Fora da ferramenta Select, `Esc` cancela a operação em andamento da ferramenta ativa, volta para a ferramenta **Select** e limpa a seleção (libera o objeto).
- Na própria ferramenta Select, o `Esc` continua sendo tratado em estágios pela própria ferramenta: cancela primeiro uma edição de grip, depois uma janela de seleção em andamento e, por fim, limpa a seleção.
- O modo **Zoom Window** mantém o `Esc` que já existia (sai do modo e volta para Select).

### Mover cotas

- Antes, a função de translação de entidades do `cad-core` tratava `line`, `rectangle`, `circle`, `arc` e `polyline`, mas **ignorava `dimension`** — mover uma cota selecionada não fazia nada.
- Agora a cota inteira é transladada: todos os pontos da definição andam pelo mesmo vetor. Como a distância entre os pontos não muda, o valor medido e o estilo permanecem.

| Tipo de cota      | Pontos transladados no Move                          |
| ----------------- | ---------------------------------------------------- |
| Linear / Aligned  | `firstPoint`, `secondPoint`, `dimensionLinePoint`    |
| Radius / Diameter | `center`, `leaderEndPoint` (o raio não muda)         |
| Angular           | `vertex`, `firstPoint`, `secondPoint`, `arcPoint`    |

## Arquivos

### Alterados

- `packages/cad-core/src/index.ts`: a função `moveEntity` passa a tratar `dimension` (novo helper `moveDimensionEntity`, translação pura de todos os pontos da definição) e foi exportada para reúso.
- `packages/cad-tools/src/modify/MoveTool.ts`: o preview fantasma passa a usar o `moveEntity` canônico do `cad-core` (removido o `moveEntity` local duplicado, que não tratava cotas/arcos/polylines), mantendo preview e comando coerentes.
- `apps/web/src/state/useCadStore.ts`: o `Esc` no `dispatchKeyDown` encerra o comando da ferramenta ativa, volta para **Select** e limpa a seleção; na ferramenta Select o tratamento em estágios é preservado.
- `packages/cad-core/src/index.test.ts`: testes de move de cota linear, cota de raio (raio preservado) e undo de cota movida.
- `packages/cad-tools/tests/MoveTool.test.ts`: teste do preview fantasma mostrando a cota acompanhando o deslocamento.

## Decisões técnicas

- **Translação única no core.** Corrigir a translação em `cad-core.moveEntity` conserta o Move e qualquer comando que reutilize a translação, sem duplicar regra por ferramenta. O `undo` do `MoveEntitiesCommand` já nega o deslocamento, então a cota volta ao lugar de forma simétrica.
- **Preview = comando.** O `MoveTool` deixou de manter uma cópia própria de `moveEntity`; usa a do core, garantindo que o fantasma mostre exatamente o que o comando fará (inclusive para cotas, arcos e polylines).
- **Esc uniforme, Select em estágios.** O encerramento por `Esc` fica no orquestrador (store), que conhece a ferramenta ativa. A ferramenta Select mantém seu `Esc` escalonado, evitando limpar a seleção antes de cancelar um grip/janela.

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-core src/index.test.ts
npx vitest run --root packages/cad-tools tests/MoveTool.test.ts
npm run test --workspaces --if-present
```

Na entrega: suíte completa passando. Teste de navegador (Playwright) confirmou o `Esc` voltando para **Select** a partir de Line (após aplicar um ponto), Move e Stretch, sem erros de página. A translação de cotas é coberta por testes unitários no core (linear, raio e undo) e no `MoveTool` (preview).

## Teste manual

1. **Esc:** ative qualquer ferramenta (ex.: Line), clique um ponto, aperte `Esc`. A ferramenta volta para **Select** e a seleção é liberada.
2. **Mover cota:** desenhe uma linha e cote-a (`dli`). Selecione a cota, ative **Move** (`m`), escolha um ponto base e arraste em qualquer direção (+X, +Y, −X, −Y). A cota inteira acompanha; `Ctrl+Z` desfaz.
3. Repita o Move com uma cota de raio e uma angular.

## Próximos passos recomendados

- Retomar o roadmap em `MVP 3.9 — EllipseTool`.
