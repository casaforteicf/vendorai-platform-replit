import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ImageIcon, Loader2, MessageSquarePlus } from "lucide-react";

type Cena = { id: string; nome: string | null; ambienteId?: string | null };

type OfficialVersion = {
  id: string;
  parentRenderId: string | null;
  ambiente: string;
  operationType: string | null;
  materialId: string | null;
  materialName: string | null;
  resultImageUrl: string | null;
  originalImageUrl: string | null;
  versionTag: string | null;
  status: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  createdAt: string;
  concluidoEm: string | null;
  versionNumber: number;
};

type VersionsResponse = {
  project: { id: string; title: string; clientName: string | null };
  versions: OfficialVersion[];
};

function getBase() {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

function imageSrc(url: string | null) {
  if (!url) return "";
  return url.startsWith("/api") ? `${getBase()}${url}` : url;
}

export default function PortalOfficialRenderHistory({ token, cenas }: { token: string; cenas: Cena[] }) {
  const [versions, setVersions] = useState<OfficialVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<OfficialVersion | null>(null);
  const [selectedCenaId, setSelectedCenaId] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/portal/arqdor/${token}/versions`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Não foi possível carregar o histórico oficial.");
        return res.json() as Promise<VersionsResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setVersions(data.versions ?? []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar versões.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const latest = useMemo(() => versions[versions.length - 1] ?? null, [versions]);

  async function submitRevision() {
    if (!selectedVersion || !selectedCenaId || !notes.trim()) return;
    setSending(true);
    setSent(false);
    try {
      const res = await fetch(`/api/portal/arqdor/${token}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cenaId: selectedCenaId,
          sourceAiRenderId: selectedVersion.id,
          observacoes: notes.trim(),
        }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Não foi possível registrar a revisão.");
      setSent(true);
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar revisão.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border bg-white p-5 flex items-center gap-3 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> Carregando histórico oficial do projeto…
      </section>
    );
  }

  if (error && versions.length === 0) return null;
  if (versions.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-violet-600" />
          <div>
            <h2 className="text-lg font-semibold">Versões oficiais</h2>
            <p className="text-xs text-gray-500">Histórico persistido do Render Studio</p>
          </div>
        </div>
        {latest?.approvedAt && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> Versão aprovada
          </span>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {versions.map((version) => {
          const url = imageSrc(version.resultImageUrl);
          const approved = Boolean(version.approvedAt) || version.operationType === "approved" || version.versionTag === "aprovado";
          return (
            <button
              key={version.id}
              type="button"
              onClick={() => {
                setSelectedVersion(version);
                setSent(false);
                setSelectedCenaId((current) => current || cenas[0]?.id || "");
              }}
              className={`shrink-0 w-44 text-left rounded-xl border bg-white overflow-hidden transition-shadow hover:shadow-md ${selectedVersion?.id === version.id ? "ring-2 ring-violet-500" : ""}`}
            >
              {url ? (
                <img src={url} alt={`Versão ${version.versionNumber}`} className="w-full h-28 object-cover" />
              ) : (
                <div className="w-full h-28 bg-gray-100 flex items-center justify-center"><ImageIcon className="h-6 w-6 text-gray-300" /></div>
              )}
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">V{version.versionNumber}</span>
                  {approved && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                </div>
                <p className="text-[11px] text-gray-500 truncate mt-1">{version.ambiente || "Ambiente"}</p>
                {version.materialName && <p className="text-[11px] text-violet-600 truncate">{version.materialName}</p>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedVersion && (
        <div className="mt-4 rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquarePlus className="h-4 w-4 text-violet-600" />
            <p className="font-semibold text-sm">Solicitar revisão da V{selectedVersion.versionNumber}</p>
          </div>
          <div className="grid sm:grid-cols-[220px_1fr] gap-3">
            <label className="text-xs text-gray-500">
              Cena/ambiente
              <div className="relative mt-1">
                <select
                  value={selectedCenaId}
                  onChange={(e) => setSelectedCenaId(e.target.value)}
                  className="w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-sm bg-white"
                >
                  <option value="">Selecione</option>
                  {cenas.map((cena) => <option key={cena.id} value={cena.id}>{cena.nome ?? "Cena"}</option>)}
                </select>
                <ChevronDown className="h-4 w-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </label>
            <label className="text-xs text-gray-500">
              O que deve ser revisado?
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Descreva a alteração desejada nesta versão…"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm resize-none"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-xs">
              {sent ? <span className="text-emerald-600">✓ Revisão registrada e vinculada a esta versão.</span> : error ? <span className="text-red-600">{error}</span> : <span className="text-gray-400">A equipe verá exatamente qual versão originou o pedido.</span>}
            </div>
            <button
              type="button"
              onClick={() => void submitRevision()}
              disabled={sending || !selectedCenaId || !notes.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar revisão
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
