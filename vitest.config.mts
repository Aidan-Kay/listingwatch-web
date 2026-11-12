import { defineConfig } from "vitest/config";

// One runner for every workspace; each project keeps its own environment.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
  },
});
