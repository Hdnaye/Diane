import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{js,ts}"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.{js,ts}"],
          // Starts a throwaway PocketBase instance for the whole run.
          globalSetup: ["tests/integration/pocketbase.global-setup.ts"],
          testTimeout: 15_000,
        },
      },
    ],
  },
});
