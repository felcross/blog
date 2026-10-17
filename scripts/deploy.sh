#!/usr/bin/env bash
# deploy.sh — Deploy seguro do Blog na VPS (preserva volumes/banco).
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env -p blog"

# Preflight: variáveis obrigatórias no .env
if [[ ! -f .env ]]; then
  echo "ERRO: .env não existe. Copie de .env.example e preencha." >&2
  exit 1
fi
for var in POSTGRES_PASSWORD NPM_NETWORK SESSION_SECRET SMTP_USER SMTP_PASS ADMIN_EMAIL WEB_URL; do
  if ! grep -q "^${var}=." .env; then
    echo "ERRO: ${var} ausente ou vazia no .env" >&2
    exit 1
  fi
done

echo "=== Deploy: blog ==="
echo "Pull de alterações..."
git pull

echo "Buildando imagens..."
$COMPOSE build

echo "Subindo serviços..."
$COMPOSE up -d

echo "=== Deploy concluído ==="
$COMPOSE ps
