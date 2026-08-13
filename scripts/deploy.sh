#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: $0 <tag-o-sha-de-imagen>" >&2
  exit 2
fi

project_dir=${TABI_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
new_tag=$1
previous_tag=${TABI_IMAGE_TAG:-latest}
cd "$project_dir"

"$project_dir/scripts/backup-postgres.sh"
export TABI_IMAGE_TAG=$new_tag
docker compose pull app
docker compose up -d --wait app
if ! curl --fail --silent --show-error --max-time 10 http://127.0.0.1:${TABI_HOST_PORT:-4173}/api/health >/dev/null; then
  echo "El healthcheck falló; restaurando la imagen anterior $previous_tag" >&2
  export TABI_IMAGE_TAG=$previous_tag
  docker compose up -d --wait app
  exit 1
fi
echo "Despliegue correcto: $new_tag"
