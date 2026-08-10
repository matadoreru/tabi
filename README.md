# Actualizar Docker

```bash
docker compose pull app
docker compose up -d app
docker compose ps
```

# Tabi · planificador colaborativo de viajes

Aplicación web multiusuario para organizar itinerarios, lugares, tareas, compras, presupuesto, alojamientos, transporte,
reservas y documentos. Mantiene la interfaz PWA original, pero los datos compartidos se almacenan ahora en SQLite detrás
de una API autenticada.

## Ejecutar

Requiere Deno 2.9 o posterior. No hay paquetes que instalar.

```bash
deno task dev
```

Abre [http://localhost:4173](http://localhost:4173). La primera ejecución crea `data/tabi.sqlite` y aplica
automáticamente las migraciones pendientes.

```bash
deno task test
```

Para producción:

```bash
PORT=8000 TABI_SECURE_COOKIE=true TABI_DATABASE_PATH=/ruta/segura/tabi.sqlite deno task dev
```

Debe desplegarse detrás de HTTPS y con copias de seguridad del archivo SQLite.

Para el despliegue automatizado con Docker, GHCR, Watchtower y Cloudflare Tunnel, consulta [DEPLOY.md](./DEPLOY.md).

## Arquitectura

```text
server.js                     servidor HTTP, estáticos y cabeceras de seguridad
backend/
  api.js                      API, transacciones, auditoría y validación
  auth.js                     registro, login, sesión y contraseñas
  authorization.js            membresía y protección anti-IDOR
  crypto.js                   PBKDF2, tokens y hashing SHA-256
  database.js                 esquema SQLite y migraciones incrementales
  events.js                   sincronización Server-Sent Events
  http.js                     errores tipados, cookies y protección de origen
src/
  api-client.js               cliente HTTP y errores de API
  session.js                  currentUser/currentTrip/membership/permissions
  store.js                    repositorio remoto y suscripción en tiempo real
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
`MEMBER_INVITE`, `BUDGET_EDIT` o `DOCUMENT_UPLOAD`, junto con el mapa único `ROLE_PERMISSIONS`. `authorize()` resuelve
membresía y capability antes de cualquier acceso.

- Owner: todas las capabilities.
- Editor: lectura, edición de contenido, presupuesto, documentos y duplicado.
- Viewer: solo lectura.

Cambiar roles, expulsar miembros y transferir propiedad se realiza mediante operaciones específicas y transacciones. El
owner no se puede expulsar ni degradar directamente.

## Invitaciones

El servidor genera tokens aleatorios de 256 bits. El token completo se devuelve una sola vez y se guarda únicamente en
el navegador que creó el enlace para poder copiarlo posteriormente; SQLite conserva solo su hash. La aceptación valida y
consume el uso dentro de una transacción con versión, evitando carreras entre dos aceptaciones simultáneas.

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

SQLite con WAL es adecuado para uso personal o un grupo pequeño en una única instancia. Para una instalación con varias
réplicas, se puede mantener la API y migrar el repositorio a PostgreSQL/PostGIS; SSE debería respaldarse entonces con
Redis o `LISTEN/NOTIFY`. Los documentos siguen siendo enlaces: almacenar pasaportes o PDFs requeriría object storage
cifrado, antivirus, URLs firmadas y una política explícita de retención.
