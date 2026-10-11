import { describe, expect, it } from "vitest";
import {
  canPresentContext,
  visibleExperiences,
  type ExperienceContext,
  type TransactionParticipant,
} from "./unifiedExperienceCatalog";

const personal: ExperienceContext = {
  id: "self:1",
  kind: "personal",
  label: "Minha conta",
  roles: ["customer"],
  enabledExperiences: ["consumer", "commerce", "business", "finance"],
};

describe("UI-01 contextual experience catalog", () => {
  it("shows only enabled experiences compatible with a personal context", () => {
    expect(visibleExperiences(personal).map(x => x.key)).toEqual(["consumer", "commerce"]);
  });

  it("rejects contexts from a different tenant", () => {
    const organization: ExperienceContext = {
      id: "org:1", kind: "organization", label: "Loja",
      tenantId: "tenant-a", roles: ["supplier"],
      enabledExperiences: ["commerce", "business", "finance"],
    };
    expect(canPresentContext(organization, { tenantId: "tenant-b" })).toBe(false);
    expect(canPresentContext(organization, { tenantId: "tenant-a" })).toBe(true);
    expect(visibleExperiences(organization).map(x => x.key)).toEqual(["commerce", "business", "finance"]);
  });

  it("requires matching project and tenant for project contexts", () => {
    const project: ExperienceContext = {
      id: "project:1", kind: "project", label: "Minha casa",
      projectId: "p1", tenantId: "t1", roles: ["co_owner"],
      enabledExperiences: ["consumer", "professional", "execution"],
    };
    expect(canPresentContext(project, { projectId: "p1", tenantId: "t2" })).toBe(false);
    expect(canPresentContext(project, { projectId: "p2", tenantId: "t1" })).toBe(false);
    expect(canPresentContext(project, { projectId: "p1", tenantId: "t1" })).toBe(true);
  });

  it("does not derive financial positions from roles", () => {
    const participant: TransactionParticipant = {
      subjectId: "architect-a", transactionId: "deal-1",
      positions: ["payer", "commission_recipient"],
    };
    expect(participant.positions).toContain("payer");
    expect(participant.positions).toContain("commission_recipient");
  });

  it("rejects incomplete contexts and validates personal isolation", () => {
    expect(canPresentContext(personal, {})).toBe(true);
    expect(canPresentContext({ ...personal, tenantId: "t1" }, { tenantId: "t1" })).toBe(false);
    expect(canPresentContext({ ...personal, roles: [] }, {})).toBe(false);
  });
});
