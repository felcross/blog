#!/usr/bin/env bash
# backup.sh — dump do Postgres de produção com gzip e retenção de 7 dias.
# Uso: ./scripts/backup.sh   (na VPS, a partir de ~/blog)
# Cron sugerido (documentado no DEPLOY.md — não instalar automaticamente):
#   17 3 * * * /root/blog/scripts/backup.sh >> /root/backups/blog-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env -p blog"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M)"
OUT="${BACKUP_DIR}/blog-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Gerando dump em ${OUT}..."
if ! $COMPOSE exec -T postgres pg_dump -U blog blog | gzip >"$OUT"; then
  echo "ERRO: pg_dump falhou." >&2
  rm -f "$OUT"
  exit 1
fi

if [ ! -s "$OUT" ]; then
  echo "ERRO: dump vazio." >&2
  rm -f "$OUT"
  exit 1
fi

# valida que o gzip está íntegro
if ! gzip -t "$OUT" 2>/dev/null; then
  echo "ERRO: arquivo gzip corrompido." >&2
  rm -f "$OUT"
  exit 1
fi

echo "Removendo backups com mais de ${RETENTION_DAYS} dias..."
find "$BACKUP_DIR" -name 'blog-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete

echo "Backup OK: ${OUT} ($(du -h "$OUT" | cut -f1))"
