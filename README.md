# Actualizar Docker

```bash
docker compose pull
docker compose up -d
docker compose ps
```

# Tabi · planificador colaborativo de viajes

Aplicación web multiusuario para organizar itinerarios, lugares, tareas, compras, presupuesto, alojamientos, transporte
y reservas. Mantiene la interfaz PWA original, pero los datos compartidos se almacenan en PostgreSQL detrás de una API
autenticada.

Las tareas se gestionan como una sola lista TODO, con responsable, prioridad, fecha límite, estado e información libre.
La moneda principal, secundaria y el tipo de cambio pertenecen al viaje, por lo que todos los miembros ven los mismos
totales.

## Monedas y tipos de cambio

`src/currency.js` centraliza las monedas admitidas, precisión, formato y conversiones. Cada movimiento conserva su
importe y moneda originales; cambiar la moneda principal solo modifica cómo se calculan y presentan los resúmenes. Al
guardar un importe, la API añade una instantánea del cambio utilizado como referencia histórica y respaldo.

El modo automático consulta Frankfurter exclusivamente desde el backend, guarda el resultado en PostgreSQL durante 12
horas y reutiliza el último valor conocido si el proveedor no responde. No requiere ni expone claves. El modo manual
conserva un cambio compartido entre la moneda principal y secundaria. Los tipos automáticos son valores de referencia
diarios, no cotizaciones para operaciones financieras.

## Ejecutar

Requiere Deno 2.9 o posterior y un PostgreSQL accesible. Deno descarga el driver declarado en `deno.json`.

```bash
deno task dev
```

PostgreSQL debe estar disponible con las variables `TABI_POSTGRES_*`. La primera ejecución crea las tablas y aplica
automáticamente las migraciones pendientes. La configuración Docker y el traslado desde SQLite están en
[DEPLOY.md](./DEPLOY.md).

```bash
deno task test
```

Para producción:

```bash
PORT=8000 TABI_SECURE_COOKIE=true TABI_POSTGRES_HOST=127.0.0.1 TABI_POSTGRES_PASSWORD=... deno task dev
```

Debe desplegarse detrás de HTTPS y con copias periódicas mediante `pg_dump`.

Para el despliegue automatizado con Docker, GHCR, Watchtower y Cloudflare Tunnel, consulta [DEPLOY.md](./DEPLOY.md).

## Arquitectura

```text
server.js                     servidor HTTP, estáticos y cabeceras de seguridad
backend/
  api.js                      API, transacciones, auditoría y validación
  auth.js                     registro, login, sesión y contraseñas
  authorization.js            membresía y protección anti-IDOR
  crypto.js                   PBKDF2, tokens y hashing SHA-256
  database.js                 pool, esquema PostgreSQL y migraciones incrementales
  events.js                   sincronización Server-Sent Events
  exchange-rates.js           proveedor desacoplado y caché de tipos de cambio
  http.js                     errores tipados, cookies y protección de origen
src/
  api-client.js               cliente HTTP y errores de API
  session.js                  currentUser/currentTrip/membership/permissions
  store.js                    repositorio remoto y suscripción en tiempo real
  currency.js                 catálogo, formato y conversión central de monedas
  visuals.js                  iconos y colores compartidos de estados
  permissions.js              capabilities y mapa central de roles
  app.js                      router, controladores y composición de vistas
  ui.js                       componentes HTML, modal y feedback
  domain.js                   reglas puras de horarios, presupuesto y distancia
  data.js                     catálogos y datos de la versión local anterior
```

La capa de sesión ofrece el equivalente al contexto solicitado:

```js
session.currentUser;
session.currentTrip;
session.currentMembership;
session.currentPermissions;
session.can(PERMISSIONS.TRIP_EDIT);
```

El frontend usa estos datos para adaptar la interfaz, pero el servidor vuelve a autorizar cada operación.

## Datos y migraciones

El esquema contiene:

- `users`: nombre de usuario y email únicos, hash, sal y algoritmo de contraseña.
- `sessions`: tokens opacos almacenados como SHA-256, expiración e índice por usuario.
- `trips`: datos generales, auditoría y versión optimista.
- `trip_members`: clave primaria compuesta `(trip_id, user_id)` y un único owner por viaje.
- `trip_invitations`: token hasheado, rol, creador, expiración, límite de usos, revocación y versión.
- `trip_activity_logs`: evento y metadata estructurada, indexado por viaje y fecha.
- Una tabla por entidad existente, siempre con FK `trip_id`, `version`, `created_at`, `updated_at`, `created_by` y
  `updated_by`.

