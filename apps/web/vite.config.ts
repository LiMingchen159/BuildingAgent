import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/health": "http://127.0.0.1:3000",
      // Direct collector (no auth) — mirrors production nginx /bms → :8765
      "/bms": "http://127.0.0.1:8765"
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("plotly.js-dist-min")) return "vendor-plotly";
            if (id.includes("react-dom")) return "vendor-react-dom";
            if (id.includes("react")) return "vendor-react";
            return "vendor";
          }
          return undefined;
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [fileURLToPath(new URL("./src/test/setup.ts", import.meta.url))],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  }
});
