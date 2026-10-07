// Release marker: Arqdor Ambiente Real functional flow 2026-10-07.
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";

const port = Number(process.env.PORT || 3000);
const host = "0.0.0.0";
const publicDir = resolve(process.cwd(), "artifacts/frontend/dist/public");
const apiOrigin = process.env.API_ORIGIN || "https://vendorai-platform-replit-production.up.railway.app";
const obrasGovOrigin = "https://api-publica.obrasgov.gestao.gov.br";

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^([.][.][/\\])+/, "");
  const candidate = resolve(publicDir, `.${sep}${normalized}`);
  return candidate === publicDir || candidate.startsWith(`${publicDir}${sep}`) ? candidate : null;
}

function sendFile(res, filePath, { immutable = false } = {}) {
  const stat = statSync(filePath);
  const ext = extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
  res.setHeader("Content-Length", stat.size);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Cache-Control",
    immutable ? "public, max-age=31536000, immutable" : "private, no-store, max-age=0, must-revalidate",
  );
  createReadStream(filePath).pipe(res);
}

function copyProxyHeaders(source, res) {
  for (const [key, value] of source.headers) {
    const lower = key.toLowerCase();
    if (["connection", "content-length", "content-encoding", "transfer-encoding"].includes(lower)) continue;
    res.setHeader(key, value);
  }
}

async function proxyRequest(req, res, targetUrl) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    const lower = key.toLowerCase();
    if (["host", "connection", "content-length", "transfer-encoding"].includes(lower)) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = req.method || "GET";
  const init = { method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(method)) {
    init.body = req;
    init.duplex = "half";
  }

  const upstream = await fetch(targetUrl, init);
  res.statusCode = upstream.status;
  copyProxyHeaders(upstream, res);

  if (!upstream.body || method === "HEAD" || upstream.status === 204 || upstream.status === 304) {
    res.end();
    return;
  }

  Readable.fromWeb(upstream.body).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ ok: true, service: "vendorai-frontend" }));
      return;
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const target = new URL(`${url.pathname}${url.search}`, apiOrigin);
      await proxyRequest(req, res, target);
      return;
    }

    if (url.pathname === "/obrasgov" || url.pathname.startsWith("/obrasgov/")) {
      const suffix = url.pathname.slice("/obrasgov".length);
      const target = new URL(`/obras${suffix}${url.search}`, obrasGovOrigin);
      await proxyRequest(req, res, target);
      if (!res.headersSent) res.setHeader("Cache-Control", "private, max-age=60");
      return;
    }

    const filePath = safeFilePath(url.pathname);
    if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
      sendFile(res, filePath, { immutable: url.pathname.startsWith("/assets/") });
      return;
    }

    const indexPath = join(publicDir, "index.html");
    if (!existsSync(indexPath)) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Frontend build not found");
      return;
    }

    sendFile(res, indexPath);
  } catch (error) {
    console.error("frontend-server-error", error);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ error: "FRONTEND_PROXY_ERROR" }));
  }
});

server.listen(port, host, () => {
  console.log(`VendorAI frontend listening on http://${host}:${port}`);
  console.log(`Static directory: ${publicDir}`);
  console.log(`API proxy: ${apiOrigin}`);
});
