import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../../..");

function read(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("audit trust regressions", () => {
  it("does not expose simulated partner/VCN records as real data", () => {
    const partner = read("artifacts/frontend/src/pages/partner-hub/PartnerHubPage.tsx");
    const vcn = read("artifacts/frontend/src/pages/vcn/VCNPage.tsx");
    const vcnDetail = read("artifacts/frontend/src/pages/vcn/VCNCompanyDetailPage.tsx");

    for (const source of [partner, vcn, vcnDetail]) {
      expect(source).toContain("RealDataUnavailable");
      expect(source).not.toMatch(/MOCK_(?:COMPANY|COMPANIES|SPECIALISTS|PRODUCTS)/);
    }
  });

  it("keeps Ecosystem detail connected to the selected real company", () => {
    const source = read("artifacts/frontend/src/pages/ecosystem-hub/CompanyDetailPage.tsx");
    expect(source).toContain('useParams<{ id: string }>()');
    expect(source).toContain('/api/ecosystem-hub/companies/${encodeURIComponent(id)}');
    expect(source).not.toContain("MOCK_COMPANY");
  });

  it("keeps POE recommendations connected to the backend", () => {
    const source = read("artifacts/frontend/src/pages/poe/POEPage.tsx");
    expect(source).toContain('/api/poe/opportunities/${encodeURIComponent(opportunityId)}/recommendations');
    expect(source).not.toContain("MOCK_RECOMMENDATIONS");
  });

  it("keeps the intelligent Arqdor project protected from demo project injection", () => {
    const source = read("artifacts/frontend/src/modules/arqdor/workspace/modules/ProjectModule.tsx");
    expect(source).toContain("RealDataUnavailable");
    expect(source).not.toContain("<ArqdorPage");
  });

  it("keeps the orphan prompt-variations router removed", () => {
    expect(existsSync(resolve(repoRoot, "artifacts/api-server/src/routes/prompt_variations.ts"))).toBe(false);
  });

  it("forbids mock vehicle lookup when the server starts in production", () => {
    const source = read("artifacts/api-server/src/lib/logger.ts");
    expect(source).toContain('VEHICLE_LOOKUP_PROVIDER="senatran"');
    expect(source).toContain("mock vehicle lookup is forbidden");
  });
});
