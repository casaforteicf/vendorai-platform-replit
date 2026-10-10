import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({pool: {connect: vi.fn(() => {throw new Error("DATABASE_CONNECTION_UNEXPECTED");})}}));
import { enqueueManagerSupportReview } from "./agent-manager-support.js";

const valid = {
  module: "crm" as const, kind: "platform_defect" as const,
  fingerprint:"fingerprint-1", title:"Problem", description:"Description",
  evidence:"Reproducible evidence", acceptanceCriteria:"Expected outcome",
};
describe("manager support payload boundary", () => {
  it("rejects null strings before attempting a database connection", async () => {
    for (const key of ["fingerprint","title","description","evidence","acceptanceCriteria"] as const) {
      await expect(enqueueManagerSupportReview({...valid,[key]:null as unknown as string}))
        .rejects.toThrow("MANAGER_SUPPORT_EVIDENCE_REQUIRED");
    }
  });
  it("rejects empty and whitespace-only evidence before DB connection", async () => {
    await expect(enqueueManagerSupportReview({...valid,evidence:"   "}))
      .rejects.toThrow("MANAGER_SUPPORT_EVIDENCE_REQUIRED");
  });
});
