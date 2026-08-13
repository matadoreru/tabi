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
  `
  CREATE TABLE IF NOT EXISTS financial_transactions(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    source_collection TEXT NOT NULL,
    source_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('planned','committed','paid','refund','fund')),
    category TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'confirmed',
    amount_minor NUMERIC(30, 0) NOT NULL CHECK(amount_minor >= 0),
    currency TEXT NOT NULL CHECK(char_length(currency) = 3),
    payer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    occurred_on DATE,
    title TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE(trip_id, source_collection, source_id, kind)
  );
  CREATE INDEX IF NOT EXISTS idx_financial_transactions_trip
    ON financial_transactions(trip_id, occurred_on, category);
  CREATE INDEX IF NOT EXISTS idx_financial_transactions_source
    ON financial_transactions(trip_id, source_collection, source_id);

  CREATE TABLE IF NOT EXISTS expense_splits(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    source_collection TEXT NOT NULL,
    source_id TEXT NOT NULL,
    member_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    participant_name TEXT NOT NULL DEFAULT '',
    amount_minor NUMERIC(30, 0) NOT NULL CHECK(amount_minor >= 0),
    currency TEXT NOT NULL CHECK(char_length(currency) = 3),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK(member_user_id IS NOT NULL OR participant_name <> '')
  );
  CREATE INDEX IF NOT EXISTS idx_expense_splits_trip ON expense_splits(trip_id, member_user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_splits_member_unique
    ON expense_splits(trip_id, source_collection, source_id, member_user_id)
    WHERE member_user_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS financial_projection_state(
    trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
    projection_version INTEGER NOT NULL DEFAULT 1,
    projected_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media_assets(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    owner_collection TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
    bytes BYTEA NOT NULL,
    byte_size INTEGER NOT NULL CHECK(byte_size > 0 AND byte_size <= 2000000),
    content_hash TEXT NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE(trip_id, owner_collection, owner_id, field_name)
  );
  CREATE INDEX IF NOT EXISTS idx_media_assets_trip_owner
    ON media_assets(trip_id, owner_collection, owner_id);

  CREATE TABLE IF NOT EXISTS account_recovery_codes(
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON account_recovery_codes(user_id, expires_at);

  INSERT INTO media_assets(
    id,trip_id,owner_collection,owner_id,field_name,mime_type,bytes,byte_size,content_hash,created_by,created_at,updated_at
  )
  SELECT 'med_' || md5(p.trip_id || p.id || 'photo'),p.trip_id,'purchases',p.id,'photo',
    CASE WHEN p.data->>'photo' LIKE 'data:image/png%' THEN 'image/png'
         WHEN p.data->>'photo' LIKE 'data:image/webp%' THEN 'image/webp' ELSE 'image/jpeg' END,
    decode(split_part(p.data->>'photo', ',', 2), 'base64'),
    octet_length(decode(split_part(p.data->>'photo', ',', 2), 'base64')),
    md5(p.data->>'photo'),p.updated_by,p.created_at,p.updated_at
  FROM purchases p WHERE p.data->>'photo' ~ '^data:image/(jpeg|png|webp);base64,'
  ON CONFLICT DO NOTHING;
  UPDATE purchases p SET data=(p.data - 'photo') || jsonb_build_object(
    'photoAssetId','med_' || md5(p.trip_id || p.id || 'photo'),
    'photo','/api/media/' || 'med_' || md5(p.trip_id || p.id || 'photo')
  ) WHERE p.data->>'photo' ~ '^data:image/(jpeg|png|webp);base64,';

  INSERT INTO media_assets(
    id,trip_id,owner_collection,owner_id,field_name,mime_type,bytes,byte_size,content_hash,created_by,created_at,updated_at
  )
  SELECT 'med_' || md5(p.trip_id || p.id || 'backgroundImage'),p.trip_id,'places',p.id,'backgroundImage',
    CASE WHEN p.data->>'backgroundImage' LIKE 'data:image/png%' THEN 'image/png'
         WHEN p.data->>'backgroundImage' LIKE 'data:image/webp%' THEN 'image/webp' ELSE 'image/jpeg' END,
    decode(split_part(p.data->>'backgroundImage', ',', 2), 'base64'),
    octet_length(decode(split_part(p.data->>'backgroundImage', ',', 2), 'base64')),
    md5(p.data->>'backgroundImage'),p.updated_by,p.created_at,p.updated_at
  FROM places p WHERE p.data->>'backgroundImage' ~ '^data:image/(jpeg|png|webp);base64,'
  ON CONFLICT DO NOTHING;
  UPDATE places p SET data=(p.data - 'backgroundImage') || jsonb_build_object(
    'backgroundImageAssetId','med_' || md5(p.trip_id || p.id || 'backgroundImage'),
    'backgroundImage','/api/media/' || 'med_' || md5(p.trip_id || p.id || 'backgroundImage')
  ) WHERE p.data->>'backgroundImage' ~ '^data:image/(jpeg|png|webp);base64,';
  `,
  `
  ALTER TABLE financial_projection_state ADD COLUMN IF NOT EXISTS projection_version INTEGER NOT NULL DEFAULT 1;
  UPDATE purchases
  SET data=(data - 'photoUrl') || jsonb_build_object('photo', data->>'photoUrl')
  WHERE data ? 'photoAssetId' AND NOT (data ? 'photo') AND data->>'photoUrl' LIKE '/api/media/%';
  `,
  `
  CREATE TABLE IF NOT EXISTS entity_comments(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    entity_collection TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL CHECK(char_length(body) BETWEEN 1 AND 2000),
    mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entity_comments_target
    ON entity_comments(trip_id, entity_collection, entity_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_entity_comments_mentions
    ON entity_comments USING GIN(mentions);

  CREATE TABLE IF NOT EXISTS reminders(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_trip ON reminders(trip_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS route_estimates(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    route_key TEXT NOT NULL,
    travel_mode TEXT NOT NULL CHECK(travel_mode IN ('WALKING','DRIVING','TRANSIT','BICYCLING')),
    distance_meters INTEGER NOT NULL CHECK(distance_meters >= 0),
    duration_seconds INTEGER NOT NULL CHECK(duration_seconds >= 0),
    provider TEXT NOT NULL DEFAULT 'google-maps',
    fetched_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE(trip_id, route_key, travel_mode)
  );
  CREATE INDEX IF NOT EXISTS idx_route_estimates_expiry ON route_estimates(expires_at);

  UPDATE trips SET data=data || jsonb_build_object('timeZone','UTC') WHERE NOT (data ? 'timeZone');
  `,
  `
  CREATE TABLE IF NOT EXISTS trip_participants(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK(char_length(name) BETWEEN 1 AND 80),
    kind TEXT NOT NULL DEFAULT 'guest' CHECK(kind IN ('member','guest')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_participants_user
    ON trip_participants(trip_id,user_id) WHERE user_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_trip_participants_trip ON trip_participants(trip_id,active,name);

  INSERT INTO trip_participants(id,trip_id,user_id,name,kind,active,created_at,updated_at,created_by)
  SELECT 'par_' || md5(tm.trip_id || tm.user_id),tm.trip_id,tm.user_id,u.name,'member',TRUE,
    tm.joined_at,tm.joined_at,tm.invited_by
  FROM trip_members tm JOIN users u ON u.id=tm.user_id
  ON CONFLICT DO NOTHING;

  ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS payer_participant_id TEXT
    REFERENCES trip_participants(id) ON DELETE SET NULL;
  ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS participant_id TEXT
    REFERENCES trip_participants(id) ON DELETE CASCADE;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_splits_participant_unique
    ON expense_splits(trip_id,source_collection,source_id,participant_id)
    WHERE participant_id IS NOT NULL;

  UPDATE financial_transactions f SET payer_participant_id=p.id
  FROM trip_participants p
  WHERE f.trip_id=p.trip_id AND f.payer_id=p.user_id AND f.payer_participant_id IS NULL;
  UPDATE expense_splits s SET participant_id=p.id
  FROM trip_participants p
  WHERE s.trip_id=p.trip_id AND s.member_user_id=p.user_id AND s.participant_id IS NULL;

  CREATE TABLE IF NOT EXISTS settlement_payments(
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    from_participant_id TEXT NOT NULL REFERENCES trip_participants(id),
    to_participant_id TEXT NOT NULL REFERENCES trip_participants(id),
    amount_minor NUMERIC(30,0) NOT NULL CHECK(amount_minor > 0),
    currency TEXT NOT NULL CHECK(char_length(currency)=3),
    paid_on DATE NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','voided')),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    CHECK(from_participant_id<>to_participant_id)
  );
  CREATE INDEX IF NOT EXISTS idx_settlement_payments_trip
    ON settlement_payments(trip_id,paid_on,created_at);

  CREATE TABLE IF NOT EXISTS notification_reads(
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_key TEXT NOT NULL,
    read_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(trip_id,user_id,notification_key)
  );

  ${
    ["proposals", "availabilities", "journal_entries", "emergency_contacts", "location_shares"].map((table) => `
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
    CREATE INDEX IF NOT EXISTS idx_${table}_trip ON ${table}(trip_id,updated_at DESC);
  `).join("\n")
  }
  `,
  `
  ALTER TABLE expense_splits DROP CONSTRAINT IF EXISTS expense_splits_check;
  ALTER TABLE expense_splits DROP CONSTRAINT IF EXISTS expense_splits_identity_check;
  ALTER TABLE expense_splits ADD CONSTRAINT expense_splits_identity_check
    CHECK(member_user_id IS NOT NULL OR participant_id IS NOT NULL OR participant_name <> '');
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
