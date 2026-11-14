import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

const root = path.dirname(fileURLToPath(import.meta.url));

// Client-only SPA build. server.js serves dist/ and the /api endpoints.
export default defineConfig({
  plugins: [
    // Must come before react(): generates src/routeTree.gen.ts from src/routes.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": path.resolve(root, "src") },
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
  server: {
    // `npm run dev`: Vite on 5173, API proxied to `npm start` on 3000.
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});