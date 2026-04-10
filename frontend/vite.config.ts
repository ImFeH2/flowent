import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, "../app/static"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (
            id.includes("/@xyflow/") ||
            id.includes("/@dagrejs/") ||
            id.includes("/react-rnd/")
          ) {
            return "graph-vendor";
          }
          if (id.includes("/react-markdown/") || id.includes("/remark-gfm/")) {
            return "markdown-vendor";
          }
          if (
            id.includes("/motion/") ||
            id.includes("/lucide-react/") ||
            id.includes("/sonner/") ||
            id.includes("/@radix-ui/") ||
            id.includes("/react-resizable-panels/")
          ) {
            return "ui-vendor";
          }
          if (id.includes("/react/") || id.includes("/react-dom/")) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: path.resolve(__dirname, "src/test/setup.ts"),
    css: true,
    clearMocks: true,
    restoreMocks: true,
  },
});
