import {describe,expect,it} from "vitest";
import {issuePartnerLotEntry,verifyPartnerLotEntry} from "../lib/arqdor-partner-lot-entry";
const secret="a-private-long-server-test-secret-with-32-plus-characters";
const claims={tenantId:"tenant-a",partnerId:"parceiro-a",lotId:"lote-12",revision:3};
describe("signed partner lot entry",()=>{
 it("issues tenant-bound version-bound short lived entry",()=>{
  const token=issuePartnerLotEntry(claims,{secret,nowSeconds:2000000000,ttlSeconds:300});
  const value=verifyPartnerLotEntry(token,{secret,nowSeconds:2000000001});
  expect(value).toMatchObject({...claims,scope:"preproject:create"});
  expect(value.nonce).toBeTruthy();
 });
 it("rejects tampering, expiry and revoked nonce",()=>{
  const token=issuePartnerLotEntry(claims,{secret,nowSeconds:2000000000,ttlSeconds:300});
  expect(()=>verifyPartnerLotEntry(token+"x",{secret,nowSeconds:2000000001})).toThrow();
  expect(()=>verifyPartnerLotEntry(token,{secret,nowSeconds:2000000400})).toThrow();
  expect(()=>verifyPartnerLotEntry(token,{secret,nowSeconds:2000000001,isRevoked:()=>true})).toThrow();
 });
 it("does not accept weak secrets or invalid expiry",()=>{
  expect(()=>issuePartnerLotEntry(claims,{secret:"short",nowSeconds:2000000000})).toThrow();
  expect(()=>issuePartnerLotEntry(claims,{secret,nowSeconds:2000000000,ttlSeconds:99999})).toThrow();
 });
});