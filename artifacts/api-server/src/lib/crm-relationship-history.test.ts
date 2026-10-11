import { describe, expect, it } from "vitest";
import { appendRelationshipEvent } from "./crm-relationship-history.js";

describe("CRM V4-01 — histórico e compatibilidade de vínculos", () => {
  it("registra novos vínculos sem inventar uma origem legada", () => {
    const metadata = appendRelationshipEvent(undefined, "linked", "u1");
    expect(metadata.inactive).toBe(false);
    expect(metadata.relationshipHistory).toHaveLength(1);
    expect(metadata.relationshipHistory[0].action).toBe("linked");
  });

  it("preserva legado sem inventar data ou responsável original", () => {
    const metadata = appendRelationshipEvent({ legacyRelationship: true }, "updated", "u2");
    expect(metadata.relationshipHistory).toHaveLength(2);
    expect(metadata.relationshipHistory[0]).toEqual({ action: "legacy_existing", at: null, actorId: null });
    expect(metadata.relationshipHistory[1].action).toBe("updated");
  });

  it("não duplica marcador legado nas próximas atualizações", () => {
    const first = appendRelationshipEvent({ legacyRelationship: true }, "updated", "u1");
    const second = appendRelationshipEvent(first, "updated", "u2");
    expect(second.relationshipHistory.filter(e => e.action === "legacy_existing")).toHaveLength(1);
    expect(second.relationshipHistory).toHaveLength(3);
  });

  it("preserva eventos ao desvincular e reativar", () => {
    const linked = appendRelationshipEvent(null, "linked", "u1");
    const removed = appendRelationshipEvent(linked, "unlinked", "u2");
    const reactivated = appendRelationshipEvent(removed, "linked", "u3");
    expect(removed.inactive).toBe(true);
    expect(reactivated.inactive).toBe(false);
    expect(reactivated.relationshipHistory.map(e => e.action)).toEqual(["linked", "unlinked", "linked"]);
    expect(linked.relationshipHistory).toHaveLength(1);
  });

  it("preserva metadados não reservados ao atualizar", () => {
    const metadata = appendRelationshipEvent({ commission: { enabled: true } }, "updated", null);
    expect(metadata.commission).toEqual({ enabled: true });
    expect(metadata.relationshipHistory[0].actorId).toBeNull();
  });
});
