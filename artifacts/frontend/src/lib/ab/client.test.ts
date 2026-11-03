import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  AbApiError,
  atualizarCargo,
  criarCargo,
  listarCargos,
  mensagemDoErro,
  type AbAuth,
} from "./client";

const auth: AbAuth = { token: "jwt-de-teste", tenantId: "hotel-123" };

const linhaArroz = {
  id: "cargo-1",
  tenant_id: "hotel-123",
  nome: "Chefe de Cozinha",
  setor: "cozinha",
  descricao: "Responde pela produção quente",
  ativo: true,
  created_at: "2026-11-01T10:00:00.000Z",
  updated_at: "2026-11-01T10:00:00.000Z",
};

function respostaJson(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("client A&B — cargos", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lista cargos e converte snake_case para camelCase", async () => {
    fetchMock.mockResolvedValue(respostaJson([linhaArroz]));

    const cargos = await listarCargos(auth);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tenants/hotel-123/ab/cargos",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer jwt-de-teste" }),
      }),
    );
    expect(cargos).toEqual([
      {
        id: "cargo-1",
        tenantId: "hotel-123",
        nome: "Chefe de Cozinha",
        setor: "cozinha",
        descricao: "Responde pela produção quente",
        ativo: true,
        createdAt: "2026-11-01T10:00:00.000Z",
        updatedAt: "2026-11-01T10:00:00.000Z",
      },
    ]);
  });

  it("repassa filtros como query string", async () => {
    fetchMock.mockResolvedValue(respostaJson([]));

    await listarCargos(auth, { ativo: false, setor: "bar" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/tenants/hotel-123/ab/cargos?ativo=false&setor=bar",
    );
  });

  it("codifica o tenant na URL", async () => {
    fetchMock.mockResolvedValue(respostaJson([]));

    await listarCargos({ token: "t", tenantId: "hotel com espaço" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/tenants/hotel%20com%20espa%C3%A7o/ab/cargos",
    );
  });

  it("cria cargo com POST e corpo JSON", async () => {
    fetchMock.mockResolvedValue(respostaJson(linhaArroz, 201));

    const cargo = await criarCargo(auth, {
      nome: "Chefe de Cozinha",
      setor: "cozinha",
      descricao: null,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      nome: "Chefe de Cozinha",
      setor: "cozinha",
      descricao: null,
    });
    expect(cargo.nome).toBe("Chefe de Cozinha");
  });

  it("atualiza cargo com PATCH no id certo", async () => {
    fetchMock.mockResolvedValue(respostaJson({ ...linhaArroz, ativo: false }));

    const cargo = await atualizarCargo(auth, "cargo-1", { ativo: false });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/tenants/hotel-123/ab/cargos/cargo-1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(cargo.ativo).toBe(false);
  });

  it("traduz 409 (nome duplicado) para mensagem em pt-BR", async () => {
    fetchMock.mockResolvedValue(
      respostaJson({ error: "Cargo with this name already exists for this hotel" }, 409),
    );

    await expect(
      criarCargo(auth, { nome: "Chefe de Cozinha", setor: "cozinha" }),
    ).rejects.toMatchObject({
      name: "AbApiError",
      status: 409,
      message: expect.stringContaining("Já existe um cargo com esse nome"),
    });
  });

  it("expõe os campos inválidos devolvidos em 422", async () => {
    fetchMock.mockResolvedValue(
      respostaJson({ error: "Invalid cargo", fields: ["nome", "setor"] }, 422),
    );

    const erro = await criarCargo(auth, { nome: "", setor: "" }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AbApiError);
    expect((erro as AbApiError).status).toBe(422);
    expect((erro as AbApiError).fields).toEqual(["nome", "setor"]);
    expect(mensagemDoErro(erro)).toContain("campos: nome, setor");
  });

  it("não chama a rede quando faltam credenciais", async () => {
    await expect(listarCargos({ token: "", tenantId: "hotel-123" })).rejects.toMatchObject({
      status: 401,
    });
    await expect(listarCargos({ token: "t", tenantId: "" })).rejects.toMatchObject({
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("converte falha de rede em erro tratável", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(listarCargos(auth)).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("Não foi possível conectar"),
    });
  });
});
