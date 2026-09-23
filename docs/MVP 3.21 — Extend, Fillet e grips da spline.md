# MVP 3.21 — Extend, Fillet e grips da spline

## Objetivo

Completar a edição da spline (MVP 3.20): **Extend**, **Fillet** e **edição por grips** (alças de edição no canvas), como no AutoCAD.

## Extend

- `extend` → limites (ou Enter para todos) → clicar na spline aberta: a ponta estendida é a do lado do clique (pela metade do comprimento).
- **Extensão natural**: o último segmento cúbico é prolongado como o próprio polinômio. A continuação é exata e suave (C∞ com a curva). Ela só vale enquanto a tangente gira menos de 90° e não encolhe (sem laço), até cerca de três vezes o segmento. Como o ajuste por pontos usa curvatura zero nas pontas, a continuação começa praticamente reta.
- **Fallback reto**: se a extensão natural não alcança nenhum limite, a spline segue reta pela tangente da ponta (G1), como uma linha.
- Qualquer geometria serve de limite (linha, retângulo, polyline, círculo, arco, elipse, spline).
- A spline estendida fica só com os pontos de controle (como no Trim). Spline fechada: mensagem clara. Preview do trecho acrescentado; um único undo.

## Fillet

| Combinação | Resultado |
| --- | --- |
| Spline × linha | A linha vai até a tangência (aparada ou estendida), mantendo o lado do clique; a spline aberta é aparada na tangência. |
| Spline × círculo / arco / elipse / arco de elipse | Arcos e arcos de elipse são aparados; círculos e elipses fechadas ficam inteiros. |
| Spline × spline | As duas splines abertas são aparadas na tangência. |

- A ordem dos cliques não importa (spline primeiro ou o outro objeto primeiro).
- Solução numérica no kernel (`cad-geometry/src/filletSpline.ts`): o centro fica na paralela da spline à distância r, do lado em que o outro objeto foi clicado. A equação "distância com sinal ao outro objeto = r" é resolvida por varredura + bisseção ao longo da spline. Raízes falsas (saltos da projeção) e tangências fora do objeto (fora do arco, na ponta da spline) são descartadas. Vale a solução mais próxima dos cliques.
- Splines fechadas não são aparadas. As aparadas perdem os pontos de ajuste. Tudo em um único undo (`CompositeCommand`); preview ao vivo.

## Grips

- Com a ferramenta **Select**, as splines selecionadas mostram grips (até 50 splines na seleção):
  - **por pontos de ajuste**: um grip (quadrado) por ponto; arrastar recalcula a curva C2 pelos pontos;
  - **por vértices de controle**: quadrados nos vértices da curva, círculos nas alças e a armação tracejada vértice → alça. Arrastar um vértice leva junto as duas alças. Arrastar uma alça numa junção suave gira a alça oposta junto (mesmo comprimento), mantendo a curva suave. Na spline fechada, a costura é um único grip.
- Durante o arrasto: preview, snaps ativos e Esc cancela. Ao soltar, um `UpdateEntityCommand` (um undo); a seleção é mantida. Camada bloqueada: mensagem, sem edição.
- **Painel → Method**: a spline por pontos de ajuste pode ser convertida para **Control vertices** (os grips passam a ser as alças), como no AutoCAD. A conversão inversa não existe.

## Arquivos

- `packages/cad-geometry`: `splineExtend.ts` (`extendBezierChain`, `bezierChainExtensionSearchBox`, `reverseBezierChain`), `filletSpline.ts` (`computeSplineFillet`, `FilletOperand`), `splineGrips.ts` (`getSplineGripPoints`, `updateSplineByGrip`, `splineControlFrame`). Testes: `splineEdit.test.ts`.
- `packages/cad-tools`: `ExtendTool` (spline), `FilletTool` (spline × linha/curva/spline), `SelectTool` (grips genéricos: cota e spline; `gripEntitiesOfSelection`). Testes: `tests/SplineEdit.test.ts`.
- `packages/cad-renderer`: `renderSplineGrips2D` (grips e armação de controle; só lê a geometria; generalizado em `renderEntityGrips2D` no MVP 3.22).
- `apps/web`: grips da spline no overlay (só na ferramenta Select) e conversão Fit → Control vertices no painel.

## Fora de escopo (futuro)

- ~~Inserir/remover pontos de ajuste pelo grip~~ (MVP 3.22); tangentes nas pontas.
- Extend de spline fechada e Fillet com polyline/retângulo (arestas) × spline.
- ~~Grips das demais entidades (linha, círculo, polyline…)~~ (MVP 3.22).

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. `spline` por 3 pontos e uma linha vertical à frente da ponta → `extend` → Enter → clicar perto da ponta: a spline chega exatamente à linha, sem quina. Ctrl+Z restaura.
2. Linha longe (mais de 3× o último trecho): a extensão segue reta pela tangente.
3. `fillet` → `3` → clicar numa spline → clicar numa linha que a cruza: arco tangente, linha e spline aparadas; Ctrl+Z desfaz tudo.
4. Repetir com arco, círculo, elipse e outra spline.
5. Selecionar a spline (Select): grips nos pontos de ajuste; arrastar um e soltar: curva recalculada; Esc durante o arrasto cancela.
6. Painel → Method → Control vertices: aparecem as alças e a armação tracejada; arrastar um vértice (as alças acompanham) e uma alça (a oposta gira junto).
