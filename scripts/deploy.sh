#!/usr/bin/env bash
# deploy.sh — Deploy seguro do Blog na VPS (preserva volumes/banco).
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml -p blog"

echo "=== Deploy: blog ==="
echo "Pull de alterações..."
git pull

echo "Buildando imagens..."
$COMPOSE build

echo "Subindo serviços..."
$COMPOSE up -d

echo "=== Deploy concluído ==="
$COMPOSE ps
