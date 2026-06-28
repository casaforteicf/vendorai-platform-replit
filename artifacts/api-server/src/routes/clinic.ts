import { Router, type IRouter } from "express";
import { and, eq, desc, gte, lte, lt } from "drizzle-orm";
import {
  db,
  clinicEspecialidadesTable,
  clinicMedicosTable,
  clinicConveniosTable,
  clinicConsultasTable,
  clinicProntuariosTable,
  leadsTable,
} from "@workspace/db";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccess(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || tid(req) === tenantId;
}

// ─── Especialidades ───────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/clinic/especialidades", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(clinicEspecialidadesTable)
    .where(eq(clinicEspecialidadesTable.tenantId, tenantId))
    .orderBy(clinicEspecialidadesTable.nome);

  return res.json(rows);
});

router.post("/tenants/:tenantId/clinic/especialidades", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(clinicEspecialidadesTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

// ─── Médicos ──────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/clinic/medicos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const medicos = await db
    .select()
    .from(clinicMedicosTable)
    .where(eq(clinicMedicosTable.tenantId, tenantId))
    .orderBy(clinicMedicosTable.nome);

  const especialidades = await db
    .select()
    .from(clinicEspecialidadesTable)
    .where(eq(clinicEspecialidadesTable.tenantId, tenantId));

  const espMap = Object.fromEntries(especialidades.map((e) => [e.id, e]));

  return res.json(
    medicos.map((m) => ({
      ...m,
      especialidade: m.especialidadeId ? espMap[m.especialidadeId] ?? null : null,
    })),
  );
});

router.post("/tenants/:tenantId/clinic/medicos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(clinicMedicosTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/clinic/medicos/:id", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(clinicMedicosTable)
    .set(req.body as any)
    .where(and(eq(clinicMedicosTable.id, id), eq(clinicMedicosTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Médico not found" });
  return res.json(row);
});

// ─── Convênios ────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/clinic/convenios", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(clinicConveniosTable)
    .where(eq(clinicConveniosTable.tenantId, tenantId))
    .orderBy(clinicConveniosTable.nome);

  return res.json(rows);
});

router.post("/tenants/:tenantId/clinic/convenios", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(clinicConveniosTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

// ─── Consultas ────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/clinic/consultas", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(clinicConsultasTable.tenantId, tenantId)];

  if (req.query.medicoId) {
    filters.push(eq(clinicConsultasTable.medicoId, req.query.medicoId as string));
  }
  if (req.query.status) {
    filters.push(eq(clinicConsultasTable.status, req.query.status as string));
  }
  if (req.query.convenio) {
    filters.push(eq(clinicConsultasTable.convenio, req.query.convenio as string));
  }
  if (req.query.data) {
    const dayStart = new Date(`${req.query.data}T00:00:00`);
    const dayEnd   = new Date(`${req.query.data}T23:59:59.999`);
    filters.push(gte(clinicConsultasTable.dataHora, dayStart));
    filters.push(lte(clinicConsultasTable.dataHora, dayEnd));
  }
  if (req.query.dataInicio) {
    filters.push(gte(clinicConsultasTable.dataHora, new Date(`${req.query.dataInicio}T00:00:00`)));
  }
  if (req.query.dataFim) {
    filters.push(lte(clinicConsultasTable.dataHora, new Date(`${req.query.dataFim}T23:59:59.999`)));
  }

  const consultas = await db
    .select()
    .from(clinicConsultasTable)
    .where(and(...filters))
    .orderBy(clinicConsultasTable.dataHora);

  // Enrich com paciente, médico, especialidade
  const pacienteIds     = [...new Set(consultas.map((c) => c.pacienteId))];
  const medicoIds       = [...new Set(consultas.map((c) => c.medicoId))];

  const [pacientes, medicos, especialidades] = await Promise.all([
    pacienteIds.length
      ? db
          .select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone, email: leadsTable.email })
          .from(leadsTable)
          .where(eq(leadsTable.tenantId, tenantId))
      : Promise.resolve([]),
    medicoIds.length
      ? db.select().from(clinicMedicosTable).where(eq(clinicMedicosTable.tenantId, tenantId))
      : Promise.resolve([]),
    db.select().from(clinicEspecialidadesTable).where(eq(clinicEspecialidadesTable.tenantId, tenantId)),
  ]);

  const pacienteMap  = Object.fromEntries(pacientes.map((p) => [p.id, p]));
  const medicoMap    = Object.fromEntries(medicos.map((m) => [m.id, m]));
  const espMap       = Object.fromEntries(especialidades.map((e) => [e.id, e]));

  return res.json(
    consultas.map((c) => ({
      ...c,
      paciente:      pacienteMap[c.pacienteId]                              ?? null,
      medico:        medicoMap[c.medicoId]                                   ?? null,
      especialidade: c.especialidadeId ? espMap[c.especialidadeId] ?? null : null,
    })),
  );
});

