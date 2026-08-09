FROM denoland/deno:2.9.4

ENV DENO_DIR=/deno-dir \
    PORT=4173 \
    TABI_DATABASE_PATH=/app/data/tabi.sqlite \
    TABI_PUBLIC_ORIGIN= \
    TABI_SECURE_COOKIE=true

WORKDIR /app

COPY --chown=deno:deno deno.json server.js index.html manifest.webmanifest sw.js ./
COPY --chown=deno:deno backend ./backend
COPY --chown=deno:deno src ./src
COPY --chown=deno:deno assets ./assets

RUN mkdir -p /app/data \
    && chown deno:deno /app/data \
    && deno cache server.js

USER deno

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["deno", "eval", "const response = await fetch('http://127.0.0.1:4173/api/health'); if (!response.ok) Deno.exit(1)"]

CMD ["deno", "run", "--cached-only", "--allow-net=0.0.0.0:4173", "--allow-read=/app", "--allow-write=/app/data", "--allow-env=PORT,TABI_DATABASE_PATH,TABI_PUBLIC_ORIGIN,TABI_SECURE_COOKIE", "server.js"]
