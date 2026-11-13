# syntax=docker/dockerfile:1
# Imagem do app web (@cad-web/web). O contexto de build e a raiz do monorepo,
# porque o SPA depende dos pacotes internos.

# ---- Builder: compila o SPA de producao ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY . .
RUN npm ci
# O SPA importa os pacotes internos (@cad-web/cad-core etc.) pela saida
# compilada (dist/), que o .dockerignore nao copia; compila o monorepo com
# tsc -b antes de empacotar o SPA, senao o Vite nao resolve os pacotes.
RUN npx tsc -b
# Mesma origem: o SPA chama /api/v1/... e o Nginx faz proxy para a API, entao
# a URL base fica vazia (sem apontar para um host fixo).
ENV VITE_API_URL=""
RUN npm run build -w @cad-web/web

# ---- Runner: Nginx servindo o site estatico (/) + o editor SPA (/app) + proxy /api ----
FROM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
# Site institucional estatico (landing, login, termos, privacidade, robots, sitemap) na raiz.
COPY --from=builder /app/apps/web/site /usr/share/nginx/html
# Editor (SPA) compilado com base /app/, servido sob /app.
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html/app
EXPOSE 80
