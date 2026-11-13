# MVP 8.2 — Integração do app web (nuvem)

Fecha o ciclo da fase 8: o app web passa a **conversar com o backend** — login,
registro e salvar/abrir o desenho atual no servidor, além da persistência local
que já existia (IndexedDB).

## Objetivo

- Autenticar no backend a partir da interface (entrar / criar empresa).
- Listar projetos e desenhos da empresa.
- Salvar o desenho atual no servidor (novo ou atualizando o aberto) e abrir um
  desenho do servidor no editor.

## Arquivos criados

- `src/services/apiClient.ts` — cliente REST do backend: URL base
  (`VITE_API_URL`), token em `localStorage` e as chamadas de auth, projetos e
  desenhos; normaliza erros em `ApiError`.
- `src/components/cad/CadCloudPanel.tsx` — painel "Nuvem": formulário de
  login/registro quando deslogado; conta, projetos, desenhos e ações de
  salvar/abrir quando logado.
- `src/styles/cloud.css` — estilo do painel, usando as variáveis do tema.
- `apps/web/.env.example` — documenta `VITE_API_URL`.

## Arquivos alterados

- `src/components/cad/CadTopMenu.tsx` — botão "Nuvem" na barra de acesso rápido
  (prop `onCloud`).
- `src/components/cad/CadEditor.tsx` — estado de abertura do painel e montagem do
  `CadCloudPanel`, ligado ao store (`cad.document` e `cad.importDocument`).
- `src/main.tsx` — importa o `cloud.css`.

## Decisões técnicas

- **Reuso do kernel para o round-trip:** salvar usa `serializeCadDocument` (do
  cad-io) e abrir usa `parseCadDocument`, então o documento vai e volta no mesmo
  formato nativo, validado pelo cad-io — nada de cálculo geométrico na UI.
- **Carregar = `importDocument`:** abrir um desenho do servidor reaproveita o
  mesmo caminho usado pela importação de arquivos (substitui o documento e
  enquadra), com undo/redo e persistência local coerentes.
- **Token em `localStorage`:** a sessão sobrevive ao reload; o painel revalida
  com `GET /me` ao abrir e cai para o login se o token expirou.
- **Sem dependência nova:** o cliente usa `fetch`; nenhuma lib de HTTP ou de
  estado foi adicionada.

## Como testar

```bash
npx tsc -b                      # typecheck de todos os pacotes
npm run build -w @cad-web/web   # build de producao do app
```

Manual (com o backend no ar):

```bash
# 1) backend: configure apps/api/.env e rode as migrations + o servidor
npm run migrate -w @cad-web/api && npm run dev -w @cad-web/api
# 2) web: aponte para a API e rode o app
echo "VITE_API_URL=http://127.0.0.1:3333" > apps/web/.env
npm run dev
# 3) na interface: botao "Nuvem" -> criar empresa -> novo projeto ->
#    "Salvar como novo" -> recarregar -> abrir o desenho da lista
```

## Próximos passos

- Indicar o desenho aberto e o estado "salvo/não salvo" na barra de título.
- Autosave no servidor (reusar o debounce já existente da persistência local).
- Branches e commits do desenho (snapshot imutável, histórico, diff).
- RBAC: papéis e convite de usuários para a empresa.
