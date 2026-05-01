# Estrutura Inicial do Monorepo

## Objetivo

Este documento registra a estrutura inicial criada para o CAD-WEB Engenharia SaaS.

## Estrutura

```text
cad-web/
  package.json
  tsconfig.base.json
  packages/
    cad-core/
    cad-geometry/
    cad-renderer/
    cad-tools/
    cad-io/
  apps/
    web/
    api/
  docs/
```

## Decisoes

- `cad-geometry` contem matematica pura e tipos geometricos.
- `cad-core` contem documento CAD e entidades.
- `cad-renderer` contem Canvas e viewport, sem alterar geometria.
- `cad-tools` contem contratos iniciais para ferramentas interativas.
- `cad-io` contem serializacao e desserializacao.
- `apps/web` foi reservado para React + Vite.
- `apps/api` foi reservado para Laravel.

## Proxima Etapa

Implementar testes unitarios iniciais para `cad-geometry` e evoluir `cad-core` com comandos e historico de undo/redo.
