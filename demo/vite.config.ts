import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  base: "/",
  publicDir: resolve(__dirname, "public"),
  resolve: {
    alias: {
      neurarobobridge: resolve(__dirname, "../src/index.ts"),
    },
  },
  server: {
    port: 5174,
    open: false,
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
});
