import { useMemo } from "react";
import type { ArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalQuantityRows, architecturalScheduleCsv } from "./conceptArchitecturalSchedule";
export function ConceptArchitecturalSchedule({ model }: { model: ArchitecturalModel }) {
  const rows = useMemo(() => architecturalQuantityRows(model), [model]);
  function download() {
    const url = URL.createObjectURL(new Blob([architecturalScheduleCsv(model)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "quantitativos-arqdor.csv";
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <section className="space-y-2" aria-label="Quantitativos arquitetônicos">
    <h4 className="text-sm font-semibold">Quantitativos do modelo</h4>
    <p className="text-xs text-slate-500">Lajes descontam vãos manuais e de escadas. Volume geométrico sem perdas. Coberturas: projeção horizontal com beiral.</p>
    {rows.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><caption className="sr-only">Quantitativos por elemento; pavimento zero é o térreo</caption>
      <thead><tr>{["ID", "Pav.", "Medição", "Quantidade"].map(label => <th key={label} scope="col" className="p-1 text-left">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={`${row.id}-${i}`}><th scope="row" className="p-1 text-left font-normal">{row.id}</th><td>{row.floor ?? "—"}</td><td>{row.item}</td><td>{row.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {row.unit}</td></tr>)}</tbody>
    </table></div> : <p className="text-xs">Adicione elementos para gerar os quantitativos.</p>}
    <button type="button" disabled={!rows.length} onClick={download} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Exportar quantitativos CSV</button>
  </section>;
}
