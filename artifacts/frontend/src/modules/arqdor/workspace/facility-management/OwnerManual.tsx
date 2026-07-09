import React from "react";

export function OwnerManual() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Manual digital</p>
      <h2 className="mt-2 text-3xl font-semibold text-slate-950">Manual do Proprietário</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
        Entrega técnica com orientações de uso, manutenção, garantias, fornecedores, assistência e documentação final do projeto.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {["Uso", "Limpeza", "Garantias", "Assistência"].map((item, index) => (
          <div key={item} className={["rounded-3xl p-5", index === 0 ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-800"].join(" ")}>
            <p className="text-sm font-semibold">{item}</p>
            <p className={["mt-2 text-xs leading-5", index === 0 ? "text-slate-300" : "text-slate-500"].join(" ")}>
              Conteúdo técnico para o proprietário.
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
