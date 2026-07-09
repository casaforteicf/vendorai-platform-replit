import React, { useState } from "react";
import type { MaterialChange } from "./renderGalleryTypes";

export function MaterialChangePanel({
  onChange,
}: {
  onChange: (changes: MaterialChange[]) => void;
}) {
  const [target, setTarget] = useState("bancada");
  const [fromMaterial, setFromMaterial] = useState("");
  const [toMaterial, setToMaterial] = useState("quartzo branco");
  const [notes, setNotes] = useState("");
  const [changes, setChanges] = useState<MaterialChange[]>([]);

  function addChange() {
    const next: MaterialChange = {
      id: crypto.randomUUID(),
      target,
      fromMaterial,
      toMaterial,
      notes,
    };

    const list = [...changes, next];
    setChanges(list);
    onChange(list);
    setNotes("");
  }

  function removeChange(id: string) {
    const list = changes.filter((item) => item.id !== id);
    setChanges(list);
    onChange(list);
  }

  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Materiais</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Alteração de material por região</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="Região/objeto" value={target} onChange={setTarget} placeholder="ex: bancada, armário inferior, piso" />
        <Field label="Material atual" value={fromMaterial} onChange={setFromMaterial} placeholder="opcional" />
        <Field label="Novo material" value={toMaterial} onChange={setToMaterial} placeholder="ex: MDF carvalho claro" />
        <Field label="Observação" value={notes} onChange={setNotes} placeholder="ex: manter medidas e puxadores" />
      </div>

      <button
        type="button"
        onClick={addChange}
        className="mt-4 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Adicionar alteração
      </button>

      <div className="mt-5 space-y-2">
        {changes.map((change) => (
          <div key={change.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--arq-card-soft)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-violet-950">{change.target} → {change.toMaterial}</p>
              <p className="text-xs text-[var(--arq-accent)]">{change.notes || "Sem observação."}</p>
            </div>
            <button type="button" onClick={() => removeChange(change.id)} className="text-xs font-semibold text-rose-600">
              remover
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      />
    </label>
  );
}
