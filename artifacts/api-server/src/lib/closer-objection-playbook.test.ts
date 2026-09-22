import { describe, expect, it } from "vitest";
import {
  CLOSER_OBJECTION_PLAYBOOK_PROMPT,
  UNIVERSAL_OBJECTION_PLAYBOOK,
} from "./closer-objection-playbook.js";

describe("closer objection playbook", () => {
  it("covers the 10 universal objections", () => {
    expect(UNIVERSAL_OBJECTION_PLAYBOOK).toHaveLength(10);
    expect(new Set(UNIVERSAL_OBJECTION_PLAYBOOK.map((item) => item.id)).size).toBe(10);
  });

  it("injects LAER and truthfulness guardrails", () => {
    expect(CLOSER_OBJECTION_PLAYBOOK_PROMPT).toContain("LAER");
    expect(CLOSER_OBJECTION_PLAYBOOK_PROMPT).toContain("Escassez e urgência só podem ser usadas");
    expect(CLOSER_OBJECTION_PLAYBOOK_PROMPT).toContain("Nunca invente desconto");
    expect(CLOSER_OBJECTION_PLAYBOOK_PROMPT).toContain("Está caro");
    expect(CLOSER_OBJECTION_PLAYBOOK_PROMPT).toContain("Vou pensar");
    expect(CLOSER_OBJECTION_PLAYBOOK_PROMPT).toContain("Não preciso disso");
  });

  it("keeps tenant-specific facts out of the universal data", () => {
    const serialized = JSON.stringify(UNIVERSAL_OBJECTION_PLAYBOOK);
    expect(serialized).not.toMatch(/R\$\s*\d/);
    expect(serialized).not.toMatch(/\+\d+\s*clientes/i);
  });
});
