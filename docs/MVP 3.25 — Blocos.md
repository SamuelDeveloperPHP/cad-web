# MVP 3.25 — Blocos (definição, inserção e explode)

## Objetivo

Primeira entrega da Fase 2 do roadmap (5.0 BlockDefinition + BlockReference): definições de bloco reutilizáveis no documento e referências a elas, com criação a partir da seleção, inserção com escala e rotação, explode e painel de blocos. É também a base da importação DXF (3.26), que traz as bibliotecas de blocos da empresa.

## Modelo

- `CadDocument.blocks?: BlockDefinition[]`: `{ name, basePoint, entities }`. A geometria fica nas coordenadas originais; o ponto base é a origem da inserção. Opcional: documentos antigos abrem iguais.
- Entidade **`block`** (`BlockReferenceEntity`): `{ blockName, position, rotation?, scaleX?, scaleY? }`. O ponto base vai para `position`; escalas X/Y independentes (negativo espelha). `p' = position + R(rotation)·S(scaleX, scaleY)·(p − base)`.
- A geometria de uma referência é **sempre derivada** da definição (`expandBlockReference`, cacheada por referência e definição). Desenho, seleção, janela, snaps, envoltório e SVG usam as mesmas entidades expandidas, sem cópias salvas.
- **Camada**: entidades da camada 0 dentro do bloco herdam a camada da referência; as demais mantêm a própria. Ocultar a camada da referência esconde o bloco inteiro; ocultar a camada de uma peça esconde só ela.
- **Aninhamento**: blocos dentro de blocos compõem as matrizes; ciclos (A contém A) e profundidade acima de 16 são cortados; há limite de 200 mil entidades expandidas.
- **Cotas** ainda não entram em blocos (ficam fora da definição e da expansão).

## Ferramentas e interface

| Função | Como |
| --- | --- |
| **Block** (`b`, `block`, `bloco`) | Com a seleção: ponto base (clique ou `x,y`) → nome. As entidades viram a definição e são substituídas por uma referência no mesmo lugar (a aparência não muda). Uma operação de histórico (`CreateBlockCommand`); nome vazio, duplicado (sem diferenciar maiúsculas) ou com mais de 60 caracteres é recusado. O nome é texto livre (pode ser "line"). |
| **Insert** (`i`, `insert`, `inserir`) | Nome do bloco (ou botão Insert do painel) → o ponto base acompanha o cursor com preview; clique ou `x,y` insere e a inserção continua até o Esc. Opções digitadas: `s=2`, `sx=`, `sy=`, `r=90` (graus anti-horário, convenção do AutoCAD). A referência vai para a camada ativa. |
| **Explode** (`x`) | Explode **um nível**, como no AutoCAD: as entidades da definição viram entidades do desenho (ids novos); blocos aninhados continuam referências. Um único undo. |
| **Painel Blocks** | Lista as definições com nº de objetos e de inserções, botão Insert, exclusão (só de blocos sem uso) e "New from selection". |
| **Propriedades** | Nome do bloco, nº de objetos, posição (Y para cima), rotação, escala X e Y editáveis. |
| **Demais comandos** | Move, Copy/Array (retangular, polar, caminho), Rotate, Scale, Mirror, Stretch (move a referência inteira quando o ponto de inserção está na janela), Erase, grips (ponto de inserção) funcionam como em qualquer entidade. O Mirror produz rotação e escala Y negativa, sempre representável. |
| **Seleção e snaps** | Clicar em qualquer traço do bloco o seleciona; janela/cruzamento usam o envoltório expandido; os snaps (extremidade, centro, ponto médio, interseção, etc.) pegam a geometria do bloco. |

## Formatos

- **JSON nativo**: `blocks` no documento (omitido quando não há blocos), validação de nomes únicos, entidades e escala diferente de zero.
- **SVG**: a referência vira `<g data-block-name>` com a geometria expandida (visível em qualquer programa); o JSON da referência e as definições (`data-cad-document`) permitem a **ida e volta exata** no CAD-WEB. `embedCadData: false` exporta só o desenho.
- Persistência (IndexedDB) já usa o JSON nativo.

## Decisões técnicas

- **Expansão em vez de cópia**: a definição é a fonte única; editar um bloco (futuro) atualiza todas as inserções.
- **Transformação por matriz** (`transformEntityByMatrix`): círculos e arcos viram **elipses** sob escala não uniforme; retângulos cisalhados viram polylines; arcos e elipses mantêm os extremos ao refletir.
- **`entityBoundingBox(entity, blocks?)`**: o envoltório de uma referência precisa das definições; o índice espacial as recebe na construção.

## Fora de escopo (futuro)

- Editar a definição de um bloco existente (BEDIT), renomear e redefinir; atributos (5.1); biblioteca por disciplina (5.2); cotas em blocos; cores BYBLOCK.

## Arquivos

- `packages/cad-core`: `blocks.ts` (tipos de uso, matriz, decomposição, `transformEntityByMatrix`, `expandBlockReference`, `explodeBlockReference`, `CreateBlockCommand`, `DeleteBlockDefinitionCommand`, `blockIsReferenced`); `index.ts` (tipos e transformações da referência); `spatial.ts`; `array.ts`. Testes: `blocks.test.ts`.
- `packages/cad-io`: `json.ts`, `svg.ts`, `svgImport.ts`. Testes: `blocks.test.ts`.
- `packages/cad-renderer`: desenho pela geometria expandida com culling e LOD (bloco sub-pixel vira ponto). Testes: `blocks.test.ts`.
- `packages/cad-tools`: `modify/BlockTool.ts`, `draw/InsertTool.ts`, `ExplodeTool`, hit testing, janela, snaps, Stretch. Testes: `tests/BlockTools.test.ts`.
- `apps/web`: ribbon "Blocos", painel `CadBlockPanel`, propriedades do bloco, registro das ferramentas, `startBlockInsert` no store.

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. Desenhar duas linhas e um círculo, selecionar por janela, `block` → `0,0` → `Valvula`: o desenho continua igual, agora como um bloco (aba Blocks mostra "3 objects · 1 insert").
2. Aba Blocks → Insert (ou `insert` → `Valvula`): o preview acompanha o cursor; `s=2`, `r=90`, clicar em dois pontos.
3. Clicar numa linha do bloco: seleciona a inserção inteira; Props mostra posição, rotação e escala (editáveis).
4. Move/Rotate/Scale/Mirror/Copy na inserção; Ctrl+Z desfaz.
5. `explode` na inserção: viram entidades soltas; Ctrl+Z volta ao bloco.
6. Exportar SVG e importar de volta: blocos e inserções idênticos; recarregar a página: os blocos persistem.
