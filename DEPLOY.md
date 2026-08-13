# Despliegue de Tabi con PostgreSQL en Docker

Tabi ejecuta dos contenedores en una red privada:

```text
Cloudflare Tunnel → 127.0.0.1:4173 → tabi (Deno)
                                            ↓
                                      tabi-postgres
                                            ↓
                                  volumen tabi_postgres_data
```

PostgreSQL no publica ningún puerto en el host. La aplicación crea y actualiza las tablas automáticamente al arrancar.
El volumen antiguo `tabi_data` se conserva únicamente para importar o recuperar la base SQLite anterior.

## 1. Preparar la instalación

```bash
sudo mkdir -p /srv/docker/tabi/backups
sudo chown -R "$USER":"$USER" /srv/docker/tabi
chmod 750 /srv/docker/tabi
cd /srv/docker/tabi
cp .env.example .env
chmod 600 .env
openssl rand -base64 32
```

Pega el resultado como `TABI_POSTGRES_PASSWORD` en `.env`. Configuración mínima:

```env
TABI_HOST_PORT=4173
TABI_IMAGE_TAG=latest
TABI_POSTGRES_DB=tabi
TABI_POSTGRES_USER=tabi
TABI_POSTGRES_PASSWORD=CONTRASENA_ALEATORIA_LARGA
TABI_POSTGRES_POOL_SIZE=10
TABI_PUBLIC_ORIGIN=https://tabi.example.com
TABI_GOOGLE_MAPS_API_KEY=CLAVE_WEB_RESTRINGIDA
TABI_GOOGLE_MAPS_MAP_ID=MAP_ID_DE_GOOGLE
TABI_SECURE_COOKIE=true
```

No publiques `5432` en `compose.yml` ni abras ese puerto en el router. La contraseña no debe subirse a Git.

## 2. Instalación nueva

```bash
cd /srv/docker/tabi
docker compose config --quiet
docker compose pull
docker compose up -d postgres
docker compose up -d app
docker compose ps
```

La primera ejecución crea automáticamente las tablas, restricciones e índices. Comprueba ambos servicios:

```bash
curl --fail --silent http://127.0.0.1:4173/api/health
docker compose exec postgres pg_isready -U tabi -d tabi
```

El esquema incluye `users`, `sessions`, `trips`, `trip_members`, `trip_invitations`, `trip_activity_logs`,
`exchange_rates` y las colecciones `activities`, `places`, `tasks`, `purchases`, `expenses`, `funds`, `stays`,
`transports`, `reservations`, `inspirations` y `notes`. También crea `financial_transactions`, `expense_splits`,
`financial_projection_state` y `media_assets`. `schema_migrations` registra cada cambio aplicado.

## 3. Migrar una instalación SQLite existente

El proceso conserva usuarios, contraseñas cifradas, sesiones, viajes, miembros, invitaciones, historial, tipos de cambio
y entidades. Las imágenes base64 antiguas se extraen automáticamente a `media_assets` y los movimientos financieros se
proyectan con unidades menores exactas. Se cancela si PostgreSQL ya contiene usuarios y valida todos los recuentos en
una única transacción.

### 3.1 Copia y rollback

Antes de reemplazar el `compose.yml` antiguo:

```bash
cd /srv/docker/tabi
cp compose.yml compose.sqlite.rollback.yml
docker image tag "$(docker inspect tabi --format '{{.Image}}')" tabi:sqlite-rollback
sed -i 's|image:.*|image: tabi:sqlite-rollback|' compose.sqlite.rollback.yml
docker compose stop app
mkdir -p backups
docker run --rm \
  -v tabi_data:/data:ro \
  -v "$PWD/backups:/backup" \
  alpine:3.21 \
  sh -c 'tar czf /backup/tabi-sqlite-before-postgres.tar.gz -C /data .'
ls -lh backups/tabi-sqlite-before-postgres.tar.gz
```

### 3.2 Importar en PostgreSQL

Instala el nuevo `compose.yml`, completa `.env` y ejecuta:

```bash
cd /srv/docker/tabi
docker compose config --quiet
docker compose pull app postgres
docker compose up -d postgres
docker compose --profile migration run --rm migrate-sqlite
```

Debe terminar con `Migración SQLite → PostgreSQL completada y verificada` y mostrar los recuentos. No inicies la
aplicación si aparece `Migración cancelada`.

Verificación adicional:

```bash
docker compose exec postgres psql -U tabi -d tabi -c \
  'SELECT (SELECT count(*) FROM users) usuarios, (SELECT count(*) FROM trips) viajes;'
```

### 3.3 Activar Tabi

```bash
docker compose up -d app
docker compose ps
docker compose logs --tail=100 app postgres
curl --fail --silent http://127.0.0.1:4173/api/health
```

Inicia sesión y revisa lugares, TODO, presupuesto y reservas. Conserva SQLite hasta tener varias copias PostgreSQL.

### Rollback

El importador nunca modifica SQLite:

```bash
docker compose stop app
docker compose rm -f app
docker compose -f compose.sqlite.rollback.yml up -d app
```

Los cambios realizados después de activar PostgreSQL no existirán en SQLite.

## 4. Backups

