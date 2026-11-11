import { defineConfig } from "vitest/config";

if (process.env.CI && !process.env.JOB_OPS_PORTFOLIO_ROOT) {
  throw new Error("CI requires JOB_OPS_PORTFOLIO_ROOT; run the pinned renderer asset setup before the full suite.");
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
