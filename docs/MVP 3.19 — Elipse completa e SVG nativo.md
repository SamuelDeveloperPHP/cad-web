# MVP 3.19 — Elipse completa e SVG nativo

## Objetivo

Deixar a elipse (e o arco de elipse) com todas as funcionalidades que o engenheiro espera de um CAD, e fazer o SVG voltar ao CAD-WEB como entidades nativas (elipses, arcos, cotas, textos, camadas e estilos), para a aplicação ficar completa para a rodada de testes.

## Elipse

| Funcionalidade | Comportamento |
| --- | --- |
| Criação | Modo **Centro** (padrão) e modo **Eixo, Fim** (`a`/`axis`/`eixo`): dois extremos do eixo e a distância até o outro eixo. `c` volta ao modo Centro. As opções não ativam Arc/Circle (a ferramenta reivindica a entrada com `claimsCommandInput`). |
| Eixo maior | Sempre guardado no eixo X local (`normalizeEllipseAxes`), como o AutoCAD: se o segundo eixo for o maior, os raios trocam, a rotação soma 90° e os parâmetros do arco se ajustam, sem mudar a forma. |
| Painel | Centro, **raio maior e raio menor editáveis** (se o menor passar do maior, os eixos trocam de papel), razão editável, rotação (convenção AutoCAD); elipse fechada: perímetro (Ramanujan II) e área; arco de elipse: **ângulos inicial e final editáveis** (reais, medidos a partir do eixo maior, anti-horários), ângulo total e comprimento do arco (Simpson). |
| Trim | A elipse e o arco de elipse são **aparados** (a elipse fechada precisa de dois cortes e vira arco; o arco pode virar dois arcos) e servem de **aresta de corte** para linhas e curvas. |
| Extend | O arco de elipse **estende** pela ponta mais próxima do clique até o limite, seguindo a elipse; elipses servem de **limite** para linhas e curvas. Elipse fechada recebe mensagem clara. |
| Offset | Elipse e arco de elipse geram a curva paralela como **polyline densa** (erro de corda ≈ 1e-4 do raio). Para dentro, a distância precisa ser menor que o menor raio de curvatura (b²/a). |
| Fillet | **Linha × elipse / arco de elipse** (e também linha × círculo / arco), resolvido numericamente no kernel. A linha é aparada/estendida até a tangência; arcos são aparados; círculos e elipses fechadas ficam inteiros, como no AutoCAD. Uma única operação de undo (`CompositeCommand`). |
| Path Array | A elipse e o arco de elipse servem de caminho (amostragem por comprimento de arco). |
| Explode | Como no AutoCAD, elipses, círculos, arcos, linhas e textos são primitivas: a mensagem explica o motivo. |
| Já existentes | Move, Copy (Array), Rotate, Scale, Mirror, Stretch, snaps (centro, quadrante, extremidades, ponto médio, interseção, perpendicular, tangente, próximo), seleção, JSON. |

## Trim e Extend gerais

O núcleo novo (`cad-geometry/src/curveTrim.ts`) trabalha com primitivas de interseção, então:

- **Aparar**: linhas, círculos, arcos, elipses e arcos de elipse.
- **Estender**: linhas, arcos e arcos de elipse; a linha estende pela ponta mais próxima do clique em qualquer ponto dela (antes era preciso clicar perto da ponta).
- **Arestas de corte / limites**: linha, retângulo, polyline, círculo, arco, elipse e arco de elipse.
- Círculos aparados viram arcos; arcos anti-horários passam a ser guardados no sentido crescente (mesma forma).

## Primeiro ponto digitado

Line, Arc, Circle e Rectangle passaram a aceitar o **primeiro ponto** como coordenada `x,y` na linha de comando (Polyline e Ellipse já aceitavam), na unidade de trabalho.

## SVG

### Exportação

- Cada entidade leva o próprio JSON em `data-cad-entity` e a posição original em `data-cad-index`; o `<svg>` leva camadas, estilos de cota, unidade base e unidade de trabalho em `data-cad-document`. Outros programas ignoram esses atributos. Opção `embedCadData: false` para um SVG "limpo".
- O desenho SVG passa a mostrar cor (`stroke`), espessura (`stroke-width`) e tracejado (`stroke-dasharray`) das entidades.

### Importação (reescrita, `cad-io/src/svgImport.ts`)