Las eliminaciones de un viaje propagan únicamente a sus datos, miembros, invitaciones e historial. El borrado de un
usuario elimina sus sesiones y membresías; en auditoría y entidades el autor se conserva como referencia anulable.

La antigua información de `localStorage` no se elimina. Al crear el primer viaje, la UI detecta `tabi-data-v1` y permite
importarla mediante una transacción autenticada.

### Proyectos editables (`.tabi-trip.json`)

Desde Configuración se puede exportar una copia completa del contenido del viaje en JSON e importarla de nuevo después
de editarla o procesarla con ChatGPT. El archivo incluye los datos generales y todas las colecciones, conserva los IDs
que enlazan actividades con lugares, alojamientos y transportes, y contiene una guía breve para su edición. Las fotos
optimizadas de productos, las referencias de fotos de Google Places y las notas ordenables también forman parte del
archivo.

La importación valida primero el archivo y después sustituye el contenido en una sola transacción: un error no deja el
viaje a medias. Las cuentas, membresías, permisos, invitaciones, sesiones y el historial de auditoría no son portables y
permanecen intactos en el viaje de destino.

## Autenticación y seguridad

- Login mediante usuario o email. Contraseñas derivadas con PBKDF2-SHA-256, 310.000 iteraciones y sal aleatoria
  individual.
- Sesión de 256 bits en cookie `HttpOnly`, `SameSite=Lax`; `Secure` se activa con `TABI_SECURE_COOKIE=true`.
- En la base solo se conserva SHA-256 del token de sesión y del token de invitación.
- Validación de tamaño y formato tanto en formularios como en la API.
- Comprobación de `Origin`/`Sec-Fetch-Site` y API exclusivamente JSON para mutaciones.
- CSP, `nosniff`, política de referrer y prohibición de embedding.
- Consultas de recursos siempre acotadas por `id AND trip_id`, después de comprobar la membresía.
- Los usuarios sin acceso reciben `404` para no revelar la existencia del viaje.

### Autorización

Los roles no se comprueban de manera dispersa. `src/permissions.js` define capabilities como `TRIP_EDIT`,
`MEMBER_INVITE` o `BUDGET_EDIT`, junto con el mapa único `ROLE_PERMISSIONS`. `authorize()` resuelve membresía y
capability antes de cualquier acceso.

- Owner: todas las capabilities.
- Editor: lectura, edición de contenido, presupuesto y duplicado.
- Viewer: solo lectura.

Cambiar roles, expulsar miembros y transferir propiedad se realiza mediante operaciones específicas y transacciones. El
owner no se puede expulsar ni degradar directamente.

## Invitaciones

El servidor genera tokens aleatorios de 256 bits. El token completo se devuelve una sola vez y se guarda únicamente en
el navegador que creó el enlace para poder copiarlo posteriormente; PostgreSQL conserva solo su hash. La aceptación
valida y consume el uso dentro de una transacción con versión, evitando carreras entre dos aceptaciones simultáneas.

La ruta `/invite/:token` funciona con o sin sesión. El token permanece en la URL durante registro/login, y se consume
únicamente al pulsar “Unirme al viaje”.

## Concurrencia y sincronización

Todas las entidades editables tienen `version`. Un `PATCH` debe incluir la versión leída; el
`UPDATE ... WHERE version = ?` detecta escrituras obsoletas y responde `409 VERSION_CONFLICT`. La UI recarga la versión
del servidor y explica el conflicto en lugar de sobrescribir silenciosamente.

Cada mutación publica un evento SSE en `/api/trips/:tripId/events`. Los demás clientes autenticados recargan el agregado
y muestran quién hizo el cambio. El historial persistente utiliza acciones estables y metadata JSON, no frases rígidas.

## Pruebas

La suite comprueba reglas de presupuesto y horarios, hashing de contraseñas, tokens de invitación hasheados, consumo
máximo, permisos Viewer, aislamiento de viajes/IDOR, auditoría y conflictos de versión.

## Siguiente evolución

PostgreSQL permite escrituras concurrentes y separar la persistencia del contenedor de aplicación. Para varias réplicas,
SSE debería respaldarse con Redis, PostgreSQL `LISTEN/NOTIFY` u otro bus compartido.
