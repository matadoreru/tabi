<div align="center">
  <img src="./assets/icon.svg" alt="Tabi" width="96" height="96">

# Tabi

**Organiza todo tu viaje en un único lugar.**

Itinerario, mapa, reservas, presupuesto y colaboración en tiempo real.

[![Deno](https://img.shields.io/badge/Deno-2.9+-111111?logo=deno&logoColor=white)](https://deno.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![PWA](https://img.shields.io/badge/PWA-offline-5A0FC8?logo=pwa&logoColor=white)](./manifest.webmanifest)

[Características](#-qué-puedes-hacer) · [Inicio rápido](#-inicio-rápido) · [Docker](#-docker) ·
[Documentación](#-documentación)

</div>

---

## ✨ Qué puedes hacer

|    | Función            | Descripción                                                               |
| -- | ------------------ | ------------------------------------------------------------------------- |
| 🗓️ | **Itinerario**     | Planifica cada día, detecta solapamientos y calcula desplazamientos.      |
| 🗺️ | **Mapa y lugares** | Guarda lugares de Google Places con ubicación, datos e imagen automática. |
| 🎫 | **Reservas**       | Relaciona reservas con actividades, alojamientos y transportes.           |
| 💰 | **Presupuesto**    | Controla gastos, fondos y liquidaciones en dos monedas.                   |
| 👥 | **Colaboración**   | Invita viajeros, asigna permisos y recibe cambios en tiempo real.         |
| ✅ | **TODO**           | Gestiona una lista común con responsables, prioridad y fecha límite.      |
| 📴 | **Modo offline**   | Consulta el último viaje y crea elementos aunque pierdas la conexión.     |
| 📱 | **PWA**            | Instala Tabi en móvil u ordenador como una aplicación.                    |

También incluye compras con fotografías, hospedaje, transporte, notas, inspiración, calendario ICS, recordatorios,
plantillas y duplicación inteligente de viajes.

## 🚀 Inicio rápido

### Requisitos

- [Deno 2.9 o posterior](https://docs.deno.com/runtime/getting_started/installation/)
- PostgreSQL accesible
- Variables `TABI_POSTGRES_*` configuradas; consulta [.env.example](./.env.example)

### Ejecutar en local

```bash
git clone https://github.com/matadoreru/tabi.git
cd tabi
cp .env.example .env
```

Completa, como mínimo, la contraseña de PostgreSQL y arranca la aplicación cargando ese archivo:

```bash
deno task --env-file=.env dev
```

Abre [http://localhost:4173](http://localhost:4173). La primera ejecución crea las tablas y aplica las migraciones
pendientes automáticamente.

> [!TIP]
> Para una instalación completa con PostgreSQL en Docker, copias de seguridad y HTTPS, sigue [DEPLOY.md](./DEPLOY.md).

## 🐳 Docker

### Primera instalación

La configuración de producción, migración desde SQLite y recuperación de copias está explicada paso a paso en
[DEPLOY.md](./DEPLOY.md).

### Actualizar una instalación existente

```bash
docker compose pull app
docker compose up -d --wait app
docker compose ps
```

Comprueba después que la API responde y revisa los últimos mensajes:

```bash
curl --fail --silent http://127.0.0.1:4173/api/health
docker compose logs --tail=100 app postgres
```

> [!IMPORTANT]
> No vuelvas a ejecutar `migrate:sqlite` después del traslado inicial y no uses `docker compose down -v`: eliminaría los
> volúmenes de datos. Haz una copia de PostgreSQL antes de cada actualización importante.

## 🧪 Desarrollo y pruebas

```bash
# Formato
deno fmt --check

# Lint
deno lint

# Comprobación de tipos
deno check src/app.js
deno check server.js

# Suite completa (requiere PostgreSQL de pruebas)
deno task test
```

El backend necesita las variables `TABI_POSTGRES_*` también durante sus pruebas de integración.

## 🧭 Cómo está organizado

```text
Tabi
├── backend/          API, autenticación, PostgreSQL y servicios
├── src/              dominio, estado, componentes y aplicación web
├── scripts/          migración, despliegue y copias de seguridad
├── server.js         servidor HTTP y archivos estáticos
├── sw.js             service worker y funcionamiento offline
├── compose.yml       aplicación y PostgreSQL en Docker
└── DEPLOY.md         guía de instalación y operación
```

El proyecto separa las reglas de negocio, los servicios y la persistencia. El frontend adapta las acciones al rol del
usuario, pero todas las operaciones vuelven a validarse y autorizarse en el servidor.

<details>
<summary><strong>Ver módulos principales</strong></summary>

### Backend

| Módulo                      | Responsabilidad                                       |
| --------------------------- | ----------------------------------------------------- |
| `backend/api.js`            | Rutas de viaje, transacciones y validación.           |
| `backend/database.js`       | Pool, esquema PostgreSQL y migraciones incrementales. |
| `backend/auth.js`           | Registro, login, sesiones y contraseñas.              |
| `backend/authorization.js`  | Membresía, capacidades y protección anti-IDOR.        |
| `backend/finance.js`        | Proyección financiera, repartos y liquidaciones.      |
| `backend/media.js`          | Almacenamiento autenticado de imágenes.               |
| `backend/events.js`         | Sincronización mediante Server-Sent Events.           |
| `backend/exchange-rates.js` | Proveedor y caché de tipos de cambio.                 |

### Frontend y dominio

| Módulo                 | Responsabilidad                                 |
| ---------------------- | ----------------------------------------------- |
| `src/app.js`           | Router, controladores y composición de vistas.  |
| `src/store.js`         | Repositorio remoto y sincronización.            |
| `src/contracts.js`     | Contratos compartidos y validación estructural. |
| `src/money.js`         | Aritmética monetaria decimal exacta.            |
| `src/finance.js`       | Reglas financieras puras.                       |
| `src/time.js`          | Zonas horarias e instantes UTC.                 |
| `src/offline-cache.js` | Caché local y operaciones pendientes.           |
| `src/permissions.js`   | Capacidades y roles centralizados.              |

</details>

## 📚 Documentación

| Documento                                      | Contenido                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| [DEPLOY.md](./DEPLOY.md)                       | Instalación en mini-PC, Docker, PostgreSQL, backups, actualización y recuperación. |
| [.env.example](./.env.example)                 | Variables de entorno disponibles.                                                  |
| [compose.yml](./compose.yml)                   | Servicios y volúmenes utilizados en Docker.                                        |
| [manifest.webmanifest](./manifest.webmanifest) | Instalación y accesos directos de la PWA.                                          |

---

<div align="center">
  Hecho para que organizar el viaje también forme parte del viaje. ✈️
</div>
