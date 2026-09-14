import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../dist/public");
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const relative = decoded.replace(/^\/+/, "");
  const candidate = path.resolve(root, relative);
  if (!candidate.startsWith(root)) return null;
  return candidate;
}

function sendFile(res, filePath, method) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return false;
  const type = contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "content-length": stat.size,
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=300",
  });
  if (method === "HEAD") return res.end(), true;
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer((req, res) => {
  try {
    const method = req.method || "GET";
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      return res.end("Method Not Allowed");
    }

    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    let candidate = safePath(pathname);
    if (!candidate) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      return res.end("Bad Request");
    }

    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      candidate = path.join(candidate, "index.html");
    }

    if (fs.existsSync(candidate) && sendFile(res, candidate, method)) return;

    const prerendered = path.join(root, pathname.replace(/^\/+/, ""), "index.html");
    if (prerendered.startsWith(root) && fs.existsSync(prerendered) && sendFile(res, prerendered, method)) return;

    const fallback = path.join(root, "index.html");
    if (fs.existsSync(fallback) && sendFile(res, fallback, method)) return;

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  } catch (error) {
    console.error("[website-static-server] request failed", error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[website-static-server] serving ${root} on 0.0.0.0:${port}`);
});
