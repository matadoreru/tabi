import { APPLICATION_COMMIT } from "./version.js";

const configuredPublicOrigin = Deno.env.get("TABI_PUBLIC_ORIGIN")?.trim();

export const CONFIG = Object.freeze({
  postgres: Object.freeze({
    host: Deno.env.get("TABI_POSTGRES_HOST") || "127.0.0.1",
    port: Number(Deno.env.get("TABI_POSTGRES_PORT") || 5432),
    database: Deno.env.get("TABI_POSTGRES_DB") || "tabi",
    user: Deno.env.get("TABI_POSTGRES_USER") || "tabi",
    password: Deno.env.get("TABI_POSTGRES_PASSWORD") || "",
    maxConnections: Number(Deno.env.get("TABI_POSTGRES_POOL_SIZE") || 10),
  }),
  publicOrigin: configuredPublicOrigin ? new URL(configuredPublicOrigin).origin : "",
  googleMapsApiKey: Deno.env.get("TABI_GOOGLE_MAPS_API_KEY")?.trim() || "",
  googleMapsMapId: Deno.env.get("TABI_GOOGLE_MAPS_MAP_ID")?.trim() || "",
  metricsToken: Deno.env.get("TABI_METRICS_TOKEN")?.trim() || "",
  commitSha: APPLICATION_COMMIT,
  sessionCookie: "tabi_session",
  sessionDays: 30,
  passwordIterations: 310_000,
  invitationTokenBytes: 32,
  maxBodyBytes: 2_000_000,
  maxArchiveBytes: 10_000_000,
});

export const ENTITY_TABLES = Object.freeze({
  activities: "activities",
  places: "places",
  tasks: "tasks",
  purchases: "purchases",
  expenses: "expenses",
  funds: "funds",
  stays: "stays",
  transports: "transports",
  reservations: "reservations",
  inspirations: "inspirations",
  notes: "notes",
  reminders: "reminders",
});
