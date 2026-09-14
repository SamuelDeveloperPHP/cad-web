# MVP 3.13 — Snaps de perpendicular e tangente

## Objetivo

Adicionar os snaps de **perpendicular** e **tangente**. Diferente dos anteriores, estes são *deferred snaps*: dependem de um **ponto de referência** — o ponto anterior do desenho em andamento. Ex.: começar uma linha e mirar perpendicular a outra entidade, ou tangente a um círculo/elipse.

## Ponto de referência

Foi adicionado um mecanismo para a ferramenta ativa informar seu ponto âncora:

- `CadTool.getSnapReferencePoint?(): Point2D | null` — a ferramenta devolve o ponto anterior (ex.: primeiro ponto da linha, último vértice da polyline).
- `SnapService.findSnap(..., referencePoint?)` e `findBestSnap(..., referencePoint?)` passaram a aceitar esse ponto.
- `resolveSnappedPoint(..., referencePoint?)` o encaminha; `LineTool` e `PolylineTool` o fornecem a partir do segundo ponto.
- O store passa o ponto de referência ao calcular o marcador de snap, para o feedback aparecer antes do clique.

Sem ponto de referência (ex.: primeiro ponto de uma linha), perpendicular e tangente simplesmente não são oferecidos.

## Snaps por entidade

| Snap          | Segmento (linha/retângulo/polyline) | Círculo / arco            | Elipse / arco de elipse   |
| ------------- | ----------------------------------- | ------------------------- | ------------------------- |
| Perpendicular | pé da perpendicular (dentro do segmento) | dois pés (colineares com o centro) | pés (raízes por amostragem) |
| Tangent       | —                                   | dois pontos de tangência (externo) | pontos de tangência (amostragem) |

Perpendicular e tangente respeitam os limites reais da entidade (extensão do segmento, faixa do arco de círculo, varredura do arco de elipse). Prioridade de desempate (maior vence): `endpoint > intersection > midpoint > perpendicular > tangent > quadrant > center > nearest`.

### Matemática (novo módulo `perpTangent.ts`)

- **Segmento (perpendicular)**: parâmetro bruto da projeção; só há pé se cair dentro do segmento.
- **Círculo (perpendicular)**: os pés são colineares com centro e ponto de referência; **tangente**: construção clássica (ângulo ± `acos(r/d)`), sem tangência quando o ponto está dentro.
- **Elipse (perpendicular e tangente)**: as condições `(from−P)·tangente = 0` (perpendicular) e `(from−P)×tangente = 0` (tangente) não têm forma fechada simples, então as raízes são achadas por varredura com troca de sinal e bisseção na faixa varrida.

## Arquivos

### Novos

- `packages/cad-geometry/src/perpTangent.ts`: `perpendicularPointsOnPrimitive`, `tangentPointsOnPrimitive` (sobre as primitivas segmento/círculo/elipse).
- `packages/cad-geometry/src/perpTangent.test.ts`: testes de segmento, círculo (perpendicular e tangente) e elipse.

### Alterados

- `packages/cad-geometry/src/index.ts`: export de `perpTangent`.
- `packages/cad-geometry/src/snap.ts`: `SnapType`/`SnapSettings` ganham `perpendicular` e `tangent`; `getPerpendicularSnapCandidates`/`getTangentSnapCandidates`; `findBestSnap` aceita `referencePoint`; prioridades renumeradas.
- `packages/cad-geometry/src/snap.test.ts`: perpendicular a linha, tangente a círculo e ausência sem ponto de referência.
- `packages/cad-tools/src/contracts/CadTool.ts` e `ToolContext.ts`: `getSnapReferencePoint` e `referencePoint` em `findSnap`.
- `packages/cad-tools/src/snaps/ObjectSnapService.ts`: encaminha o `referencePoint`.
- `packages/cad-tools/src/draw/LineTool.ts` e `PolylineTool.ts`: fornecem o ponto de referência.
- `packages/cad-renderer/src/overlays.ts`: marcadores (ângulo reto / círculo-tangente) e rótulos.
- `apps/web`: store passa o ponto de referência; storage, checkboxes no ribbon e resumo na status bar.

## Decisões técnicas

- **Ponto de referência opcional.** Threadar um `referencePoint` opcional por toda a cadeia mantém retrocompatibilidade: ferramentas sem âncora não mudam, e os snaps deferidos só aparecem quando faz sentido.
- **Reuso das primitivas.** Perpendicular/tangente operam sobre as mesmas primitivas (segmento/círculo/elipse) da interseção, tratando N tipos com poucas rotinas.
- **Fechada onde dá, amostragem onde não dá.** Segmento e círculo têm solução fechada; a elipse usa busca de raízes por bisseção nas condições geométricas, suficiente para o snap.

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-geometry src/perpTangent.test.ts src/snap.test.ts
npm run test --workspaces --if-present
```

Na entrega: suíte completa passando (482 testes). Teste de navegador (Playwright) confirmou: uma linha a partir de (10,20) grudou no pé da perpendicular (10,0) de outra linha; uma linha a partir de (30,0) grudou no ponto de tangência do círculo (sobre o círculo e perpendicular ao raio); os marcadores aparecem; sem erros de página.

## Teste manual

1. Comece uma linha (`l`) e clique o primeiro ponto.
2. Aproxime o cursor de outra entidade: o marcador **Perpendicular** (ângulo reto) aparece no pé da perpendicular; sobre um círculo/elipse aparece o **Tangent**.
3. Clique para fixar. Repita com a polyline.
4. Nos snaps (ribbon/status bar), ligue/desligue "Perpendicular" e "Tangent".

## Próximos passos recomendados

- Estender o ponto de referência às demais ferramentas (Move, Circle, Rectangle...).
- Seguir o roadmap para blocos e importação DXF.
