import { describe, expect, it, vi } from "vitest";
import { generateGlobalCustomerSession, validateGlobalCustomerSession, resolveDualCustomerSessions } from "./customer-global-session";
const token="a".repeat(64);
describe("global customer sessions",()=>{
 it("creates random session tokens",()=>{const a=generateGlobalCustomerSession(),b=generateGlobalCustomerSession();expect(a.token).toMatch(/^[a-f0-9]{64}$/);expect(a.token).not.toBe(b.token);expect(a.tokenHash).not.toBe(a.token)});
 it("rejects missing global credentials without querying",async()=>{const db={query:vi.fn()};expect(await validateGlobalCustomerSession(db,undefined)).toBeNull();expect(db.query).not.toHaveBeenCalled()});
 it("requires verified active global account",async()=>{const db={query:vi.fn().mockResolvedValue({rows:[{identity_id:"id-1"}]})};expect(await validateGlobalCustomerSession(db,"Bearer "+token)).toEqual({globalIdentityId:"id-1"});expect(db.query.mock.calls[0][0]).toContain("email_verified_at IS NOT NULL")});
 it("never accepts one token for both identities",async()=>{const db={query:vi.fn()};const legacy=vi.fn();expect(await resolveDualCustomerSessions(db,"Bearer "+token,"Bearer "+token,legacy)).toBeNull();expect(legacy).not.toHaveBeenCalled()});
 it("requires both independently verified sessions",async()=>{const db={query:vi.fn().mockResolvedValue({rows:[{identity_id:"id-1"}]})};const legacy=vi.fn().mockResolvedValue({tenantId:"A",legacyPortalUserId:"legacy"});expect(await resolveDualCustomerSessions(db,"Bearer "+token,"Bearer "+"b".repeat(64),legacy)).toMatchObject({tenantId:"A",globalIdentityId:"id-1"});legacy.mockResolvedValueOnce(null);expect(await resolveDualCustomerSessions(db,"Bearer "+token,"Bearer "+"b".repeat(64),legacy)).toBeNull()});
});
