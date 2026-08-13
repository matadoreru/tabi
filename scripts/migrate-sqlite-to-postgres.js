import { DatabaseSync } from "node:sqlite";
import { closeDatabase, db, transaction } from "../backend/database.js";
import { ENTITY_TABLES } from "../backend/config.js";
import { extractMediaAssets } from "../backend/media.js";
import { syncFinancialSource } from "../backend/finance.js";
import { attachExactMoney } from "../src/money.js";
import { ENTITY_CONTRACTS } from "../src/contracts.js";

const sourcePath = Deno.args[0] || Deno.env.get("TABI_SQLITE_SOURCE") || "/app/data/tabi.sqlite";
const JSON_COLUMNS = new Set(["data", "metadata"]);

function migrationValue(table, column, value, row) {
  if (!JSON_COLUMNS.has(column) || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`JSON inválido en ${table}.${column} para ${row.id || row.trip_id || "un registro"}.`);
  }
}

let source;
try {
  source = new DatabaseSync(sourcePath, { readOnly: true });
  const destinationUsers = Number((await db.prepare("SELECT COUNT(*)::integer count FROM users").get()).count);
  if (destinationUsers > 0) {
    throw new Error("PostgreSQL ya contiene usuarios. La importación se cancela para no sobrescribir datos.");
  }

  const tables = [
    [
      "users",
      [
        "id",
        "name",
        "username",
        "email",
        "password_hash",
        "password_salt",
        "password_algorithm",
        "avatar_url",
        "created_at",
        "updated_at",
      ],
    ],
    ["sessions", ["id", "token_hash", "user_id", "created_at", "expires_at", "last_seen_at"]],
    [
      "trips",
      [
        "id",
        "name",
        "emoji",
        "country",
        "start_date",
        "end_date",
        "travelers",
        "budget",
        "currency",
        "data",
        "version",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
      ],
    ],
    ["trip_members", ["trip_id", "user_id", "role", "joined_at", "invited_by"]],
    [
      "trip_invitations",
      [
        "id",
        "trip_id",
        "token_hash",
        "role",
        "created_by",
        "created_at",
        "expires_at",
        "max_uses",
        "uses",
        "revoked_at",
        "version",
      ],
    ],
    [
      "trip_activity_logs",
      ["id", "trip_id", "user_id", "action", "entity_type", "entity_id", "metadata", "created_at"],
    ],
    ...Object.values(ENTITY_TABLES).map((table) => [
      table,
      ["id", "trip_id", "data", "version", "created_at", "updated_at", "created_by", "updated_by"],
    ]),
    ["exchange_rates", ["base_currency", "quote_currency", "rate", "provider", "rate_date", "fetched_at"]],
  ];

  const sourceTables = new Set(
    source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({ name }) => name),
  );
  const counts = {};
  const entityCollections = new Map(Object.entries(ENTITY_TABLES).map(([collection, table]) => [table, collection]));
  const tripCurrencies = new Map(
    source.prepare("SELECT id,currency FROM trips").all().map((row) => [row.id, row.currency]),
  );

  await transaction(async () => {
    for (const [table, columns] of tables) {
      if (!sourceTables.has(table)) {
        counts[table] = 0;
        continue;
      }
      const rows = source.prepare(`SELECT ${columns.join(",")} FROM ${table}`).all();
      counts[table] = rows.length;
      const placeholders = columns.map(() => "?").join(",");
      const insert = db.prepare(`INSERT INTO ${table}(${columns.join(",")}) VALUES (${placeholders})`);
      for (const row of rows) {
        const values = Object.fromEntries(
          columns.map((column) => [column, migrationValue(table, column, row[column], row)]),
        );
        const collection = entityCollections.get(table);
        if (collection) {
          attachExactMoney(values.data, ENTITY_CONTRACTS[collection]?.money || [], tripCurrencies.get(row.trip_id));
          await extractMediaAssets(row.trip_id, collection, row.id, values.data, row.updated_by);
        }
        await insert.run(...columns.map((column) => values[column]));
        if (collection) {
          await syncFinancialSource(
            row.trip_id,
            collection,
            { ...values.data, id: row.id },
            tripCurrencies.get(row.trip_id),
            row.updated_at,
          );
        }
      }
    }

    for (const [table, columns] of tables) {
      const destination = Number((await db.prepare(`SELECT COUNT(*)::integer count FROM ${table}`).get()).count);
      if (destination !== counts[table]) {
        throw new Error(`Verificación fallida en ${table}: SQLite=${counts[table]}, PostgreSQL=${destination}.`);
      }
      const jsonColumn = columns.find((column) => JSON_COLUMNS.has(column));
      if (jsonColumn) {
        const invalidJson = Number(
          (await db.prepare(
            `SELECT COUNT(*)::integer count FROM ${table} WHERE jsonb_typeof(${jsonColumn}) <> 'object'`,
          ).get()).count,
        );
        if (invalidJson > 0) {
          throw new Error(`Verificación JSONB fallida en ${table}: ${invalidJson} registros no son objetos.`);
        }
      }
    }
  });

  console.log("Migración SQLite → PostgreSQL completada y verificada.");
  for (const [table, count] of Object.entries(counts)) console.log(`${table}: ${count}`);
} catch (error) {
  console.error(`Migración cancelada: ${error.message}`);
  Deno.exitCode = 1;
} finally {
  source?.close();
  await closeDatabase();
}
