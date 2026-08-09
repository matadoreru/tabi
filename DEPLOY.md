# Despliegue de Tabi en Ubuntu Server

## Arquitectura desplegada

Tabi utiliza un solo proceso Deno que sirve el frontend, la API y la sincronización SSE en el puerto interno `4173`. La
base de datos es SQLite, no PostgreSQL. El archivo `/app/data/tabi.sqlite` se guarda en el volumen Docker `tabi_data`,
por lo que Watchtower puede reemplazar el contenedor sin eliminar usuarios, viajes, sesiones o invitaciones.

```text
Cloudflare Tunnel
  └── http://127.0.0.1:4173
        └── contenedor ghcr.io/matadoreru/tabi:latest
              └── volumen tabi_data:/app/data
```

No hay una fase de build web ni contenedores separados. La imagen ejecuta directamente `server.js` con Deno 2.9.4 como
usuario no-root.

El contenedor aplica además un sistema de archivos raíz de solo lectura, elimina todas las capacidades Linux, impide
adquirir privilegios nuevos y limita tanto los procesos como el crecimiento de los logs. Solo el volumen `tabi_data` y
el `tmpfs` efímero de `/tmp` admiten escritura.

## 1. Publicar la primera imagen

Sube este repositorio a GitHub bajo `matadoreru/tabi` y asegúrate de que la rama principal se llama `main`:

```bash
git add .
git commit -m "Configurar despliegue de Tabi"
git push origin main
```

En GitHub, abre **Actions → Validate and publish Docker image**. El workflow debe terminar en verde. Después comprueba
en **Packages** que existen estas etiquetas:

```text
ghcr.io/matadoreru/tabi:latest
ghcr.io/matadoreru/tabi:<sha-completo-del-commit>
```

El workflow usa el `GITHUB_TOKEN` automático; no necesita un secret creado manualmente. En repositorios u organizaciones
con políticas restrictivas, habilita **Settings → Actions → General → Workflow permissions → Read and write
permissions** y permite publicar paquetes. Puedes dejar el paquete público o mantenerlo privado.

## 2. Copiar la configuración al servidor

Desde el equipo que contiene este repositorio, reemplaza `USUARIO` y `SERVIDOR`:

```bash
scp compose.yml .env.example USUARIO@SERVIDOR:/tmp/
```

En Ubuntu Server:

```bash
sudo mkdir -p /srv/docker/tabi
sudo mv /tmp/compose.yml /srv/docker/tabi/compose.yml
sudo mv /tmp/.env.example /srv/docker/tabi/.env
sudo chown -R "$USER":"$USER" /srv/docker/tabi
sudo chmod 750 /srv/docker/tabi
chmod 600 /srv/docker/tabi/.env
cd /srv/docker/tabi
```

Edita `/srv/docker/tabi/.env`:

```env
TABI_HOST_PORT=4173
TABI_IMAGE_TAG=latest
TABI_PUBLIC_ORIGIN=https://tabi.example.com
TABI_GOOGLE_MAPS_API_KEY=CLAVE_WEB_RESTRINGIDA
TABI_GOOGLE_MAPS_MAP_ID=MAP_ID_DE_GOOGLE
TABI_SECURE_COOKIE=true
```

- `TABI_HOST_PORT` es el puerto local de Ubuntu. El valor recomendado es `4173`.
- `TABI_IMAGE_TAG=latest` permite que Watchtower aplique actualizaciones.
- `TABI_PUBLIC_ORIGIN` debe ser la URL HTTPS pública exacta configurada en Cloudflare, sin barra final.
- `TABI_GOOGLE_MAPS_API_KEY` permite cargar Maps JavaScript API y Places. Restríngela al dominio público en Google
  Cloud.
- `TABI_GOOGLE_MAPS_MAP_ID` identifica el estilo vectorial usado por los marcadores del mapa.
- `TABI_SECURE_COOKIE=true` es obligatorio para el acceso HTTPS normal a través de Cloudflare.

Para crear esas credenciales, habilita **Maps JavaScript API**, **Places API** y **Places API (New)** en el mismo
proyecto de Google Cloud con facturación activa. Configura la clave como clave de sitio web, limita los referentes HTTP
a `https://tabi.example.com/*`, restringe la clave a esas APIs y crea un Map ID de tipo JavaScript. Sustituye el dominio
de ejemplo por el hostname público real antes de desplegar.

No hacen falta `DATABASE_URL`, credenciales PostgreSQL, `JWT_SECRET` ni `SESSION_SECRET`: Tabi usa SQLite y genera
tokens de sesión aleatorios, conservando únicamente sus hashes en la base de datos.

## 3. Autenticarse en GHCR si el paquete es privado

Omite este paso si `ghcr.io/matadoreru/tabi` es público. Para un paquete privado, crea en GitHub un Personal Access
Token clásico con permiso `read:packages` y ejecuta como el mismo usuario que administra Docker:

