import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev port and does not want the host cleared.
// `--mode tools` builds the tools website into dist-tools/ (see src/tools/),
// with relative addresses so it works from any folder of a web server.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  ...(mode === "tools" ? { base: "./" } : {}),
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "chrome105",
    minify: "esbuild",
    sourcemap: false,
    ...(mode === "tools" ? { outDir: "dist-tools" } : {}),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
