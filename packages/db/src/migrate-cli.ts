import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env or export it.");
  process.exit(1);
}

const { db, pool } = createDb(url);
try {
  await runMigrations(db);
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
