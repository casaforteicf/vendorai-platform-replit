import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      JWT_SECRET: "test-jwt-secret-for-unit-tests",
      DATABASE_URL: "postgres://localhost/test-placeholder",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    },
  },
});
