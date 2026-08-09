import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { CONFIG, ENTITY_TABLES } from "./config.js";

const directory = dirname(CONFIG.databasePath);
if (CONFIG.databasePath !== ":memory:") Deno.mkdirSync(directory, { recursive: true });

export const db = new DatabaseSync(CONFIG.databasePath);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

const migrations = [
  `
  CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  CREATE TABLE users(
    id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
    email TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
    password_algorithm TEXT NOT NULL, avatar_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE sessions(
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX idx_sessions_user ON sessions(user_id);
  CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
  CREATE TABLE trips(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '✈️', country TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, travelers INTEGER NOT NULL DEFAULT 1 CHECK(travelers > 0),
    budget REAL NOT NULL DEFAULT 0 CHECK(budget >= 0), currency TEXT NOT NULL DEFAULT 'JPY', data TEXT NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id),
    CHECK(start_date <= end_date)
  ) STRICT;
  CREATE TABLE trip_members(
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')), joined_at TEXT NOT NULL,
    invited_by TEXT REFERENCES users(id) ON DELETE SET NULL, PRIMARY KEY(trip_id, user_id)
  ) WITHOUT ROWID, STRICT;
  CREATE INDEX idx_trip_members_user ON trip_members(user_id, trip_id);
  CREATE UNIQUE INDEX idx_one_owner_per_trip ON trip_members(trip_id) WHERE role = 'owner';
  CREATE TABLE trip_invitations(
    id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('editor','viewer')), created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL CHECK(max_uses > 0),
    uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0), revoked_at TEXT, version INTEGER NOT NULL DEFAULT 1
  ) STRICT;
  CREATE INDEX idx_invitations_trip ON trip_invitations(trip_id, created_at DESC);
  CREATE INDEX idx_invitations_expiry ON trip_invitations(expires_at) WHERE revoked_at IS NULL;
  CREATE TABLE trip_activity_logs(
    id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL,
    entity_id TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX idx_activity_trip_created ON trip_activity_logs(trip_id, created_at DESC);
  `,
  `
  CREATE TABLE activities(id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
  CREATE TABLE places(id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
  CREATE TABLE tasks(id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
  CREATE TABLE purchases(id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
  CREATE TABLE expenses(id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
  CREATE TABLE stays(id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
  CREATE TABLE transports(id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
  CREATE TABLE reservations(id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
  CREATE TABLE documents(id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
  `,
  `
  CREATE INDEX idx_activities_trip ON activities(trip_id, updated_at DESC);
  CREATE INDEX idx_places_trip ON places(trip_id, updated_at DESC);
  CREATE INDEX idx_tasks_trip ON tasks(trip_id, updated_at DESC);
  CREATE INDEX idx_purchases_trip ON purchases(trip_id, updated_at DESC);
  CREATE INDEX idx_expenses_trip ON expenses(trip_id, updated_at DESC);
  CREATE INDEX idx_stays_trip ON stays(trip_id, updated_at DESC);
  CREATE INDEX idx_transports_trip ON transports(trip_id, updated_at DESC);
  CREATE INDEX idx_reservations_trip ON reservations(trip_id, updated_at DESC);
  CREATE INDEX idx_documents_trip ON documents(trip_id, updated_at DESC);
  `,
  `
  ALTER TABLE users ADD COLUMN username TEXT;
  UPDATE users SET username = lower(substr(email, 1, instr(email, '@') - 1)) || '_' || lower(substr(id, -6)) WHERE username IS NULL;
  CREATE UNIQUE INDEX idx_users_username_unique ON users(username COLLATE NOCASE);
  `,
  `
  CREATE TABLE funds(id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL);
  CREATE INDEX idx_funds_trip ON funds(trip_id, updated_at DESC);
  `,
];

export function migrate() {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const current = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get()?.version || 0;
  for (let index = current; index < migrations.length; index++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migrations[index]);
      db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(
        index + 1,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function transaction(work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function entityTable(name) {
  const table = ENTITY_TABLES[name];
  if (!table) throw new Error("Entidad no soportada");
  return table;
}

migrate();
