#!/usr/bin/env bash
# deploy-clean.sh — Reset limpo do Blog na VPS.
# ⚠️  DESTRUTIVO: `down -v` APAGA o banco de dados (volumes).
# Use apenas para reset total. Para deploy normal, use ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env -p blog"

echo "=== Deploy limpo: blog ==="
echo "Parando containers e removendo volumes..."
$COMPOSE down -v

echo "Rebuildando imagens sem cache..."
$COMPOSE build --no-cache

echo "Subindo serviços..."
$COMPOSE up -d

echo "=== Deploy concluído ==="
$COMPOSE ps
