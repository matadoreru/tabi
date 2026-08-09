const configuredPublicOrigin = Deno.env.get("TABI_PUBLIC_ORIGIN")?.trim();

export const CONFIG = Object.freeze({
  databasePath: Deno.env.get("TABI_DATABASE_PATH") || "./data/tabi.sqlite",
  publicOrigin: configuredPublicOrigin ? new URL(configuredPublicOrigin).origin : "",
  sessionCookie: "tabi_session",
  sessionDays: 30,
  passwordIterations: 310_000,
  invitationTokenBytes: 32,
  maxBodyBytes: 2_000_000,
});

export const ENTITY_TABLES = Object.freeze({
  activities: "activities",
  places: "places",
  tasks: "tasks",
  purchases: "purchases",
  expenses: "expenses",
  stays: "stays",
  transports: "transports",
  reservations: "reservations",
  documents: "documents",
});
