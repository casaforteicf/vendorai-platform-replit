import { describe, expect, it } from "vitest";
import { fingerprintRegistrationPayload } from "./crm-lead-idempotency.js";
describe("CRM V4 registration fingerprint integrity", () => {
 it("rejects NaN and Infinity rather than hashing them as null",()=>{
   expect(()=>fingerprintRegistrationPayload({price:NaN})).toThrow("REGISTRATION_NONFINITE_NUMBER");
   expect(()=>fingerprintRegistrationPayload({clients:[{income:Infinity}]})).toThrow("REGISTRATION_NONFINITE_NUMBER");
 });
 it("keeps a stable fingerprint regardless of object key order",()=>{
   expect(fingerprintRegistrationPayload({tenantId:"t",client:{name:"A",age:25}}))
    .toBe(fingerprintRegistrationPayload({client:{age:25,name:"A"},tenantId:"t"}));
 });
});
