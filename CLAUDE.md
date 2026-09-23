# CLAUDE.md — CAD-WEB

As regras de arquitetura, stack e convenções do projeto estão em `AGENTS.md` e valem integralmente aqui:

@AGENTS.md

Regras específicas por área: `apps/web/AGENTS.md` e `packages/cad-tools/AGENTS.md`.

## Estado do projeto

- Fix recente: Entrada direta de medidas em todas as ferramentas de desenho. Após clicar o primeiro ponto, o usuário pode digitar distância (ex.: `10`), coordenadas absolutas (`10,20`), relativas (`@5,3`) ou polares (`@10<45`) na linha de comando. Funciona em LineTool, ArcTool, EllipseTool, EllipseArcTool e PolylineTool. CircleTool e RectangleTool já tinham entrada numérica.
- Fix anterior: Fillet e Chamfer agora operam sobre retângulos e polylines (além de linhas separadas). Ao selecionar duas arestas adjacentes de um retângulo ou polyline, a entidade original é explodida em linhas individuais + arco (fillet) ou linha de chanfro (chamfer). Comandos `FilletCornerCommand` e `ChamferCornerCommand` com undo/redo. O fluxo de duas linhas separadas (`FilletLineLineCommand`/`ChamferLineLineCommand`) continua funcionando.
- Último MVP entregue: `docs/MVP 3.19 — Elipse completa e SVG nativo.md` (elipse com modo Eixo/Fim, eixo maior normalizado, painel com raios e ângulos do arco editáveis, perímetro/comprimento; Trim/Extend gerais — linhas, círculos, arcos, elipses e arcos de elipse, qualquer geometria como corte/limite; Offset de arco/elipse; Fillet linha × curva; Path Array em elipse; primeiro ponto digitado em Line/Arc/Circle/Rectangle; SVG com payload JSON nativo — ida e volta exata de elipses, arcos, cotas, textos, camadas e estilos — e importador novo com transforms, `<path>` completo, `<ellipse>` e camadas do Inkscape).
- MVP anterior: `docs/MVP 3.18 — Texto e propriedades de anotação.md` (entidade `text` com TextTool no estilo TEXT do AutoCAD — ponto, altura, rotação, várias linhas —, render com greeking, snap Insertion, JSON/SVG e painel de propriedades; setas de cota `open`/`dot`/`none` e overrides de Arrow Size/Text Height; painel de propriedades na unidade de trabalho com ângulos na convenção AutoCAD). Complemento 3.18.1: importação de `<text>` de SVG (grupos do CAD-WEB com ida e volta exata e textos de outros editores), seção de elipse no painel e ângulos do arco na convenção AutoCAD (`cad-geometry/src/visualAngles.ts`).
- MVP anterior: `docs/MVP 3.17 — Unidades de trabalho.md` (a unidade do rodapé vira unidade de trabalho: entrada digitada e leitura convertidas por `unitScale` no ToolContext; geometria continua em mm).
- MVP anterior: `docs/MVP 3.16 — Mira do cursor e linhas de eixo.md` (mira tracejada amarela que acompanha o mouse + eixos verde/vermelho na origem, desenhados no overlay; botões CURSOR/EIXOS no rodapé e comandos cursor/eixo; preferência em localStorage). Inclui o fix do canvas em branco no StrictMode (rAF reagendado no remonte).
- MVP anterior: `docs/MVP 3.15 — Performance 2 — Cache de bounding box e LOD.md` (entityBoundingBox cacheado por objeto em WeakMap no cad-core; LOD no renderDocument2D — entidades sub-pixel viram ponto e o texto de cota é omitido quando ilegível; cache ~10x e sem geometria/texto de cota no zoom aberto).
- MVP anterior: `docs/MVP 3.14 — Performance 1 — Persistência IndexedDB e render em rAF.md` (persistência assíncrona em IndexedDB com debounce, migrando o legado do localStorage; render em duas camadas — base estática + overlay dinâmico — agendado em requestAnimationFrame; só `apps/web`).
- Ajustes de UX adicionados: `docs/MVP 3.7.1 — Controles de Zoom (digitar e centralizar).md`, `docs/MVP 3.7.2 — Zoom completo (Window, Previous, In-Out).md` (zoom digitado, extents, window, previous e in/out) `docs/MVP 3.8.1 — Seleção por área, snap de fechamento e Stretch vinculado.md` (snap na polyline, seleção por janela/cruzamento com tracejado, Stretch vinculado à seleção por área) `docs/MVP 3.8.2 — Stretch associativo de cotas.md` (as cotas acompanham o Stretch e o valor recalcula) `docs/MVP 3.8.3 — ESC encerra o comando e mover cotas em qualquer direção.md` (Esc volta para Select liberando o objeto; cotas movem em +X/+Y/−X/−Y no Move) `docs/MVP 3.9 — EllipseTool - Elipse.md` (elipse nativa) `docs/MVP 3.10 — Arco de elipse.md` (arco de elipse) `docs/MVP 3.11 — Snaps de elipse e arco de elipse.md` (snaps de elipse/arco + tipo Quadrant) `docs/MVP 3.12 — Snap de interseção.md` (snap de interseção entre pares) e `docs/MVP 3.13 — Snaps de perpendicular e tangente.md` (snaps deferidos com ponto de referência).
- Próximo MVP recomendado: rodada de testes dos engenheiros; depois entidade spline, edição de texto no canvas (duplo clique) ou seguir o roadmap para blocos e importação DXF.
- `apps/api` (Laravel) ainda não foi iniciado; contém apenas README.
- Roadmap completo por disciplina (fases 1 a 5): `docs/00 - ROADMAP — MVPs por disciplina de engenharia.md`.
- CI: `.github/workflows/ci.yml` roda build, typecheck, testes, build do web e checagem de fronteiras a cada push e pull request.

