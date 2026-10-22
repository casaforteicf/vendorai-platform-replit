import { afterEach, describe, expect, it, vi } from "vitest";

// These tests exercise OAuth URLs and Graph response handling without database access.
vi.mock("@workspace/db", () => ({ db: {}, whatsappConnectionsTable: {}, agentConfigsTable: {}, usersTable: {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("WhatsApp OAuth", () => {
  it("usa o Embedded Signup configurado no Railway", async () => {
    vi.stubEnv("WHATSAPP_APP_ID", "123456789");
    vi.stubEnv("WHATSAPP_APP_SECRET", "test-app-secret");
    vi.stubEnv("WHATSAPP_EMBEDDED_CONFIG_ID", "config-456");
    vi.resetModules();

    const { buildWhatsappOAuthUrl } = await import("../services/whatsapp-oauth.js");
    const url = new URL(buildWhatsappOAuthUrl("tenant-1", "state-1"));

    expect(url.searchParams.get("client_id")).toBe("123456789");
    expect(url.searchParams.get("config_id")).toBe("config-456");
    expect(url.searchParams.get("override_default_response_type")).toBe("true");
  });

  it("procura o telefone em todas as contas WhatsApp autorizadas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: "phone-2",
          display_phone_number: "+55 49 99999-9999",
          verified_name: "Farmacia Sao Rafael",
        }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { findWhatsappPhoneNumber } = await import("../services/whatsapp-oauth.js");
    const result = await findWhatsappPhoneNumber([
      { id: "waba-1", name: "Conta sem telefone" },
      { id: "waba-2", name: "Conta com telefone" },
    ], "access-token");

    expect(result?.waba.id).toBe("waba-2");
    expect(result?.phone.id).toBe("phone-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("diferencia falha da API de uma conta realmente sem telefone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));

    const { findWhatsappPhoneNumber } = await import("../services/whatsapp-oauth.js");

    await expect(findWhatsappPhoneNumber([
      { id: "waba-1", name: "Conta sem permissao" },
    ], "access-token")).rejects.toThrow("Nao foi possivel consultar");
  });
});
