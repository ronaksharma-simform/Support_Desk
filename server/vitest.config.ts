import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL_TEST ??
        "postgres://supportdesk:supportdesk@localhost:5432/supportdesk_test",
      JWT_SECRET: "supportdesk-test-secret",
      PORT: "0",
    },
  },
});
