import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../dist/public");
const port = Number(process.env.PORT || 3000);
const apiOrigin = (process.env.API_ORIGIN || "https://vendorai-platform-replit-production.up.railway.app").replace(/\/$/, "");
const obrasOrigin = "https://api-publica.obrasgov.gestao.gov.br";

const mime = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"], [".png", "image/png"], [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"], [".webp", "image/webp"], [".ico", "image/x-icon"],
  [".woff", "font/woff"], [".woff2", "font/woff2"], [".map", "application/json; charset=utf-8"],
]);

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
  res.statusCode = 200;
  res.setHeader("Content-Type", mime.get(ext) || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", immutable
    ? "public, max-age=31536000, immutable"
    : "private, no-store, max-age=0, must-revalidate");
  fs.createReadStream(filePath).pipe(res);
}

async function proxy(req, res, targetUrl) {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      if (["host", "content-length", "connection"].includes(key.toLowerCase())) continue;
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    headers.set("X-Original-Host", String(req.headers.host || "app.appvendorai.com").split(":")[0]);

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : body,
      redirect: "manual",
    });

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (["content-encoding", "content-length", "transfer-encoding", "connection"].includes(key.toLowerCase())) return;
      res.setHeader(key, value);
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (error) {
    console.error("frontend proxy error", error);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "UPSTREAM_UNAVAILABLE" }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, service: "vendorai-frontend" }));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    await proxy(req, res, `${apiOrigin}${url.pathname}${url.search}`);
    return;
  }

  if (url.pathname.startsWith("/obrasgov/")) {
    const suffix = url.pathname.slice("/obrasgov".length);
    await proxy(req, res, `${obrasOrigin}/obras${suffix}${url.search}`);
    return;
  }

  const decoded = decodeURIComponent(url.pathname);
  const candidate = path.resolve(publicDir, `.${decoded}`);
  if (candidate.startsWith(publicDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    sendFile(res, candidate);
    return;
  }

  const indexPath = path.join(publicDir, "index.html");
  if (fs.existsSync(indexPath)) {
    sendFile(res, indexPath);
    return;
  }

  res.statusCode = 503;
  res.end("Frontend build unavailable");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`VendorAI frontend listening on :${port}`);
});
