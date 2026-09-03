import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dev server proxies /api to the Express backend (server/, port 4000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
