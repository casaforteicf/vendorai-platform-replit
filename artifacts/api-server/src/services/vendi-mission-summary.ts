type RecordValue = Record<string, unknown>;
export type MissionSummaryItem = { toolId: string; text: string };

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

// Summarize recorded evidence, without another AI call or another database query.
// Each tool uses its latest successful observation; repeated samples are never added.
export function summarizeMission(outputs: RecordValue[]): MissionSummaryItem[] {
  const latest = new Map<string, RecordValue>();
  for (const output of outputs) {
    if (output.ok === true && typeof output.toolId === "string") latest.set(output.toolId, output);
  }
  return [...latest].map(([toolId, output]) => {
    const evidence = record(output.evidence);
    const data = record(output.data);
    const limit = count(evidence.limit);
    const scope = limit === undefined ? "" : ` (limite: ${limit})`;
    const suffix = ` Última consulta${scope}; os registros retornados não representam necessariamente o total da empresa.`;
    if (toolId === "admin.operational_attention") {
      const overdue = count(evidence.overdueTasks) ?? (Array.isArray(data.overdueTasks) ? data.overdueTasks.length : undefined);
      const unassigned = count(evidence.unassignedLeads) ?? (Array.isArray(data.unassignedLeads) ? data.unassignedLeads.length : undefined);
      const parts = [
        overdue === undefined ? null : `${overdue} atividades vencidas`,
        unassigned === undefined ? null : `${unassigned} leads sem responsável`,
      ].filter(Boolean);
      return { toolId, text: parts.length ? `Atenção operacional: ${parts.join(" e ")} retornados.${suffix}` : "Atenção operacional consultada; contagens indisponíveis." };
    }
    const labels: Record<string, string> = {
      "crm.leads.list": "Leads", "crm.deals.list": "Negócios", "agenda.appointments.list": "Agendamentos",
    };
    const label = labels[toolId];
    if (label) {
      const n = count(evidence.count) ?? (Array.isArray(output.data) ? output.data.length : undefined);
      return { toolId, text: n === undefined ? `${label}: consulta executada; contagem indisponível.` : `${label}: ${n} registros retornados.${suffix}` };
    }
    return { toolId, text: `${toolId}: execução registrada com sucesso.` };
  });
}

export function summarizeMissionEvents(events: Array<{ type: string; status: string; toolId: string | null; output: unknown; evidence: unknown }>): MissionSummaryItem[] {
  return summarizeMission(events.filter(event => event.type === "tool_result" && event.status === "executed")
    .map(event => ({ ...record(event.output), toolId: event.toolId, evidence: event.evidence })));
}