router.post("/tenants/:tenantId/clinic/consultas", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const {
    pacienteId,
    medicoId,
    especialidadeId,
    dataHora,
    tipoAtendimento,
    convenio,
    numeroCarteirinha,
    valor,
  } = req.body as {
    pacienteId: string;
    medicoId: string;
    especialidadeId?: string;
    dataHora: string;
    tipoAtendimento?: string;
    convenio?: string;
    numeroCarteirinha?: string;
    valor?: number;
  };

  if (!pacienteId || !medicoId || !dataHora) {
    return res.status(422).json({ error: "pacienteId, medicoId e dataHora são obrigatórios" });
  }

  const dataHoraDate = new Date(dataHora);
  if (isNaN(dataHoraDate.getTime())) {
    return res.status(422).json({ error: "dataHora inválida" });
  }

  // Duração da consulta: vem da especialidade (default 30 min)
  let duracaoMinutos = 30;
  if (especialidadeId) {
    const [esp] = await db
      .select({ duracaoConsultaMinutos: clinicEspecialidadesTable.duracaoConsultaMinutos })
      .from(clinicEspecialidadesTable)
      .where(and(eq(clinicEspecialidadesTable.id, especialidadeId), eq(clinicEspecialidadesTable.tenantId, tenantId)));
    if (esp?.duracaoConsultaMinutos) duracaoMinutos = esp.duracaoConsultaMinutos;
  }

  const slotFim = new Date(dataHoraDate.getTime() + duracaoMinutos * 60 * 1000);

  // Verificar conflito de horário do médico
  const conflitos = await db
    .select({ id: clinicConsultasTable.id })
    .from(clinicConsultasTable)
    .where(
      and(
        eq(clinicConsultasTable.tenantId, tenantId),
        eq(clinicConsultasTable.medicoId, medicoId),
        gte(clinicConsultasTable.dataHora, dataHoraDate),
        lt(clinicConsultasTable.dataHora, slotFim),
      ),
    );

  // Ignorar cancelados/faltou em memória
  if (conflitos.length > 0) {
    return res.status(409).json({ error: "Médico ocupado neste horário" });
  }

  const [consulta] = await db
    .insert(clinicConsultasTable)
    .values({
      tenantId,
      pacienteId,
      medicoId,
      especialidadeId: especialidadeId ?? null,
      dataHora: dataHoraDate,
      tipoAtendimento: tipoAtendimento ?? "presencial",
      convenio:          convenio         ?? null,
      numeroCarteirinha: numeroCarteirinha ?? null,
      valor:             valor             ?? null,
    } as any)
    .returning();

  res.status(201).json(consulta);

  // Agendar lembretes 24h e 2h antes (background)
  setImmediate(() => {
    const agora = Date.now();
    const ms24h = dataHoraDate.getTime() - agora - 24 * 60 * 60 * 1000;
    const ms2h  = dataHoraDate.getTime() - agora -  2 * 60 * 60 * 1000;

    if (ms24h > 0) {
      setTimeout(async () => {
        try {
          await db
            .update(clinicConsultasTable)
            .set({ lembrete1Enviado: true })
            .where(eq(clinicConsultasTable.id, consulta.id));
        } catch { /* silent */ }
      }, ms24h);
    }
    if (ms2h > 0) {
      setTimeout(async () => {
        try {
          await db
            .update(clinicConsultasTable)
            .set({ lembrete2Enviado: true })
            .where(eq(clinicConsultasTable.id, consulta.id));
        } catch { /* silent */ }
      }, ms2h);
    }
  });
});

