import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function src(relative: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), "src", relative), "utf8");
}

describe("cold prospecting end-to-end contract", () => {
  it("keeps new cold discoveries out of Lead/Deal until qualification", () => {
    const worker = src("jobs/prospectorQueue.ts");
    expect(worker).toContain("pre-lead prospect created without CRM Lead/Deal");
    expect(worker).toContain("db.insert(prospectsTable)");
    const newFlow = worker.slice(worker.indexOf("// ── New cold Prospect"));
    expect(newFlow).not.toContain("db.insert(leadsTable)");
    expect(newFlow).not.toContain("db.insert(dealsTable)");
  });

  it("intercepts cold WhatsApp replies before normal Lead creation", () => {
    const webhooks = src("routes/webhooks.ts");
    const cold = webhooks.indexOf("tryIngestColdProspectReply");
    const createLead = webhooks.indexOf("evolution-webhook: creating lead from first contact");
    expect(cold).toBeGreaterThanOrEqual(0);
    expect(createLead).toBeGreaterThan(cold);
  });

  it("routes unmatched inbound email through Prospect intelligence first", () => {
    const email = src("services/email-platforms.ts");
    expect(email).toContain("tryIngestColdProspectEmailReply");
    expect(email.indexOf("tryIngestColdProspectEmailReply")).toBeLessThan(email.indexOf('category: "email_unmatched"'));
  });

  it("has governed outreach, conversion, meeting and autonomous follow-up services", () => {
    expect(src("services/prospect-outreach.ts")).toContain("maxContactsPerPerson7d");
    expect(src("services/prospect-outreach.ts")).toContain("outside_contact_window");
    expect(src("services/prospect-conversion.ts")).toContain("convertProspectToLead");
    expect(src("services/prospect-meeting.ts")).toContain("scheduleProspectMeeting");
    expect(src("jobs/coldProspectFollowup.ts")).toContain('coldProspectingMode, "autonomous"');
  });

  it("keeps generated sales content approval-gated", () => {
    const generator = src("services/sales-content-generator.ts");
    expect(generator).toContain('approvalStatus: "review"');
    expect(generator).toContain("effectiveAutoSend");
    expect(generator).toContain('runtime.mode === "autonomous"');
  });

  it("exposes the AI prospecting workspace without removing legacy views", () => {
    const page = fs.readFileSync(path.resolve(process.cwd(), "../frontend/src/pages/Prospector.tsx"), "utf8");
    expect(page).toContain("ColdProspectingWorkspace");
    expect(page).toContain("ProspectorClassicWorkspace");
    expect(page).toContain("ConstructionRadarWorkspace");
    expect(page).toContain("Prospecção IA");
  });
});
