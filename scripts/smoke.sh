#!/usr/bin/env bash
# smoke.sh — espera o healthcheck da API após deploy e falha com logs se não subir.
# Uso: ./scripts/smoke.sh   (na VPS, a partir de ~/blog)
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env -p blog"
MAX_WAIT=60
SLEEP=2

echo "Aguardando /api/health (até ${MAX_WAIT}s)..."
elapsed=0
# 127.0.0.1 (IPv4): o wget do Alpine resolve localhost para ::1 e o nginx
# do container blog escuta só em IPv4 — localhost daria Connection refused.
until docker exec blog wget -qO- http://127.0.0.1/api/health >/dev/null 2>&1; do
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    echo "ERRO: health check falhou após ${MAX_WAIT}s." >&2
    echo "wget: $(docker exec blog wget -qO- http://127.0.0.1/api/health 2>&1 || true)" >&2
    echo "Últimas 50 linhas de 'api':" >&2
    docker logs --tail 50 blog-api >&2 || true
    exit 1
  fi
  sleep "$SLEEP"
  elapsed=$((elapsed + SLEEP))
done

echo "Smoke test OK (${elapsed}s)."
$COMPOSE ps
