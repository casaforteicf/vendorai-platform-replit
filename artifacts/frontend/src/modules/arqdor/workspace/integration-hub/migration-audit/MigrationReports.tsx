import React from "react";
import { migrations, mockInventory, traceLinks } from "./migrationData";
import { MetricCard } from "./MetricCard";

export function MigrationReports() {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Migrações" value={String(migrations.length)} description="Planos de migração." />
        <MetricCard label="Mocks" value={String(mockInventory.length)} description="Arquivos com dados simulados." />
        <MetricCard label="Trace links" value={String(traceLinks.length)} description="Entidades rastreáveis." />
        <MetricCard label="Status" value="Em implantação" description="Sprint 017D finaliza governança." />
      </section>

      <section className="rounded-[34px] border border-slate-100 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Relatório</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">Migration & Audit Summary</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          Relatório consolidado de migração mock → API real, auditoria, rastreabilidade, rollback e checklist.
        </p>

        <button type="button" className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700">
          Gerar relatório PDF
        </button>
      </section>
    </div>
  );
}
