// Bridge the existing Release Center to the existing private MCP operator.
// Configuration is administrative; request/model input cannot select a host,
// credential, shell command, or register a new deployment lot.
export type HostAction = "build" | "homologate" | "publish" | "rollback" | "releaseStatus";
export type HostReceipt = {
  lot: string;
  sha: string;
  build: Record<string, string>;
  homolog: Record<string, string>;
  tests?: Record<string, string>;
  production: Record<string, string>;
  activeImageId: string;
};

export function releaseBinding(releaseId: string, sha: string, policyText?: string): string {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("VENDI_RELEASE_SHA_INVALID");
  let policy: unknown;
  try { policy = JSON.parse(policyText ?? "null"); } catch { throw new Error("VENDI_RELEASE_BINDING_INVALID"); }
  if (!policy || typeof policy !== "object" || Array.isArray(policy) || !Object.hasOwn(policy, releaseId)) {
    throw new Error("VENDI_RELEASE_BINDING_REQUIRED");
  }
  const binding = (policy as Record<string, {lot?: string; sha?: string}>)[releaseId];
  if (!binding || binding.sha !== sha || !/^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$/.test(binding.lot ?? "")) {
    throw new Error("VENDI_RELEASE_BINDING_MISMATCH");
  }
  return binding.lot!;
}

export async function callReleaseOperator(action: HostAction, lot: string, options: {
  url?: string; token?: string; fetcher?: typeof fetch;
} = {}): Promise<string> {
  if (!/^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$/.test(lot)) throw new Error("VENDI_RELEASE_LOT_INVALID");
  const url = options.url ?? process.env["VENDI_RELEASE_MCP_URL"];
  const token = options.token ?? process.env["VENDI_RELEASE_MCP_OAUTH_TOKEN"];
  if (!url || !token) throw new Error("VENDI_RELEASE_MCP_NOT_CONFIGURED");
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) {
    throw new Error("VENDI_RELEASE_MCP_URL_INVALID");
  }
  const response = await (options.fetcher ?? fetch)(endpoint, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(180000),
    headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream"},
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: "vendi_contabo_operate", arguments: {action, lot}}}),
  });
  if (!response.ok) throw new Error("VENDI_RELEASE_MCP_HTTP_" + response.status);
  const raw = await response.text();
  if (raw.length > 262144) throw new Error("VENDI_RELEASE_MCP_RESPONSE_TOO_LARGE");
  const messages = response.headers.get("content-type")?.includes("text/event-stream")
    ? raw.split("\n").filter(line => line.startsWith("data:")).map(line => JSON.parse(line.slice(5)))
    : [JSON.parse(raw)];
  const result = messages.find(message => message.id === 1);
  if (!result || result.error || result.result?.isError) throw new Error("VENDI_RELEASE_MCP_DENIED_OR_FAILED");
  const text = result.result?.content?.find((item: {type: string}) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error("VENDI_RELEASE_MCP_RESPONSE_INVALID");
  const payload = JSON.parse(text);
  if (payload.action !== action || payload.lot !== lot || typeof payload.output !== "string") throw new Error("VENDI_RELEASE_MCP_RESPONSE_MISMATCH");
  return payload.output;
}

export function hostReceipt(output: string, lot: string, sha: string): HostReceipt {
  const records = output.split(/\r?\n/).filter(line => line.startsWith("RELEASE_RECEIPT_JSON="));
  if (records.length !== 1) throw new Error("VENDI_RELEASE_RECEIPT_REQUIRED");
  const receipt = JSON.parse(records[0]!.slice("RELEASE_RECEIPT_JSON=".length)) as HostReceipt;
  if (receipt.lot !== lot || receipt.sha !== sha || !receipt.build || !receipt.homolog || !receipt.production) {
    throw new Error("VENDI_RELEASE_RECEIPT_MISMATCH");
  }
  return receipt;
}

export function requireHomologated(receipt: HostReceipt, now = Date.now()): void {
  const {lot, sha, build, homolog} = receipt;
  const at = Number(homolog.AT_EPOCH) * 1000;
  if (build.SHA !== sha || build.STATUS !== "BUILT_NOT_DEPLOYED" || homolog.LOT !== lot || homolog.SHA !== sha ||
      homolog.STATUS !== "HOMOLOGATED" || homolog.MODE !== "ISOLATED_READONLY" ||
      !/^sha256:[0-9a-f]{64}$/.test(build.IMAGE_ID ?? "") || homolog.IMAGE_ID !== build.IMAGE_ID ||
      build.IMAGE !== homolog.IMAGE || !Number.isFinite(at) || at > now || now - at > 86400000) {
    throw new Error("VENDI_RELEASE_HOMOLOGATION_NOT_VERIFIED");
  }
}

export function requirePublished(receipt: HostReceipt): void {
  if (receipt.production.STATUS !== "PUBLISHED" || receipt.production.SHA !== receipt.sha ||
      !/^sha256:[0-9a-f]{64}$/.test(receipt.production.IMAGE_ID ?? "") ||
      receipt.production.IMAGE_ID !== receipt.activeImageId) throw new Error("VENDI_RELEASE_PUBLICATION_NOT_VERIFIED");
}

export function requireTested(receipt: HostReceipt, now = Date.now()): void {
  const {lot, sha, build, tests} = receipt;
  const at = Number(tests?.AT_EPOCH) * 1000;
  if (build.SHA !== sha || build.STATUS !== "BUILT_NOT_DEPLOYED" || tests?.LOT !== lot || tests.SHA !== sha ||
      tests.STATUS !== "PASSED" || tests.SUITE !== "api,mcp,operator,rollback,migrations" ||
      !/^sha256:[0-9a-f]{64}$/.test(build.IMAGE_ID ?? "") || tests.IMAGE_ID !== build.IMAGE_ID ||
      !Number.isFinite(at) || at > now || now - at > 86400000) {
    throw new Error("VENDI_RELEASE_TESTS_NOT_VERIFIED");
  }
}
