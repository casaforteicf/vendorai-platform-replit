import { useRef, useState } from "react";

export type GalleryVersion = {
  renderId: string;
  resultImageUrl: string;
  generatedAt: string;
  renderView: "exterior" | "interior";
  canRegenerate?: boolean;
  versionNumber?: number;
};

export function ConceptRenderGalleryActions({ versions, selected, primaryId, processing, onPrimary, onRegenerated }: {
  versions: GalleryVersion[];
  selected: GalleryVersion;
  primaryId: string | null;
  processing: boolean;
  onPrimary: (id: string) => void;
  onRegenerated: (id: string) => void;
}) {
  const [pending, setPending] = useState<"primary" | "regenerate" | "variation" | "download" | null>(null);
  const [lighting, setLighting] = useState("day");
  const [error, setError] = useState<string | null>(null);
  const [compareId, setCompareId] = useState("");
  const busy = useRef(false);
  const requests = useRef<Record<string, string>>({});
  const compared = versions.find((version) => version.renderId === compareId && version.renderId !== selected.renderId);
  const act = async (action: "primary" | "regenerate" | "variation") => {
    if (busy.current || (action !== "primary" && processing)) return;
    busy.current = true;
    setPending(action);
    setError(null);
    const requestKey = `${selected.renderId}:${action === "variation" ? lighting : "same"}`;
    try {
      // Retain this key after a lost response: retrying must recover the same job.
      const requestId = action !== "primary"
        ? (requests.current[requestKey] ??= crypto.randomUUID()) : undefined;
      const response = await fetch(`/api/arch/ai-render/${encodeURIComponent(selected.renderId)}/${action === "variation" ? "regenerate" : action}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, lighting: action === "variation" ? lighting : undefined }),
      });
      const body = await response.json();
      if (!response.ok || !body.render_id) {
        if (response.status >= 400 && response.status < 500) delete requests.current[requestKey];
        throw new Error(body.error ?? "Não foi possível salvar esta ação.");
      }
      if (action === "primary") onPrimary(body.render_id);
      else {
        delete requests.current[requestKey];
        onRegenerated(body.render_id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha de conexão. Tente novamente.");
    } finally {
      busy.current = false;
      setPending(null);
    }
  };
  const download = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending("download");
    setError(null);
    let url: string | undefined;
    try {
      const response = await fetch(selected.resultImageUrl);
      if (!response.ok) throw new Error("Não foi possível baixar a imagem. Use Abrir imagem para salvá-la.");
      const blob = await response.blob();
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
      link.download = `arqdor-render-${selected.renderId}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError("Não foi possível baixar a imagem. Use Abrir imagem para salvá-la.");
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 1000);
      busy.current = false;
      setPending(null);
    }
  };
  const buttonClass = "min-h-11 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50";
  return (
    <section aria-label="Ações da versão selecionada" className="space-y-3 rounded-2xl border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass} disabled={pending !== null || primaryId === selected.renderId} onClick={() => void act("primary")}>
          {pending === "primary" ? "Salvando…" : primaryId === selected.renderId ? "Render principal" : "Definir como principal"}
        </button>
        <button type="button" className={buttonClass} disabled={pending !== null || processing || !selected.canRegenerate} onClick={() => void act("regenerate")}>
          {pending === "regenerate" ? "Criando versão…" : "Regenerar com referência salva"}
        </button>
        <button type="button" className={buttonClass} disabled={pending !== null} onClick={() => void download()}>
          {pending === "download" ? "Baixando…" : "Baixar imagem"}
        </button>
        <label className="flex min-w-0 items-center gap-2 text-xs font-semibold">
          Iluminação da variação
          <select value={lighting} disabled={pending !== null} onChange={(event) => setLighting(event.target.value)} className="min-h-11 rounded-xl border bg-white px-3">
            <option value="day">Dia</option><option value="sunset">Entardecer</option><option value="night">Noite</option>
          </select>
        </label>
        <button type="button" className={buttonClass} disabled={pending !== null || processing || !selected.canRegenerate} onClick={() => void act("variation")}>
          {pending === "variation" ? "Criando variação…" : "Gerar variação de luz"}
        </button>
        {versions.length > 1 && (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold">
            Comparar com
            <select className="min-h-11 max-w-full rounded-xl border bg-white px-3" value={compared?.renderId ?? ""} onChange={(event) => setCompareId(event.target.value)}>
              <option value="">Escolher versão</option>
              {versions.map((version, index) => version.renderId !== selected.renderId && (
                <option key={version.renderId} value={version.renderId}>V{version.versionNumber ?? index + 1} · {version.renderView === "interior" ? "Interior" : "Fachada"} · {new Date(version.generatedAt).toLocaleString("pt-BR")}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">O principal aparece no resultado do pré-projeto. Regenerar cria uma nova versão com a referência e as configurações salvas.</p>
      {!selected.canRegenerate && <p className="text-xs text-muted-foreground">Esta versão não tem referência salva para regeneração. Gere pela fachada ou pelo 3D.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {compared && (
        <div className="grid gap-3 md:grid-cols-2" aria-label="Comparação de renders">
          {[selected, compared].map((version) => (
            <figure key={version.renderId} className="min-w-0 rounded-xl border bg-slate-50 p-2">
              <img src={version.resultImageUrl} alt={`Render versão ${version.versionNumber ?? versions.findIndex((item) => item.renderId === version.renderId) + 1}`} className="aspect-video w-full object-contain" />
              <figcaption className="mt-2 text-xs">V{version.versionNumber ?? versions.findIndex((item) => item.renderId === version.renderId) + 1} · {new Date(version.generatedAt).toLocaleString("pt-BR")}{version.renderId === primaryId ? " · Principal" : ""}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
