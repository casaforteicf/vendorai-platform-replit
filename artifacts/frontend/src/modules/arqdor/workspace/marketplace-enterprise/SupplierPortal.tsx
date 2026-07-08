import React, { useState } from "react";

export function SupplierPortal() {
  const [name, setName] = useState("Novo produto");
  const [sku, setSku] = useState("SKU-000");
  const [price, setPrice] = useState(0);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Portal fornecedor</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Publicar produto</h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Nome" value={name} onChange={setName} />
          <Field label="SKU" value={sku} onChange={setSku} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Preço</span>
            <input type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100" />
          </label>
          <Field label="Coleção" value="Nova coleção" onChange={() => undefined} />
        </div>

        <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-semibold text-slate-700">Upload de assets</p>
          <p className="mt-1 text-xs text-slate-500">PDF, BIM, Revit, SketchUp, DWG, Texturas e imagens.</p>
        </div>

        <button type="button" className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700">
          Publicar produto
        </button>
      </section>

      <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Prévia</p>
        <div className="mt-5 rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-base font-semibold text-slate-950">{name}</p>
          <p className="mt-1 text-sm text-slate-500">{sku}</p>
          <p className="mt-5 text-2xl font-semibold text-slate-950">R$ {price}</p>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100" />
    </label>
  );
}
