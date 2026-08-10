import { describe, expect, it } from "vitest";
import { isSentProposalStatus, requiresSentProposalContext } from "./scoutBudgetGuard.js";

describe("Revenue Scout budget message guard", () => {
  it("requires a sent proposal for budget follow-up opportunities", () => {
    expect(requiresSentProposalContext("orcamento_parado", "Temos uma novidade para você")).toBe(true);
  });

  it("detects misconfigured messages that mention a quote or proposal", () => {
    expect(requiresSentProposalContext("reativacao", "Seu orçamento foi atualizado")).toBe(true);
    expect(requiresSentProposalContext("reativacao", "Podemos revisar a proposta?")).toBe(true);
  });

  it("does not block unrelated messages", () => {
    expect(requiresSentProposalContext("reativacao", "Temos novidades para você")).toBe(false);
  });

  it("only treats an actually sent proposal as eligible", () => {
    expect(isSentProposalStatus("enviada")).toBe(true);
    expect(isSentProposalStatus("pendente")).toBe(false);
    expect(isSentProposalStatus("rascunho")).toBe(false);
    expect(isSentProposalStatus(null)).toBe(false);
  });
});
