import { describe, expect, it, vi } from "vitest";
import { createEmailVerificationToken, issueGlobalEmailVerification, consumeGlobalEmailVerification } from "./customer-global-email-verification";

const id="11111111-1111-4111-8111-111111111111";
describe("global email verification (not mounted)",()=>{
  it("generates distinct opaque tokens without storing plaintext",()=>{
    const a=createEmailVerificationToken(),b=createEmailVerificationToken();
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toBe(a.token);
    expect(a.token).not.toBe(b.token);
  });
  it("requires valid identity and pending unverified state before issuing",async()=>{
    const db={query:vi.fn().mockResolvedValue({rows:[{id}],rowCount:1})};
    expect(await issueGlobalEmailVerification(db,"bad-id")).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
    const token=await issueGlobalEmailVerification(db,id);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(db.query.mock.calls[0][0]).toContain("email_verified_at IS NULL");
    expect(db.query.mock.calls[0][1][1]).not.toBe(token);
  });
  it("rejects malformed token without querying",async()=>{
    const db={query:vi.fn()};
    expect(await consumeGlobalEmailVerification(db,"wrong")).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });
  it("consumes a challenge only once via atomic conditional update",async()=>{
    const db={query:vi.fn().mockResolvedValueOnce({rows:[{id}],rowCount:1}).mockResolvedValueOnce({rows:[],rowCount:0})};
    const token="a".repeat(64);
    expect(await consumeGlobalEmailVerification(db,token)).toBe(true);
    expect(await consumeGlobalEmailVerification(db,token)).toBe(false);
    expect(db.query.mock.calls[0][0]).toContain("consumed_at IS NULL");
    expect(db.query.mock.calls[0][0]).toContain("expires_at>now()");
  });
});
