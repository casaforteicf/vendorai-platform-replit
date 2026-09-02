from pathlib import Path

path = Path("artifacts/api-server/src/routes/deals.ts")
text = path.read_text(encoding="utf-8")

def once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1, encontrado {count}")
    text = text.replace(old, new, 1)

once(
    'import { z } from "zod";\n',
    'import { z } from "zod";\nimport { COMMERCIAL_STAGE_ORDER, PARTNER_STAGE_ORDER, SAAS_STAGE_ORDER, TERMINAL_DEAL_STAGES, isBackwardMove } from "../lib/pipeline-progress.js";\n',
    "import progress",
)
once(
    '.select({ id: dealsTable.id, tenantId: dealsTable.tenantId, etapa: dealsTable.etapa, assignedTo: dealsTable.assignedTo, wonAt: dealsTable.wonAt, vehicleReservationBlocked: dealsTable.vehicleReservationBlocked })',
    '.select({ id: dealsTable.id, tenantId: dealsTable.tenantId, etapa: dealsTable.etapa, etapaSaas: dealsTable.etapaSaas, relationshipStage: dealsTable.relationshipStage, assignedTo: dealsTable.assignedTo, wonAt: dealsTable.wonAt, vehicleReservationBlocked: dealsTable.vehicleReservationBlocked })',
    "select progression fields",
)
anchor = '''  if (handoff && (!parsed.data.etapa || parsed.data.etapa === existing.etapa)) {
'''
guards = '''  if (parsed.data.etapa && parsed.data.etapa !== existing.etapa) {
    const target = parsed.data.etapa;
    if (TERMINAL_DEAL_STAGES.has(existing.etapa)) {
      res.status(409).json({ error: "CARD_CLOSED", message: "Processo comercial encerrado não pode ser reaberto. Inicie um novo processo vinculado ao mesmo cliente." });
      return;
    }
    if (existing.etapa === "em_aquecimento" || existing.etapa === "parceiro") {
      res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "A retomada de Aquecimento/Parceiros cria um novo processo; o card anterior permanece no histórico." });
      return;
    }
    const targetIsTransfer = target === "em_aquecimento" || target === "parceiro" || target === "perdido";
    if (!targetIsTransfer && isBackwardMove(COMMERCIAL_STAGE_ORDER, existing.etapa, target)) {
      res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "O card comercial só pode avançar. Etapas já concluídas permanecem no histórico." });
      return;
    }
  }
  if (existing.etapa === "parceiro" && parsed.data.relationshipStage && isBackwardMove(PARTNER_STAGE_ORDER, existing.relationshipStage || "parceiro_identificado", parsed.data.relationshipStage)) {
    res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "O processo de parceiro só pode avançar." });
    return;
  }
  if (parsed.data.etapaSaas && existing.etapaSaas && isBackwardMove(SAAS_STAGE_ORDER, existing.etapaSaas, parsed.data.etapaSaas)) {
    res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "O card SaaS só pode avançar." });
    return;
  }

  if (handoff && (!parsed.data.etapa || parsed.data.etapa === existing.etapa)) {
'''
once(anchor, guards, "progression guards")
path.write_text(text, encoding="utf-8")
