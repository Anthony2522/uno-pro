import path from "node:path";
import fs from "node:fs";
import {createHash} from "node:crypto";
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
    // Ship a versioned app shell, all lazy route chunks and card art for Wi-Fi-free games.
    {
      name:"uno-browser-offline-shell",apply:"build" as const,
      generateBundle(_options,bundle){
        const assets=["/",...Object.keys(bundle).filter(x=>/\.(js|css|woff2|svg|png|webp)$/.test(x)).map(x=>"/"+x)];
        const publicDir=path.join(root,"public");
        if(fs.existsSync(publicDir))for(const entry of fs.readdirSync(publicDir)){
          const file=path.join(publicDir,entry);
          if(fs.statSync(file).isFile()&&/\.(svg|png|webp|ico|json|woff2)$/.test(entry))assets.push("/"+entry);
        }
        const unique=[...new Set(assets)].sort();
        const stamp=createHash("sha256").update(unique.join("|")).digest("hex").slice(0,12);
        const template=fs.readFileSync(path.join(root,"scripts/offline-sw-template.js"),"utf8");
        this.emitFile({type:"asset",fileName:"sw.js",source:template.replace("__UNO_CACHE_VERSION__","uno-offline-"+stamp).replace("__UNO_PRECACHE__",JSON.stringify(unique))});
      }
    },
  ],
  resolve: {
    alias: { "@": path.resolve(root, "src"),"node:crypto":path.resolve(root,"src/lib/uno/browserCrypto.js") },
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
  server: {
    // `npm run dev`: Vite on 5173, API proxied to `npm start` on 3000.
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});