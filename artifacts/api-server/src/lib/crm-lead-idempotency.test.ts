import { describe, expect, it } from "vitest";
import {
  fingerprintRegistrationPayload,
  matchesRegistrationReplay,
  parseRegistrationRequestId,
} from "./crm-lead-idempotency.js";

describe("CRM V4-01 — cadastro de lead idempotente", () => {
  const id = "a8114f4c-0c4f-4c33-8d12-f22673d9c5a1";

  it("aceita UUID e normaliza caixa", () => {
    expect(parseRegistrationRequestId(id.toUpperCase())).toBe(id);
    expect(parseRegistrationRequestId(undefined)).toBeNull();
  });

  it("recusa identificadores inválidos em vez de descartar a proteção", () => {
    expect(() => parseRegistrationRequestId("1")).toThrow("Identificador de solicitação inválido");
    expect(() => parseRegistrationRequestId({ id })).toThrow();
  });

  it("gera hash estável mesmo com propriedades reordenadas", () => {
    const a = { tenantId: "t", nome: "Cliente", metadata: { registrationRequestId: id, cupom: "X" } };
    const b = { metadata: { cupom: "X", registrationRequestId: id }, nome: "Cliente", tenantId: "t" };
    expect(fingerprintRegistrationPayload(a)).toBe(fingerprintRegistrationPayload(b));
  });

  it("não aceita a mesma chave com payload diferente", () => {
    const hash = fingerprintRegistrationPayload({ nome: "Primeiro" });
    const anotherHash = fingerprintRegistrationPayload({ nome: "Segundo" });
    expect(matchesRegistrationReplay({ registrationActorId: "u1", registrationPayloadHash: hash }, "u1", anotherHash)).toBe(false);
  });

  it("não permite reaproveitar solicitação pertencente a outro usuário", () => {
    const hash = fingerprintRegistrationPayload({ nome: "Cliente" });
    const metadata = { registrationActorId: "u1", registrationPayloadHash: hash };
    expect(matchesRegistrationReplay(metadata, "u2", hash)).toBe(false);
    expect(matchesRegistrationReplay(metadata, "u1", hash)).toBe(true);
  });
});
