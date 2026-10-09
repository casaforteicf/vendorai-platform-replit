import { lazy, Suspense, useEffect, useRef, useState } from "react";
const RenderStudioGlbViewer = lazy(() => import("./RenderStudioGlbViewer"));
const RenderStudioOpeningReview = lazy(() => import("./RenderStudioOpeningReview"));
import type { FormEvent } from "react";
import { renderAuthHeader } from "./renderStudioApi";

type Model = {
  id: string; originalName: string; createdAt: string; bytes: number; sha256: string; meshCount: number;
  materials: { name: string; specificationStatus: "unconfirmed" }[];
};
type Calibration = {
  measuredDistance: number; actualMeters: number; referenceDimensions: { width: number; depth: number; height: number };
  tolerance: number;
};

async function modelRequest(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { ...renderAuthHeader(), ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Não foi possível concluir a operação (${response.status})`);
  return data;
}

function CalibrationForm({ url, model }: { url: string; model: Model }) {
  const [fields, setFields] = useState({ measuredDistance: "", actualMeters: "", width: "", depth: "", height: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    modelRequest(`${url}/${model.id}/calibrations`, { signal: controller.signal }).then(drafts => {
      const calibration = drafts[0]?.calibration as Calibration | undefined;
      if (calibration) {
        setFields({ measuredDistance: String(calibration.measuredDistance), actualMeters: String(calibration.actualMeters),
          width: String(calibration.referenceDimensions.width), depth: String(calibration.referenceDimensions.depth), height: String(calibration.referenceDimensions.height) });
        setSaved(true);
      }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, model.id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setSaved(false);
    try {
      await modelRequest(`${url}/${model.id}/calibrations`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measuredDistance: Number(fields.measuredDistance), actualMeters: Number(fields.actualMeters),
          referenceDimensions: { width: Number(fields.width), depth: Number(fields.depth), height: Number(fields.height) }, tolerance: .01 }) });
      setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Falha ao salvar medidas"); }
    finally { setSaving(false); }
  }

  const labels = { measuredDistance: "Distância medida no modelo (unidade original)", actualMeters: "Distância real correspondente (m)",
    width: "Largura independente — eixo X (m)", depth: "Profundidade independente — eixo Y (m)", height: "Altura independente — eixo Z (m)" };
  return <form onSubmit={save} className="space-y-4" aria-busy={loading || saving}>
    <h3 className="font-semibold">2. Conferir escala e geometria</h3>
    <p className="text-sm text-slate-600">Use uma distância conhecida para calibrar a escala. Confira as outras três medidas por uma fonte independente, como planta ou levantamento. Os eixos correspondem ao modelo após importação no Blender.</p>
    {loading ? <p role="status">Recuperando medidas salvas…</p> : <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(labels) as Array<keyof typeof labels>).map(field => <label key={field} className="text-sm space-y-1">
        <span className="block">{labels[field]}</span>
        <input className="w-full rounded-md border p-2" type="number" min="0.000001" step="any" required value={fields[field]}
          onChange={event => { setFields(previous => ({ ...previous, [field]: event.target.value })); setSaved(false); }} />
      </label>)}
      <button className="rounded-md bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-white sm:col-span-2" type="submit">{saving ? "Salvando…" : "Salvar referências desta versão"}</button>
    </fieldset>}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {saved ? <p role="status" className="text-sm text-emerald-700">Referências salvas. A conferência das dimensões no worker ainda está pendente.</p> : null}
    <p className="text-sm rounded-md bg-amber-50 p-3 text-amber-900">A escala não aprova a geometria. Revise paredes, aberturas, pavimentos, plantas e cortes antes de usar quantitativos. Quantitativos permanecem bloqueados.</p>
  </form>;
}

export default function RenderStudioModels({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [selectedMesh, setSelectedMesh] = useState<string | null>(null);
  const url = `/api/arch/projetos/${encodeURIComponent(projectId)}/model-files`;
  const selected = models.find(model => model.id === selectedId);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    modelRequest(url, { signal: controller.signal }).then(data => {
      setConfigured(data.configured); setModels(data.models); setSelectedId(data.models[0]?.id ?? "");
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url]);

  async function upload(file: File) {
    if (!/\.glb$/i.test(file.name) || file.size > 45 * 1024 * 1024) {
      setError("Escolha um GLB com recursos incorporados de até 45 MB."); return;
    }
    setUploading(true); setError("");
    try {
      const body = new FormData(); body.append("file", file);
      const model = await modelRequest(url, { method: "POST", body });
      setModels(previous => [model, ...previous]); setSelectedId(model.id);
    } catch (error) { setError(error instanceof Error ? error.message : "Falha ao importar modelo"); }
    finally { setUploading(false); }
  }

  async function download(model: Model) {
    setError("");
    try {
      const response = await fetch(`${url}/${model.id}/file`, { headers: renderAuthHeader() });
      if (!response.ok) throw new Error("Não foi possível baixar o arquivo original");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = objectUrl; link.download = model.originalName;
      link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { setError(error instanceof Error ? error.message : "Falha no download"); }
  }

  return <dialog ref={dialog} aria-labelledby="arqdor-model-title" className="w-[min(1000px,95vw)] max-h-[90vh] rounded-xl bg-white p-0 text-slate-900 backdrop:bg-black/40"
    onCancel={event => { event.preventDefault(); if (!uploading) onClose(); }}>
    <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-4">
      <div><h2 id="arqdor-model-title" className="text-lg font-bold">Modelos 3D do projeto</h2><p className="text-sm text-slate-600">Importação e preparação para render</p></div>
      <button type="button" disabled={uploading} className="rounded-md border px-3 py-2 disabled:opacity-50" onClick={onClose}>Fechar</button>
    </header>
    <div className="grid gap-6 p-4 md:grid-cols-[240px_1fr]">
      <aside className="space-y-4">
        <h3 className="font-semibold">1. Importar modelo</h3>
        <p className="text-sm text-slate-600">GLB com texturas incorporadas, até 45 MB. SKP, IFC, OBJ, FBX e GLTF aguardam validação dos conversores neste fluxo.</p>
        {loading ? <p role="status">Carregando versões…</p> : !configured ? <p role="status" className="rounded-md bg-amber-50 p-3 text-sm">O armazenamento privado precisa ser configurado para habilitar a importação.</p> : null}
        <label className="block text-sm font-medium">Arquivo GLB
          <input type="file" accept=".glb,model/gltf-binary" disabled={loading || !configured || uploading} className="mt-2 block w-full text-sm"
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
        </label>
        {uploading ? <p role="status">Importando e salvando arquivo original…</p> : null}
        <ul className="space-y-2" aria-label="Versões importadas">{models.map(model => <li key={model.id}>
          <button type="button" disabled={uploading} aria-pressed={selectedId === model.id} onClick={() => { setSelectedId(model.id); setSelectedMesh(null); }}
            className={`w-full break-words rounded-md border p-3 text-left text-sm ${selectedId === model.id ? "border-emerald-600 bg-emerald-50" : "bg-white"}`}>
            <strong className="block">{model.originalName}</strong><span className="text-xs">{new Date(model.createdAt).toLocaleString("pt-BR")}</span>
          </button>
        </li>)}</ul>
        {!loading && configured && !models.length ? <p className="text-sm text-slate-600">Importe o primeiro modelo para começar.</p> : null}
      </aside>
      <main className="min-w-0 space-y-6">
        {error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-red-700">{error}</p> : null}
        {selected ? <>
          <section className="rounded-md border bg-slate-50 p-4 space-y-2">
            <h3 className="font-semibold break-words">{selected.originalName}</h3>
            <p className="text-sm">{selected.meshCount} malhas · {(selected.bytes / 1024 / 1024).toFixed(2)} MB · versão original preservada</p>
            <button type="button" onClick={() => void download(selected)} className="text-sm underline">Baixar original</button>
            <p className="text-xs text-slate-600">Este resumo lê as informações declaradas no arquivo. A visualização 3D e a conferência da geometria estão em desenvolvimento.</p>
          </section>
          <Suspense fallback={<p role="status">Preparando visualização 3D…</p>}>
            <RenderStudioGlbViewer key={selected.id} url={url} modelId={selected.id} onSelect={setSelectedMesh} />
          </Suspense>
          <p className="text-sm text-emerald-800" role="status">Elemento selecionado: {selectedMesh ?? "nenhum"}. Edição de materiais ainda indisponível.</p>
          <CalibrationForm key={selected.id} url={url} model={selected} />
          <section className="space-y-2"><h3 className="font-semibold">3. Revisar materiais</h3>
            <p className="text-sm text-slate-600">Os nomes vêm do arquivo. Não confirmam fabricante, produto, acabamento ou especificação técnica.</p>
            <ul className="grid gap-2 sm:grid-cols-2">{selected.materials.map((material, index) => <li key={index} className="rounded-md border p-2 text-sm break-words">{material.name}<span className="block text-xs text-amber-800">Especificação não confirmada</span></li>)}</ul>
            {!selected.materials.length ? <p className="text-sm">Nenhum material declarado no arquivo.</p> : null}
          </section>
          <Suspense fallback={<p role="status">Preparando revisão de esquadrias…</p>}>
            <RenderStudioOpeningReview key={selected.id} sourceSha256={selected.sha256} url={url} modelId={selected.id} />
          </Suspense>
          <section className="rounded-md border p-4 space-y-2"><h3 className="font-semibold">5. Câmera, iluminação e render</h3>
            <p className="text-sm text-slate-600">O render 3D está em desenvolvimento e ainda não pode ser gerado por esta tela. O Render IA por imagem continua disponível no Studio.</p>
            <button type="button" disabled className="rounded-md bg-slate-200 px-4 py-2 text-slate-600">Render 3D aguardando integração</button>
          </section>
        </> : <p className="text-slate-600">Selecione ou importe um modelo. Cada arquivo terá sua própria versão e referências de escala.</p>}
      </main>
    </div>
  </dialog>;
}
