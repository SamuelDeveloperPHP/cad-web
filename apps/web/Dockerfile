# syntax=docker/dockerfile:1
# Imagem do app web (@cad-web/web). O contexto de build e a raiz do monorepo,
# porque o SPA depende dos pacotes internos.

# ---- Builder: compila o SPA de producao ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY . .
RUN npm ci
# Mesma origem: o SPA chama /api/v1/... e o Nginx faz proxy para a API, entao
# a URL base fica vazia (sem apontar para um host fixo).
ENV VITE_API_URL=""
RUN npm run build -w @cad-web/web

# ---- Runner: Nginx servindo o SPA e fazendo proxy do /api ----
FROM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