```bash
export GHCR_PAT='PEGA_AQUI_EL_TOKEN_SOLO_DURANTE_ESTA_SESION'
echo "$GHCR_PAT" | docker login ghcr.io -u matadoreru --password-stdin
unset GHCR_PAT
```

El Watchtower global también necesita acceso a esas credenciales. Si ya usa el socket Docker y `--label-enable`,
asegúrate de que tenga montado el archivo de autenticación del usuario anterior como `/config.json`, por ejemplo:

```text
$HOME/.docker/config.json:/config.json:ro
```

No guardes el PAT en `compose.yml`, `.env` ni este repositorio.

## 4. Iniciar Tabi

Valida primero la configuración efectiva y después inicia el servicio:

```bash
cd /srv/docker/tabi
docker compose config
docker compose pull
docker compose up -d
docker compose ps
```

Espera a que el estado muestre `healthy`. Consulta los logs con:

```bash
docker compose logs -f --tail=200 app
```

Pulsa `Ctrl+C` para salir de los logs; el contenedor seguirá funcionando.

Prueba la aplicación desde Ubuntu:

```bash
curl --fail --silent --show-error http://127.0.0.1:4173/api/health
```

La respuesta esperada es:

```json
{ "status": "ok" }
```

También puedes comprobar que la interfaz responde:

```bash
curl --fail --head http://127.0.0.1:4173/
```

## 5. Configurar Cloudflare Tunnel

Configura el servicio de origen del hostname público con:

```text
http://localhost:4173
```

También es válido `http://127.0.0.1:4173`. El puerto solo escucha en loopback y no queda accesible desde la red local ni
desde Internet directamente.

Si `cloudflared` estuviera dentro de otro contenedor, `localhost` apuntaría a ese contenedor y no al host. Esta guía
asume, como se indicó, que `cloudflared` está instalado directamente en Ubuntu Server.

## 6. Operaciones habituales

Detener y volver a iniciar:

```bash
cd /srv/docker/tabi
docker compose stop
docker compose start
```

Recrear manualmente con la imagen más reciente:

```bash
cd /srv/docker/tabi
docker compose pull app
docker compose up -d app
```

Reiniciar sin recrear:

```bash
docker compose restart app
```

Ver la imagen que se está ejecutando:

```bash
docker inspect tabi --format '{{.Config.Image}} {{.Image}}'
```

El volumen persiste al ejecutar `docker compose down`. No ejecutes `docker compose down -v`, porque `-v` elimina
deliberadamente `tabi_data`.

## 7. Copia de seguridad de SQLite

Crea primero el directorio de copias:

```bash
mkdir -p /srv/docker/tabi/backups
```

Para una copia consistente sencilla, detén brevemente Tabi y copia el volumen:

```bash
cd /srv/docker/tabi
docker compose stop app
docker run --rm -v tabi_data:/data:ro -v /srv/docker/tabi/backups:/backup alpine:3.21 sh -c 'tar czf /backup/tabi-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .'
docker compose start app
```

Lista las copias:

```bash
ls -lh /srv/docker/tabi/backups
```

## 8. Actualizaciones automáticas

El flujo normal es:

```bash
git add .
git commit -m "cambios"
git push origin main
```

Para verificar una actualización:

1. Confirma que GitHub Actions terminó correctamente.
2. Comprueba que GHCR publicó `latest` y la etiqueta SHA.
3. Revisa los logs del Watchtower global.
4. Comprueba cuándo se recreó Tabi:

```bash
docker inspect tabi --format '{{.Created}} {{.Config.Image}}'
docker compose -f /srv/docker/tabi/compose.yml --env-file /srv/docker/tabi/.env ps
curl --fail http://127.0.0.1:4173/api/health
```

Watchtower solo recreará `tabi`, porque es el único servicio con la label `com.centurylinklabs.watchtower.enable=true`.
El volumen `tabi_data` se vuelve a montar en el nuevo contenedor.

## 9. Rollback por SHA

Busca en GitHub Packages la etiqueta SHA de la versión estable. Edita `/srv/docker/tabi/.env`:

```env
TABI_IMAGE_TAG=SHA_COMPLETO_DEL_COMMIT
```

Aplica el rollback:

```bash
cd /srv/docker/tabi
docker compose pull app
docker compose up -d app
docker compose ps
curl --fail http://127.0.0.1:4173/api/health
```

Las migraciones de base de datos son incrementales. Antes de volver a una versión antigua tras una migración nueva, crea
una copia de seguridad y comprueba que esa versión del código entiende el esquema actual.

Para regresar al canal automático:

```bash
sed -i 's/^TABI_IMAGE_TAG=.*/TABI_IMAGE_TAG=latest/' /srv/docker/tabi/.env
docker compose pull app
docker compose up -d app
```
