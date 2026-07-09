import React from "react";
import { roles } from "./tenantAdminData";
import { adminStatusClass, adminStatusLabel, riskClass } from "./tenantAdminUtils";

export function RolesPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Permissões</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Papéis, escopo e políticas</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {roles.map((role) => (
          <article key={role.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskClass(role.risk)}`}>
                risco {role.risk}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${adminStatusClass(role.status)}`}>
                {adminStatusLabel(role.status)}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{role.role}</p>
            <p className="mt-1 text-sm text-slate-500">{role.scope}</p>

            <div className="mt-5 space-y-2">
              {role.permissions.map((permission) => (
                <div key={permission} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  {permission}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
