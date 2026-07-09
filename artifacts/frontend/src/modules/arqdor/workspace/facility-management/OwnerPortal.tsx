import React from "react";

export function OwnerPortal() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Portal do proprietário</p>
      <h2 className="mt-2 text-3xl font-semibold text-slate-950">Entrega e pós-obra</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
        Portal para o proprietário acessar manual digital, garantias, documentos, chamados, agenda preventiva e histórico de manutenção.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {["Manual", "Garantias", "Chamados", "Manutenção"].map((item, index) => (
          <div key={item} className={["rounded-3xl p-5", index === 0 ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-800"].join(" ")}>
            <p className="text-sm font-semibold">{item}</p>
            <p className={["mt-2 text-xs leading-5", index === 0 ? "text-slate-300" : "text-slate-500"].join(" ")}>
              Acesso direto pelo proprietário.
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
