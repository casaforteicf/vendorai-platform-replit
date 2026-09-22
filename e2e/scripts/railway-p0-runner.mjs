import { spawn } from "node:child_process";
import http from "node:http";

const port = Number(process.env.PORT || 8080);
const startedAt = new Date().toISOString();
let finishedAt = null;
let exitCode = null;
let state = "running";

const child = spawn(
  "pnpm",
  ["--filter", "@workspace/e2e", "run", "test:p0p1"],
  {
    cwd: "/workspace",
    env: { ...process.env, CI: "1" },
    stdio: "inherit",
  },
);

child.on("exit", (code) => {
  exitCode = code ?? 1;
  finishedAt = new Date().toISOString();
  state = exitCode === 0 ? "passed" : "failed";
  console.log(`[e2e-runner] P0+P1 concluído: ${state} (exit=${exitCode})`);
});

child.on("error", (error) => {
  exitCode = 1;
  finishedAt = new Date().toISOString();
  state = "failed";
  console.error("[e2e-runner] erro ao iniciar Playwright", error);
});

const server = http.createServer((req, res) => {
  const payload = JSON.stringify({ state, exitCode, startedAt, finishedAt });
  res.setHeader("content-type", "application/json; charset=utf-8");

  if (req.url === "/health") {
    res.statusCode = state === "passed" ? 200 : state === "running" ? 202 : 503;
    res.end(payload);
    return;
  }

  if (req.url === "/result") {
    res.statusCode = 200;
    res.end(payload);
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify({
    service: "vendorai-e2e-p0p1",
    endpoints: ["/health", "/result"],
    ...JSON.parse(payload),
  }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(
    `[e2e-runner] health server em :${port}; iniciando P0+P1 contra ${process.env.E2E_BASE_URL || "https://app.appvendorai.com"}`,
  );
});