El repositorio incluye una copia atómica y una comprobación de que el dump es legible:

```bash
cd /srv/docker/tabi
chmod +x scripts/backup-postgres.sh scripts/verify-postgres-backup.sh scripts/deploy.sh
./scripts/backup-postgres.sh
./scripts/verify-postgres-backup.sh backups/tabi-FECHA.dump
```

Programa `backup-postgres.sh` con systemd timer o cron y replica `backups/` a otro equipo. La verificación de catálogo
detecta ficheros truncados; periódicamente conserva también la prueba de restauración completa descrita debajo.

Copia lógica comprimida:

```bash
cd /srv/docker/tabi
mkdir -p backups
docker compose exec -T postgres pg_dump -U tabi -d tabi -Fc > \
  "backups/tabi-$(date +%Y%m%d-%H%M%S).dump"
ls -lh backups/*.dump
```

Prueba de restauración en una base temporal:

```bash
docker compose exec -T postgres createdb -U tabi tabi_restore_test
docker compose exec -T postgres pg_restore -U tabi -d tabi_restore_test --clean --if-exists < backups/COPIA.dump
docker compose exec -T postgres psql -U tabi -d tabi_restore_test -c 'SELECT count(*) FROM trips;'
docker compose exec -T postgres psql -U tabi -d tabi_restore_test -c 'SELECT count(*) FROM media_assets;'
docker compose exec -T postgres dropdb -U tabi tabi_restore_test
```

Automatiza `pg_dump` diariamente y conserva copias fuera del mini-PC. El volumen no sustituye a un backup.

## 5. Operación

Usa tags inmutables o el SHA de la imagen y deja `TABI_WATCHTOWER_ENABLE=false`. El despliegue asistido crea primero un
backup, espera el healthcheck y recupera el tag anterior si falla:

```bash
./scripts/deploy.sh sha-<commit>
```

`GET /api/health` informa de PostgreSQL, versión de esquema, uptime y commit. Si defines `TABI_METRICS_TOKEN`,
Prometheus puede consultar `/api/metrics` enviando `Authorization: Bearer ...`. Los logs HTTP son JSON e incluyen
`requestId`, ruta, estado y duración; el mismo identificador se devuelve en `X-Request-Id`.

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f --tail=200 app postgres
```

Las migraciones se aplican al arrancar. No ejecutes `docker compose down -v`: eliminaría los volúmenes.

PostgreSQL solo es accesible desde la red privada. La aplicación usa un pool de 10 conexiones por defecto; cada réplica
suma su propio pool. Cambiar la contraseña en `.env` después de inicializar el volumen no cambia la contraseña del rol:
debe rotarse también mediante `psql`.

## 6. Actualizar Tabi en el mini-PC

### Actualización normal

Las migraciones PostgreSQL están incluidas en la aplicación y se ejecutan automáticamente, una sola vez, al arrancar la
nueva imagen. Para esta versión no hay que ejecutar `migrate:sqlite`: esa tarea se utilizó únicamente para el cambio
inicial desde SQLite.

Antes de actualizar, crea una copia. La secuencia recomendada es:

```bash
cd /srv/docker/tabi
mkdir -p backups
docker compose exec -T postgres pg_dump \
  -U "${TABI_POSTGRES_USER:-tabi}" \
  -d "${TABI_POSTGRES_DB:-tabi}" \
  -Fc > "backups/tabi-before-update-$(date -u +%Y%m%dT%H%M%SZ).dump"

docker compose pull app
docker compose up -d --wait app
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:${TABI_HOST_PORT:-4173}/api/health
docker compose logs --tail=100 app postgres
```

`docker compose pull`, `up -d` y `ps` ponen en marcha la versión, pero por sí solos no comprueban el backup, la
migración ni el healthcheck. Por eso conviene añadir las comprobaciones anteriores.

No uses los siguientes comandos durante una actualización normal:

```text
docker compose down -v
docker compose --profile migration run --rm migrate-sqlite
```

El primero borraría los volúmenes y el segundo intentaría repetir la antigua importación SQLite.

### Cuándo hay que actualizar también `compose.yml` o `.env`

Descargar una imagen no modifica los archivos del host. Debes copiar el nuevo `compose.yml` manualmente cuando las notas
de una versión indiquen cambios de infraestructura. Para las fases 2 y 3 se recomienda que el servicio `app` tenga:

```yaml
environment:
  TABI_METRICS_TOKEN: "${TABI_METRICS_TOKEN:-}"
labels:
  - "com.centurylinklabs.watchtower.enable=${TABI_WATCHTOWER_ENABLE:-false}"
```

Comprueba siempre el archivo entregado con el proyecto y valídalo después:

```bash
docker compose config --quiet
```

`TABI_METRICS_TOKEN` es opcional. Si no necesitas Prometheus puede quedar vacío. Mantén `TABI_WATCHTOWER_ENABLE=false`
para que una imagen nueva no se despliegue sin backup y healthcheck.

### Comprobación posterior en el navegador

Abre Tabi y revisa Configuración → Aplicación y modo offline. Si permanece la interfaz anterior, pulsa “Aplicar
actualización” en el aviso de la PWA. No es necesario borrar los datos del navegador ni reinstalar la aplicación.
