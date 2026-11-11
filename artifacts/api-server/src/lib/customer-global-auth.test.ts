import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { authenticateGlobalCustomer, setInitialGlobalPassword } from "./customer-global-auth";
describe("global customer auth (not mounted)", () => {
  it("rejects malformed email without querying",async()=>{
    const db={query:vi.fn()};
    expect(await authenticateGlobalCustomer(db,"invalid","password")).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
  it("does not issue unknown account a session",async()=>{
    const db={query:vi.fn().mockResolvedValue({rows:[],rowCount:0})};
    expect(await authenticateGlobalCustomer(db,"a@example.com","wrong")).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it("issues session for valid credential",async()=>{
    const h=await bcrypt.hash("known-secure-password",4);
    const db={query:vi.fn().mockResolvedValueOnce({rows:[{identity_id:"00000000-0000-4000-8000-000000000001",password_hash:h}],rowCount:1}).mockResolvedValueOnce({rows:[],rowCount:1})};
    const x=await authenticateGlobalCustomer(db," Person@Example.com ","known-secure-password");
    expect(x?.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(db.query.mock.calls[0][1]).toEqual(["person@example.com"]);
  });
  it("does not overwrite credentials",async()=>{
    const db={query:vi.fn().mockResolvedValue({rows:[],rowCount:0})};
    expect(await setInitialGlobalPassword(db,"00000000-0000-4000-8000-000000000001","another-secure-password")).toBe(false);
    expect(db.query.mock.calls[0][0]).toContain("DO NOTHING");
  });
});
