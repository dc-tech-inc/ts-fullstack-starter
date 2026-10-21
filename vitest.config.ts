import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Tests run against workspace TypeScript sources, so no package has to be built first.
  resolve: {
    alias: {
      "@app/shared": src("./packages/shared/src/index.ts"),
      "@app/db": src("./packages/db/src/index.ts"),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: "shared", include: ["packages/shared/test/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "api",
          include: ["apps/api/test/**/*.test.ts"],
          globalSetup: ["apps/api/test/global-setup.ts"],
          // Integration files share one database and truncate it between tests.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: { name: "web", environment: "jsdom", include: ["apps/web/test/**/*.test.{ts,tsx}"] },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["apps/api/src/**/*.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
