# MVP 3.11 — Snaps de elipse e arco de elipse

## Objetivo

Dar à elipse e ao arco de elipse (MVPs 3.9 e 3.10) os snaps de objeto que faltavam, mais um novo tipo de snap de **quadrante**. Assim o desenho preciso passa a "grudar" nos pontos notáveis dessas entidades como já acontece com linhas, círculos e arcos.

## Novo tipo de snap: Quadrante

Foi adicionado o `SnapType` **quadrant** (losango, convenção do AutoCAD), com um toggle próprio nas configurações de snap. Ele expõe:

- **Elipse**: os quatro extremos dos semi-eixos (params 0, π/2, π, 3π/2 no referencial local).
- **Arco de elipse**: apenas os quadrantes que caem dentro da varredura.
- **Círculo**: os quatro quadrantes (extremos horizontais e verticais) — bônus, antes ausente.

## Snaps por entidade

| Snap      | Elipse completa            | Arco de elipse                         |
| --------- | -------------------------- | -------------------------------------- |
| Center    | centro                     | centro                                 |
| Quadrant  | 4 quadrantes               | quadrantes dentro da varredura         |
| Endpoint  | —                          | extremidades do arco (início e fim)    |
| Midpoint  | —                          | ponto médio da varredura               |
| Nearest   | ponto mais próximo da borda| ponto mais próximo dentro da varredura |

Prioridade de desempate (maior vence): `endpoint > midpoint > quadrant > center > nearest`.

## Arquivos

### Alterados

- `packages/cad-geometry/src/ellipse.ts`: novas funções puras `nearestPointOnEllipse`, `ellipseQuadrantPoints`, `ellipseArcEndpoints`, `ellipseArcMidpoint` — todas respeitam o intervalo do arco.
- `packages/cad-geometry/src/snap.ts`: `SnapType` e `SnapSettings` ganham `quadrant`; nova `SnapEllipseEntity` na união `SnapEntity`; a elipse é tratada em endpoint/midpoint/center/nearest; nova `getQuadrantSnapCandidates` (elipse e círculo); `findBestSnap` considera o quadrante; prioridades renumeradas.
- `packages/cad-geometry/src/snap.test.ts`: snaps de centro/quadrante na elipse, quadrante no círculo, endpoint/midpoint no arco e ausência de quadrante fora da varredura.
- `packages/cad-renderer/src/overlays.ts`: marcador (losango) e rótulo "Quadrant".
- `apps/web/src/services/snapSettingsStorage.ts`: persistência do toggle `quadrant`.
- `apps/web/src/components/cad/CadRibbon.tsx`: checkbox "Quadrant" no painel de snap.
- `apps/web/src/components/cad/CadStatusBar.tsx`: "Quadrant" no resumo de snaps ativos.

## Decisões técnicas

- **`SnapEllipseEntity` estrutural.** O `ObjectSnapService` já entrega as `CadEntity` do índice espacial como `SnapEntity`; bastou incluir a variante de elipse na união, com a mesma forma da entidade, para as funções de snap tratarem `type === "ellipse"`.
- **Reuso da amostragem.** O snap `nearest` da elipse reaproveita a mesma estratégia de amostragem + refinamento por busca ternária usada na distância, respeitando a varredura do arco.
- **Quadrantes locais.** Os quadrantes são calculados no referencial da elipse (extremos dos semi-eixos), então acompanham naturalmente a rotação da entidade.
- **Retrocompatível.** O novo toggle `quadrant` entra com padrão ligado; configurações antigas salvas sem o campo assumem o padrão ao carregar.

## Testes

```bash
npx tsc -b
npx vitest run --root packages/cad-geometry src/snap.test.ts
npm run test --workspaces --if-present
```

Na entrega: suíte completa passando (462 testes). Teste de navegador (Playwright) confirmou: com uma elipse desenhada, os extremos de uma linha "grudaram" exatamente nos quadrantes (30,0) e (0,10); o marcador de Quadrante (losango) aparece ao aproximar o cursor; sem erros de página.

## Teste manual

1. Desenhe uma elipse (`el`) e/ou um arco de elipse (`ea`).
2. Ative uma ferramenta de desenho (ex.: Line) e aproxime o cursor dos pontos notáveis: centro, quadrantes, e — no arco — extremidades e ponto médio; a borda oferece o snap nearest.
3. O marcador aparece e o clique fixa o ponto exato.
4. Nos snaps (ribbon/status bar), ligue/desligue "Quadrant" e confira o comportamento.

## Próximos passos recomendados

- Snap de interseção (elipse × linha/círculo/arco).
- Seguir o roadmap para blocos e importação DXF.