router.patch("/tenants/:tenantId/clinic/consultas/:id/status", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { status } = req.body as { status: string };
  const statusValidos = ["agendada", "confirmada", "realizada", "cancelada", "faltou"] as const;
  if (!statusValidos.includes(status as any)) {
    return res.status(422).json({ error: `status inválido. Valores: ${statusValidos.join(", ")}` });
  }

  const [existing] = await db
    .select()
    .from(clinicConsultasTable)
    .where(and(eq(clinicConsultasTable.id, id), eq(clinicConsultasTable.tenantId, tenantId)));

  if (!existing) return res.status(404).json({ error: "Consulta not found" });

  const [consulta] = await db
    .update(clinicConsultasTable)
    .set({ status })
    .where(eq(clinicConsultasTable.id, id))
    .returning();

  res.json(consulta);

  // Se realizada → criar rascunho de prontuário se não existir
  if (status === "realizada") {
    setImmediate(async () => {
      try {
        const [pExisting] = await db
          .select({ id: clinicProntuariosTable.id })
          .from(clinicProntuariosTable)
          .where(eq(clinicProntuariosTable.consultaId, id));

        if (!pExisting) {
          await db.insert(clinicProntuariosTable).values({
            tenantId,
            pacienteId: existing.pacienteId,
            consultaId: id,
          } as any);
        }
      } catch { /* silent — prontuário pode ser criado manualmente */ }
    });
  }
});

// ─── Prontuários ──────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/clinic/prontuarios/consulta/:consultaId", async (req, res) => {
  const { tenantId, consultaId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .select()
    .from(clinicProntuariosTable)
    .where(
      and(
        eq(clinicProntuariosTable.tenantId, tenantId),
        eq(clinicProntuariosTable.consultaId, consultaId),
      ),
    )
    .limit(1);
  return res.json(row ?? null);
});

router.get("/tenants/:tenantId/clinic/consultas/:id", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [consulta] = await db
    .select()
    .from(clinicConsultasTable)
    .where(and(eq(clinicConsultasTable.id, id), eq(clinicConsultasTable.tenantId, tenantId)))
    .limit(1);
  if (!consulta) return res.status(404).json({ error: "Consulta not found" });

  const [paciente, medico] = await Promise.all([
    consulta.pacienteId
      ? db.select({ id: leadsTable.id, nome: leadsTable.nome }).from(leadsTable).where(eq(leadsTable.id, consulta.pacienteId)).limit(1).then((r) => r[0] ?? null)
      : null,
    consulta.medicoId
      ? db.select({ id: clinicMedicosTable.id, nome: clinicMedicosTable.nome, crm: clinicMedicosTable.crm }).from(clinicMedicosTable).where(eq(clinicMedicosTable.id, consulta.medicoId)).limit(1).then((r) => r[0] ?? null)
      : null,
  ]);

  return res.json({ ...consulta, paciente, medico });
});

router.get("/tenants/:tenantId/clinic/pacientes/:pacienteId/prontuarios", async (req, res) => {
  const { tenantId, pacienteId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(clinicProntuariosTable)
    .where(
      and(
        eq(clinicProntuariosTable.tenantId, tenantId),
        eq(clinicProntuariosTable.pacienteId, pacienteId),
      ),
    )
    .orderBy(desc(clinicProntuariosTable.createdAt));

  return res.json(rows);
});

router.post("/tenants/:tenantId/clinic/prontuarios", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(clinicProntuariosTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/clinic/prontuarios/:id", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(clinicProntuariosTable)
    .set({ ...req.body, updatedAt: new Date() } as any)
    .where(and(eq(clinicProntuariosTable.id, id), eq(clinicProntuariosTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Prontuário not found" });
  return res.json(row);
});

export default router;
