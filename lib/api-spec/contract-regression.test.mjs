import test from "node:test";
import assert from "node:assert/strict";
import { CreateLeadBody, CreateDealBody, UpdateTenantBody } from "../api-zod/src/generated/api.ts";

test("lead creation preserves assignment, representative and registration metadata", () => {
  const input = {
    tenantId: "tenant-contract-test", nome: "Cliente de teste",
    assignedTo: "user-test", representativeFunctionId: "function-test",
    instagramHandle: "cliente", tipoPessoa: "fisica", mercadoSegmento: "construcao",
    source: "manual", metadata: { registrationRequestId: "request-test" },
  };
  assert.deepEqual(CreateLeadBody.parse(input), input);
});

test("deal creation retains the responsible user and numeric value", () => {
  const input = { tenantId: "tenant-contract-test", titulo: "Teste", assignedTo: "user-test", valor: 1234.56 };
  assert.deepEqual(CreateDealBody.parse(input), input);
  assert.equal(CreateDealBody.safeParse({ ...input, valor: "1234.56" }).success, false);
});

test("tenant updates retain brand and opt-in partner settings", () => {
  const input = { corPrimaria: "#123456", parceiroRedeAtivo: false, parceiroCategorias: ["construcao"] };
  assert.deepEqual(UpdateTenantBody.parse(input), input);
});
