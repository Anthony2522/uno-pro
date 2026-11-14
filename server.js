// UNO Pro — Node server for Render (or any Node host).
// Serves the built React app from dist/, the game API at /api/rpc and live updates at /api/events.
// No database, no external services: rooms live in this process' memory.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RpcError } from "./server/game.js";
import { proRpc as rpc, RPC_NAMES, onBumpPro as onBump, proSweep as sweep } from "./server/pro.js";
import { TokenBucket } from "./server/rateLimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY = 8 * 1024;

// ---------- rate limits ----------
// Generous per-IP buckets: friends on the same Wi-Fi share one IP.
const ipLimiter = new TokenBucket({ capacity: 150, refillPerSec: 40 });
const registerLimiter = new TokenBucket({ capacity: 15, refillPerSec: 15 / 600 }); // ~15 new nicknames / 10 min / IP
const createLimiter = new TokenBucket({ capacity: 10, refillPerSec: 10 / 60 }); // ~10 rooms / min / IP
const SSE_PER_IP = 40;
const sseCount = new Map();

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff) return xff.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

// ---------- SSE (data-free "doorbell": clients re-fetch their own state) ----------
const subs = { lobby: new Set(), room: new Map() };

function send(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    /* socket gone; close handler cleans up */
  }
}

onBump((scope, code) => {
  if (scope === "lobby") for (const res of subs.lobby) send(res, "bump", { scope: "lobby" });
  else {
    const set = subs.room.get(code);
    if (set) for (const res of set) send(res, "bump", { scope: "room" });
  }
});

function handleEvents(req, res, url) {
  const ip = clientIp(req);
  const scope = url.searchParams.get("scope");
  const code = (url.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (scope !== "lobby" && !(scope === "room" && code.length >= 4 && code.length <= 10)) {
    return json(res, 400, { error: { code: "BAD_REQUEST", message: "BAD_REQUEST" } });
  }
  const open = sseCount.get(ip) || 0;
  if (open >= SSE_PER_IP) return json(res, 429, { error: { code: "RATE_LIMITED", message: "Muitas conexões abertas. Feche algumas abas." } });
  sseCount.set(ip, open + 1);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  send(res, "ready", { scope });

  let set;
  if (scope === "lobby") set = subs.lobby;
  else {
    set = subs.room.get(code);
    if (!set) subs.room.set(code, (set = new Set()));
  }
  set.add(res);
  const hb = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      /* ignore */
    }
  }, 20_000);

  const cleanup = () => {
    clearInterval(hb);
    set.delete(res);
    if (scope === "room" && set.size === 0) subs.room.delete(code);
    const c = (sseCount.get(ip) || 1) - 1;
    if (c <= 0) sseCount.delete(ip);
    else sseCount.set(ip, c);
  };
  req.on("close", cleanup);
}

// ---------- RPC ----------
function json(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(s),
  });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new RpcError("PAYLOAD_TOO_LARGE", 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleRpc(req, res, url) {
  if (req.method !== "POST") return json(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "METHOD_NOT_ALLOWED" } });
  const ip = clientIp(req);
  if (!ipLimiter.take(ip)) {
    return json(res, 429, { error: { code: "RATE_LIMITED", message: "Muitas ações em pouco tempo. Aguarde um instante." } });
  }
  let body;
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch (e) {
    const status = e instanceof RpcError ? e.status : 400;
    return json(res, status, { error: { code: "BAD_REQUEST", message: "BAD_REQUEST" } });
  }
  // Accept POST /api/rpc/<fn> {args} or POST /api/rpc {fn, args}
  const fromPath = url.pathname.slice("/api/rpc".length).replace(/^\//, "");
  const fn = fromPath || (body && typeof body.fn === "string" ? body.fn : "");
  const args = fromPath ? body : body?.args;
  if (!RPC_NAMES.includes(fn)) return json(res, 404, { error: { code: "UNKNOWN_FUNCTION", message: "UNKNOWN_FUNCTION" } });
  if (fn === "register_guest" && !registerLimiter.take(ip)) {
    return json(res, 429, { error: { code: "RATE_LIMITED", message: "Muitos apelidos criados. Tente de novo em alguns minutos." } });
  }
  if (fn === "create_room" && !createLimiter.take(ip)) {
    return json(res, 429, { error: { code: "RATE_LIMITED", message: "Muitas salas criadas. Aguarde um minuto." } });
  }
  try {
    const data = rpc(fn, args);
    return json(res, 200, { data });
  } catch (e) {
    if (e instanceof RpcError) return json(res, e.status, { error: { code: e.code, message: e.code } });
    console.error(`[rpc ${fn}]`, e);
    return json(res, 500, { error: { code: "INTERNAL", message: "Erro interno no servidor." } });
  }
}

// ---------- static files + SPA fallback ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function serveFile(res, file, status = 200, req) {
  const ext = path.extname(file).toLowerCase();
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(status, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  if (req?.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

function handleStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    return res.end();
  }
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    rel = "/";
  }
  const file = path.normalize(path.join(DIST, rel));
  if (file.startsWith(DIST + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return serveFile(res, file, 200, req);
  }
  const index = path.join(DIST, "index.html");
  if (!fs.existsSync(index)) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Build não encontrado. Rode `npm install` (que executa `npm run build`) antes de `npm start`.");
  }
  // Missing asset files are real 404s; every other path is an app route (/, /sala/ABC123, …).
  if (rel.startsWith("/assets/")) {
    res.writeHead(404);
    return res.end();
  }
  return serveFile(res, index, 200, req);
}

// ---------- server ----------
export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/api/rpc" || url.pathname.startsWith("/api/rpc/")) {
      handleRpc(req, res, url).catch((e) => {
        console.error(e);
        if (!res.headersSent) json(res, 500, { error: { code: "INTERNAL", message: "Erro interno no servidor." } });
      });
      return;
    }
    if (url.pathname === "/api/events") return handleEvents(req, res, url);
    if (url.pathname === "/api/health") return json(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: { code: "NOT_FOUND", message: "NOT_FOUND" } });
    return handleStatic(req, res, url);
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const server = createServer();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  const sweeper = setInterval(sweep, 3_000);
  const limiterGc = setInterval(() => {
    ipLimiter.gc();
    registerLimiter.gc();
    createLimiter.gc();
  }, 60_000);
  server.listen(PORT, HOST, () => console.log(`UNO Pro ouvindo em http://${HOST}:${PORT}`));
  const stop = () => {
    clearInterval(sweeper);
    clearInterval(limiterGc);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}