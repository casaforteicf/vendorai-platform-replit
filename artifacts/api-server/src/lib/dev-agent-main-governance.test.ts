import { describe, expect, it } from "vitest";
import {
  classifyGithubHttpFailure,
  evaluateMainGovernance,
  githubGovernanceReadinessReason,
} from "./dev-agent-main-governance.js";

describe("evaluateMainGovernance", () => {
  const sha = "333ac489c813da0d87cf890ad7f9fae391169a74";

  it("verifies main when the exact SHA is the merge commit of a merged PR", () => {
    expect(evaluateMainGovernance(sha, [
      { number: 719, merged_at: "2026-09-05T17:55:56Z", merge_commit_sha: sha },
    ])).toEqual({ status: "verified_pr", prNumber: 719 });
  });

  it("flags a direct commit when no merged PR owns the exact main SHA", () => {
    expect(evaluateMainGovernance(sha, [
      { number: 719, merged_at: "2026-09-05T17:55:56Z", merge_commit_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    ])).toEqual({ status: "direct_commit", prNumber: null });
  });

  it("does not accept an unmerged PR as governance evidence", () => {
    expect(evaluateMainGovernance(sha, [
      { number: 720, merged_at: null, merge_commit_sha: sha },
    ])).toEqual({ status: "direct_commit", prNumber: null });
  });

  it("returns unknown when main revision is unavailable", () => {
    expect(evaluateMainGovernance(null, [])).toEqual({ status: "unknown", prNumber: null });
  });
});

describe("classifyGithubHttpFailure", () => {
  it("classifies authentication and authorization failures as invalid credential", () => {
    expect(classifyGithubHttpFailure(401)).toBe("GITHUB_CREDENTIAL_INVALID");
    expect(classifyGithubHttpFailure(403)).toBe("GITHUB_CREDENTIAL_INVALID");
  });

  it("keeps other GitHub HTTP failures distinguishable", () => {
    expect(classifyGithubHttpFailure(500)).toBe("GITHUB_HTTP_500");
  });
});

describe("githubGovernanceReadinessReason", () => {
  it("explains how to recover from an invalid or expired GitHub credential", () => {
    expect(githubGovernanceReadinessReason("GITHUB_CREDENTIAL_INVALID")).toContain("Credencial GitHub inválida ou expirada");
    expect(githubGovernanceReadinessReason("GITHUB_CREDENTIAL_INVALID")).toContain("GITHUB_PERSONAL_ACCESS_TOKEN");
  });

  it("distinguishes a missing credential from a generic GitHub outage", () => {
    expect(githubGovernanceReadinessReason("GITHUB_DEV_TOKEN_MISSING")).toContain("Credencial GitHub ausente");
    expect(githubGovernanceReadinessReason("GITHUB_HTTP_500")).toContain("GITHUB_HTTP_500");
  });
});
