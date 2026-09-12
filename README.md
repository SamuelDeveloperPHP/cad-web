# cad-web

CAD-WEB — CAD 2D comercial de alta performance para engenharia (SaaS multiempresa),
com ferramentas estilo AutoCAD, versionamento por branch/commit e import/export JSON e SVG.

Monorepo TypeScript com npm workspaces. A descrição de arquitetura, regras e convenções
está em [AGENTS.md](AGENTS.md); a documentação de cada MVP está em [`docs/`](docs).

## Requisitos

- Node.js 18+ (LTS recomendado) e npm 9+

## Setup

```bash
# Instalar as dependências (raiz + todos os workspaces)
npm install
```

> **Por que o dev depende do `tsc -b`:** os pacotes do workspace
> (`@cad-web/cad-core`, `cad-geometry`, `cad-renderer`, `cad-tools`, `cad-io`)
> apontam `main` para `dist/index.js`, que não existe em um clone novo e não é
> versionado. O Vite do `apps/web` **não** transpila essas libs internas, então sem
> o `dist/` o app falha com `Failed to resolve entry for package "@cad-web/cad-core"`
> ou com um erro de export ausente (`does not provide an export named ...`) quando o
> `dist/` está desatualizado após um `git pull`. Por isso o `npm run dev` compila os
> pacotes automaticamente (script `predev`) antes de subir o Vite.

## Desenvolvimento

```bash
# Compila os pacotes (predev) e sobe o app web (Vite) em http://127.0.0.1:5173
npm run dev
```

O `npm run dev` já roda `tsc -b` antes do Vite, então um clone novo ou um `git pull`
recente funciona sem passo manual. Ao **editar** código em `packages/*` com o dev já
rodando, o Vite não recompila as libs internas sozinho; mantenha o compilador em modo
watch num terminal separado:

```bash
npm run dev:watch   # equivale a: npx tsc -b --watch
```

Se algum dia o `dist/` ficar inconsistente (por exemplo, erro de export ausente),
force uma recompilação limpa:

```bash
npx tsc -b --force
```

## Scripts (raiz)

| Comando             | O que faz                                                        |
| ------------------- | ---------------------------------------------------------------- |
| `npm run dev`       | Compila os pacotes (`tsc -b`) e sobe o app web (Vite, porta 5173) |
| `npm run dev:watch` | Recompila os pacotes internos em modo watch (terminal separado)  |
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
