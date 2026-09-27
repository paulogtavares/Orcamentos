import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["compartilhado/**/*.test.ts", "api/testes/**/*.test.ts", "web/src/**/*.test.{ts,tsx}"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
