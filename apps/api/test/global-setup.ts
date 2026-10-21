import { createDb, runMigrations } from "@app/db";

/**
 * Recreates the schema once per run so integration tests start from the committed migrations.
 * Refuses to touch a database whose name does not contain "test".
 */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      "\n[api] Integration tests SKIPPED: DATABASE_URL is not set. " +
        "Start Postgres (docker compose up -d db) and export DATABASE_URL to run them.\n",
    );
    return;
  }

  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.includes("test")) {
    throw new Error(`Refusing to reset database "${dbName}": integration tests need a database whose name contains "test".`);
  }

  const { db, pool } = createDb(url);
  try {
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
