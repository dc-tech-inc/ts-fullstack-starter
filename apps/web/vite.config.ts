import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin in development: the browser talks to Vite, Vite forwards /api to Express.
    proxy: { "/api": "http://localhost:3000" },
  },
});
