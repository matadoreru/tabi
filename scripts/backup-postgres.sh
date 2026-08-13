#!/usr/bin/env sh
set -eu

project_dir=${TABI_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
backup_dir=${TABI_BACKUP_DIR:-"$project_dir/backups"}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_dir/tabi-$timestamp.dump"
temporary="$target.partial"

mkdir -p "$backup_dir"
cd "$project_dir"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
docker compose exec -T postgres pg_dump \
  --username "${TABI_POSTGRES_USER:-tabi}" \
  --dbname "${TABI_POSTGRES_DB:-tabi}" \
  --format custom --compress 6 --no-owner --no-acl > "$temporary"
docker compose exec -T postgres pg_restore --list < "$temporary" >/dev/null
mv "$temporary" "$target"
trap - EXIT HUP INT TERM
printf '%s\n' "$target"
