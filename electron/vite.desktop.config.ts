import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

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
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("..", import.meta.url)),
    },
  },
  build: {
    outDir: desktopOutput,
    emptyOutDir: true,
  },
});