## Comandos essenciais

```bash
npm ci                                  # dependências
npm run dev                             # compila os pacotes (predev) e sobe o app web em http://127.0.0.1:5173
npm run dev:watch                       # recompila packages/* em watch (terminal separado, ao editar libs internas)
npx tsc -b --force                      # recompila do zero se o dist/ ficar inconsistente
npm run test --workspaces --if-present  # testes de todos os pacotes (Vitest)
npx vitest run --root packages/<pacote> # testes de um pacote
```

## Agentes do projeto (`.claude/agents/`)

Cada agente trabalha em uma única área e respeita as fronteiras de pacote. Ordem natural de um MVP: `mvp-planner → cad-geometry → cad-core → cad-tools → cad-renderer → cad-io → web-ui → cad-reviewer`.

| Agente         | Área                     | Quando usar                                                                 |
| -------------- | ------------------------ | --------------------------------------------------------------------------- |
| `mvp-planner`  | `docs/` (só lê)          | Transformar uma ideia em plano de MVP no padrão dos documentos existentes   |
| `cad-geometry` | `packages/cad-geometry`  | Funções matemáticas puras e seus testes                                     |
| `cad-core`     | `packages/cad-core`      | Entidades, comandos com undo/redo, layers, estilos de cota, índice espacial |
| `cad-tools`    | `packages/cad-tools`     | Ferramentas interativas, snaps, seleção, aliases                            |
| `cad-renderer` | `packages/cad-renderer`  | Canvas, viewport, grid, overlays, performance de render                     |
| `cad-io`       | `packages/cad-io`        | JSON nativo, SVG, migrações de schema, round trip                           |
| `web-ui`       | `apps/web`               | Integração de ferramentas na UI, painéis, store, UX                         |
| `api-laravel`  | `apps/api`               | Backend SaaS: tenants, auth, branches, commits, merge requests              |
| `cad-reviewer` | repositório (só lê)      | Revisão de fronteiras, undo/redo, serialização, tolerância, testes          |

Exemplo de uso: "use o agente mvp-planner para planejar o MVP 3.6 ArcTool", depois "use o agente cad-geometry para implementar o passo 1 do plano".
