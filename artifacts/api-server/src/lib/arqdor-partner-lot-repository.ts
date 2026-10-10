import {createHash} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {issuePartnerLotEntry,verifyPartnerLotEntry} from "./arqdor-partner-lot-entry";

type DbQuery={query:(text:string,values?:unknown[])=>Promise<{rows:any[];rowCount?:number|null}>};
export type PartnerInviteRepository = {
 issue:(args:{tenantId:string;partnerId:string;lotId:string;revision:number;secret:string;ttlSeconds?:number;nowSeconds?:number;origin?:string})=>Promise<string>;
 verify:(args:{token:string;secret:string;nowSeconds?:number})=>Promise<{tenantId:string;partnerId:string;lotId:string;revision:number}>;
 revoke:(args:{tenantId:string;nonceHash:string})=>Promise<void>;
};
const nonceHash=(nonce:string)=>createHash("sha256").update(nonce).digest("hex");
/** Uses tenant-qualified queries. Authentication/RBAC must be enforced by API route before calling issue/revoke. */
export function createPartnerInviteRepository(pool:DbQuery):PartnerInviteRepository {
 return {
  async issue({tenantId,partnerId,lotId,revision,secret,ttlSeconds=900,nowSeconds=Math.floor(Date.now()/1000),origin}){
    const row=await pool.query(
      `SELECT 1 FROM arqdor_partner_lots l
       JOIN arqdor_partner_developments d ON d.tenant_id=l.tenant_id AND d.id=l.development_id
       JOIN arqdor_partner_lot_revisions r ON r.tenant_id=l.tenant_id AND r.lot_id=l.id AND r.revision=$4
       WHERE l.tenant_id=$1 AND l.id=$2 AND l.technical_revision=$4 AND d.status='active'
         AND l.availability='available' AND d.tenant_id=$1 AND $3 <> ''`,
      [tenantId,lotId,partnerId,revision]);
    if(!row.rows.length)throw Error("Lote indisponivel ou versao nao encontrada");
    const token=issuePartnerLotEntry({tenantId,partnerId,lotId,revision},{secret,ttlSeconds,nowSeconds});
    const claim=verifyPartnerLotEntry(token,{secret,nowSeconds});
    await pool.query(
      `INSERT INTO arqdor_partner_lot_invites(id,tenant_id,lot_id,revision,nonce_hash,allowed_origin,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,to_timestamp($7))`,
      [claim.nonce,tenantId,lotId,revision,nonceHash(claim.nonce),origin??null,claim.expiresAt]);
    return token;
  },
  async verify({token,secret,nowSeconds=Math.floor(Date.now()/1000)}){
    const claim=verifyPartnerLotEntry(token,{secret,nowSeconds});
    const r=await pool.query(
      `SELECT i.id FROM arqdor_partner_lot_invites i
       JOIN arqdor_partner_lots l ON l.tenant_id=i.tenant_id AND l.id=i.lot_id
       WHERE i.tenant_id=$1 AND i.lot_id=$2 AND i.revision=$3 AND i.nonce_hash=$4
         AND i.revoked_at IS NULL AND i.expires_at > to_timestamp($5)
         AND l.availability='available' AND l.technical_revision=i.revision`,
      [claim.tenantId,claim.lotId,claim.revision,nonceHash(claim.nonce),nowSeconds]);
    if(!r.rows.length)throw Error("Convite revogado, vencido ou lote indisponivel");
    return {tenantId:claim.tenantId,partnerId:claim.partnerId,lotId:claim.lotId,revision:claim.revision};
  },
  async revoke({tenantId,nonceHash:hash}){
    if(!tenantId||!hash)throw Error("Tenant e nonce obrigatorios");
    await pool.query("UPDATE arqdor_partner_lot_invites SET revoked_at=now() WHERE tenant_id=$1 AND nonce_hash=$2 AND revoked_at IS NULL",[tenantId,hash]);
  }
 };
}
