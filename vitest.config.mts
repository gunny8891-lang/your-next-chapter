import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Dates are read as UTC wall-clock throughout the app (see schedule.ts), so
    // tests must not depend on the machine's timezone.
    env: { TZ: "Europe/London" },
  },
});
