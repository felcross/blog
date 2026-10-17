# API — Express + Prisma (monorepo pnpm)
# Build context: repo root (ver docker-compose.yml)

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# cache do store pnpm acelera retries em rede instável
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 20000 && \
    pnpm config set fetch-retry-maxtimeout 120000 && \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter api build

FROM base AS runtime
# openssl: engine do Prisma em alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production

# Workspace completo (pnpm usa symlinks para /app/node_modules/.pnpm)
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api

WORKDIR /app/apps/api
EXPOSE 3001

# non-root: node user já existe na imagem oficial
RUN chown -R node:node /app
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:3001/api/health || exit 1

# migrate deploy no boot garante schema atualizado a cada deploy
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
