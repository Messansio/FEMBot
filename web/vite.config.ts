import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = `http://localhost:${process.env["API_PORT"] ?? 3000}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@api": fileURLToPath(new URL("../src/api", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": apiTarget,
      "/auth": apiTarget,
    },
  },
});
