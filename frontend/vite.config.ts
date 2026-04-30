import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDirectory, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 6873,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:6874",
        changeOrigin: true,
      },
    },
  },
});
