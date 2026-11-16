import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// ClassKernel Science is a static website: relative addresses (base "./") so
// it works from any folder of a web server, GitHub Pages included.
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
  },
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
