import { useEffect, useMemo, useState } from "react";
import { renderAuthHeader } from "./renderStudioApi";

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
  modelSha256?: string;
  openingScheduleDraft?: OpeningRow[];
};

type ReviewItem = OpeningRow & { reasons: string[]; key: string };

export default function RenderStudioOpeningReview({ sourceSha256, url, modelId }: { sourceSha256: string; url: string; modelId: string }) {
  const [rows, setRows] = useState<ReviewItem[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noReport, setNoReport] = useState(false);
  const filtered = useMemo(() => rows.filter(row =>
    (!onlyConflicts || row.reasons.length > 0) &&
    (!search || [row.opening, row.objectId, row.sourceObjectKey].some(
      value => String(value ?? "").toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))))),
    [rows, search, onlyConflicts]);

  function applyReport(data: Report) {
      const digest = data.sourceSha256?.toLowerCase() ?? "";
      if (!/^[a-f0-9]{64}$/.test(digest) || data.modelSha256?.toLowerCase() !== sourceSha256.toLowerCase()) {
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
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoaded(false); setRows([]); setError(""); setNoReport(false);
    fetch(`${url}/${encodeURIComponent(modelId)}/conversion-report`, {
      headers: renderAuthHeader(), signal: controller.signal,
    }).then(async response => {
      if (response.status === 404) { setNoReport(true); return; }
      if (!response.ok) throw new Error(`Falha ao consultar relatório (${response.status}).`);
      applyReport(await response.json() as Report);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha de leitura.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, modelId, sourceSha256]);

  return <section className="rounded-lg border p-4 space-y-3" aria-label="Revisão preliminar de esquadrias">
    <div>
      <h3 className="font-semibold">4. Conferir portas e janelas</h3>
      <p className="text-sm text-slate-600">A conferência consulta o relatório privado vinculado ao modelo convertido. É somente leitura; nenhuma decisão é salva.</p>
    </div>
    {loading && <p role="status" className="text-sm">Consultando relatório da versão selecionada…</p>}
    {noReport && <p className="text-sm text-slate-600">Sem relatório de conversão associado a este GLB.</p>}
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
