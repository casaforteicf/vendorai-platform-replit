import assert from "node:assert/strict";
import { test } from "vitest";
import { approvedContext, emptyPlan, reviseSection, roleForFeature, type PlanRecord } from "./business-plan-model.js";
const record: PlanRecord = { id: "one", title: "Arquitetos", values: { Perfil: "Escritórios residenciais" }, source: "Responsável comercial", evidence: "declared", productIds: [], assetIds: [] };
test("drafts never reach agents; approval is additive and a new draft preserves approved facts", () => {
  let p = reviseSection(emptyPlan(), "segments", [record], "save", "u", "now");
  assert.equal(approvedContext(p,"marketing"), "");
  p = reviseSection(p,"segments",[record],"approve","u","now");
  p = reviseSection(p,"segments",[{...record,title:"Unapproved change"}],"save","u","now");
  assert.match(approvedContext(p,"marketing"), /Arquitetos/);
  assert.doesNotMatch(approvedContext(p,"marketing"), /Unapproved change/);
  assert.equal(p.version,3);
});
test("hypotheses and financial planning never enter marketing or support", () => {
  let p = reviseSection(emptyPlan(),"segments",[{...record,evidence:"hypothesis"}],"approve","u","now");
  p = reviseSection(p,"finance",[{...record,title:"INTERNAL MARGIN"}],"approve","u","now");
  assert.equal(approvedContext(p,"marketing"),"");
  assert.equal(approvedContext(p,"suporte"),"");
  assert.equal(approvedContext(p,"unknown"),"");
});
test("revoking approval removes shared agent context but retains editable draft", () => {
  let p=reviseSection(emptyPlan(),"company",[record],"approve","u","now");
  p=reviseSection(p,"company",[record],"revoke","u","later");
  assert.equal(approvedContext(p,"closer"),"");
  assert.equal(p.sections.company?.draft.length,1);
  assert.equal(p.history.at(-1)?.approved[0]?.title,"Arquitetos");
});
test("gateway maps supported features without leaking business strategy to unrelated calls",()=>{
 assert.equal(roleForFeature("content_generator"),"marketing");
 assert.equal(roleForFeature("agent_sdr"),"sdr");
 assert.equal(roleForFeature("agent_financeiro"),"financeiro");
 assert.equal(roleForFeature("embedding"),undefined);
 assert.equal(roleForFeature("agent_expansao_conta"),"scout");
 assert.equal(roleForFeature("site_generator"),"marketing");
 assert.equal(roleForFeature("proposal_generator"),"closer");
});
