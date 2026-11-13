# Rodando localmente

Guia prático para rodar o CAD-WEB na sua máquina. Há três modos, do mais leve ao
mais completo — escolha conforme o que você quer fazer.

## Resumo dos modos

| Modo | O que sobe | Quando usar | Precisa de |
| ---- | ---------- | ----------- | ---------- |
| **1. Só o editor** | Web (Vite) | Mexer no CAD, sem nuvem/login | Node 22 |
| **2. Dev leve** (recomendado p/ backend) | Postgres (Docker) + API (Node) + Web (Vite) | Desenvolver com a nuvem e *hot reload* | Node 22 + Docker |
| **3. Stack completa** | Web + API + Postgres + Redis (tudo em Docker) | Rodar tudo empacotado, perto de produção | Docker |

## Portas

| Serviço | Porta |
| ------- | ----- |
| Web (Vite, dev) | 5173 |
| Web (Docker, Nginx) | 8085 |
| API | 3333 |
| PostgreSQL | 5432 |
| Redis | 6379 |

## Pré-requisitos

- **Node.js 22** (o backend e as imagens Docker usam a 22; o app web roda a partir da 18).
- **Docker Desktop** (para o Postgres no modo 2, ou a stack completa no modo 3).
- Instalar as dependências uma vez, na raiz do repositório:

```bash
npm ci
```

---

## Modo 1 — Só o editor (sem backend)

O mais rápido para ver o CAD funcionando. Não precisa de Docker nem de banco.

```bash
npm run dev
```

→ abre em **http://127.0.0.1:5173**. Os desenhos são salvos **localmente** no
navegador (IndexedDB); não há login nem recursos de nuvem.

> O `npm run dev` compila os pacotes internos (`tsc -b`, via `predev`) antes de
> subir o Vite, então um clone novo ou um `git pull` recente funciona sem passo
> manual. Ao **editar** código em `packages/*`, mantenha `npm run dev:watch` num
> terminal separado para recompilar as libs internas.

---

## Modo 2 — Dev leve: Docker só para o Postgres (recomendado)

Aqui o Docker carrega **apenas o PostgreSQL**; a API e o web rodam direto com
Node, com *hot reload*. É o fluxo de desenvolvimento mais leve e rápido. Use três
terminais.

### Terminal 1 — Postgres

```bash
docker compose up -d db
```

Sobe só o serviço `db` (PostgreSQL em `localhost:5432`; usuário/senha/base =
`cad`/`cad`/`cad_web`). Confira que está pronto com `docker compose ps` (estado
`healthy`).

### Terminal 2 — API (Node)

**Windows (PowerShell):**

```powershell
$env:DATABASE_URL="postgres://cad:cad@localhost:5432/cad_web"
$env:JWT_SECRET="troque-este-segredo-com-32-ou-mais-caracteres"
npm run migrate -w @cad-web/api   # cria/atualiza as tabelas
npm run dev -w @cad-web/api        # API em http://127.0.0.1:3333 (watch)
```

**macOS / Linux (bash):**

```bash
export DATABASE_URL="postgres://cad:cad@localhost:5432/cad_web"
export JWT_SECRET="troque-este-segredo-com-32-ou-mais-caracteres"
npm run migrate -w @cad-web/api
npm run dev -w @cad-web/api
```

> O `migrate` só precisa rodar na primeira vez e sempre que houver uma migration
> nova. Se ele falhar com erro de conexão logo após subir o banco, espere o
> Postgres terminar de iniciar (`docker compose ps` → `healthy`) e rode de novo.

### Terminal 3 — Web (Vite)

```bash
npm run dev
```

→ **http://127.0.0.1:5173**. O web já chama a API em `:3333` por padrão (não
precisa configurar nada), e o CORS em desenvolvimento libera o `5173`
automaticamente.

Pronto: no app, **Nuvem → Criar empresa** e todo o fluxo de nuvem funciona
(projetos, desenhos, salvar, commits, branches, merge requests), com Postgres
real por trás.

Para parar o Postgres depois: `docker compose stop db` (mantém o container) ou
`docker compose down` (remove os containers; o volume `pgdata` preserva os dados).

---

## Modo 3 — Stack completa (um comando)

Tudo empacotado em Docker (Nginx servindo o SPA + API + Postgres + Redis). **Não
precisa de Node instalado** — tudo compila dentro dos containers.

```bash
docker compose up --build
```

→ **http://localhost:8085**. A API aplica as migrations e sobe em `:3333`; o
Nginx serve o app e faz **proxy de `/api`** para a API (mesma origem, sem CORS).

- Parar/limpar: `docker compose down` (o volume `pgdata` preserva os dados).
- O **primeiro build demora alguns minutos** (instala dependências e compila web
  e API).

> **Produção:** defina um `JWT_SECRET` forte antes de subir (ex.: num arquivo
> `.env` ao lado do `docker-compose.yml`). O valor padrão do compose é apenas um
> placeholder.

---

## Variáveis de ambiente

### API (`apps/api`)

| Variável | Obrigatória | Padrão | Descrição |
| -------- | ----------- | ------ | --------- |
| `DATABASE_URL` | sim | — | Conexão PostgreSQL (`postgres://user:senha@host:porta/base`) |
| `JWT_SECRET` | sim | — | Segredo do JWT (**≥ 32 caracteres** em produção) |
| `PORT` | não | `3333` | Porta da API |
| `NODE_ENV` | não | `development` | Ambiente |
| `CORS_ORIGINS` | não | reflete a origem | Lista separada por vírgula; **defina em produção** |
| `LOG_LEVEL` | não | `info` | Nível de log do `pino` |

### Web (`apps/web`)

| Variável | Padrão | Descrição |
| -------- | ------ | --------- |
| `VITE_API_URL` | `http://127.0.0.1:3333` | Base da API. **Vazio** = mesma origem (usado no Docker, onde o Nginx faz o proxy) |

---

## Perguntas comuns

### Preciso de Docker só para o Postgres?

Hoje, na prática, **sim**. O backend usa **PostgreSQL** (Drizzle + `pg`) — o MySQL
do WAMP não serve. O Docker é o jeito mais fácil de ter Postgres no Windows sem
instalar nativamente. A API e o web você roda direto com Node (modo 2).
Alternativa: instalar o PostgreSQL nativo e apontar a `DATABASE_URL` para ele —
aí dispensa o Docker por completo.

### E o Redis?

Está reservado para cache/filas/realtime (fase 9 do roadmap). **O código ainda
não usa**, então não precisa subir. Quando entrar, basta
`docker compose up -d db redis`.

---

## Problemas comuns

- **`Cannot GET /` em alguma porta** — outro servidor (Express) está ocupando a
  porta; não é o Nginx do projeto. Descubra o dono com
  `netstat -ano | findstr :<porta>` e `tasklist /FI "PID eq <PID>"` (Windows), ou
  troque a porta publicada no `docker-compose.yml`.
- **`Failed to resolve entry for package "@cad-web/cad-core"`** — faltou compilar
  os pacotes internos. Rode `npx tsc -b` (o `npm run dev` e os Dockerfiles já
  fazem isso automaticamente).
- **`port is already allocated` no `docker compose up`** — a porta do host já está
  em uso; troque o mapeamento no `docker-compose.yml` (ex.: `8090:80`).
- **A API não conecta no Postgres logo após subir** — o banco ainda está
  iniciando; espere o `docker compose ps` mostrar `healthy` e rode o passo de novo.
- **`dist/` inconsistente após um `git pull`** (erro de export ausente) — force
  uma recompilação limpa: `npx tsc -b --force`.
