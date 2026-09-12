# MVP 3.7 — MirrorTool (Espelhar)

## Objetivo

Permitir espelhar as entidades selecionadas em torno de um eixo definido por dois pontos, criando uma cópia refletida. O alias `mi`/`mirror` já estava reservado em `CommandAliases.ts` desde os primeiros MVPs.

## Comandos

- `mi`
- `mirror`
- `espelhar`

## Fluxo

1. Selecione uma ou mais entidades com a ferramenta Select.
2. Ative Mirror pela ribbon, toolbar ou digitando `mi`.
3. Clique no primeiro ponto do eixo de espelhamento.
4. Mova o mouse: aparece o preview fantasma da cópia refletida.
5. Clique no segundo ponto do eixo. A cópia refletida é criada e o original é mantido.

`Esc` cancela e limpa o preview. Pontos de eixo coincidentes são recusados. Entidades em camada bloqueada são ignoradas.

## Espelhamento por tipo de entidade

| Entidade   | Comportamento                                                                 |
| ---------- | ----------------------------------------------------------------------------- |
| Line       | Reflete os dois extremos.                                                      |
| Circle     | Reflete o centro; mantém o raio.                                               |
| Arc        | Reflete o centro, reflete os ângulos das extremidades e inverte o sentido.     |
| Polyline   | Reflete cada vértice; preserva `closed`.                                        |
| Rectangle  | Reconstrói a partir do canto refletido para permanecer um retângulo válido.     |
| Dimension  | Não é espelhada nesta fase; a ferramenta avisa quando ignora alguma cota.       |

O retângulo merece nota: a reflexão inverte a orientação, e um retângulo definido por
base, largura, altura e rotação com dimensões positivas não representa diretamente a
forma refletida. A `mirrorEntity` usa o canto `base + largura` refletido como nova base
e recalcula a rotação, o que mantém largura e altura positivas e a posição correta.
Casos de eixo vertical e horizontal têm teste unitário.

## Manter o original vs. apagar

Nesta fase o Mirror sempre mantém o original e cria uma cópia. Apagar o original ao
espelhar depende de um seletor dedicado na interface, porque letras isoladas na linha de
comando (como `e`) colidem com aliases globais de ferramentas (`e` ativa Erase). O comando
`MirrorEntitiesCommand` já aceita o parâmetro `keepOriginal` (com testes para os dois
caminhos), então expor a opção no futuro é direto.

## Arquivos

### Criados

- `packages/cad-geometry/src/mirror.ts` e `mirror.test.ts`
- `packages/cad-core/src/mirror.test.ts`
- `packages/cad-tools/src/modify/MirrorTool.ts` e `tests/MirrorTool.test.ts`
- `docs/MVP 3.7 — MirrorTool - Espelhar.md`

### Alterados

- `packages/cad-geometry/src/matrix.ts`: `reflectionMatrix`.
- `packages/cad-geometry/src/index.ts`: export de `mirror`.
- `packages/cad-core/src/index.ts`: `mirrorEntity` e `MirrorEntitiesCommand`.
- `packages/cad-tools/src/index.ts`: export da ferramenta.
- `apps/web`: `toolRegistry.ts`, `useCadStore.ts` (`ActiveCadTool`), `CadRibbon.tsx`, `CadToolbar.tsx`, `CadCommandLine.tsx`, `CadStatusBar.tsx` (ícone `FlipHorizontal2`, prompt e rótulo).
- `CLAUDE.md`: estado do projeto.

## Funções

```ts
reflectionMatrix(p1, p2, epsilon?): Matrix2D               // cad-geometry/matrix
reflectPointAcrossLine(point, a, b, epsilon?): Point2D      // cad-geometry/mirror
reflectAngleAcrossAxis(angle, axisAngle): number            // cad-geometry/mirror
mirrorEntity(entity, axisStart, axisEnd): CadEntity | null  // cad-core
class MirrorEntitiesCommand(sourceEntityIds, mirroredEntities, keepOriginal)  // cad-core
```

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-geometry src/mirror.test.ts
npx vitest run --root packages/cad-core src/mirror.test.ts
npx vitest run --root packages/cad-tools tests/MirrorTool.test.ts
npm run test --workspaces --if-present
```

Na entrega: 402 testes passando. Teste de navegador com Playwright confirmou a cópia
espelhada criada (contador 2 → 3), preview fantasma durante o desenho, Ctrl+Z e Ctrl+Y
(3 → 2 → 3) e nenhum erro de página.

## Teste manual

1. Desenhe um retângulo à esquerda da tela.
2. Selecione-o com Select clicando na borda.
3. Ative Mirror e clique dois pontos formando um eixo vertical à direita do retângulo.
4. Confirme que surge uma cópia espelhada e o original permanece.
5. Ctrl+Z e Ctrl+Y.
6. Repita com uma polyline aberta, um arco e um círculo.
7. Espelhe algo em camada bloqueada e confirme que é ignorado.
8. Export JSON, Clear, Import JSON: a cópia espelhada volta.
9. Export SVG: a cópia aparece.

## Próximos passos recomendados

- Seletor de "apagar origem" na interface, ativando o caminho `keepOriginal: false`.
- `MVP 3.8 — StretchTool` (esticar vértices dentro de janela de seleção).
- Espelhamento de cotas quando houver `TextEntity`.
