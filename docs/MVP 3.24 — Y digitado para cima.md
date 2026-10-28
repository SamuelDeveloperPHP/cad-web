# MVP 3.24 — Y digitado e exibido para cima (convenção do AutoCAD)

## Objetivo

O engenheiro digita e lê coordenadas como no AutoCAD: **X para a direita e Y para cima** na tela. Só a fronteira com o usuário muda: o documento continua guardado com Y para baixo (referencial do Canvas), então **nenhum arquivo precisa de migração** e o JSON/SVG exportados não mudam.

## O que mudou

| Onde | Antes | Agora |
| --- | --- | --- |
| Coordenada absoluta digitada (`10,20`) em Line, Arc, Circle, Rectangle, Ellipse, Ellipse Arc, Polyline, Spline, Text | Y positivo descia | Y positivo sobe |
| Relativa digitada (`@5,3`) e polar (`@10<90`, do MVP 3.23) | `@5,3` descia | `@5,3` sobe; polar e relativa ficam coerentes |
| Dimensões do retângulo (`100,50`) e entrada dinâmica cartesiana | altura positiva descia | altura positiva sobe (negativa desce) |
| Grips e Move/Rotate/Scale/Mirror dos grips (`@dx,dy`, `x,y`) | Y para baixo | Y para cima |
| Centro do Array Polar e ponto base do Path Array (`x,y`) | Y para baixo (e sem unidade de trabalho) | Y para cima, na unidade de trabalho |
| Espaçamento de linhas do Array retangular (`dy`) | positivo descia | positivo sobe |
| Barra de status (Y do cursor) | Y do documento | Y para cima |
| Painel de propriedades (Start/End Y, Center Y, Y do retângulo, Position Y do texto) | Y do documento | Y para cima; o valor digitado volta ao documento com o sinal trocado |

## Decisões

- **Sem migração:** o documento mantém o Y do Canvas; só a entrada e a exibição trocam de sinal em um ponto único por camada (`userPointToWorld`/`userOffsetToWorld` em `cad-tools/src/draw/directInput.ts` e `userY` no painel). Desenhos antigos abrem iguais; o painel e a barra de status passam a mostrar o Y invertido em relação a antes.
- **Retângulo:** o campo "Y" do painel é o do canto superior esquerdo (o ponto de referência guardado).
- **Valores fora de escopo:** JSON e SVG exportados continuam com Y para baixo (como o SVG nativamente). Uma futura importação DXF (Y para cima) vai precisar inverter o sinal na importação.

## Arquivos

- `packages/cad-tools`: `draw/directInput.ts` (helpers e resolução absoluta/relativa), `RectangleTool`, `ArrayTool`, `ArrayPolarTool`, `PathArrayTool` e os `draw/*Tool` que digitam o primeiro ponto; `index.ts` exporta os helpers. Testes: `tests/UserCoordinates.test.ts` e atualização dos testes de entrada digitada.
- `apps/web`: `CadStatusBar`, `CadPropertiesPanel` (`userY`) e `dynamicInput.ts` (sinal da altura).

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. `line` → `0,0` → `10,20`: a linha sobe para a direita. Selecionar: o painel mostra End Y = 20.
2. No painel, editar End Y para 30: a linha sobe mais 10.
3. Mover o cursor acima da origem: o Y da barra de status fica positivo.
4. `rect` → `0,0` → `40,30`: retângulo acima e à direita; `-40,-30`: abaixo e à esquerda.
5. `@10<90` e `@0,10` (Line/Move pelo grip): ambos sobem 10.
6. Array retangular com `dy=50`: a segunda linha fica 50 acima.
