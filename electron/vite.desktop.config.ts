import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import {
  javaRandomEsmPlugin,
  vosviewerOptimizeDeps,
  vosviewerReact19Plugin,
} from "../build/java-random-esm-plugin";

const rendererRoot = fileURLToPath(
  new URL("./renderer", import.meta.url),
);
const desktopOutput = fileURLToPath(
  new URL("../dist-desktop", import.meta.url),
);
const publicDirectory = fileURLToPath(
  new URL("../public", import.meta.url),
);

export default defineConfig({
  root: rendererRoot,
  publicDir: publicDirectory,
  base: "./",
  plugins: [javaRandomEsmPlugin(), vosviewerReact19Plugin(), react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("..", import.meta.url)),
    },
  },
  optimizeDeps: vosviewerOptimizeDeps(),
  build: {
    outDir: desktopOutput,
    emptyOutDir: true,
  },
});
