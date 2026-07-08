import React from "react";
import { permissions } from "./automationAuditData";
import { permissionClass } from "./automationAuditUtils";

export function PermissionsCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Permissions Center</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Permissões por perfil</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {permissions.map((permission) => (
          <article key={permission.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{permission.role}</p>
                <p className="mt-1 text-sm text-slate-500">{permission.module}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${permissionClass(permission.status)}`}>{permission.status}</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{permission.permission}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
