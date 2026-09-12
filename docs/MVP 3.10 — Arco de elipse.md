# MVP 3.10 — Arco de elipse (Elliptical Arc)

## Objetivo

Estender a entidade elipse (MVP 3.9) para representar também **arcos de elipse** (recorte parcial), com ferramenta própria, render, seleção restrita ao trecho, transformações e IO (JSON/SVG). A elipse completa continua funcionando sem mudanças.

## Modelo

`EllipseEntity` ganhou dois campos opcionais:

| Campo        | Significado                                                                 |
| ------------ | --------------------------------------------------------------------------- |
| `startAngle` | Ângulo paramétrico inicial do arco (opcional)                               |
| `endAngle`   | Ângulo paramétrico final do arco (opcional)                                 |

- **Ausentes** → elipse fechada (comportamento do MVP 3.9, retrocompatível).
- **Presentes** → arco que varre de `startAngle` a `endAngle` no sentido paramétrico crescente.

Os ângulos são **paramétricos** (o `t` de `x = rx·cos t`, `y = ry·sin t`), no referencial local da elipse. Por serem locais, não mudam quando a elipse é rotacionada, escalada ou transladada — só o `mirror` os altera.

## Ferramenta

`EllipseArcTool` (alias `ea`, `ellipsearc`, `arcoelipse`), em cinco cliques:

1. **Centro** da elipse.
2. **Fim do eixo maior** (rotação + semi-eixo maior).
3. **Semi-eixo menor** (distância perpendicular).
4. **Ponto do ângulo inicial** (projetado no referencial da elipse → `startAngle`).
5. **Ponto do ângulo final** (→ `endAngle`).

`Esc` cancela e volta à ferramenta Select (comportamento global do MVP 3.8.3).

## Comportamento por operação

- **Move / Stretch / Array**: translada o centro; os ângulos (locais) não mudam.
- **Rotate**: gira o centro pelo pivô e soma o ângulo à `rotation`; os ângulos paramétricos permanecem.
- **Scale**: escala centro e semi-eixos; os ângulos permanecem.
- **Mirror**: reflete o centro e o ângulo do eixo maior; para o arco, inverte a orientação paramétrica (negando e trocando `startAngle`/`endAngle`), preservando o mesmo trecho varrido.
- **Seleção**: o hit-testing limita a amostragem ao intervalo do arco — clicar fora da varredura mede a distância à extremidade mais próxima, então não seleciona o arco.
- **Bounding box**: envoltório do trecho varrido (extremidades + extremos dos semi-eixos que caem dentro da varredura).

## Arquivos

### Novos

- `packages/cad-tools/src/draw/EllipseArcTool.ts`: ferramenta interativa.
- `packages/cad-tools/tests/EllipseArcTool.test.ts`: criação, preview e cancelamento.

### Alterados

- `packages/cad-geometry/src/ellipse.ts`: `EllipseGeometry` com `startAngle`/`endAngle` opcionais e novas funções puras — `normalizeEllipseSweep`, `isFullEllipse`, `ellipseParamAtPoint`, `ellipseArcPoints`, `ellipseArcBoundingBox`, `ellipseArcFromPoints`; `distancePointToEllipse` passa a respeitar o intervalo do arco.
- `packages/cad-geometry/src/ellipse.test.ts`: testes das novas funções.
- `packages/cad-core/src/index.ts`: `EllipseEntity` com os campos opcionais; `mirrorEntity` inverte a orientação do arco. Move/rotate/scale/stretch já preservam os ângulos via spread.
- `packages/cad-core/src/spatial.ts`: `entityBoundingBox` usa `ellipseArcBoundingBox`.
- `packages/cad-core/src/index.test.ts` e `mirror.test.ts`: bbox do arco e espelhamento do arco.
- `packages/cad-renderer/src/entities.ts`: arco desenhado por amostragem de pontos (coerente com bbox e hit-test); a elipse completa segue via `ctx.ellipse`.
- `packages/cad-io/src/json.ts` + `json.test.ts`: validação dos ângulos opcionais e round-trip do arco.
- `packages/cad-io/src/svg.ts`: export do arco como `<path>` com o comando `A` (elliptical arc) e bounds via `ellipseArcBoundingBox`.
- `packages/cad-tools/src/selection/hitTesting.ts`: passa os ângulos para restringir a seleção ao trecho.
- `apps/web`: `ActiveCadTool` + set, registro no `toolRegistry`, prompt, rótulo na status bar e botão **Ell Arc** no ribbon.

## Decisões técnicas

- **Retrocompatível.** Os campos são opcionais; elipses antigas (sem ângulos) continuam fechadas. A serialização preserva os campos quando presentes e os omite quando ausentes.
- **Ângulos paramétricos locais.** Guardar `t` no referencial da elipse mantém os ângulos estáveis sob rotação/escala/translação; só o espelhamento (que inverte orientação) precisa ajustá-los.
- **Render por amostragem.** O arco é traçado por pontos amostrados no mesmo intervalo usado por bbox e hit-test, evitando divergências de direção da API `ctx.ellipse`. A elipse completa mantém o traçado nativo.
- **Varredura sempre crescente.** `normalizeEllipseSweep` devolve a varredura em (0, 2π], padronizando a direção para render, bbox, hit-test e export.

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-geometry src/ellipse.test.ts
npx vitest run --root packages/cad-tools tests/EllipseArcTool.test.ts
npm run test --workspaces --if-present
```

Na entrega: suíte completa passando (456 testes). Teste de navegador (Playwright) confirmou: arco de elipse desenhado pela UI (5 cliques) com `startAngle`/`endAngle` corretos, persistido no JSON, renderizado e selecionável ao clicar sobre o trecho — e **não** selecionável ao clicar fora da varredura; sem erros de página.

## Teste manual

1. Clique em **Ell Arc** (ou digite `ea`).
2. Centro → fim do eixo maior → semi-eixo menor → ponto do ângulo inicial → ponto do ângulo final.
3. O arco é criado. Selecione clicando sobre o trecho; use Move, Rotate, Scale, Mirror, Stretch e Array.
4. Exporte em JSON e reimporte (round trip); exporte em SVG e confira o `<path A>`.

## Próximos passos recomendados

- Snaps específicos da elipse/arco (centro, quadrantes, extremidades do arco).
- Seguir o roadmap para blocos e importação DXF.
