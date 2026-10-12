import {createHmac,randomUUID,timingSafeEqual} from "node:crypto";

/** Server-only partner lot entry token. Never use on the client.
 * Requires configured secret >=32 bytes, persisted revocation/nonce registry in production.
 */
export type PartnerLotEntryClaims={
 tenantId:string;partnerId:string;lotId:string;revision:number;nonce:string;
 issuedAt:number;expiresAt:number;scope:"preproject:create";
};
const encoded=(v:object)=>Buffer.from(JSON.stringify(v),"utf8").toString("base64url");
const sign=(payload:string,secret:string)=>createHmac("sha256",secret).update(payload).digest("base64url");
function requireSecret(secret:string){if(Buffer.byteLength(secret,"utf8")<32)throw Error("Partner link signing key too short");}
export function issuePartnerLotEntry(input:Omit<PartnerLotEntryClaims,"nonce"|"issuedAt"|"expiresAt"|"scope">,{
 secret,nowSeconds=Math.floor(Date.now()/1000),ttlSeconds=900
}:{secret:string;nowSeconds?:number;ttlSeconds?:number}):string {
 requireSecret(secret);
 for(const k of ["tenantId","partnerId","lotId"] as const)if(!input[k]?.trim())throw Error("Missing "+k);
 if(!Number.isSafeInteger(input.revision)||input.revision<1)throw Error("Invalid lot revision");
 if(!Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>3600)throw Error("Invalid expiry");
 if(!Number.isSafeInteger(nowSeconds)||nowSeconds<1)throw Error("Invalid timestamp");
 const claims:PartnerLotEntryClaims={...input,nonce:randomUUID(),issuedAt:nowSeconds,expiresAt:nowSeconds+ttlSeconds,scope:"preproject:create"};
 const payload=encoded(claims);
 return payload+"."+sign(payload,secret);
}
export function verifyPartnerLotEntry(token:string,{
 secret,nowSeconds=Math.floor(Date.now()/1000),isRevoked=()=>false
}:{secret:string;nowSeconds?:number;isRevoked?:(nonce:string)=>boolean}):PartnerLotEntryClaims{
 requireSecret(secret);
 const sections=token.split(".");
 if(sections.length!==2||!sections.every(Boolean)||token.length>4096)throw Error("Invalid partner lot link");
 const expected=Buffer.from(sign(sections[0],secret));
 const actual=Buffer.from(sections[1]);
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw Error("Invalid partner lot link");
 let c:PartnerLotEntryClaims;
 try{c=JSON.parse(Buffer.from(sections[0],"base64url").toString("utf8")) as PartnerLotEntryClaims;}catch{throw Error("Invalid partner lot payload");}
 if(c.scope!=="preproject:create"||!c.tenantId||!c.partnerId||!c.lotId||!c.nonce||!Number.isSafeInteger(c.revision)||c.revision<1||
  !Number.isSafeInteger(c.issuedAt)||!Number.isSafeInteger(c.expiresAt)||c.issuedAt>nowSeconds+60||c.expiresAt<=nowSeconds||c.expiresAt-c.issuedAt>3600||
  isRevoked(c.nonce))throw Error("Partner lot link expired or invalid");
 return c;
}
