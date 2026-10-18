# Deploy — Blog em produção (VPS + Nginx Proxy Manager)

## Topologia

```
Internet → NPM (443, SSL) → blog:80 (nginx: SPA + proxy /api/)
  → api:3001 (Express + Prisma) → postgres:5432 (rede interna)
  → worker (BullMQ) → redis:6379 (rede interna) → SMTP
```

O browser vê uma única origem (`https://blog.felbatista.tech`) — cookie de sessão funciona sem CORS.

- Apenas `web` é alcançável de fora (via NPM, na rede externa).
- `api`, `worker`, `postgres` e `redis` vivem só na rede `internal`.
- Nenhum serviço publica porta no host (`redis` e `worker` inclusos).
- O container `worker` **não** roda migrations — só `api` roda `prisma migrate deploy`.

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
| `REDIS_URL` | não | Default `redis://redis:6379` no compose de produção |
| `EMAIL_WORKER_CONCURRENCY` | não | Default `5` |
| `EMAIL_BACKOFF_MS` | não | Default `5000` (backoff exponencial do BullMQ) |
| `LOG_LEVEL` | não | Default `info` (`fatal\|error\|warn\|info\|debug\|trace\|silent`) |
| `POSTGRES_USER` | não | Default `blog` |
| `POSTGRES_DB` | não | Default `blog` |
| `PORT` | não | Default `3001` |

\* o compose injeta o `DATABASE_URL` apontando para o serviço `postgres`.

Copie de `.env.example` e preencha. **Nunca commite o `.env`.**

## Subir / atualizar

```bash
# Primeira subida ou update completo
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# Update via script (git pull + build + up)
./scripts/deploy.sh

# Smoke test (espera /api/health até 60s; em falha imprime logs da api)
./scripts/smoke.sh

# Reset total (APAGA o banco)
./scripts/deploy-clean.sh
```

## Logs

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f api
docker compose -f docker-compose.prod.yml --env-file .env logs -f worker
docker compose -f docker-compose.prod.yml --env-file .env logs -f web
docker compose -f docker-compose.prod.yml --env-file .env ps
```

- Logs da API e do worker são JSON (Pino), um evento por linha, com `requestId`.
- O `requestId` de uma request HTTP aparece também nos logs do worker (correlação ponta a ponta).
- Rotação de logs: `json-file`, `max-size: 10m`, `max-file: 3` em todos os serviços.

### Filas de e-mail

```bash
# Contagens + DLQ (admin, requer sessão ADMIN)
curl -s -b cookies.txt https://blog.felbatista.tech/api/admin/queues/email
```

- Jobs `magic-link` e `welcome` na fila `email` (3 tentativas, backoff exponencial).
- Jobs esgotados vão para `email-dlq` (sem URL/token — só e-mail mascarado, requestId, jobId).
- Worker logs: `docker compose … logs -f worker` (eventos `completed`, `failed`, `stalled`).

## Migrations e seed

- Migrations rodam **automaticamente** no start da API (`prisma migrate deploy`).
- O container `worker` **não** roda migrations (command override `node dist/worker.js`).
- Seed **não** roda em produção. Para popular o admin + posts de exemplo (uma vez):
  ```bash
  docker compose -f docker-compose.prod.yml --env-file .env exec api npx prisma db seed
  ```

## Rollback

```bash
cd /root/blog
git log --oneline -5          # escolha o commit bom
git checkout <commit-bom>
docker compose -f docker-compose.prod.yml --env-file .env -p blog up -d --build
./scripts/smoke.sh
```

- Não é preciso reverter migrations para rollback de código, desde que o schema seja compatível.
- Se uma migration quebrou o banco: restore do backup (`gunzip -c … | psql`) e então `git checkout` do commit anterior.

## Backup do Postgres

Script recomendado (gzip + retenção de 7 dias):

```bash
./scripts/backup.sh
```

- Grava em `~/backups/blog-YYYYMMDD-HHMM.sql.gz`
- Apaga backups com mais de 7 dias
- Sai com código ≠ 0 se o dump falhar ou o gzip estiver corrompido
- Variáveis opcionais: `BACKUP_DIR` (default `~/backups`), `RETENTION_DAYS` (default `7`)

### Cron sugerido (instalar manualmente na VPS)

```cron
17 3 * * * /root/blog/scripts/backup.sh >> /root/backups/blog-backup.log 2>&1
```

### Restore

```bash
gunzip -c ~/backups/blog-XXXXXX-XXXX.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env exec -T postgres psql -U blog blog
```

Dump manual (sem script):

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec -T postgres \
  pg_dump -U blog blog | gzip > "backup-blog-$(date +%Y%m%d-%H%M%S).sql.gz"
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
lint/test → SSH na VPS (`/root/blog`) → `git pull` → `docker compose … up -d --build` → `./scripts/smoke.sh`.

- Deploy só roda se lint/test passarem (`needs: lint-and-test`).
- Grupo de concorrência `deploy-vps`: api e web nunca fazem deploy ao mesmo tempo.
- Se o smoke test falhar, o job falha e imprime as últimas 50 linhas de `blog-api`.

Secrets necessárias no repo GitHub: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
