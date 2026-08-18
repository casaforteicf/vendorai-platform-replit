import { afterEach, describe, expect, it, vi } from "vitest";

import { consumeOAuthState, createOAuthState } from "./oauth-state.js";

describe("OAuth state secret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses SESSION_SECRET when the dedicated OAuth and JWT secrets are absent", () => {
    vi.stubEnv("OAUTH_STATE_SECRET", "");
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("SESSION_SECRET", "session-secret-with-at-least-32-characters");

    const state = createOAuthState("tenant-1", "user-1", "whatsapp");

    expect(consumeOAuthState(state, "whatsapp")).toMatchObject({
      tenantId: "tenant-1",
      userId: "user-1",
      provider: "whatsapp",
    });
  });

  it("rejects state generation when no sufficiently long secret exists", () => {
    vi.stubEnv("OAUTH_STATE_SECRET", "");
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("SESSION_SECRET", "short");

    expect(() => createOAuthState("tenant-1", "user-1", "whatsapp")).toThrow(
      "must be configured with at least 32 characters",
    );
  });
});
