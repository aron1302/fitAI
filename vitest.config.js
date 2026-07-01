import { defineConfig } from "vitest/config";

// Standalone config so Vitest runs from the project root (not vite.config.js's
// client/ root) and doesn't load the React plugin for these Node-side tests.
export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    environment: "node",
  },
});
