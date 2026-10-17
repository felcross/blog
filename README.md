# Portfolio Blog

Full-stack TypeScript blog: React + Vite frontend, Express + Prisma + PostgreSQL backend, magic-link auth.

## Stack

| Layer | Tech |
|---|---|
| Web | React 18, Vite 6, React Router, TanStack Query, Tailwind v4, react-markdown |
| API | Express 5, Prisma 6, Zod, Pino, TypeScript strict |
| Infra | Docker Compose (PostgreSQL 16, Redis 7, Mailpit — dev) / nginx + Postgres (prod) |
| Tests | Vitest, Supertest, Testing Library, vitest-axe |

## Setup

```bash
# 1. Start infrastructure (Postgres + Redis + Mailpit)
docker compose up -d

# 2. Configure env
cp .env.example .env
# edit .env as needed

# 3. Install dependencies
pnpm install

# 4. Migrate + seed
pnpm db:migrate
pnpm db:seed

# 5. Dev (API :3001 + Web :5173)
pnpm dev
```

Mailpit UI (dev emails): http://localhost:8025

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | API + Web in parallel |
| `pnpm build` | Build both packages |
| `pnpm test` | Run all tests |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check both packages |
| `pnpm db:migrate` | Prisma migrate dev |
| `pnpm db:migrate:deploy` | Prisma migrate deploy (produção) |
| `pnpm db:seed` | Seed admin + sample posts |
| `pnpm db:reset` | Reset DB + migrate + seed |

## Deploy (VPS)

Guia completo (env vars, Nginx Proxy Manager, backup, CI/CD): **[DEPLOY.md](./DEPLOY.md)**

```bash
# Produção (atrás do NPM)
docker compose -f docker-compose.prod.yml up -d --build

# Deploy via script
./scripts/deploy.sh
```

Topologia: Internet → NPM (SSL) → `blog:80` → `api:3001` → `postgres` (rede interna).
Nenhum serviço publica porta no host; só o `web` é alcançável via NPM.

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health + DB check |
| GET | `/api/posts?page=&limit=` | Published posts (paginated) |
| GET | `/api/posts/:slug` | Single published post (404 for drafts) |

Every response includes `x-request-id`. Errors use the envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "Post not found", "details": {} } }
```

## Project structure

```
apps/
  api/          Express + Prisma
  web/          React + Vite
```

Architecture: `routes → controller → service → Prisma` (no repository layer).

## Testing

```bash
pnpm test
```

- API: service visibility + Supertest per endpoint
- Web: unit/integration + axe accessibility

## Notes

- PostgreSQL is mapped to host port **5433** in dev only (5432 is used by another local project). In production Postgres is not published on the host.
- Draft posts are never returned by public endpoints.
- Phases 3–6 of the original spec are roadmap-only (not implemented).
