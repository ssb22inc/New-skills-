#!/usr/bin/env bash
# Haven Development Seed Script
# ============================================================
# Seeds the local (or staging) Supabase database with test data.
#
# Usage:
#   ./scripts/seed.sh               # seeds local Supabase
#   ./scripts/seed.sh --env staging # seeds staging (requires DATABASE_URL)
#
# WARNING: Never run against production!
# ============================================================

set -euo pipefail

ENV="${SEED_ENV:-local}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ "$ENV" == "production" ]]; then
  echo "ERROR: Refusing to seed production database!"
  exit 1
fi

echo "[seed] Seeding ${ENV} database..."

if [[ "$ENV" == "local" ]]; then
  # Local Supabase
  supabase db seed
else
  # Remote (staging) via DATABASE_URL
  : "${DATABASE_URL:?DATABASE_URL is required for non-local seeding}"
  psql "$DATABASE_URL" -f "$(dirname "$0")/../supabase/seed.sql"
fi

echo "[seed] Done. Test users:"
echo "  Landlord: landlord@example.com  (password: password123)"
echo "  Seeker 1: seeker@example.com    (password: password123)"
echo "  Seeker 2: seeker2@example.com   (password: password123)"
