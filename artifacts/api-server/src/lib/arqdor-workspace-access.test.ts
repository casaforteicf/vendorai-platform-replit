import { describe, expect, it } from "vitest";
import { canEditArqdorWorkspaceProject } from "./arqdor-workspace-access";
const actor = { tenantId:"tenant-a", userId:"user-a", accessScope:"tenant", actorType:"human", active:true };
const member = { tenantId:"tenant-a", projectId:"project-a", userId:"user-a", permission:"editor" as const };
describe("MULTI-07 project ACL policy", () => {
  it("allows registered owner/editor only", () => {
    expect(canEditArqdorWorkspaceProject(actor,"tenant-a","project-a",member)).toBe(true);
    expect(canEditArqdorWorkspaceProject(actor,"tenant-a","project-a",{...member,permission:"owner"})).toBe(true);
    expect(canEditArqdorWorkspaceProject(actor,"tenant-a","project-a",{...member,permission:"viewer"})).toBe(false);
  });
  it("denies tenant, project or user mismatch", () => {
    expect(canEditArqdorWorkspaceProject(actor,"tenant-b","project-a",member)).toBe(false);
    expect(canEditArqdorWorkspaceProject(actor,"tenant-a","project-b",member)).toBe(false);
    expect(canEditArqdorWorkspaceProject({...actor,userId:"user-b"},"tenant-a","project-a",member)).toBe(false);
  });
  it("denies guest, revoked, internal and missing membership", () => {
    expect(canEditArqdorWorkspaceProject({...actor,accessScope:"preprojeto"},"tenant-a","project-a",member)).toBe(false);
    expect(canEditArqdorWorkspaceProject({...actor,active:false},"tenant-a","project-a",member)).toBe(false);
    expect(canEditArqdorWorkspaceProject({...actor,actorType:"ai"},"tenant-a","project-a",member)).toBe(false);
    expect(canEditArqdorWorkspaceProject(actor,"tenant-a","project-a",null)).toBe(false);
  });
});
