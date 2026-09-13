# MVP 3.12 — Snap de interseção

## Objetivo

Adicionar o snap de **interseção**: quando o cursor se aproxima de um ponto onde duas entidades se cruzam, o desenho "gruda" nesse cruzamento. É o primeiro snap entre pares de entidades (os anteriores eram por entidade). Cobre todas as combinações dos tipos suportados, incluindo elipse e arco de elipse.

## Como funciona

Cada entidade é reduzida a **primitivas geométricas**:

| Entidade                         | Primitivas                                  |
| -------------------------------- | ------------------------------------------- |
| Linha / retângulo / polyline     | Segmentos                                   |
| Círculo / arco                   | Círculo (com faixa angular no arco)         |
| Elipse / arco de elipse          | Elipse (com faixa paramétrica no arco)      |

Para cada par de entidades próximas ao cursor (já filtradas pelo índice espacial), o snap calcula os pontos de interseção entre suas primitivas e oferece os que caem dentro da tolerância. A interseção é filtrada pelos limites reais de cada entidade (segmentos limitados, faixa do arco de círculo, varredura do arco de elipse).

### Matemática (novo módulo `intersections.ts`)

- **segmento × segmento**: analítico.
- **segmento × círculo**: equação quadrática, limitada ao segmento e à faixa do arco.
- **segmento × elipse**: o segmento é levado ao espaço normalizado da elipse (des-rotacionado e dividido pelos semi-eixos), onde a elipse vira o círculo unitário; a solução volta ao mundo e é filtrada pela varredura.
- **círculo × círculo**: analítico (dois círculos), filtrado pelas faixas dos arcos.
- **círculo × elipse** e **elipse × elipse**: uma das curvas é amostrada em segmentos (respeitando sua faixa) e resolvida analiticamente contra a outra — resultado exato na curva analítica e sub-pixel na amostrada.

## Novo tipo de snap: Intersection

Foi adicionado o `SnapType` **intersection** (marcador em "X", convenção do AutoCAD), com toggle próprio nas configurações. Prioridade de desempate (maior vence): `endpoint > intersection > midpoint > quadrant > center > nearest`.

## Arquivos

### Novos

- `packages/cad-geometry/src/intersections.ts`: primitivas e cálculo de interseção (`segmentSegmentIntersection`, `segmentCircleIntersections`, `segmentEllipseIntersections`, `circleCircleIntersections`, `intersectPrimitives`).
- `packages/cad-geometry/src/intersections.test.ts`: testes das interseções analíticas e com curvas limitadas.

### Alterados

- `packages/cad-geometry/src/index.ts`: export do módulo `intersections`.
- `packages/cad-geometry/src/snap.ts`: `SnapType`/`SnapSettings` ganham `intersection`; redução `snapEntityToPrimitives`; `getIntersectionSnapCandidates`; `findBestSnap` percorre os pares de entidades; prioridades renumeradas.
- `packages/cad-geometry/src/snap.test.ts`: interseção linha×linha, linha×elipse e ausência quando não há cruzamento.
- `packages/cad-renderer/src/overlays.ts`: marcador ("X") e rótulo "Intersection".
- `apps/web/src/services/snapSettingsStorage.ts`: persistência do toggle.
- `apps/web/src/components/cad/CadRibbon.tsx` e `CadStatusBar.tsx`: checkbox "Intersection" e resumo.

## Decisões técnicas

- **Snap por par no orquestrador.** Diferente dos snaps por entidade, a interseção precisa de dois objetos; o loop de pares fica em `findBestSnap`, que já recebe apenas as entidades próximas ao cursor (índice espacial), mantendo o custo baixo.
- **Redução a primitivas.** Reduzir toda entidade a segmento/círculo/elipse permite tratar N×M combinações com poucas rotinas analíticas, sem um caso especial por par de tipos.
- **Híbrido analítico + amostragem.** Pares curva×curva (círculo/elipse × círculo/elipse) amostram uma curva e resolvem analiticamente contra a outra, evitando a solução de quártica e mantendo precisão suficiente para o snap.
- **Retrocompatível.** O toggle `intersection` entra ligado por padrão; configurações salvas sem o campo assumem o padrão ao carregar.

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-geometry src/intersections.test.ts src/snap.test.ts
npm run test --workspaces --if-present
```

Na entrega: suíte completa passando (471 testes). Teste de navegador (Playwright) confirmou: com duas linhas cruzando, o extremo de uma terceira "grudou" exatamente na interseção real; o marcador em "X" aparece no cruzamento de uma linha com a elipse; sem erros de página.

## Teste manual

1. Desenhe duas entidades que se cruzem (ex.: duas linhas, ou uma linha e uma elipse/círculo/arco).
2. Ative uma ferramenta de desenho e aproxime o cursor do cruzamento: o marcador "X" (Intersection) aparece e o clique fixa o ponto exato.
3. Nos snaps (ribbon/status bar), ligue/desligue "Intersection".

## Próximos passos recomendados

- Snap de perpendicular e tangente.
- Seguir o roadmap para blocos e importação DXF.
