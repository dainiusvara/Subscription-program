import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Database tests: run against the local Supabase stack (`npx supabase start`). */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.db.test.ts"],
    environment: "node",
    globalSetup: ["src/test/supabase-env.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
