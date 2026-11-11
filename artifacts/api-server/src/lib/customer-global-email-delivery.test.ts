import { describe, expect, it, vi } from "vitest";
const send = vi.fn();
vi.mock("resend",()=>({Resend: class { emails={send}; }}));
import { sendGlobalCustomerVerificationEmail } from "./customer-global-email-delivery";
describe("global portal confirmation email",()=>{
  it("does not send without a configured existing mail provider",async()=>{
    expect(await sendGlobalCustomerVerificationEmail({to:"client@example.com",code:"a".repeat(64)})).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects malformed destination and code",async()=>{
    expect(await sendGlobalCustomerVerificationEmail({to:"x",code:"a".repeat(64),resendApiKey:"configured"})).toBe(false);
    expect(await sendGlobalCustomerVerificationEmail({to:"client@example.com",code:"bad",resendApiKey:"configured"})).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("reuses Resend and does not log or change account sessions",async()=>{
    send.mockResolvedValueOnce({error:null});
    expect(await sendGlobalCustomerVerificationEmail({to:"Client@Example.com",code:"a".repeat(64),resendApiKey:"configured",fromEmail:"noreply@example.com"})).toBe(true);
    expect(send.mock.calls.at(-1)?.[0].to).toBe("client@example.com");
    expect(send.mock.calls.at(-1)?.[0].subject).toContain("Portal do Cliente");
  });
  it("fails closed on provider errors",async()=>{
    send.mockResolvedValueOnce({error:{message:"failed"}});
    expect(await sendGlobalCustomerVerificationEmail({to:"client@example.com",code:"b".repeat(64),resendApiKey:"configured"})).toBe(false);
  });
});
