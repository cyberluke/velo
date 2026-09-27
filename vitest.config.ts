import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // Nested Agent Manager worktrees (.kilo/worktrees/*) are full checkouts
    // of this repo and would otherwise be scanned and run twice — once with
    // a stale tree that fails on the Tauri mocks.
    exclude: ["**/node_modules/**", "**/.kilo/**", "**/dist/**"],
  },
});
