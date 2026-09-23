# MVP 3.22 — Grips de todas as entidades

## Objetivo

Levar os grips (alças de edição) do MVP 3.21, que só existiam em cotas e splines, para linha, círculo, arco, elipse, polyline, retângulo e texto. Também passa a ser possível inserir e remover vértices de polylines e pontos de ajuste de splines pelo grip, como no AutoCAD.

## Grips por entidade

| Entidade | Grips | Efeito |
| --- | --- | --- |
| Linha | pontas, ponto médio | ponta estica; ponto médio move a linha |
| Círculo | centro, 4 quadrantes | centro move; quadrante define o raio |
| Arco | centro, pontas, ponto médio | centro move; ponta/meio refazem o arco por três pontos (os outros dois ficam fixos) |
| Elipse / arco de elipse | centro, quadrantes (só os que estão no arco), pontas do arco | quadrante define o raio do eixo (os eixos trocam se o menor passar do maior); ponta muda o ângulo paramétrico |
| Polyline | vértices (quadrados), meios dos segmentos (retângulos) | vértice move; meio move o segmento inteiro |
| Retângulo | cantos, meios das arestas | canto: o oposto fica fixo; aresta: só ela se move; continua retângulo (mesma rotação) |
| Texto | ponto de inserção | move |
| Spline | pontos de ajuste ou vértices de controle | como no MVP 3.21 |
| Cota | como antes (seleção única) | |

- Os grips aparecem nas entidades selecionadas (até 50) e só na ferramenta **Select**. Camadas bloqueadas não mostram nem editam grips.
- A edição é sempre calculada a partir da entidade original (sem acumular erro). Geometria degenerada (ex.: três pontos alinhados no arco) mantém o último preview válido e não é confirmada.
- Cada edição é um `ReplaceEntityCommand` (um undo; id, camada e estilo preservados). A seleção é mantida.

## Grip arrastado ou "quente"

- **Arrastar** o grip e soltar: aplica.
- **Clicar e soltar** no grip (sem arrastar): o grip fica **quente** e segue o cursor. Então:
  - clique: define o ponto (com snaps);
  - digitar na linha de comando: `x,y` (absoluto), `@dx,dy` ou `@d<a` (relativos ao ponto original do grip) ou uma distância na direção do cursor, na unidade de trabalho;
  - **A**: insere um vértice logo depois do grip (vértice ou meio de segmento da polyline, ponto de ajuste da spline). O vértice novo fica quente e segue o cursor até o clique;
  - **R** ou **Delete**: remove o vértice ou ponto de ajuste do grip (mínimo: 2 pontos abertos, 3 fechados). Com um grip ativo, o Delete não apaga a entidade;
  - **Esc**: cancela.
- As opções também funcionam durante o arrasto (A/R com o botão pressionado).

## Arquivos

- `packages/cad-geometry`: `entityGrips.ts` (`getEntityGripPoints`, `updateEntityByGrip`, `gripVertexOptions`, `addVertexAtGrip`, `removeVertexAtGrip`, `supportsEntityGrips`), estrutural, sem depender do cad-core. Testes: `entityGrips.test.ts`.
- `packages/cad-tools`: `SelectTool` (grips genéricos, grip quente, coordenadas digitadas, A/R/Delete); contrato `CadTool.claimsKeyDown`. Testes: `tests/EntityGrips.test.ts`.
- `packages/cad-renderer`: `renderEntityGrips2D` (substitui `renderSplineGrips2D`): quadrados, retângulos nos meios e círculos nas alças da spline.
- `apps/web`: o store entrega à ferramenta as teclas que ela reivindica (Delete do grip) antes dos atalhos globais; overlay dos grips.

## Fora de escopo (futuro)

- Vários grips quentes ao mesmo tempo (Shift) e grips coincidentes movidos juntos.
- Menu de grip com Move/Rotate/Scale/Mirror a partir do grip (ciclo com Espaço, como no AutoCAD).
- Converter segmento de polyline em arco (a polyline ainda não tem arcos).

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. Desenhar linha, círculo e polyline; selecionar por janela: aparecem os grips.
2. Arrastar a ponta da linha e o meio dela; arrastar um quadrante do círculo (raio).
3. Clicar e soltar num quadrante do círculo (grip quente), digitar `@3,0` e Enter: o raio aumenta 3.
4. Clicar num vértice da polyline, apertar `A` e clicar em outro ponto: vértice novo. Clicar nele e apertar Delete: some só o vértice.
5. Arrastar o meio de um segmento da polyline: o segmento inteiro se move. Ctrl+Z desfaz.
6. Retângulo: arrastar um canto e o meio de uma aresta (continua retângulo); arco: arrastar o ponto médio; elipse: arrastar um quadrante; texto: arrastar o ponto de inserção.
7. Spline por pontos: clicar num ponto de ajuste, `A` para inserir e `R` para remover.
