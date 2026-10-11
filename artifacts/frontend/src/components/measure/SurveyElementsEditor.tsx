import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SurveyPlanPreview from "./SurveyPlanPreview";
import { convertSurveyToArqdor } from "./convertSurveyToArqdor";
import { queueSurvey, readPendingSurvey, clearPendingSurvey } from "./offlineSurveyQueue";

export type SurveyElement = {
  id: string;
  roomName: string;
  elementType: "wall" | "door" | "window" | "column" | "beam" | "electrical" | "plumbing" | "gas" | "other";
  label: string;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  x1Mm?: number | null;
  y1Mm?: number | null;
  x2Mm?: number | null;
  y2Mm?: number | null;
  thicknessMm?: number | null;
  wallId?: string | null;
  offsetMm?: number | null;
  sillHeightMm?: number | null;
  sourcePhotoPath?: string | null;
  note?: string | null;
  verified: boolean;
};
type Props = { elements: SurveyElement[]; photos: string[]; draftKey: string; disabled?: boolean; onSave: (items: SurveyElement[]) => Promise<void> };
const types: SurveyElement["elementType"][] = ["wall","door","window","column","beam","electrical","plumbing","gas","other"];
export default function SurveyElementsEditor({ elements, photos, draftKey, disabled = false, onSave }: Props) {
  const storageKey = "arqdor-measure-session:" + draftKey;
  const [recovery] = useState<{ items: SurveyElement[]; editedAt: string } | null>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw || raw.length > 250000) return null;
      const payload = JSON.parse(raw);
      return payload && Array.isArray(payload.items) && payload.items.length <= 200 && typeof payload.editedAt === "string" && payload.items.every((e: unknown) => e && typeof e === "object" && typeof (e as SurveyElement).id === "string" && typeof (e as SurveyElement).elementType === "string") ? payload : null;
    } catch { return null; }
  });
  const [items, setItems] = useState<SurveyElement[]>(elements);
  const [dirty, setDirty] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(Boolean(recovery));
  useEffect(() => {
    if (!dirty || disabled) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ items, editedAt: new Date().toISOString() })); }
    catch { setFeedback("Não foi possível manter cópia nesta sessão. Salve o levantamento."); }
  }, [items, dirty, disabled, storageKey]);
  const [roomName, setRoomName] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<SurveyElement["elementType"]>("wall");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [photo, setPhoto] = useState("");
  const [points, setPoints] = useState(["", "", "", ""]);
  const [thickness, setThickness] = useState("150");
  const [wallId, setWallId] = useState("");
  const [offset, setOffset] = useState("");
  const [sill, setSill] = useState("0");
  const [saving, setSaving] = useState(false);
  const [offlinePending, setOfflinePending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    void readPendingSurvey(storageKey).then((pending) => { if (active && pending) { setOfflinePending(true); setFeedback("Há um levantamento pendente no dispositivo. Recupere antes de sincronizar."); } }).catch(() => {});
    return () => { active = false; };
  }, [storageKey]);
  async function recoverOffline() {
    const pending = await readPendingSurvey(storageKey);
    if (!pending) return;
    setItems(pending.items);
    setDirty(true);
    setOfflinePending(true);
    setFeedback("Medições recuperadas. Revise e sincronize quando conectado.");
  }
  async function saveWithOfflineFallback() {
    setSaving(true);
    setFeedback("");
    try {
      if (!navigator.onLine) {
        await queueSurvey(storageKey, items);
        setOfflinePending(true);
        setFeedback("Sem conexão. Medições guardadas neste dispositivo; não sincronizadas.");
        return;
      }
      await onSave(items);
      await clearPendingSurvey(storageKey);
      setOfflinePending(false);
      setDirty(false);
      sessionStorage.removeItem(storageKey);
      setFeedback("Levantamento sincronizado no checklist.");
    } catch (error) {
      if (error instanceof TypeError || !navigator.onLine) {
        try {
          await queueSurvey(storageKey, items);
          setOfflinePending(true);
          setFeedback("Falha de rede. Levantamento guardado no dispositivo para envio manual.");
        } catch { setFeedback("Erro de rede e armazenamento offline indisponível. Mantenha esta página aberta."); }
      } else {
        setFeedback(error instanceof Error ? error.message : "Não foi possível sincronizar. Os dados não foram sobrescritos.");
      }
    } finally { setSaving(false); }
  }
  function toDimension(value: string): number | null { const n = Number(value.replace(",", ".")); return value.trim() && Number.isFinite(n) && n > 0 && n <= 1000000 ? n : null; }
  function add() {
    if (!roomName.trim() || !label.trim() || (width.trim() && toDimension(width) === null) || (height.trim() && toDimension(height) === null)) { setFeedback("Preencha ambiente, identificação e medidas válidas."); return; }
    const coords = points.map((v) => Number(v.replace(",", ".")));
    if (kind === "wall" && (points.some((v) => !v.trim()) || coords.some((v) => !Number.isFinite(v) || Math.abs(v) > 1000000) || Math.hypot(coords[2]-coords[0], coords[3]-coords[1]) < 10 || !toDimension(thickness) || Number(thickness) < 50 || Number(thickness) > 1000)) {
      setFeedback("Informe X1, Y1, X2, Y2 e espessura válidos. Comprimento mínimo: 10 mm."); return;
    }
    if (kind === "door" || kind === "window") {
      const wall = items.find((e) => e.id === wallId && e.elementType === "wall" && e.verified && e.roomName === roomName.trim());
      if (!wall || !toDimension(width) || !toDimension(height) || offset.trim() === "" || !Number.isFinite(Number(offset)) || Number(offset) < 0 || (kind === "window" && (sill.trim() === "" || !Number.isFinite(Number(sill)) || Number(sill) < 0))) {
        setFeedback("Selecione parede conferida do ambiente e informe largura, altura, posição e peitoril."); return;
      }
      const length = Math.hypot((wall.x2Mm ?? 0)-(wall.x1Mm ?? 0),(wall.y2Mm ?? 0)-(wall.y1Mm ?? 0));
      if (Number(offset) + Number(width) > length) {setFeedback("Abertura ultrapassa o comprimento da parede."); return;}
    }
    const opening = kind === "door" || kind === "window" ? { wallId, offsetMm: Number(offset), sillHeightMm: kind === "window" ? Number(sill) : 0 } : {};
    const geometry = kind === "wall" ? {x1Mm:coords[0],y1Mm:coords[1],x2Mm:coords[2],y2Mm:coords[3],thicknessMm:toDimension(thickness)} : {};
    setDirty(true);
    setItems((old) => [...old, { ...geometry, ...opening, id: crypto.randomUUID(), roomName: roomName.trim(), label: label.trim(), elementType: kind, widthMm: toDimension(width), heightMm: toDimension(height), sourcePhotoPath: photo || null, verified: false }]);
    setLabel(""); setWidth(""); setHeight(""); setFeedback("Elemento adicionado; salve para persistir.");
  }
  return <section className="mt-3 rounded-lg border p-3 space-y-3 print:hidden" aria-label="Elementos do levantamento">
    <div><h3 className="font-semibold">Ambiente e elementos técnicos</h3><p className="text-xs text-muted-foreground">Inventário técnico, ainda não convertido em geometria BIM. Confira antes de liberar para fabricação.</p></div>
    {hasRecovery && <div className="rounded border border-amber-300 p-2 space-y-2 text-sm">
      Há um levantamento não salvo nesta sessão, registrado em {recovery?.editedAt}.
      <div className="flex gap-2">
        <Button size="sm" disabled={disabled} onClick={() => {if(recovery){setItems(recovery.items);setDirty(true);}setHasRecovery(false);}}>Recuperar alterações</Button>
        <Button size="sm" variant="outline" onClick={() => {sessionStorage.removeItem(storageKey);setHasRecovery(false);}}>Descartar cópia</Button>
      </div>
    </div>}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Input aria-label="Ambiente" value={roomName} maxLength={120} onChange={(e)=>setRoomName(e.target.value)} placeholder="Ambiente (ex.: Cozinha)" disabled={disabled}/>
      <select aria-label="Tipo de elemento" value={kind} onChange={(e)=>setKind(e.target.value as SurveyElement["elementType"])} disabled={disabled} className="rounded-md border bg-background px-3 py-2 text-sm">{types.map(t=><option key={t} value={t}>{t}</option>)}</select>
      <Input aria-label="Identificação" value={label} maxLength={160} onChange={(e)=>setLabel(e.target.value)} placeholder="Parede A / Janela 01" disabled={disabled}/>
      <Input aria-label="Largura em milímetros" value={width} onChange={(e)=>setWidth(e.target.value)} placeholder="Largura (mm)" inputMode="decimal" disabled={disabled}/>
      <Input aria-label="Altura em milímetros" value={height} onChange={(e)=>setHeight(e.target.value)} placeholder="Altura (mm)" inputMode="decimal" disabled={disabled}/>
      <select aria-label="Foto de referência" value={photo} onChange={(e)=>setPhoto(e.target.value)} disabled={disabled} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="">Sem foto associada</option>{photos.map((p,i)=><option key={p} value={p}>Foto {i+1}</option>)}</select>
    </div>
    {kind === "wall" && <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {["X1 (mm)","Y1 (mm)","X2 (mm)","Y2 (mm)"].map((name,i) => <Input key={name} aria-label={name} placeholder={name} value={points[i]} onChange={(e) => setPoints((old) => old.map((v,j) => i === j ? e.target.value : v))} disabled={disabled}/>)}
      <Input aria-label="Espessura (mm)" value={thickness} onChange={(e)=>setThickness(e.target.value)} disabled={disabled}/>
    </div>}
    {(kind === "door" || kind === "window") && <div className="grid gap-2 sm:grid-cols-3">
      <select aria-label="Parede de referência" className="rounded-md border bg-background px-3 py-2 text-sm" value={wallId} onChange={(e)=>setWallId(e.target.value)} disabled={disabled}>
        <option value="">Selecione parede conferida</option>
        {items.filter((e)=>e.elementType==="wall" && e.verified && e.roomName===roomName.trim()).map((w)=><option key={w.id} value={w.id}>{w.label}</option>)}
      </select>
      <Input aria-label="Deslocamento na parede em mm" value={offset} onChange={(e)=>setOffset(e.target.value)} placeholder="Distância desde início (mm)" disabled={disabled}/>
      {kind === "window" && <Input aria-label="Peitoril em mm" value={sill} onChange={(e)=>setSill(e.target.value)} placeholder="Peitoril (mm)" disabled={disabled}/>}
    </div>}
    <Button size="sm" variant="outline" disabled={disabled} onClick={add}>Adicionar elemento</Button>
    {items.map((entry)=><div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm"><span>{entry.roomName} · {entry.elementType} · {entry.label} · {entry.widthMm ?? "—"} × {entry.heightMm ?? "—"} mm {entry.verified ? "· Conferido" : "· Pendente"}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={disabled} onClick={()=>{setDirty(true);setItems(old=>old.map(e=>e.id===entry.id?{...e,verified:!e.verified}:e));}}>{entry.verified?"Reabrir":"Marcar conferido"}</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={()=>{setDirty(true);setItems(old=>old.filter(e=>e.id!==entry.id));}}>Excluir</Button></div></div>)}
    {offlinePending && <Button size="sm" variant="outline" disabled={disabled || saving} onClick={() => { void recoverOffline(); }}>Recuperar pendência offline</Button>}
    <Button disabled={disabled||saving} onClick={() => { void saveWithOfflineFallback(); }}>{saving?"Salvando...":offlinePending?"Sincronizar levantamento":"Salvar levantamento"}</Button>
    <SurveyPlanPreview elements={items} />
    <Button size="sm" variant="outline" onClick={() => setShowDraft((v) => !v)}>Prévia para Arqdor</Button>
    {showDraft && <div className="rounded border p-3 space-y-2">
      <p className="text-sm font-medium">Rascunho técnico — não altera projeto existente</p>
      {convertSurveyToArqdor(items).warnings.map((warning) => <p key={warning} className="text-xs text-amber-700">{warning}</p>)}
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(convertSurveyToArqdor(items), null, 2)}</pre>
      <label className="flex gap-2 items-center text-xs">
        <input type="checkbox" checked={reviewConfirmed} onChange={(e) => setReviewConfirmed(e.target.checked)} />
        Revisei as medidas e entendo que este é apenas um arquivo de pré-projeto, sem aprovação para fabricação.
      </label>
      <Button size="sm" variant="outline" disabled={!reviewConfirmed || !convertSurveyToArqdor(items).readyForReview} onClick={() => {
        const draft = convertSurveyToArqdor(items);
        const payload = { ...draft, reviewedAt: new Date().toISOString(), source: "measure_manual_review", savedToArqdor: false };
        const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url; link.download = "arqdor-measure-projeto-rascunho.json"; link.click();
        URL.revokeObjectURL(url);
      }}>Exportar pré-projeto revisado</Button>
    </div>}
    <p role="status" className="text-xs text-muted-foreground">{feedback}</p>
  </section>;
}
