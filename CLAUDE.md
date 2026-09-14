# CLAUDE.md — CAD-WEB

As regras de arquitetura, stack e convenções do projeto estão em `AGENTS.md` e valem integralmente aqui:

@AGENTS.md

Regras específicas por área: `apps/web/AGENTS.md` e `packages/cad-tools/AGENTS.md`.

## Estado do projeto

- Último MVP entregue: `docs/MVP 3.13 — Snaps de perpendicular e tangente.md` (deferred snaps com ponto de referência via getSnapReferencePoint; módulo perpTangent.ts; Line e Polyline fornecem a âncora).
- Ajustes de UX adicionados: `docs/MVP 3.7.1 — Controles de Zoom (digitar e centralizar).md`, `docs/MVP 3.7.2 — Zoom completo (Window, Previous, In-Out).md` (zoom digitado, extents, window, previous e in/out) `docs/MVP 3.8.1 — Seleção por área, snap de fechamento e Stretch vinculado.md` (snap na polyline, seleção por janela/cruzamento com tracejado, Stretch vinculado à seleção por área) `docs/MVP 3.8.2 — Stretch associativo de cotas.md` (as cotas acompanham o Stretch e o valor recalcula) `docs/MVP 3.8.3 — ESC encerra o comando e mover cotas em qualquer direção.md` (Esc volta para Select liberando o objeto; cotas movem em +X/+Y/−X/−Y no Move) `docs/MVP 3.9 — EllipseTool - Elipse.md` (elipse nativa) `docs/MVP 3.10 — Arco de elipse.md` (arco de elipse) `docs/MVP 3.11 — Snaps de elipse e arco de elipse.md` (snaps de elipse/arco + tipo Quadrant) `docs/MVP 3.12 — Snap de interseção.md` (snap de interseção entre pares) e `docs/MVP 3.13 — Snaps de perpendicular e tangente.md` (snaps deferidos com ponto de referência).
- Próximo MVP recomendado: seguir o roadmap para blocos e importação DXF, ou estender o ponto de referência de snap às demais ferramentas.
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
