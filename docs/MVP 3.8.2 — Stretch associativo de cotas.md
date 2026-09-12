# MVP 3.8.2 — Stretch associativo de cotas

## Objetivo

Fazer as cotas acompanharem o Stretch. Antes, o `stretchEntity` devolvia as cotas inalteradas (limitação registrada no MVP 3.8), então esticar uma geometria cotada deixava a cota parada e com o valor antigo. Agora a cota segue a geometria e o valor recalcula sozinho.

Este documento substitui a linha "Dimension: não é esticada nesta fase" da tabela do `docs/MVP 3.8 — StretchTool - Esticar.md`.

## Comportamento

O Stretch aplica às cotas a mesma regra das demais entidades: cada ponto da definição que estiver dentro da janela se move pelo deslocamento; os de fora permanecem. Como o valor exibido é derivado dos pontos da definição, ele se atualiza automaticamente.

| Tipo de cota      | Pontos que acompanham o stretch                          |
| ----------------- | -------------------------------------------------------- |
| Linear / Aligned  | `firstPoint`, `secondPoint`, `dimensionLinePoint`        |
| Radius / Diameter | `center`, `leaderEndPoint` (o raio não muda)             |
| Angular           | `vertex`, `firstPoint`, `secondPoint`, `arcPoint`        |

Exemplo: uma linha cotada em 37.50 mm; ao esticar o extremo direito 15 mm para a direita (com esse extremo dentro da janela), a cota acompanha e passa a exibir 52.50 mm.

Se nenhum ponto da cota estiver dentro da janela, a cota permanece exatamente a mesma (mesma referência, para o Stretch não gravar alteração inútil).

## Arquivos

### Alterados

- `packages/cad-core/src/index.ts`: o ramo de `dimension` do `stretchEntity` passa a mover os pontos da definição dentro da janela (função `stretchDimensionEntity`).
- `packages/cad-core/src/stretch.test.ts`: testes para cota linear (um extremo dentro, outro fora), cota fora da janela, raio e angular.
- `docs/MVP 3.8.2 — Stretch associativo de cotas.md` (novo).
- `CLAUDE.md`: estado do projeto.

## Decisões técnicas

- **Regra uniforme.** A cota usa a mesma lógica "move os pontos dentro da janela" das linhas e polylines, o que mantém o comportamento previsível e o cálculo do valor coerente com os pontos.
- **Sem escala.** O Stretch translada pontos; o raio de cotas de raio/diâmetro não é alterado, pois o stretch não redimensiona círculos.
- **Referência preservada.** Quando nenhum ponto entra na janela, a função devolve a mesma cota, permitindo ao `StretchTool` incluir no comando apenas as entidades que realmente mudaram.

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-core src/stretch.test.ts
npm run test --workspaces --if-present
```

Na entrega: 427 testes passando. Teste de navegador com Playwright confirmou: cota linear de 37.50 mm virando 52.50 mm ao esticar o extremo dentro da janela; a linha de cota e as extensões acompanhando; undo restaurando; nenhum erro de página.

## Teste manual

1. Desenhe uma linha horizontal e cote-a (`dli`).
2. Ative Stretch, arraste uma janela sobre o extremo direito da linha (que também cobre a origem direita da cota).
3. Escolha o extremo como ponto base e puxe para a direita.
4. A linha estica, a cota acompanha e o valor aumenta.
5. Ctrl+Z restaura linha e cota juntas.
6. Repita com uma cota de raio sobre um círculo e com uma cota angular.

## Próximos passos recomendados

- Retomar o roadmap em `MVP 3.9 — EllipseTool`.
- Cotas verdadeiramente associativas por id (a cota referenciar a entidade e recalcular sozinha em qualquer edição), quando houver o vínculo entidade↔cota.
