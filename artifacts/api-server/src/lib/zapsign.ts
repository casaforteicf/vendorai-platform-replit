import { logger } from "./logger.js";

const BASE_URL = "https://api.zapsign.com.br/api/v1";

function getApiKey(): string | null {
  return process.env.ZAPSIGN_API_KEY ?? null;
}

export function isZapSignConfigured(): boolean {
  return !!getApiKey();
}

async function zapRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("ZAPSIGN_API_KEY not configured");

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json()) as unknown;

  if (!res.ok) {
    const msg = (data as any)?.detail ?? (data as any)?.message ?? `ZapSign error ${res.status}`;
    logger.warn({ status: res.status, path, body: data }, `ZapSign error: ${msg}`);
    throw new Error(msg);
  }

  return data as T;
}

export interface ZapSignSigner {
  name: string;
  email: string;
}

export interface ZapSignDocInput {
  name: string;
  lang?: "pt-BR" | "en" | "es";
  signers: ZapSignSigner[];
  content_base64?: string;
  template_id?: string;
}

export interface ZapSignDocOutput {
  open_id: number;
  token: string;
  name: string;
  status: string;
  signers: {
    token: string;
    name: string;
    email: string;
    sign_url: string;
    status: string;
  }[];
}

export async function createDocument(input: ZapSignDocInput): Promise<ZapSignDocOutput> {
  return zapRequest<ZapSignDocOutput>("POST", "/docs/", input);
}
