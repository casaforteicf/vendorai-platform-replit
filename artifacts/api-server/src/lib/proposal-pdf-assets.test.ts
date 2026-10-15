import { afterEach, describe, expect, it, vi } from "vitest";
import { embedProposalStorageImages, proposalStorageAssetUrl } from "./proposal-pdf-assets.js";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("imagens autenticadas no PDF", () => {
  it("incorpora capa e logo sem armazenar a sessão no documento", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([137,80,78,71]), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("PORT", "5000");
    const output = await embedProposalStorageImages('<img src="/objects/uploads/tenant/logo"><img src="/api/storage/objects/uploads/tenant/cover">', { authorization: "Bearer test-session", cookie: "test-cookie=1" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:5000/api/storage/objects/uploads/tenant/logo", expect.objectContaining({
      headers: { Authorization: "Bearer test-session", Cookie: "test-cookie=1" }, redirect: "manual",
    }));
    expect(output.match(/data:image\/png;base64,/g)).toHaveLength(2);
    expect(output).not.toContain("test-session");
    expect(output).not.toContain("test-cookie");
  });
  it("deduplica a mesma imagem no rodapé, capa e CSS", async () => {
    const fetcher = vi.fn(async () => new Response("png", { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetcher);
    const html = '<img src="/objects/uploads/logo"><img src="/objects/uploads/logo"><div style="background:url(\'/objects/uploads/logo\')"></div>';
    const output = await embedProposalStorageImages(html);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(output.match(/data:image\/png;base64,/g)).toHaveLength(3);
  });
  it("não envia credenciais para hosts externos, caminhos privados arbitrários ou URLs de dados", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const html = '<img src="https://externo.invalid/api/storage/objects/logo"><img src="data:image/png;base64,AA=="><img src="http://localhost:22/admin">';
    expect(await embedProposalStorageImages(html, { authorization: "Bearer test" })).toBe(html);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([403,404,423,302])("não exporta silenciosamente imagem ausente/bloqueada (HTTP %s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
    await expect(embedProposalStorageImages('<img src="/objects/uploads/logo">')).rejects.toThrow("capa ou logo");
  });
  it("rejeita HTML de login no lugar da imagem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("login", { headers: { "content-type": "text/html" } })));
    await expect(embedProposalStorageImages('<img src="/objects/logo">')).rejects.toThrow("formato inválido");
  });
  it("resolve caminhos antigos e origem oficial para o storage local", () => {
    vi.stubEnv("PORT","8080"); vi.stubEnv("BASE_PATH","/app");
    expect(proposalStorageAssetUrl("https://app.appvendorai.com/api/storage/public-objects/objects/uploads/logo"))
      .toBe("http://127.0.0.1:8080/app/api/storage/objects/uploads/logo");
    expect(proposalStorageAssetUrl("/app/api/storage/objects/uploads/logo"))
      .toBe("http://127.0.0.1:8080/app/api/storage/objects/uploads/logo");
  });
  it("recusa imagem acima do limite", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("png", { headers: { "content-type": "image/png", "content-length": "20000000" } })));
    await expect(embedProposalStorageImages('<img src="/objects/logo">')).rejects.toThrow("muito grande");
  });
});
