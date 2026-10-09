import { useMemo, useState } from "react";

type OpeningRow = {
  opening?: string;
  objectId?: string;
  sourceObjectKey?: string;
  type?: string;
  hostRelationStatus?: string;
  measurementStatus?: string;
  dimensionsMeters?: { approxWidth?: number; approxHeight?: number; approxSillElevation?: number } | null;
  candidateWalls?: string[];
};
type Report = {
  sourceSha256?: string;
  openingScheduleDraft?: OpeningRow[];
};

type ReviewItem = OpeningRow & { reasons: string[]; key: string };

export default function RenderStudioOpeningReview({ sourceSha256 }: { sourceSha256: string }) {
  const [rows, setRows] = useState<ReviewItem[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const filtered = useMemo(() => rows.filter(row =>
    (!onlyConflicts || row.reasons.length > 0) &&
    (!search || [row.opening, row.objectId, row.sourceObjectKey].some(
      value => String(value ?? "").toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))))),
    [rows, search, onlyConflicts]);

  async function readReport(file: File) {
    setError(""); setLoaded(false); setRows([]);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Relatório excede 2 MB.");
      const data: Report = JSON.parse(await file.text());
      const digest = sourceSha256.toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(digest) || data.sourceSha256?.toLowerCase() !== digest) {
        throw new Error("O SHA-256 deste relatório não corresponde ao modelo selecionado.");
      }
      if (!Array.isArray(data.openingScheduleDraft) || data.openingScheduleDraft.length > 2000)
        throw new Error("Quadro de esquadrias ausente ou acima do limite.");
      const identities = new Set<string>();
      const next = data.openingScheduleDraft.map((row, index): ReviewItem => {
        if (!row || typeof row !== "object" || !["door", "window"].includes(row.type ?? ""))
          throw new Error("Registro de porta/janela inválido.");
        const identity = row.sourceObjectKey;
        if (typeof row.objectId !== "string" || !/^mesh-\d{6}$/.test(row.objectId) ||
            identity !== `${digest}:${row.objectId}` || identities.has(identity))
          throw new Error("Identificador repetido ou incompatível com o arquivo.");
        identities.add(identity);
        const reasons: string[] = [];
        if (row.measurementStatus !== "aabb_estimate_requires_review") reasons.push("Medida ambígua");
        if (row.hostRelationStatus !== "single_spatial_candidate") reasons.push("Parede não confirmada");
        if (row.dimensionsMeters == null) reasons.push("Sem dimensões calibradas");
        return { ...row, key: `${identity}:${index}`, reasons };
      });
      setRows(next); setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir o relatório.");
    }
  }

  return <section className="rounded-lg border p-4 space-y-3" aria-label="Revisão preliminar de esquadrias">
    <div>
      <h3 className="font-semibold">4. Conferir portas e janelas</h3>
      <p className="text-sm text-slate-600">Abra o JSON do relatório OBJ/FBX referente a este arquivo. A conferência é local e somente leitura; nenhuma decisão é salva.</p>
    </div>
    <label className="block text-sm font-medium">Relatório de conversão (JSON)
      <input type="file" accept=".json,application/json" className="mt-1 block w-full text-sm"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readReport(file); }} />
    </label>
    {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
    {loaded && <>
      <p role="status" className="text-sm">{rows.length} candidatos · {rows.filter(item => item.reasons.length > 0).length} com pendências</p>
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" aria-label="Buscar esquadria" placeholder="Buscar objeto ou esquadria"
          className="min-w-0 flex-1 rounded border p-2 text-sm" value={search} onChange={event => setSearch(event.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyConflicts} onChange={event => setOnlyConflicts(event.target.checked)} />
          Somente pendências
        </label>
      </div>
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {filtered.map(item => <li key={item.key} className="rounded border p-3 text-sm">
          <strong className="break-words">{item.opening || item.objectId}</strong>
          <span className="ml-2 text-slate-600">{item.type === "window" ? "Janela" : "Porta"}</span>
          <p className="break-all text-xs text-slate-500">{item.objectId}</p>
          <p>{item.reasons.length ? item.reasons.join(" · ") : "Sem conflito preliminar identificado; revisão técnica necessária"}</p>
          {item.dimensionsMeters && <p className="text-slate-600">Medidas aproximadas: {item.dimensionsMeters.approxWidth ?? "—"} × {item.dimensionsMeters.approxHeight ?? "—"} m</p>}
        </li>)}
      </ul>
      {!filtered.length && <p className="text-sm text-slate-600">Nenhuma esquadria corresponde aos filtros.</p>}
    </>}
    <p className="rounded bg-amber-50 p-3 text-xs text-amber-900">Não comprova vãos reais nem libera quadro de fabricação, orçamento ou quantitativos. A confirmação requer análise técnica e autorização.</p>
  </section>;
}
