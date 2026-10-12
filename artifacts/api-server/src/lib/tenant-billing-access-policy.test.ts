import { describe, expect, it } from "vitest";
import { resolveTenantBillingAccess as resolve } from "./tenant-billing-access-policy.js";

const now = new Date("2026-10-10T12:00:00.000Z");
const base = {
  context: "tenant_member" as const,
  subscriptionStatus: "inadimplente" as const,
  paidThrough: new Date("2026-10-01T00:00:00.000Z"),
  unpaidSince: new Date("2026-10-01T00:00:00.000Z"),
  now,
};

describe("tenant billing access policy", () => {
  it("permits operational tools but denies AI inside 15 day grace", () => {
    expect(resolve(base)).toMatchObject({state:"grace_no_ai",operationalTools:true,aiAllowed:false});
  });
  it("ends grace precisely at the 15 day boundary", () => {
    expect(resolve({...base,now:new Date("2026-10-16T00:00:00.000Z")})).toMatchObject({
      state:"restricted",operationalTools:false,aiAllowed:false
    });
  });
  it("restores AI only with a verified paid entitlement", () => {
    expect(resolve({...base,subscriptionStatus:"ativa",paidThrough:new Date("2026-11-01T00:00:00.000Z")}))
      .toMatchObject({state:"active",aiAllowed:true});
  });
  it("never creates grace for unpaid signups", () => {
    expect(resolve({...base,paidThrough:null,unpaidSince:null})).toMatchObject({state:"restricted"});
  });
  it("does not treat a trial as a paid subscription", () => {
    expect(resolve({...base,subscriptionStatus:"trial"})).toMatchObject({state:"restricted",aiAllowed:false});
  });
  it("does not give external customers AI or a paid tenant seat", () => {
    expect(resolve({...base,context:"external_customer",externalAccessAuthorized:true}))
      .toMatchObject({state:"active",operationalTools:true,aiAllowed:false,billingPortal:false});
  });
  it("requires customer authorization independently", () => {
    expect(resolve({...base,context:"external_customer",externalAccessAuthorized:false}))
      .toMatchObject({state:"restricted",operationalTools:false});
  });
  it("does not escalate a platform administrator", () => {
    expect(resolve({...base,context:"platform_admin"})).toMatchObject({state:"restricted"});
  });
  it("denies cancelled subscriptions regardless of due date", () => {
    expect(resolve({...base,subscriptionStatus:"cancelada"})).toMatchObject({state:"restricted"});
  });
});
