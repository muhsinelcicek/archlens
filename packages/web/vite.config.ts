import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4849,
    proxy: {
      "/api": "http://localhost:4848",
    },
  },
  worker: {
    format: "es",
  },
});
