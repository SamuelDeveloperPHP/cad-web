# MVP 3.18 — Texto e propriedades de anotação (texto, setas e cotas)

## Objetivo

Completar as propriedades de anotação do desenho: criar a entidade **Texto** (que não existia), com ferramenta, render, snap, IO e painel de propriedades; ampliar os **terminadores de cota** (setas); e deixar os campos de comprimento do painel na **unidade de trabalho** (MVP 3.17), com ângulos na convenção do AutoCAD.

Linhas (cor, tipo, espessura) e cotas (estilo, precisão, sufixo, cores) já tinham propriedades completas e renderizadas; o buraco era o texto.

## Comportamento

### Ferramenta Text (`text`, `dt`, `dtext`, `texto`)

Fluxo do TEXT do AutoCAD:

1. **Ponto de inserção** — clique (com snap) ou `x,y` na unidade de trabalho. O preview mostra um "Text" fantasma no cursor com a altura atual.
2. **Altura** `<padrão>` — digitar (unidade de trabalho) ou clicar (distância ao ponto). Enter vazio aceita o padrão: a altura de texto do estilo de cota ativo, depois a última usada.
3. **Rotação** `<0>` — graus na convenção visual (anti-horário, 0° = Leste) ou clique na direção.
4. **Conteúdo** — cada Enter cria uma linha e posiciona a próxima logo abaixo; **Enter vazio conclui**. Um clique nesse estágio recomeça em outro ponto com a mesma altura/rotação.

A linha de comando recebe o **foco automaticamente** após o ponto de inserção e repassa a entrada **crua** à ferramenta: digitar `zoom`, `u` ou `line` vira texto, não comando. Esc na linha de comando encerra.

### Propriedades do texto (painel)

Conteúdo (várias linhas; Ctrl+Enter confirma), Altura, Rotação (°), Posição X/Y, Justificação (Left/Center/Right), Vertical (Baseline/Bottom/Middle/Top), Fonte, Negrito, Itálico, além de Layer e Cor. Tudo via `UpdateEntityCommand` (undo/redo).

### Setas (terminadores de cota)

`tick` (arquitetônico), `arrow` (cheia), **`open`** (aberta, em "V"), **`dot`** (ponto cheio), **`none`** (nenhum). Selecionáveis no estilo de cota e por cota (override). A cota ganhou também overrides de **Arrow Size** e **Text Height**.

### Snap Insertion

Novo tipo de snap `insertion` (marcador de dois quadrados, convenção AutoCAD) no ponto de inserção do texto; liga/desliga em Snap → Modes.

### Painel na unidade de trabalho

Comprimentos (coordenadas, comprimento, raio, largura/altura, perímetro) e áreas (unidade²) são exibidos e digitados na unidade de trabalho, com o rótulo da unidade. Ângulo da linha e rotação do retângulo/texto usam a convenção visual do AutoCAD.

## Arquitetura

- **Largura estimada no kernel.** O kernel não depende de fonte/Canvas: a largura é estimada por `TEXT_CHAR_WIDTH_RATIO` (0,6 em). O renderer desenha com a fonte real usando **o mesmo layout** (origem de cada linha na linha de base + alinhamento), então ancoragem, envoltório, seleção e zoom ficam coerentes; só a extensão horizontal do envoltório é aproximada (conservadora).
- **`height` = tamanho da fonte (em)**, o mesmo critério do texto de cota.
- **Rotação no sistema do mundo** (Y para baixo na tela), como retângulo/elipse; a conversão para graus visuais fica só nas fronteiras (ferramenta e painel).
- **Mirror mantém o texto legível** (equivalente a `MIRRTEXT = 0`): reflete o ponto e a direção e escolhe o sentido que lê da esquerda para a direita.
- **`acceptsFreeText()`** opcional no contrato `CadTool`: a UI consulta a ferramenta para decidir se a entrada é texto livre, sem a UI conhecer a ferramenta de texto.

## Arquivos

- `packages/cad-geometry`: `src/text.ts` (layout, envoltório, distância, avanço de linha) + testes; `snap.ts` (tipo `insertion`, `SnapTextEntity`); `dimensions.ts` (`DimensionArrowType`, `DIMENSION_ARROW_TYPES`).
- `packages/cad-core`: `TextEntity` na união `CadEntity`; move/rotate/scale/mirror/stretch; envoltório (`spatial.ts`); array retangular/polar/caminho (`array.ts`, incluindo a âncora que faltava para elipse no polar sem rotação); `arrowType` com os novos tipos. Testes em `src/text.test.ts`.
- `packages/cad-tools`: `draw/TextTool.ts` (+ `visualDegreesToWorldRadians`/`worldRadiansToVisualDegrees`), `acceptsFreeText` em `CadTool`, hit-test do texto (clique em qualquer ponto do bloco). Testes em `tests/TextTool.test.ts`.
- `packages/cad-renderer`: render do texto (fonte, estilo, alinhamento, várias linhas, greeking abaixo de 4 px), terminadores `open`/`dot`/`none`, marcador do snap Insertion. Testes com canvas simulado em `src/text.test.ts`.
- `packages/cad-io`: validação JSON do texto; export SVG (`<g data-entity-type="text">` com um `<text>` por linha) e dos novos terminadores. Testes em `src/text.test.ts`.
- `apps/web`: botão Text no ribbon, registro da ferramenta, linha de comando com texto livre/foco/Esc, snap Insertion (Modes, rodapé, persistência), painel de propriedades (texto, setas, overrides da cota, unidade de trabalho), `services/workingUnits.ts` compartilhado com o rodapé.

