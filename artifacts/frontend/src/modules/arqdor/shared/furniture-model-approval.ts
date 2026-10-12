/** Lote 13.42-13.44: AI suggestions and imported model candidates are private drafts until user approval.
 * No model publishing and no AI execution occurs in this helper.
 */
export type CandidateScope="personal"|"tenant"|"universal"|"partner";
export type ReusableFurnitureCandidate={
 id:string;tenantId:string;projectId:string;name:string;source:"ai"|"import";
 sourceFileId?:string;sourceRevision?:string;confidence:number;
 rights:"unknown"|"private-authorized"|"redistribution-authorized";
 state:"draft"|"approved-private"|"published";
 ownerUserId:string;scope:CandidateScope;
};
export type ApprovalAction={actorUserId:string;tenantId:string;hasLibraryAdminPermission:boolean;explicitPublishApproval:boolean};
export function approveFurnitureCandidate(candidate:ReusableFurnitureCandidate,action:ApprovalAction,scope:CandidateScope):ReusableFurnitureCandidate{
 if(!candidate.id||candidate.tenantId!==action.tenantId||!action.actorUserId||!Number.isFinite(candidate.confidence)||candidate.confidence<0||candidate.confidence>1)throw Error("Invalid candidate scope");
 if(candidate.state!=="draft")throw Error("Candidate already processed");
 if(action.actorUserId!==candidate.ownerUserId&&!action.hasLibraryAdminPermission)throw Error("Not authorized");
 if(scope==="personal")return {...candidate,scope,state:"approved-private"};
 if(scope==="tenant"){
  if(!action.hasLibraryAdminPermission)throw Error("Tenant library publishing requires admin permission");
  if(candidate.rights==="unknown")throw Error("Unverified reuse rights");
  return {...candidate,scope,state:"approved-private"};
 }
 if(!action.hasLibraryAdminPermission||!action.explicitPublishApproval||candidate.rights!=="redistribution-authorized")throw Error("Explicit publishing rights required");
 return {...candidate,scope,state:"published"};
}
export function createCandidateFromSuggestion(input:Omit<ReusableFurnitureCandidate,"state"|"scope">):ReusableFurnitureCandidate{
 if(!input.id||!input.tenantId||!input.projectId||!input.ownerUserId||!input.name.trim()||!Number.isFinite(input.confidence)||input.confidence<0||input.confidence>1)throw Error("Invalid model candidate");
 return {...input,state:"draft",scope:"personal"};
}
