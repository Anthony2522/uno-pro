// Verify the built service worker can serve a complete app after Wi-Fi is gone.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const sw=fs.readFileSync("dist/sw.js","utf8");
const marker=sw.match(/const PRECACHE=(\[[^\n]+\]);/);
assert.ok(marker,"offline worker must embed a precache list");
const files=JSON.parse(marker[1]);
assert.ok(files.includes("/"),"SPA HTML entry must be cached");
assert.ok(files.some(file=>file.endsWith(".css")),"styles must be available offline");
assert.ok(files.some(file=>file.endsWith(".js")),"JavaScript app must be cached");
assert.ok(files.some(file=>file.includes("sala")&&file.endsWith(".js")) ||
  files.filter(file=>file.endsWith(".js")).length>=2,
  "at least one lazy route chunk should be included");
for(const file of files){
  const real=file==="/"?path.resolve("dist/index.html"):path.resolve("dist",file.slice(1));
  assert.ok(fs.existsSync(real),"missing offline shell asset: "+file);
}
assert.ok(sw.includes('url.pathname.startsWith("/api/")'),"do not cache private game API responses");
console.log("Offline service worker: "+files.length+" existing assets precached.");
