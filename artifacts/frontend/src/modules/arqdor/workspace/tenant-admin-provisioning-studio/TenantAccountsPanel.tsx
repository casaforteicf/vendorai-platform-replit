import React from "react";
import { tenants } from "./tenantAdminData";
import { adminStatusClass, adminStatusLabel, healthClass } from "./tenantAdminUtils";

export function TenantAccountsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Tenants</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Contas, planos, saúde e próxima ação</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {tenants.map((tenant) => (
          <article key={tenant.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{tenant.name}</p>
                <p className="mt-1 text-sm text-slate-500">/{tenant.slug}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${adminStatusClass(tenant.status)}`}>
                {adminStatusLabel(tenant.status)}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthClass(tenant.health)}`}>
                {tenant.health}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {tenant.plan}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Usuários" value={String(tenant.users)} />
              <Info label="Projetos" value={String(tenant.projects)} />
              <Info label="Região" value={tenant.region} />
              <Info label="Criado" value={tenant.createdAt} />
            </div>

            <div className="mt-4 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Próxima ação</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{tenant.nextAction}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
