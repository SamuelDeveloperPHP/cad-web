# cad-web

CAD-WEB — CAD 2D comercial de alta performance para engenharia (SaaS multiempresa),
com ferramentas estilo AutoCAD, versionamento por branch/commit e import/export JSON e SVG.

Monorepo TypeScript com npm workspaces. A descrição de arquitetura, regras e convenções
está em [AGENTS.md](AGENTS.md); a documentação de cada MVP está em [`docs/`](docs).

## Requisitos

- Node.js 18+ (LTS recomendado) e npm 9+

## Setup

```bash
# 1. Instalar as dependências (raiz + todos os workspaces)
npm install

# 2. Compilar os pacotes internos (obrigatório antes do primeiro dev)
npx tsc -b
```

> **Importante:** o passo 2 não é opcional. Os pacotes do workspace
> (`@cad-web/cad-core`, `cad-geometry`, `cad-renderer`, `cad-tools`, `cad-io`)
> apontam `main` para `dist/index.js`, que não existe em um clone novo. O Vite do
> `apps/web` **não** transpila essas libs internas, então `npm run dev` sozinho falha
> com `Failed to resolve entry for package "@cad-web/cad-core"` até que o `tsc -b`
> gere os `dist/`.

## Desenvolvimento

```bash
# Sobe o app web (Vite) em http://127.0.0.1:5173
npm run dev
```

Como o Vite não recompila os pacotes internos automaticamente, ao editar código em
`packages/*` rode o compilador em modo watch num terminal separado:

```bash
npx tsc -b --watch
```

## Scripts (raiz)

| Comando             | O que faz                                                        |
| ------------------- | ---------------------------------------------------------------- |
| `npm run dev`       | Sobe o app web em modo desenvolvimento (Vite, porta 5173)        |
| `npm run build`     | Compila os pacotes (`tsc -b`) e faz o build de produção do web   |
| `npm run preview`   | Serve localmente o build de produção do web                      |
| `npm run typecheck` | Type-check + build dos pacotes via project references (`tsc -b`) |
| `npm run test`      | Compila e roda os testes de todos os workspaces                  |

## Estrutura

```
packages/
  cad-core/       documento CAD, entidades, comandos, histórico, undo/redo
  cad-geometry/   matemática pura: pontos, vetores, matrizes, interseções, snaps, offset, fillet, chamfer
  cad-renderer/   Canvas, viewport, grid, zoom, pan, overlays
  cad-tools/      ferramentas interativas: line, circle, move, rotate, trim, offset, array, ...
  cad-io/         import/export JSON e SVG
apps/
  web/            aplicação React + Vite + Tailwind/shadcn
  api/            backend Laravel (SaaS)
```
