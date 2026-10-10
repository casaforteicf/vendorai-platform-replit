/**
 * Offline, pure preflight gate for the EXISTING Contabo release operator.
 * No network, credentials, docker commands, database writes, or deployment.
 * Fail closed: unknown facts never become approval.
 */
const SHA=/^[a-f0-9]{40}$/i;
const LOT=/^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$/;
const safeString=(s)=>typeof s==="string" && s.length>0 && s.length<=128;
export function assessReleaseReadiness(input) {
 const failures=[];
 const add=(code,condition)=>{if(condition)failures.push(code)};
 if(!input || typeof input!=="object" || Array.isArray(input)) return {ready:false,failures:["INVALID_INPUT"],checkedAt:null};
 add("LOT_INVALID",!LOT.test(input.lot??""));
 add("COMMIT_INVALID",!SHA.test(input.commitSha??""));
 add("IMAGE_DIGEST_MISSING",!/^sha256:[a-f0-9]{64}$/i.test(input.imageDigest??""));
 add("COMMIT_IMAGE_NOT_VERIFIED",input.commitImageVerified!==true);
 add("LOT_MAPPING_NOT_VERIFIED",input.lotMappingVerified!==true);
 add("HOST_OPERATOR_UNVERIFIED",input.operatorVerified!==true);
 add("HOMOLOG_UNHEALTHY",input.homologHealth!=="ok");
 add("TESTS_NOT_VERIFIED",input.testsPassed!==true);
 add("BACKUP_UNVERIFIED",input.backupVerified!==true);
 add("ROLLBACK_UNVERIFIED",input.rollbackVerified!==true);
 add("MIGRATIONS_UNVERIFIED",input.migrationsVerified!==true);
 add("TENANT_ISOLATION_UNVERIFIED",input.tenantIsolationVerified!==true);
 add("PRODUCTION_MUTATION_REQUESTED",input.target==="production");
 add("TARGET_INVALID",input.target!=="homolog"&&input.target!=="production");
 add("APPROVAL_MISSING",input.approved!==true);
 add("APPROVAL_REFERENCE_MISSING",!safeString(input.approvalReference));
 return {ready:failures.length===0,failures,checkedAt:null};
}
export function evaluateApiAuth(error) {
 const status=Number(error?.status??error?.statusCode);
 if(status===401)return {category:"API_AUTH_EXPIRED_OR_INVALID",retryAutomatically:false,secretRotationRequired:true};
 if(status===403)return {category:"API_FORBIDDEN",retryAutomatically:false,secretRotationRequired:false};
 if(status===404)return {category:"TENANT_OR_ENDPOINT_NOT_FOUND",retryAutomatically:false,secretRotationRequired:false};
 return {category:"UNCLASSIFIED_API_FAILURE",retryAutomatically:false,secretRotationRequired:false};
}
