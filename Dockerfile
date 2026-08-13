FROM denoland/deno:2.9.4

ARG TABI_COMMIT_SHA=""

ENV DENO_DIR=/deno-dir \
    PORT=4173 \
    TABI_POSTGRES_HOST=postgres \
    TABI_POSTGRES_PORT=5432 \
    TABI_POSTGRES_DB=tabi \
    TABI_POSTGRES_USER=tabi \
    TABI_POSTGRES_PASSWORD= \
    TABI_POSTGRES_POOL_SIZE=10 \
    TABI_GOOGLE_MAPS_API_KEY= \
    TABI_GOOGLE_MAPS_MAP_ID= \
    TABI_PUBLIC_ORIGIN= \
    TABI_SECURE_COOKIE=true \
    TABI_COMMIT_SHA=${TABI_COMMIT_SHA}

WORKDIR /app

COPY --chown=deno:deno deno.json deno.lock server.js index.html manifest.webmanifest sw.js ./
COPY --chown=deno:deno backend ./backend
COPY --chown=deno:deno src ./src
COPY --chown=deno:deno assets ./assets
COPY --chown=deno:deno scripts ./scripts

RUN deno cache server.js scripts/migrate-sqlite-to-postgres.js

USER deno

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["deno", "eval", "const response = await fetch('http://127.0.0.1:4173/api/health'); if (!response.ok) Deno.exit(1)"]

CMD ["deno", "run", "--cached-only", "--allow-net=0.0.0.0:4173,postgres:5432,maps.app.goo.gl:443,api.frankfurter.dev:443", "--allow-read=/app", "--allow-env=PORT,TABI_POSTGRES_HOST,TABI_POSTGRES_PORT,TABI_POSTGRES_DB,TABI_POSTGRES_USER,TABI_POSTGRES_PASSWORD,TABI_POSTGRES_POOL_SIZE,TABI_GOOGLE_MAPS_API_KEY,TABI_GOOGLE_MAPS_MAP_ID,TABI_PUBLIC_ORIGIN,TABI_SECURE_COOKIE,TABI_COMMIT_SHA,PGHOST,PGPORT,PGDATABASE,PGUSER,PGUSERNAME,PGPASSWORD,PGSSLMODE,PGMAX,PGSSL,PGIDLE_TIMEOUT,PGCONNECT_TIMEOUT,PGMAX_LIFETIME,PGMAX_PIPELINE,PGBACKOFF,PGKEEP_ALIVE,PGPREPARE,PGDEBUG,PGFETCH_TYPES,PGPUBLICATIONS,PGTARGET_SESSION_ATTRS,PGTARGETSESSIONATTRS,PGAPPNAME", "server.js"]
