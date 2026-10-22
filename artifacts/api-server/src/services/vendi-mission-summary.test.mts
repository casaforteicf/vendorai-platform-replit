import { test } from "vitest";
import assert from "node:assert/strict";
import { summarizeMission, summarizeMissionEvents } from "./vendi-mission-summary.ts";
test("repeated observations use latest counts, never their sum", () => {
  const outputs = [100, 50].map(limit => ({ toolId: "admin.operational_attention", ok: true, evidence: { limit, overdueTasks: 8, unassignedLeads: 1, countIsTotal: false } }));
  const result = summarizeMission(outputs);
  assert.equal(result.length, 1);
  assert.match(result[0]!.text, /8 atividades vencidas e 1 leads sem responsável/);
  assert.match(result[0]!.text, /limite: 50/);
  assert.match(result[0]!.text, /não representam necessariamente o total/);
});
test("zero is evidence; missing counts and failed outputs are not zero", () => {
  const result = summarizeMission([
    { toolId: "crm.leads.list", ok: true, data: [] },
    { toolId: "crm.deals.list", ok: true },
    { toolId: "crm.leads.list", ok: false, data: [1] },
  ]);
  assert.match(result[0]!.text, /0 registros/);
  assert.match(result[1]!.text, /contagem indisponível/);
});
test("legacy events produce a summary without rewriting or rerunning the mission", () => {
  const result = summarizeMissionEvents([
    { type: "tool_result", status: "executed", toolId: "crm.leads.list", output: {ok: true, data: [{id: "private"}]}, evidence: {count: 1, limit: 25} },
    { type: "tool_result", status: "failed", toolId: "crm.deals.list", output: {ok: false}, evidence: null },
    { type: "tool_start", status: "running", toolId: "other", output: {}, evidence: null },
  ]);
  assert.equal(result.length, 1);
  assert.match(result[0]!.text, /1 registros/);
  assert.equal(JSON.stringify(result).includes("private"), false);
});
test("appointments are described as appointments, not overdue activities", () => {
  assert.match(summarizeMission([{toolId: "agenda.appointments.list", ok: true, evidence: {count: 2}}])[0]!.text, /^Agendamentos:/);
});
