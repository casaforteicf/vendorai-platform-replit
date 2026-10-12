import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextSwitcher } from "./ContextSwitcher";
import type { ExperienceContext } from "@/lib/unifiedExperienceCatalog";

const company: ExperienceContext = {
  id: "company-a", kind: "organization", label: "Empresa A", tenantId: "tenant-a",
  roles: ["tenant_admin"], enabledExperiences: ["business", "commerce"],
};
const foreign: ExperienceContext = {
  id: "company-b", kind: "organization", label: "Empresa B", tenantId: "tenant-b",
  roles: ["tenant_admin"], enabledExperiences: ["finance"],
};

describe("ContextSwitcher", () => {
  it("never displays other tenant contexts from the current tenant scope", () => {
    const html = renderToStaticMarkup(
      <ContextSwitcher
        contexts={[company, foreign]}
        currentContextId="company-a"
        tenantId="tenant-a"
        onRequestSwitch={vi.fn()}
      />,
    );
    expect(html).toContain("Empresa A");
    expect(html).not.toContain("Empresa B");
    expect(html).toContain("Gestão");
    expect(html).not.toContain("Financeiro");
  });

  it("does not expose workspace choices with unknown scope", () => {
    const html = renderToStaticMarkup(
      <ContextSwitcher
        contexts={[company]}
        currentContextId="company-a"
        onRequestSwitch={vi.fn()}
      />,
    );
    expect(html).toContain("Nenhum espaço autorizado");
    expect(html).not.toContain("Empresa A");
  });
});
