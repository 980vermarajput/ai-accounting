import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Run each test file in isolation so env-var mutations don't bleed across suites
    isolate: true,
  },
});
