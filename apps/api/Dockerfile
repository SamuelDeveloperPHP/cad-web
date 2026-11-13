# syntax=docker/dockerfile:1
# Imagem do backend @cad-web/api. O contexto de build e a raiz do monorepo
# (veja docker-compose.yml), porque o workspace npm vive na raiz.

# ---- Builder: instala tudo e compila o apps/api ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Copia o monorepo (o .dockerignore ja exclui node_modules, dist, etc.).
COPY . .

# Instala as dependencias de todos os workspaces de forma reproduzivel.
RUN npm ci

# Compila apenas o backend para dist/.
RUN npm run build -w @cad-web/api

# Remove as dependencias de desenvolvimento, deixando so as de producao.
RUN npm prune --omit=dev

# ---- Runner: imagem enxuta apenas com o necessario para rodar ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# node_modules de producao (hoisted na raiz) e artefatos do backend.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle

WORKDIR /app/apps/api
EXPOSE 3333

# Executa sem privilegios de root.
USER node

# Sobe o servidor ja compilado. As migrations sao aplicadas pelo compose
# (ou manualmente com: node dist/db/migrate.js) antes deste comando.
CMD ["node", "dist/server.js"]
