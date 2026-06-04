import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Mirror the TS path aliases from tsconfig.json so tests import modules the
// same way the source does.
const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      "@config": r("./src/config"),
      "@plugins": r("./src/plugins"),
      "@modules": r("./src/modules"),
      "@src": r("./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // MongoMemoryServer downloads a binary on first run and integration
    // tests touch the DB; give them room and run serially to avoid sharing
    // one in-memory Mongo across parallel workers.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
