import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron";
import electronRenderer from "vite-plugin-electron-renderer";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: "src/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/main",
            rollupOptions: {
              external: [
                "electron",
                "better-sqlite3",
                "@anthropic-ai/sdk",
                /\.node$/,
              ],
            },
          },
        },
      },
      {
        entry: "src/main/preload.ts",
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron/preload",
            lib: {
              formats: ["cjs"],
              fileName: () => "preload.js",
            },
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  build: {
    outDir: "dist",
  },
});
