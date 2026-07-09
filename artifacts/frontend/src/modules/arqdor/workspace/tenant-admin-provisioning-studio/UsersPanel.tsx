import React from "react";
import { users } from "./tenantAdminData";
import { adminStatusClass, adminStatusLabel } from "./tenantAdminUtils";

export function UsersPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Usuários</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Usuários, papéis e acesso</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{user.name}</td>
                <td className="px-4 py-4 text-slate-500">{user.email}</td>
                <td className="px-4 py-4 text-slate-500">{user.tenant}</td>
                <td className="px-4 py-4 text-slate-500">{user.role}</td>
                <td className="px-4 py-4 text-slate-500">{user.lastAccess}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${adminStatusClass(user.status)}`}>
                    {adminStatusLabel(user.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
