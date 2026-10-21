import { defineConfig } from "drizzle-kit";

// `generate` only diffs the schema file against earlier snapshots, so it does
// not need a live database. `migrate` runs through src/migrate-cli.ts instead.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