- **SVG do CAD-WEB**: ida e volta **exata** de todos os tipos — linha, retângulo, círculo, arco, elipse, arco de elipse, polyline, **cotas** (linear, alinhada, raio, diâmetro, angular, com estilo e overrides) e textos — e das camadas (cor, visível, bloqueada, opacidade), estilos de cota, unidades e ordem de desenho.
- **SVG de outros programas**: o arquivo é percorrido respeitando grupos e `transform` (`matrix`, `translate`, `scale`, `rotate`, `skewX/Y`):
  - `<line>`, `<rect>` (retângulo quando a transformação preserva ângulos retos; senão polígono), `<circle>` e `<ellipse>` (círculo sob escala não uniforme vira elipse), `<polyline>`, `<polygon>`, `<text>`.
  - `<path>` com M/L/H/V/Z/A/C/S/Q/T (absolutos e relativos): trechos retos viram linha/polyline (fechada com Z), **A vira arco ou arco de elipse nativo** (conversão de extremos para centro da especificação SVG, inclusive sob espelhamento), Béziers viram polylines.
  - Camadas do CAD-WEB e do **Inkscape** viram camadas; camadas referenciadas e ausentes são criadas.
  - `<defs>`, `<clipPath>`, `<symbol>`, `<marker>`, `<style>`, metadados e `display:none` são ignorados; scripts, eventos e links externos continuam bloqueados.
  - Cores de traço são importadas, exceto preto/quase preto (o fundo do desenho é escuro): nesse caso vale a cor da camada.
  - IDs repetidos recebem sufixo; entidades inválidas são descartadas sem derrubar a importação; metadados malformados caem nos padrões.

## Arquivos

- `packages/cad-geometry`: `curveTrim.ts` (reta × primitivas, aparar/estender curvas periódicas, adaptadores de entidade), `filletCurve.ts` (fillet linha × curva), `svgGeometry.ts` (arco SVG → centro, imagem afim de elipse, Béziers), `ellipse.ts` (`normalizeEllipseAxes`, `ellipsePerimeter`, `ellipseArcLength`), `visualAngles.ts` (`ellipseArcParamsFromVisual`), `offset.ts` (`offsetArc`, `offsetEllipse`), `pathSource.ts` (fonte elipse), `snap.ts` (`entityIntersectPrimitives`). Testes para todos.
- `packages/cad-core`: `ReplaceEntityCommand`, `CompositeCommand`.
- `packages/cad-tools`: `modify/curveEditUtils.ts`; `TrimTool`, `ExtendTool`, `FilletTool`, `OffsetTool`, `PathArrayTool`, `ExplodeTool`; `EllipseTool` (modo Eixo, Fim); Line/Arc/Circle/Rectangle (primeiro ponto digitado); `claimsCommandInput` no contrato `CadTool`. Testes em `CurveTrimExtend.test.ts`, `TypedFirstPoint.test.ts` e nos testes existentes.
- `packages/cad-io`: `svgImport.ts` (novo importador), `svg.ts` (dados nativos e aparência na exportação). Testes em `svgImport.test.ts`.
- `apps/web`: painel da elipse (raios maior/menor, ângulos do arco, perímetro/comprimento), linha de comando entrega opções reivindicadas pela ferramenta.

## Decisões técnicas

- **Offset de elipse como polyline**: a paralela exata de uma elipse não é elipse; o AutoCAD usa spline. Sem entidade spline no CAD-WEB, a polyline densa é a representação fiel mais simples.
- **Fillet numérico**: o centro fica na paralela da curva à distância r; a equação escalar é resolvida por varredura + bisseção, escolhendo a solução mais próxima dos cliques.
- **Payload JSON no SVG**: garante ida e volta exata sem depender de reconstruir a geometria a partir do desenho (que perde precisão e informação de cota/estilo).

## Fora de escopo (futuro)

- Entidade spline (offset exato de elipse, importação de Béziers sem aproximação).
- Aparar retângulos e polylines por trecho (hoje são arestas de corte, não alvos).
- Chamfer com elipse (o AutoCAD também não suporta).
- `<use>`, estilos CSS por classe e unidades físicas do `viewBox` na importação SVG.

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. `ellipse` → `a` → clicar dois extremos → digitar `15`: elipse pelo eixo (o `a` não ativa o Arc).
2. Desenhar a elipse com o segundo eixo maior: o painel mostra o maior como Major Radius.
3. Linha vertical pelo centro → `trim` → Enter → clicar num lado da elipse: sobra o arco do outro lado.
4. Linha próxima → `extend` → Enter → clicar perto de uma ponta do arco de elipse: a ponta segue a elipse até a linha.
5. `offset` → `2` → clicar na elipse → clicar fora: curva paralela.
6. `fillet` → `3` → clicar na elipse → clicar numa linha próxima: arco de concordância; Ctrl+Z desfaz tudo.
7. Painel do arco de elipse: editar Start/End Angle, Major/Minor Radius e Rotation.
8. Exportar SVG e importar de volta: entidades, camadas, cotas e estilos idênticos.
9. Importar um SVG do Inkscape/Illustrator com grupos transformados, `<path>` com arcos e curvas e `<ellipse>` rotacionada.
10. `line` → digitar `0,0` → `100,0`: linha criada só pelo teclado (idem Circle, Rectangle, Arc).