## Complemento 3.18.1 — Importação de texto SVG, painel de arco e elipse

### Importar texto de SVG

- **Grupos do CAD-WEB** (`<g data-entity-type="text">`): viram uma única entidade de várias linhas. A exportação passou a gravar `data-position` (ponto de inserção exato) e `data-vertical-align`, exporta linhas vazias e usa `xml:space="preserve"`, então a ida e volta preserva conteúdo (espaços e linhas vazias), altura, rotação, alinhamentos, fonte, negrito, itálico e cor. SVGs antigos sem esses atributos usam a origem da primeira linha como inserção.
- **`<text>` de outros programas**: cada elemento vira um texto. Lê atributos diretos ou `style` (`font-size`, `font-family`, `font-weight`, `font-style`, `text-anchor`, `dominant-baseline`, `fill`), `<tspan>` com `x`/`y`/`dy` como quebra de linha, entidades `&amp;`/`&#…;`, e `transform` `rotate(a x y)` (em torno do próprio ponto) ou `translate(tx, ty)`. Espaços são colapsados como no SVG, exceto com `xml:space="preserve"`. Tamanho padrão 16 (padrão do SVG); textos vazios são ignorados.
- **Camada**: `data-layer-id` do elemento ou do grupo de camada exportado que o contém.
- O texto das cotas exportadas volta como texto solto, junto das linhas já importadas (a cota chega "explodida", como antes para as linhas).

### Arco e elipse no painel

- Conversões de ângulo (`visualDegreesToWorldRadians`, `worldRadiansToVisualDegrees`, `arcVisualAngles`, `arcAnglesFromVisual`, `ellipseArcVisualAngles`) passaram para `cad-geometry/src/visualAngles.ts`, com testes; o `TextTool` só as reexporta.
- **Arco**: Start/End Angle na convenção do AutoCAD — 0° = Leste, sempre do início ao fim no sentido anti-horário, independentemente do sentido armazenado (`clockwise`). Centro, raio e ângulos são editáveis (a edição preserva o sentido armazenado); Total Angle e Arc Length somente leitura.
- **Elipse** (nova seção): tipo (elipse/arco de elipse), Center X/Y, Radius X/Y e Rotation editáveis (Radius X segue a direção da rotação); Major/Minor Radius e Radius Ratio; área para a elipse fechada; para o arco de elipse, Start/End/Total Angle reais (não paramétricos) medidos a partir do eixo X da elipse, somente leitura.

## Fora de escopo (futuro)

- Editor de texto no próprio canvas (duplo clique) e MTEXT com formatação por trecho.
- Importar elipses, arcos e cotas de SVG como entidades nativas.
- Grips do texto (mover pelo ponto de inserção) e estilos de texto nomeados (STYLE).
- Medição real da largura com a fonte (hoje estimada) e fator de largura/oblíquo.
- Edição dos ângulos do arco de elipse no painel.

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. `text` → clicar → digitar `10` → Enter → Enter → `Planta Baixa` → `Escala 1:50` → Enter vazio: duas linhas empilhadas (14 mm entre bases).
2. Digitar `zoom` como conteúdo: vira texto, não aciona o zoom.
3. Unidade `m`: altura `0.5` → 500 mm no JSON; rotação `30` → texto subindo 30°.
4. Selecionar clicando sobre as letras; no painel mudar Justify, Bold, Fonte, Altura; Ctrl+Z desfaz cada mudança.
5. Iniciar uma linha perto do ponto de inserção do texto: marcador Insertion e ponto exato.
6. Move/Rotate/Scale/Mirror/Array em texto; Mirror em eixo vertical mantém o texto legível.
7. Cota → Arrow Type `open`, `dot`, `none`; Arrow Size e Text Height por cota; exportar SVG.
8. Exportar SVG com textos e reimportar: conteúdo, posição, rotação e estilos iguais.
9. Importar um SVG de outro editor com `<text>`/`<tspan>`, `text-anchor`, `rotate(...)`: textos no lugar certo.
10. Arco de 3 pontos Leste → Norte: painel mostra 0° / 90°; mudar End Angle para 180 vira semicírculo superior.
11. Elipse com eixo a 45°: painel mostra Rotation 45; editar Rotation e Radius Y atualiza o desenho (Ctrl+Z desfaz).
