#!/usr/bin/env bash
# Haven Database Backup Script
# ============================================================
# Creates encrypted backups of the Haven PostgreSQL database
# and uploads them to S3 with lifecycle management.
#
# Usage:
#   ./scripts/backup.sh [--env staging|production] [--dry-run]
#
# Required env vars:
#   DATABASE_URL         — PostgreSQL connection string
#   AWS_S3_BACKUP_BUCKET — S3 bucket name for backups
#   BACKUP_ENCRYPTION_KEY — GPG key ID or passphrase for encryption
#
# Optional:
#   BACKUP_RETENTION_DAYS — Days to keep backups (default: 30)
# ============================================================

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────
ENV="${BACKUP_ENV:-production}"
DRY_RUN=false
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="haven_${ENV}_${TIMESTAMP}"
BACKUP_DIR="/tmp/haven-backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# ─── Parse args ──────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# ─── Validate requirements ───────────────────────────────────
for cmd in pg_dump gzip gpg aws; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd is required but not installed."
    exit 1
  fi
done

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AWS_S3_BACKUP_BUCKET:?AWS_S3_BACKUP_BUCKET is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"

# ─── Backup ──────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
DUMP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.sql.gz"
ENCRYPTED_FILE="${DUMP_FILE}.gpg"

echo "[$(date -u +%FT%TZ)] Starting backup: ${BACKUP_NAME}"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY RUN] Would create: ${ENCRYPTED_FILE}"
  echo "[DRY RUN] Would upload to: s3://${AWS_S3_BACKUP_BUCKET}/backups/${ENV}/${BACKUP_NAME}.sql.gz.gpg"
  exit 0
fi

# Dump database
echo "[$(date -u +%FT%TZ)] Dumping database..."
pg_dump "$DATABASE_URL" \
  --format=plain \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  | gzip -9 > "$DUMP_FILE"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
echo "[$(date -u +%FT%TZ)] Dump complete. Size: ${DUMP_SIZE}"

# Encrypt
echo "[$(date -u +%FT%TZ)] Encrypting backup..."
gpg --batch --yes \
  --passphrase "$BACKUP_ENCRYPTION_KEY" \
  --symmetric \
  --cipher-algo AES256 \
  --output "$ENCRYPTED_FILE" \
  "$DUMP_FILE"

rm -f "$DUMP_FILE"

# Upload to S3
S3_PATH="s3://${AWS_S3_BACKUP_BUCKET}/backups/${ENV}/${BACKUP_NAME}.sql.gz.gpg"
echo "[$(date -u +%FT%TZ)] Uploading to ${S3_PATH}..."
aws s3 cp "$ENCRYPTED_FILE" "$S3_PATH" \
  --storage-class STANDARD_IA \
  --metadata "environment=${ENV},timestamp=${TIMESTAMP}"

rm -f "$ENCRYPTED_FILE"

echo "[$(date -u +%FT%TZ)] Backup complete: ${S3_PATH}"

# ─── Verify upload ───────────────────────────────────────────
aws s3 ls "$S3_PATH" || { echo "ERROR: Backup verification failed!"; exit 1; }

# ─── Cleanup old backups ─────────────────────────────────────
echo "[$(date -u +%FT%TZ)] Cleaning up backups older than ${RETENTION_DAYS} days..."
CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -v "-${RETENTION_DAYS}d" +%Y%m%d)

aws s3 ls "s3://${AWS_S3_BACKUP_BUCKET}/backups/${ENV}/" \
  | awk '{print $4}' \
  | while read -r file; do
      FILE_DATE=$(echo "$file" | grep -oP '\d{8}' | head -1)
      if [[ -n "$FILE_DATE" && "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
        echo "  Deleting old backup: ${file}"
        aws s3 rm "s3://${AWS_S3_BACKUP_BUCKET}/backups/${ENV}/${file}"
      fi
    done

echo "[$(date -u +%FT%TZ)] Backup process finished successfully."

# ─── Notify ──────────────────────────────────────────────────
if [[ -n "${SLACK_BACKUP_WEBHOOK:-}" ]]; then
  curl -s -X POST "$SLACK_BACKUP_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"text\": \"✅ Haven ${ENV} database backup completed: \`${BACKUP_NAME}\` (${DUMP_SIZE})\"}"
fi
