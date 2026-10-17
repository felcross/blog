# Deploy — Blog em produção (VPS + Nginx Proxy Manager)

## Topologia

```
Internet → NPM (443, SSL) → blog:80 (nginx: SPA + proxy /api/)
  → api:3001 (Express + Prisma) → postgres:5432 (rede interna)
```

O browser vê uma única origem (`https://blog.felbatista.tech`) — cookie de sessão funciona sem CORS.

- Apenas `web` é alcançável de fora (via NPM, na rede externa).
- `api` e `postgres` vivem só na rede `internal`.
- Nenhum serviço publica porta no host.

## Variáveis de ambiente (`.env` na VPS)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim* | Sobrescrita pelo compose para `@postgres:5432` |
| `ADMIN_EMAIL` | sim | Dono/admin do blog |
| `WEB_URL` | sim | `https://blog.felbatista.tech` (CORS origin) |
| `NODE_ENV` | sim | `production` (ativa cookies `Secure`) |
| `SESSION_SECRET` | sim | `openssl rand -hex 32` |
| `SMTP_HOST` | sim | `smtp.gmail.com` |
| `SMTP_PORT` | sim | `587` |
| `SMTP_USER` | sim | Usuário Gmail |
| `SMTP_PASS` | sim | App password do Gmail |
| `SMTP_FROM` | sim | Remetente, ex.: `"Blog <feljava32@gmail.com>"` |
| `TRUST_PROXY` | sim | `2` (NPM + nginx do web) |
| `NPM_NETWORK` | sim | Rede externa do NPM, ex.: `rede_vps` |
| `POSTGRES_PASSWORD` | sim | Senha do banco (força do `:?` no compose) |
| `POSTGRES_USER` | não | Default `blog` |
| `POSTGRES_DB` | não | Default `blog` |
| `PORT` | não | Default `3001` |

\* o compose injeta o `DATABASE_URL` apontando para o serviço `postgres`.

Copie de `.env.example` e preencha. **Nunca commite o `.env`.**

## Subir / atualizar

```bash
# Primeira subida ou update completo
docker compose -f docker-compose.prod.yml up -d --build

# Update via script (git pull + build + up)
./scripts/deploy.sh

# Reset total (APAGA o banco)
./scripts/deploy-clean.sh
```

## Logs

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml ps
```

## Migrations e seed

- Migrations rodam **automaticamente** no start da API (`prisma migrate deploy`).
- Seed **não** roda em produção. Para popular o admin + posts de exemplo (uma vez):
  ```bash
  docker compose -f docker-compose.prod.yml exec api npx prisma db seed
  ```

## Backup do Postgres

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U blog blog > "backup-blog-$(date +%Y%m%d-%H%M%S).sql"
```

Restore:

```bash
cat backup-blog-XXXX.sql | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U blog blog
```

## Nginx Proxy Manager

1. **DNS** (Cloudflare): `blog.felbatista.tech` → IP da VPS
2. **Proxy Host** no NPM:
   - Domain: `blog.felbatista.tech`
   - Forward: `blog:80` (na rede `NPM_NETWORK`)
   - SSL: via Cloudflare (Full/Strict) ou Let's Encrypt no NPM
3. O NPM envia `X-Forwarded-For` e `X-Forwarded-Proto` — o nginx do `blog` repassa o proto original para a API (necessário p/ cookies `Secure`).

## CI/CD (GitHub Actions)

Push em `main` dispara `.github/workflows/api.yml` e `web.yml`:
lint/test → SSH na VPS (`/root/blog`) → `git pull` + build do serviço alterado.

Secrets necessárias no repo GitHub: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
