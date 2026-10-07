import fs from "node:fs";
import { Client } from "ssh2";

export type ServerAgentMode = "read" | "write";

export interface ServerAgentExecutionInput {
  command: string;
  mode: ServerAgentMode;
  timeoutMs?: number;
}

export interface ServerAgentExecutionResult {
  ok: boolean;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  host: string;
  user: string;
}

const OUTPUT_LIMIT = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

function configuredHost() {
  return String(process.env["SERVER_AGENT_HOST"] ?? "").trim();
}

function configuredPort() {
  const value = Number(process.env["SERVER_AGENT_PORT"] ?? 22);
  return Number.isFinite(value) && value > 0 ? value : 22;
}

function configuredUser() {
  return String(process.env["SERVER_AGENT_USER"] ?? "").trim();
}

function privateKey() {
  const inline = String(process.env["SERVER_AGENT_PRIVATE_KEY"] ?? "").trim();
  if (inline) {
    if (inline.includes("BEGIN ")) return inline;
    try {
      return Buffer.from(inline, "base64").toString("utf8");
    } catch {
      return inline;
    }
  }

  const path = String(process.env["SERVER_AGENT_PRIVATE_KEY_PATH"] ?? "").trim();
  if (path) return fs.readFileSync(path, "utf8");
  return "";
}

export function serverAgentConfigured() {
  return Boolean(configuredHost() && configuredUser() && privateKey());
}

export function serverAgentStatus() {
  return {
    configured: serverAgentConfigured(),
    host: configuredHost() || null,
    port: configuredPort(),
    user: configuredUser() || null,
    approvalRequiredForWrites: true,
    outputLimitBytes: OUTPUT_LIMIT,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

function assertCommand(command: string, mode: ServerAgentMode) {
  const trimmed = command.trim();
  if (!trimmed) throw new Error("SERVER_AGENT_EMPTY_COMMAND");
  if (trimmed.length > 6000) throw new Error("SERVER_AGENT_COMMAND_TOO_LONG");
  if (/\0/.test(trimmed)) throw new Error("SERVER_AGENT_INVALID_COMMAND");

  const blocked = [
    /(^|\s)rm\s+-rf\s+\/$/i,
    /(^|\s)mkfs(?:\.|\s)/i,
    /(^|\s)(?:shutdown|reboot|poweroff|halt)(?:\s|$)/i,
    /(^|\s)dd\s+if=/i,
    /:(){:|:&};:/,
  ];
  if (blocked.some((pattern) => pattern.test(trimmed))) {
    throw new Error("SERVER_AGENT_COMMAND_BLOCKED");
  }

  if (mode === "read") {
    const writeSignals = [
      /(^|[;&|]\s*)(?:sudo\s+)?(?:rm|mv|cp|chmod|chown|mkdir|touch|tee|truncate|systemctl|docker\s+(?:run|rm|stop|restart|kill|build|pull|push|tag)|git\s+(?:checkout|switch|reset|clean|pull|merge|rebase|cherry-pick)|pnpm\s+(?:install|add|remove)|npm\s+(?:install|i|uninstall))\b/i,
      />{1,2}\s*[^&]/,
    ];
    if (writeSignals.some((pattern) => pattern.test(trimmed))) {
      throw new Error("SERVER_AGENT_WRITE_COMMAND_REQUIRES_WRITE_MODE");
    }
  }

  return trimmed;
}

function appendLimited(current: string, next: Buffer | string) {
  const value = current + String(next);
  if (Buffer.byteLength(value, "utf8") <= OUTPUT_LIMIT) return value;
  const buffer = Buffer.from(value, "utf8");
  return buffer.subarray(buffer.length - OUTPUT_LIMIT).toString("utf8");
}

export async function executeServerCommand(input: ServerAgentExecutionInput): Promise<ServerAgentExecutionResult> {
  if (!serverAgentConfigured()) throw new Error("SERVER_AGENT_NOT_CONFIGURED");

  const command = assertCommand(input.command, input.mode);
  const host = configuredHost();
  const port = configuredPort();
  const username = configuredUser();
  const key = privateKey();
  const timeoutMs = Math.min(Math.max(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 3_000), 300_000);
  const startedAt = Date.now();

  return await new Promise<ServerAgentExecutionResult>((resolve, reject) => {
    const client = new Client();
    let settled = false;
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.end();
      reject(new Error("SERVER_AGENT_TIMEOUT"));
    }, timeoutMs);

    const finish = (result: ServerAgentExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end();
      resolve(result);
    };

    client
      .on("ready", () => {
        client.exec(`bash -lc ${JSON.stringify(command)}`, (error, stream) => {
          if (error) {
            clearTimeout(timer);
            settled = true;
            client.end();
            reject(error);
            return;
          }

          let exitCode: number | null = null;
          let signal: string | null = null;

          stream.on("data", (chunk: Buffer) => {
            stdout = appendLimited(stdout, chunk);
          });

          stream.stderr.on("data", (chunk: Buffer) => {
            stderr = appendLimited(stderr, chunk);
          });

          stream.on("exit", (code: number | null, exitSignal?: string) => {
            exitCode = code;
            signal = exitSignal ?? null;
          });

          stream.on("close", () => {
            finish({
              ok: exitCode === 0,
              exitCode,
              signal,
              stdout,
              stderr,
              durationMs: Date.now() - startedAt,
              host,
              user: username,
            });
          });
        });
      })
      .on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      })
      .connect({
        host,
        port,
        username,
        privateKey: key,
        readyTimeout: Math.min(timeoutMs, 20_000),
        keepaliveInterval: 10_000,
        keepaliveCountMax: 2,
      });
  });
}
