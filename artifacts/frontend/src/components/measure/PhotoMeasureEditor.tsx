import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queuePhoto, getQueuedPhoto, removeQueuedPhoto } from "./offlinePhotoQueue";

/** Positions are normalized to the displayed image, not inferred physical coordinates. */
export type PhotoMeasure = {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  millimeters: number;
  label: string;
  photoPath?: string;
  source: "manual_verified";
};

type Props = {
  itemId: string;
  offlineKey?: string;
  imageUrl?: string | null;
  onClose: () => void;
  initialMeasurements?: PhotoMeasure[];
  readOnly?: boolean;
  onSave?: (measurements: PhotoMeasure[]) => Promise<void>;
  onUpload?: (file: File) => Promise<{ storageUrl: string; accessUrl: string }>;
  photos?: Array<{ storageUrl: string; accessUrl: string }>;
};

export default function PhotoMeasureEditor({ itemId, offlineKey, imageUrl, onClose, initialMeasurements = [], readOnly = false, onSave, onUpload, photos = [] }: Props) {
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [measures, setMeasures] = useState<PhotoMeasure[]>(initialMeasurements);
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [queued, setQueued] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedPhotoPath, setSelectedPhotoPath] = useState<string | null>(null);
  const [millimeters, setMillimeters] = useState("");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedPhoto = photos.find((photo) => photo.storageUrl === selectedPhotoPath);
  const activePath = selectedPhotoPath ?? photos.at(-1)?.storageUrl ?? null;
  const currentImage = localImage ?? uploadedImage ?? selectedPhoto?.accessUrl ?? photos.at(-1)?.accessUrl ?? imageUrl ?? null;
  const visibleMeasures = measures.filter((m) => (m.photoPath ?? null) === activePath);

  useEffect(() => {
    if (!offlineKey) return;
    let active = true;
    void getQueuedPhoto(offlineKey).then(p => { if (active && p) setQueued(true); }).catch(() => {});
    return () => { active = false; };
  }, [offlineKey]);
  useEffect(() => {
    return () => { if (localImage) URL.revokeObjectURL(localImage); };
  }, [localImage]);

  function selectImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
      setMessage("Escolha uma imagem de até 15 MB.");
      return;
    }
    setSelectedFile(file);
    setUploadedImage(null);
    setLocalImage(URL.createObjectURL(file));
    setPoints([]);
    setMessage("Foto local: ainda não enviada nem salva no servidor.");
  }

  function markPoint(event: React.MouseEvent<HTMLDivElement>) {
    if (!currentImage || readOnly || points.length >= 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setPoints((previous) => [...previous, { x, y }]);
  }

  function addMeasure() {
    if (readOnly) return;
    const value = Number(millimeters.replace(",", "."));
    if (points.length !== 2 || !Number.isFinite(value) || value <= 0 || value > 1000000) {
      setMessage("Marque dois pontos e informe a medida real positiva em milímetros.");
      return;
    }
    setMeasures((previous) => [...previous, {
      id: crypto.randomUUID(),
      start: points[0],
      end: points[1],
      millimeters: value,
      label: label.trim().slice(0, 120) || "Medida",
      source: "manual_verified",
      ...(activePath ? { photoPath: activePath } : {}),
    }]);
    setPoints([]);
    setMillimeters("");
    setLabel("");
    setMessage("Cota adicionada ao rascunho local. Exporte para preservar.");
  }

  function exportAnnotations() {
    const payload = {
      schemaVersion: 1,
      itemId,
      imageReference: localImage ? null : (imageUrl ?? null),
      localPhotoRequiresUpload: Boolean(localImage),
      measurements: measures,
      exportedAt: new Date().toISOString(),
      note: "As medidas foram informadas manualmente; a imagem não permite aferição automática exata.",
    };
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "arqdor-measure-" + itemId.replace(/[^a-z0-9_-]/gi, "") + ".json";
    link.click();
    URL.revokeObjectURL(objectUrl);
    setMessage("Anotações exportadas em JSON. Fotos locais não estão incluídas.");
  }

  return (
    <section aria-label="Medição fotográfica" className="mt-4 space-y-3 rounded-lg border p-3 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Arqdor Measure — Foto e cotas</h3>
          <p className="text-xs text-muted-foreground">Marque dois pontos na foto e digite a medida aferida com trena ou laser. Nenhuma distância é calculada a partir da foto.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>Fechar</Button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => selectImage(e.currentTarget.files?.[0])} />
      <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>Fotografar / escolher imagem</Button>
      {offlineKey && selectedFile && !readOnly && <Button size="sm" variant="outline" disabled={saving} onClick={async () => {
        try { await queuePhoto(offlineKey, selectedFile); setQueued(true); setMessage("Foto guardada no dispositivo. Envio manual pendente."); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao guardar fotografia offline."); }
      }}>Guardar foto offline</Button>}
      {offlineKey && queued && onUpload && !readOnly && <Button size="sm" variant="outline" disabled={saving} onClick={async () => {
        setSaving(true);
        try {
          const saved = await getQueuedPhoto(offlineKey);
          if (!saved) throw new Error("Foto offline não encontrada");
          const photo = await onUpload(new File([saved.file], saved.name, { type: saved.mime }));
          await removeQueuedPhoto(offlineKey);
          setQueued(false); setSelectedFile(null); setLocalImage(null);
          setSelectedPhotoPath(photo.storageUrl); setUploadedImage(photo.accessUrl);
          setMessage("Foto sincronizada com o checklist.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Envio falhou. A foto permanece no dispositivo."); }
        finally { setSaving(false); }
      }}>Enviar foto offline</Button>}
      {selectedFile && onUpload && <Button disabled={saving || readOnly} onClick={async () => {
        setSaving(true); setMessage("");
        try {
          const photo = await onUpload(selectedFile);
          setUploadedImage(photo.accessUrl);
          setSelectedPhotoPath(photo.storageUrl);
          setSelectedFile(null);
          setLocalImage(null);
          setMessage("Fotografia salva no armazenamento privado. Marque as cotas e salve no checklist.");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Falha no upload.");
        } finally { setSaving(false); }
      }}>{saving ? "Enviando..." : "Salvar fotografia no R2"}</Button>}
      {photos.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Fotografias do levantamento">
        {photos.map((photo, index) => <Button key={photo.storageUrl} size="sm" variant={activePath === photo.storageUrl ? "default" : "outline"} onClick={() => { setSelectedPhotoPath(photo.storageUrl); setUploadedImage(null); setPoints([]); }}>Foto {index + 1}</Button>)}
      </div>}
      {currentImage ? (
        <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded border bg-slate-950" onClick={markPoint} role="button" tabIndex={0} aria-label="Marcar pontos da medida na fotografia" onKeyDown={(e) => { if (e.key === "Escape") setPoints([]); }}>
          <img src={currentImage} alt="Fotografia de referência para medição" className="block w-full select-none" draggable={false} />
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {visibleMeasures.map((m) => (
              <g key={m.id}>
                <line x1={m.start.x * 100} y1={m.start.y * 100} x2={m.end.x * 100} y2={m.end.y * 100} stroke="#facc15" strokeWidth="0.55" vectorEffect="non-scaling-stroke" />
                <circle cx={m.start.x * 100} cy={m.start.y * 100} r="0.9" fill="#facc15" />
                <circle cx={m.end.x * 100} cy={m.end.y * 100} r="0.9" fill="#facc15" />
                <text x={(m.start.x + m.end.x) * 50} y={(m.start.y + m.end.y) * 50} fontSize="2.8" fill="#ffffff" stroke="#000000" strokeWidth="0.65" paintOrder="stroke" textAnchor="middle">{m.millimeters} mm</text>
              </g>
            ))}
            {points.map((p, index) => <circle key={index} cx={p.x * 100} cy={p.y * 100} r="1.1" fill="#22d3ee" />)}
          </svg>
        </div>
      ) : <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">Escolha uma foto para começar.</p>}
      <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
        <Input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="Identificação: vão, parede, peitoril..." aria-label="Identificação da cota" />
        <Input value={millimeters} onChange={(e) => setMillimeters(e.target.value)} inputMode="decimal" placeholder="Medida (mm)" aria-label="Medida real em milímetros" />
        <Button disabled={readOnly || !currentImage || points.length !== 2} onClick={addMeasure}>Adicionar cota ({points.length}/2)</Button>
      </div>
      {measures.length > 0 && (
        <div className="space-y-2">
          {measures.map((m) => <div key={m.id} className="flex items-center justify-between gap-2 text-sm"><span>{m.label}: {m.millimeters} mm</span><Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setMeasures((list) => list.filter((entry) => entry.id !== m.id))}>Remover</Button></div>)}
          {onSave && <Button disabled={saving || readOnly || Boolean(localImage)} onClick={async () => {
            setSaving(true); setMessage("");
            try { await onSave(measures); setMessage("Cotas persistidas no checklist."); }
            catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao salvar cotas."); }
            finally { setSaving(false); }
          }}>{saving ? "Salvando..." : "Salvar cotas no checklist"}</Button>}
          <Button variant="outline" onClick={exportAnnotations}>Exportar anotações JSON</Button>
        </div>
      )}
      <p className="text-xs text-amber-700" role="status">{message || "Rascunho local: ainda não integrado ao armazenamento R2 nem à aprovação para fabricação."}</p>
    </section>
  );
}
