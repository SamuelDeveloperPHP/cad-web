# MVP 3.8 — StretchTool (Esticar)

## Objetivo

Permitir esticar entidades: mover apenas os vértices que estão dentro de uma janela de seleção, mantendo os de fora. É a operação clássica de "stretch" do CAD, usada para alongar ou encurtar partes do desenho sem redesenhar.

## Comandos

- `s`
- `stretch`
- `esticar`

## Fluxo

1. Ative Stretch pela ribbon, toolbar ou digitando `s`.
2. Arraste uma janela sobre a região a esticar (dois cliques definem os cantos).
3. Clique no ponto base.
4. Mova o mouse: aparece o preview das entidades esticadas.
5. Clique no ponto de destino. O deslocamento é aplicado aos vértices dentro da janela.

`Esc` cancela e volta ao início. Janela vazia ou sem entidades é avisada. Entidades em camada bloqueada são ignoradas.

## Comportamento por tipo de entidade

| Entidade   | Comportamento                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------- |
| Line       | Move cada extremo que estiver dentro da janela; com um extremo dentro, a linha estica.        |
| Polyline   | Move cada vértice dentro da janela.                                                           |
| Circle     | Move o círculo inteiro quando o centro está na janela; caso contrário, permanece.             |
| Arc        | Move o arco inteiro quando o centro está na janela; ângulos e raio não mudam.                 |
| Rectangle  | Move o retângulo inteiro apenas quando os quatro cantos estão na janela.                       |
| Dimension  | Não é esticada nesta fase.                                                                    |

O retângulo tem uma limitação inerente: um retângulo definido por base, largura, altura e
rotação não representa um retângulo cisalhado, então esticar um único canto não é possível.
Por isso ele só se move quando está totalmente dentro da janela. Para esticar cantos livremente,
use uma polyline.

## Arquivos

### Criados

- `packages/cad-core/src/stretch.test.ts`
- `packages/cad-tools/src/modify/StretchTool.ts` e `tests/StretchTool.test.ts`
- `docs/MVP 3.8 — StretchTool - Esticar.md`

### Alterados

- `packages/cad-core/src/index.ts`: `stretchEntity` e `StretchEntitiesCommand` (guarda o estado anterior para undo/redo).
- `packages/cad-tools/src/index.ts`: export da ferramenta.
- `packages/cad-tools/src/command-line/CommandAliases.ts`: aliases `s`, `stretch`, `esticar`.
- `apps/web`: `toolRegistry.ts`, `useCadStore.ts` (`ActiveCadTool`), `CadRibbon.tsx`, `CadToolbar.tsx`, `CadCommandLine.tsx`, `CadStatusBar.tsx` (ícone `Expand`, prompt e rótulo).
- `CLAUDE.md`: estado do projeto.

## Funções

```ts
stretchEntity(entity, window: BoundingBox, displacement: Point2D): CadEntity   // cad-core
class StretchEntitiesCommand(updatedEntities: ReadonlyArray<CadEntity>)         // cad-core
```

`stretchEntity` reaproveita `boundingBoxContainsPoint` do `cad-geometry` e retorna a mesma
referência quando nada muda, o que permite ao tool enviar ao comando apenas as entidades
que realmente foram esticadas. A seleção por janela usa `entityBoundingBox` e
`boundingBoxesIntersect`, já existentes.

## Decisões técnicas

- **Sem cálculo geométrico no componente React.** A regra de quais pontos se movem está em
  `cad-core` (`stretchEntity`); a ferramenta apenas orquestra as fases janela → base → destino.
- **A ferramenta captura a própria janela.** O stretch depende do retângulo, não apenas dos
  ids selecionados, então a janela é definida dentro da ferramenta e reusa o preview de caixa
  de seleção (`selectionBox`).
- **Comando enxuto.** Só as entidades alteradas entram no `StretchEntitiesCommand`; os originais
  são capturados no execute, mantendo o redo coerente.

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-core src/stretch.test.ts
npx vitest run --root packages/cad-tools tests/StretchTool.test.ts
npm run test --workspaces --if-present
```

Na entrega: 420 testes passando. Teste de navegador com Playwright confirmou: extremo direito
de uma linha esticado para cima enquanto o esquerdo permaneceu; retângulo parcialmente coberto
não alterado (regra dos quatro cantos); ferramenta voltando ao início após cada operação;
undo/redo sem erros; nenhum erro de página.

## Teste manual

1. Desenhe uma linha horizontal.
2. Ative Stretch, arraste uma janela que cubra só o extremo direito.
3. Clique no extremo direito (base) e depois em um ponto acima (destino). A linha vira diagonal.
4. Ctrl+Z e Ctrl+Y.
5. Repita com uma polyline de vários vértices, cobrindo alguns deles.
6. Tente esticar um retângulo parcialmente coberto: ele não muda (use polyline para cantos).
7. Esticar entidade em camada bloqueada: é ignorada.

## Próximos passos recomendados

- Converter Rectangle em polyline ao esticar cantos parciais (ou oferecer "Explode" antes).
- `MVP 3.9 — EllipseTool` ou seguir o roadmap para blocos e DXF.
