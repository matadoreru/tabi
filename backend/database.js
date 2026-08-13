import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import { CONFIG, ENTITY_TABLES } from "./config.js";

const transactionContext = new AsyncLocalStorage();

export const sql = postgres({
  host: CONFIG.postgres.host,
  port: CONFIG.postgres.port,
  database: CONFIG.postgres.database,
  username: CONFIG.postgres.user,
  password: CONFIG.postgres.password,
  max: CONFIG.postgres.maxConnections,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: {
    value: {
      from(value) {
        return value instanceof Date ? value.toISOString() : value;
      },
    },
  },
});

if (!CONFIG.postgres.password) {
  throw new Error("TABI_POSTGRES_PASSWORD es obligatorio para conectar con PostgreSQL.");
}

function activeSql() {
  return transactionContext.getStore() || sql;
}

function postgresQuery(source) {
  let parameter = 0;
  return source.replaceAll("?", () => `$${++parameter}`);
}

function databaseParameters(parameters) {
  const executor = activeSql();
  return parameters.map((value) =>
    value && typeof value === "object" && !(value instanceof Date) && !(value instanceof Uint8Array)
      ? executor.json(value)
      : value
  );
}

function normalizeJsonColumns(row) {
  if (!row) return row;
  for (const column of ["data", "metadata"]) {
    if (typeof row[column] !== "string") continue;
    try {
      row[column] = JSON.parse(row[column]);
    } catch {
      // Una consulta puede usar estos alias para texto no JSON; en ese caso se conserva el valor original.
    }
  }
  return row;
}

function statement(source) {
  const query = postgresQuery(source);
  return {
    async get(...parameters) {
      const rows = await activeSql().unsafe(query, databaseParameters(parameters));
      return normalizeJsonColumns(rows[0]);
    },
    async all(...parameters) {
      return [...await activeSql().unsafe(query, databaseParameters(parameters))].map(normalizeJsonColumns);
    },
    async run(...parameters) {
      const rows = await activeSql().unsafe(query, databaseParameters(parameters));
      return { changes: rows.count ?? rows.length };
    },
  };
}

export const db = Object.freeze({
  prepare: statement,
  async exec(query) {
    return await activeSql().unsafe(query);
  },
});

const entityTablesSql = Object.values(ENTITY_TABLES).map((table) => `
  CREATE TABLE IF NOT EXISTS ${table}(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_${table}_trip ON ${table}(trip_id, updated_at DESC);
`).join("\n");

const migrations = [
  `
  CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK(char_length(name) BETWEEN 2 AND 80),
    username TEXT,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_algorithm TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(lower(email));
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(lower(username)) WHERE username IS NOT NULL;

  CREATE TABLE IF NOT EXISTS sessions(
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS trips(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '✈️',
    country TEXT NOT NULL DEFAULT '',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    travelers INTEGER NOT NULL DEFAULT 1 CHECK(travelers > 0),
    budget NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK(budget >= 0),
    currency TEXT NOT NULL DEFAULT 'JPY',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    updated_by TEXT NOT NULL REFERENCES users(id),
    CHECK(start_date <= end_date)
  );

  CREATE TABLE IF NOT EXISTS trip_members(
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
    joined_at TIMESTAMPTZ NOT NULL,
    invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY(trip_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members(user_id, trip_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_one_owner_per_trip ON trip_members(trip_id) WHERE role = 'owner';

  CREATE TABLE IF NOT EXISTS trip_invitations(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INTEGER NOT NULL CHECK(max_uses > 0),
    uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0),
    revoked_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_invitations_trip ON trip_invitations(trip_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invitations_expiry ON trip_invitations(expires_at) WHERE revoked_at IS NULL;

  CREATE TABLE IF NOT EXISTS trip_activity_logs(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_trip_created ON trip_activity_logs(trip_id, created_at DESC);

  ${entityTablesSql}
  CREATE INDEX IF NOT EXISTS idx_inspirations_trip_url ON inspirations(trip_id, (data->>'url'));

  CREATE TABLE IF NOT EXISTS exchange_rates(
    base_currency TEXT NOT NULL,
    quote_currency TEXT NOT NULL,
    rate NUMERIC(24, 12) NOT NULL CHECK(rate > 0),
    provider TEXT NOT NULL,
    rate_date DATE NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(base_currency, quote_currency)
  );
  `,
  `
  ${
    Object.values(ENTITY_TABLES).map((table) => `
    UPDATE ${table}
    SET data = (data #>> '{}')::jsonb
    WHERE jsonb_typeof(data) = 'string';
  `).join("\n")
  }
  UPDATE trips
  SET data = (data #>> '{}')::jsonb
  WHERE jsonb_typeof(data) = 'string';
  UPDATE trip_activity_logs
  SET metadata = (metadata #>> '{}')::jsonb
  WHERE jsonb_typeof(metadata) = 'string';
  `,
];

async function migrate() {
  await sql.begin(async (transactionSql) => {
    await transactionSql.unsafe("SELECT pg_advisory_xact_lock(87362491)");
    await transactionSql.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations(
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL
      )
    `);
    const currentRows = await transactionSql.unsafe(
      "SELECT COALESCE(MAX(version), 0)::integer AS version FROM schema_migrations",
    );
    const current = Number(currentRows[0]?.version || 0);
    for (let index = current; index < migrations.length; index++) {
      await transactionSql.unsafe(migrations[index]);
      await transactionSql.unsafe(
        "INSERT INTO schema_migrations(version, applied_at) VALUES ($1, $2)",
        [index + 1, new Date().toISOString()],
      );
    }
  });
}

export async function transaction(work) {
  return await sql.begin((transactionSql) => transactionContext.run(transactionSql, work));
}

export function entityTable(name) {
  const table = ENTITY_TABLES[name];
  if (!table) throw new Error("Entidad no soportada");
  return table;
}

export async function closeDatabase() {
  await sql.end({ timeout: 5 });
}

await migrate();
