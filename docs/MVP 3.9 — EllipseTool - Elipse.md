# MVP 3.9 — EllipseTool (Elipse)

## Objetivo

Adicionar a elipse como entidade nativa do CAD-WEB, com ferramenta interativa, render no Canvas, seleção, transformações (move, rotate, scale, stretch, mirror, array) e persistência (JSON nativo e export SVG).

## Entidade

`EllipseEntity` (em `packages/cad-core`):

| Campo      | Significado                                                        |
| ---------- | ----------------------------------------------------------------- |
| `center`   | Centro da elipse                                                  |
| `radiusX`  | Semi-eixo ao longo do eixo local X (antes da rotação)            |
| `radiusY`  | Semi-eixo ao longo do eixo local Y                               |
| `rotation` | Ângulo do eixo maior em radianos, em relação ao eixo X do mundo  |

## Ferramenta

`EllipseTool` (alias `el`, `ellipse`, `elipse`) no modo centro, em três cliques:

1. **Centro** da elipse.
2. **Fim do eixo maior** — define a rotação e o `radiusX` (distância centro→ponto).
3. **Semi-eixo menor** — o `radiusY` é a distância perpendicular do terceiro ponto ao eixo maior.

Enquanto o eixo maior é definido, o preview mostra um círculo (semi-eixos iguais); ao definir o menor, o preview vira a elipse final. `Esc` cancela e (pelo comportamento global do MVP 3.8.3) devolve à ferramenta Select.

## Comportamento por operação

- **Move / Stretch / Array**: a elipse translada pelo centro (como círculo e arco). No Stretch, move-se por inteiro quando o centro está na janela.
- **Rotate**: o centro gira pelo pivô e o ângulo soma-se à `rotation`.
- **Scale**: o centro escala pelo pivô e os dois semi-eixos multiplicam pelo fator (escala uniforme).
- **Mirror**: o centro é refletido e o ângulo do eixo maior é refletido no eixo do espelho; os semi-eixos não mudam.
- **Seleção**: hit-testing pela distância aproximada à borda (amostragem + refinamento por busca ternária).
- **Bounding box**: envoltório justo de elipse rotacionada (projeção dos semi-eixos nos eixos do mundo), usado pelo índice espacial e pelo export SVG.

## Arquivos

### Novos

- `packages/cad-geometry/src/ellipse.ts`: matemática pura da elipse (`ellipsePointAtParam`, `ellipseBoundingBox`, `distancePointToEllipse`, `ellipseFromAxisPoints`) e o tipo `EllipseGeometry` (fora da união `GeometryEntity` para não afetar switches exaustivos).
- `packages/cad-geometry/src/ellipse.test.ts`: testes de bbox (alinhada e rotacionada), ponto na borda, distância e construção por eixos.
- `packages/cad-tools/src/draw/EllipseTool.ts`: ferramenta interativa.
- `packages/cad-tools/tests/EllipseTool.test.ts`: testes de criação, rotação do eixo maior, preview e cancelamento.

### Alterados

- `packages/cad-core/src/index.ts`: tipo `EllipseEntity`, união `CadEntity` e tratamento em `moveEntity`, `rotateEntity`, `scaleEntity`, `stretchEntity`, `mirrorEntity`.
- `packages/cad-core/src/spatial.ts`: `entityBoundingBox` da elipse.
- `packages/cad-core/src/array.ts`: clone com offset e clone com rotação (array retangular e polar).
- `packages/cad-core/src/index.test.ts`: move, scale e bounding box da elipse.
- `packages/cad-geometry/src/index.ts`: export do módulo `ellipse`.
- `packages/cad-renderer/src/entities.ts`: desenho via `ctx.ellipse` (rotação direta, pois `worldToScreen` não espelha os eixos).
- `packages/cad-io/src/json.ts` + `json.test.ts`: validação e round-trip JSON da elipse.
- `packages/cad-io/src/svg.ts`: export `<ellipse>` (com `transform rotate` quando há rotação) e bounds no cálculo do viewBox.
- `packages/cad-tools/src/selection/hitTesting.ts`: distância ponto→elipse para seleção.
- `packages/cad-tools/src/index.ts`: export da `EllipseTool`.
- `apps/web`: `ActiveCadTool` + set, registro no `toolRegistry`, prompt na linha de comando, rótulo na status bar e botão **Ellipse** no ribbon (grupo Desenhar).

## Decisões técnicas

- **Tipo próprio na geometria.** `EllipseGeometry` não entra na união `GeometryEntity` para não quebrar os `switch` exaustivos existentes (ex.: `getEntityBoundingBox`); a elipse do documento é `EllipseEntity` no `cad-core`.
- **Elipse completa nesta fase.** O MVP entrega a elipse fechada (0..2π). Arco de elipse (com ângulos inicial/final) fica para uma fase futura.
- **Distância aproximada.** A elipse não tem fórmula fechada simples para a menor distância a um ponto; a seleção usa amostragem da borda com refinamento por busca ternária, suficiente para a tolerância de hit-testing.
- **Sem reflexão de eixos no render.** Como `worldToScreen` é escala+translação positiva, a rotação passa direto ao `ctx.ellipse` sem inverter sinal.

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-geometry src/ellipse.test.ts
npx vitest run --root packages/cad-tools tests/EllipseTool.test.ts
npm run test --workspaces --if-present
```

Na entrega: suíte completa passando (444 testes). Teste de navegador (Playwright) confirmou: elipse desenhada pela UI (centro→eixo maior→semi-eixo menor) com `radiusX/radiusY/rotation` corretos, persistida no JSON do documento, renderizada (inclusive rotacionada) e selecionável clicando na borda; sem erros de página.

## Teste manual

1. Clique em **Ellipse** (ou digite `el`).
2. Clique o centro, depois o fim do eixo maior (arraste para ver a rotação) e por fim um ponto para o semi-eixo menor.
3. A elipse é criada. Selecione-a clicando na borda; use Move, Rotate, Scale, Mirror, Stretch e Array.
4. Exporte em JSON e reimporte (round trip); exporte em SVG e confira o `<ellipse>`.

## Próximos passos recomendados

- Arco de elipse (ângulos inicial/final) e snaps específicos (centro, quadrantes).
- Seguir o roadmap para blocos e importação DXF.
