import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SurveyElement = {
  id: string;
  roomName: string;
  elementType: "wall" | "door" | "window" | "column" | "beam" | "electrical" | "plumbing" | "gas" | "other";
  label: string;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  sourcePhotoPath?: string | null;
  note?: string | null;
  verified: boolean;
};
type Props = { elements: SurveyElement[]; photos: string[]; disabled?: boolean; onSave: (items: SurveyElement[]) => Promise<void> };
const types: SurveyElement["elementType"][] = ["wall","door","window","column","beam","electrical","plumbing","gas","other"];
export default function SurveyElementsEditor({ elements, photos, disabled = false, onSave }: Props) {
  const [items, setItems] = useState<SurveyElement[]>(elements);
  const [roomName, setRoomName] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<SurveyElement["elementType"]>("wall");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [photo, setPhoto] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  function toDimension(value: string): number | null { const n = Number(value.replace(",", ".")); return value.trim() && Number.isFinite(n) && n > 0 && n <= 1000000 ? n : null; }
  function add() {
    if (!roomName.trim() || !label.trim() || (width.trim() && toDimension(width) === null) || (height.trim() && toDimension(height) === null)) { setFeedback("Preencha ambiente, identificação e medidas válidas."); return; }
    setItems((old) => [...old, { id: crypto.randomUUID(), roomName: roomName.trim(), label: label.trim(), elementType: kind, widthMm: toDimension(width), heightMm: toDimension(height), sourcePhotoPath: photo || null, verified: false }]);
    setLabel(""); setWidth(""); setHeight(""); setFeedback("Elemento adicionado; salve para persistir.");
  }
  return <section className="mt-3 rounded-lg border p-3 space-y-3 print:hidden" aria-label="Elementos do levantamento">
    <div><h3 className="font-semibold">Ambiente e elementos técnicos</h3><p className="text-xs text-muted-foreground">Inventário técnico, ainda não convertido em geometria BIM. Confira antes de liberar para fabricação.</p></div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Input aria-label="Ambiente" value={roomName} maxLength={120} onChange={(e)=>setRoomName(e.target.value)} placeholder="Ambiente (ex.: Cozinha)" disabled={disabled}/>
      <select aria-label="Tipo de elemento" value={kind} onChange={(e)=>setKind(e.target.value as SurveyElement["elementType"])} disabled={disabled} className="rounded-md border bg-background px-3 py-2 text-sm">{types.map(t=><option key={t} value={t}>{t}</option>)}</select>
      <Input aria-label="Identificação" value={label} maxLength={160} onChange={(e)=>setLabel(e.target.value)} placeholder="Parede A / Janela 01" disabled={disabled}/>
      <Input aria-label="Largura em milímetros" value={width} onChange={(e)=>setWidth(e.target.value)} placeholder="Largura (mm)" inputMode="decimal" disabled={disabled}/>
      <Input aria-label="Altura em milímetros" value={height} onChange={(e)=>setHeight(e.target.value)} placeholder="Altura (mm)" inputMode="decimal" disabled={disabled}/>
      <select aria-label="Foto de referência" value={photo} onChange={(e)=>setPhoto(e.target.value)} disabled={disabled} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="">Sem foto associada</option>{photos.map((p,i)=><option key={p} value={p}>Foto {i+1}</option>)}</select>
    </div>
    <Button size="sm" variant="outline" disabled={disabled} onClick={add}>Adicionar elemento</Button>
    {items.map((entry)=><div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm"><span>{entry.roomName} · {entry.elementType} · {entry.label} · {entry.widthMm ?? "—"} × {entry.heightMm ?? "—"} mm {entry.verified ? "· Conferido" : "· Pendente"}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={disabled} onClick={()=>setItems(old=>old.map(e=>e.id===entry.id?{...e,verified:!e.verified}:e))}>{entry.verified?"Reabrir":"Marcar conferido"}</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={()=>setItems(old=>old.filter(e=>e.id!==entry.id))}>Excluir</Button></div></div>)}
    <Button disabled={disabled||saving} onClick={async()=>{setSaving(true);setFeedback("");try{await onSave(items);setFeedback("Levantamento salvo no checklist.");}catch(e){setFeedback(e instanceof Error?e.message:"Erro ao salvar.");}finally{setSaving(false);}}}>{saving?"Salvando...":"Salvar levantamento"}</Button>
    <p role="status" className="text-xs text-muted-foreground">{feedback}</p>
  </section>;
}
