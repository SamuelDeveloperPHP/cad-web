import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Em producao o editor (SPA) e servido sob /app, pois o Nginx serve o site
// institucional estatico na raiz (/). Em desenvolvimento o Vite continua
// servindo o app na raiz (http://127.0.0.1:5173/), sem mudanca no fluxo.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/app/" : "/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
}));
