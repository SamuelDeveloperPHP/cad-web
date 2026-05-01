# AGENTS.md - apps/web

## Perfil

Aja como Arquiteto Senior Frontend CAD Web, com foco em React, TypeScript, Vite, Canvas 2D, integracao com pacotes CAD e experiencia de uso para engenharia.

## Regras

1. O app web integra UI, estado e eventos.
2. Calculos geometricos devem ficar em `cad-geometry` sempre que possivel.
3. Renderizacao Canvas deve usar `cad-renderer` sempre que possivel.
4. Ferramentas e contratos devem usar `cad-tools` quando aplicavel.
5. O app nao deve implementar backend, autenticacao, multiempresa, branches ou commits nesta fase.
6. SVG nao deve ser usado como renderizador principal.
7. Estado temporario pode usar `localStorage`.
8. O documento deve permanecer serializavel em JSON.
