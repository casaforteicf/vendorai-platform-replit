import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PenLine, RotateCcw } from "lucide-react";

type WorkCardLike = {
  id: string;
  codigo: string;
  etapa: string;
  titulo: string;
  metadata?: Record<string, unknown> | null;
};

type AttachmentLike = {
  id: string;
  nome: string;
  mimeType?: string | null;
  url: string;
};

type ItemDraft = {
  name: string;
  quantity: number;
  checked: boolean;
  width: string;
  height: string;
  location: string;
  area: string;
  observation: string;
  installation: "conforme" | "nao_conforme" | "nao_se_aplica";
  functionality: "conforme" | "nao_conforme" | "nao_se_aplica";
  interiorFinish: "conforme" | "nao_conforme" | "nao_se_aplica";
  exteriorFinish: "conforme" | "nao_conforme" | "nao_se_aplica";
  status: "conforme" | "nao_conforme" | "nao_se_aplica";
};

const FORM_TITLES: Record<string, string> = {
  relatorio_medidas: "Relatório de medição",
  checklist_transporte: "Checklist de expedição / transporte",
  checklist_instalacao: "Checklist de instalação",
  conferencia_instalacao: "Conferência final da instalação",
  vistoria_aceite: "Entrega, vistoria e aceite",
  pacote_entrega: "Pacote de entrega ao cliente",
};

function cardItems(card: WorkCardLike): ItemDraft[] {
  const raw = Array.isArray(card.metadata?.itens) ? card.metadata?.itens as Array<Record<string, unknown>> : [];
  const source = raw.length ? raw : [{ nome: card.titulo, quantidade: 1 }];
  return source.map((item) => ({
    name: String(item.nome ?? item.name ?? "Item"),
    quantity: Math.max(1, Number(item.quantidade ?? item.quantity ?? 1)),
    checked: false,
    width: String(item.largura ?? item.width ?? ""),
    height: String(item.altura ?? item.height ?? ""),
    location: String(item.localizacao ?? item.location ?? ""),
    area: String(item.area ?? ""),
    observation: "",
    installation: "conforme",
    functionality: "conforme",
    interiorFinish: "conforme",
    exteriorFinish: "conforme",
    status: "conforme",
  }));
}

function SignaturePad({ label, onChange }: { label: string; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(280, canvas.clientWidth);
    canvas.width = width * ratio;
    canvas.height = 140 * ratio;
    const ctx = canvas.getContext("2d");
    ctx?.scale(ratio, ratio);
    if (ctx) {
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#111827";
    }
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <Button type="button" size="sm" variant="ghost" onClick={clear}><RotateCcw className="mr-1 h-3.5 w-3.5" />Limpar</Button>
      </div>
      <canvas
        ref={canvasRef}
        className="h-[140px] w-full touch-none rounded-lg border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <p className="text-[11px] text-muted-foreground">Assine com o dedo, caneta ou mouse.</p>
    </div>
  );
}

function StatusSelect({ value, onChange }: { value: ItemDraft["status"]; onChange: (v: ItemDraft["status"]) => void }) {
  return (
    <Select value={value} onValueChange={(value) => onChange(value as ItemDraft["status"])}>
      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="conforme">Conforme</SelectItem>
        <SelectItem value="nao_conforme">Não conforme</SelectItem>
        <SelectItem value="nao_se_aplica">Não se aplica</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function OperationalStageFormDialog({
  open,
  onOpenChange,
  requirementKey,
  card,
  attachments,
  token,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requirementKey: string | null;
  card: WorkCardLike;
  attachments: AttachmentLike[];
  token: string;
  onChanged: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<ItemDraft[]>(() => cardItems(card));
  const [notes, setNotes] = useState("");
  const [production, setProduction] = useState("");
  const [glass, setGlass] = useState("");
  const [deliveryUntil, setDeliveryUntil] = useState("");
  const [receiverRole, setReceiverRole] = useState<"cliente" | "delegado">("cliente");
  const [receiverName, setReceiverName] = useState("");
  const [receiverDocument, setReceiverDocument] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverEmail, setReceiverEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [authorization, setAuthorization] = useState("");
  const [acceptanceType, setAcceptanceType] = useState<"sem_ressalvas" | "com_ressalvas">("sem_ressalvas");
  const [clientSigner, setClientSigner] = useState("");
  const [companySigner, setCompanySigner] = useState("");
  const [clientSignature, setClientSignature] = useState("");
  const [companySignature, setCompanySignature] = useState("");
  const [finalChecks, setFinalChecks] = useState({
    itensConferidos: false,
    funcionamentoTestado: false,
    acabamentoConferido: false,
    limpezaFinal: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItems(cardItems(card));
    setNotes("");
    setProduction("");
    setGlass("");
    setDeliveryUntil("");
  }, [open, card.id, requirementKey]);

  const imageAttachmentIds = useMemo(
    () => attachments.filter((a) => a.mimeType?.startsWith("image/")).map((a) => a.id),
    [attachments],
  );
  const manualAttachmentIds = useMemo(
    () => attachments.filter((a) => /manual|garantia|uso|manuten/i.test(a.nome)).map((a) => a.id),
    [attachments],
  );

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  async function submitStageForm() {
    if (!requirementKey) return;
    if (requirementKey === "pacote_entrega") {
      if (manualAttachmentIds.length === 0) {
        toast({ title: "Manual obrigatório", description: "Anexe o Manual de Uso/Manutenção ao card antes de enviar o pacote.", variant: "destructive" });
        return;
      }
      setSaving(true);
      try {
        const response = await fetch(`/api/work-cards/${card.id}/delivery-package/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ manualAttachmentIds }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || body.error || "Não foi possível enviar o pacote de entrega.");
        toast({ title: "Pacote enviado", description: "Termo assinado e manuais enviados ao cliente e registrados no histórico." });
        await onChanged();
        onOpenChange(false);
      } catch (error) {
        toast({ title: "Não foi possível enviar o pacote", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      } finally {
        setSaving(false);
      }
      return;
    }
    const data: Record<string, unknown> = { notes };
    if (requirementKey === "relatorio_medidas") {
      data.items = items.map((item) => ({
        name: item.name, quantity: item.quantity, checked: item.checked,
        width: item.width, height: item.height, location: item.location, observation: item.observation,
      }));
    } else if (requirementKey === "checklist_transporte") {
      data.production = production;
      data.glass = glass;
      data.deliveryUntil = deliveryUntil;
      data.items = items.map((item) => ({
        name: item.name, quantity: item.quantity, checked: item.checked,
        width: item.width, height: item.height, observation: item.observation,
      }));
    } else if (requirementKey === "checklist_instalacao") {
      data.items = items.map((item) => ({
        name: item.name, quantity: item.quantity, checked: item.checked,
        width: item.width, height: item.height, location: item.location, area: item.area, observation: item.observation,
      }));
    } else if (requirementKey === "conferencia_instalacao") {
      Object.assign(data, finalChecks);
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/work-cards/${card.id}/stage-form/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: requirementKey, data }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || "Não foi possível concluir o formulário.");
      toast({ title: "Formulário concluído", description: "O requisito da etapa foi liberado." });
      await onChanged();
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Não foi possível concluir", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function submitAcceptance() {
    if (!receiverName.trim() || !clientSigner.trim() || !companySigner.trim() || !clientSignature || !companySignature) {
      toast({ title: "Preencha o recebedor e as duas assinaturas.", variant: "destructive" });
      return;
    }
    const hasNonConformity = items.some((item) =>
      [item.installation, item.functionality, item.interiorFinish, item.exteriorFinish, item.status].includes("nao_conforme")
    );
    if (hasNonConformity && imageAttachmentIds.length === 0) {
      toast({ title: "Não conformidade exige evidência", description: "Anexe ao menos uma foto ao card antes de assinar.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/work-cards/${card.id}/delivery-acceptance/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          receiver: {
            role: receiverRole, name: receiverName, document: receiverDocument || null,
            phone: receiverPhone || null, email: receiverEmail || null,
            relationship: relationship || null, authorization: authorization || null,
          },
          acceptanceType,
          observations: notes || null,
          items: items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            installation: item.installation,
            functionality: item.functionality,
            interiorFinish: item.interiorFinish,
            exteriorFinish: item.exteriorFinish,
            status: item.status,
            observation: item.observation || null,
            evidenceAttachmentIds: item.status === "nao_conforme" || [
              item.installation, item.functionality, item.interiorFinish, item.exteriorFinish,
            ].includes("nao_conforme") ? imageAttachmentIds : [],
          })),
          signatures: {
            client: { name: clientSigner, dataUrl: clientSignature },
            company: { name: companySigner, dataUrl: companySignature },
          },
          manualAttachmentIds,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || "Não foi possível concluir o aceite.");
      toast({
        title: "Entrega assinada",
        description: body.pdfStored ? "Termo gerado, arquivado e vinculado ao cliente." : "Termo assinado; PDF disponível pelo histórico da entrega.",
      });
      await onChanged();
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Não foi possível assinar a entrega", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!requirementKey) return null;
  const isAcceptance = requirementKey === "vistoria_aceite";
  const isFinal = requirementKey === "conferencia_instalacao";
  const isPackage = requirementKey === "pacote_entrega";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PenLine className="h-5 w-5" />{FORM_TITLES[requirementKey] ?? "Formulário da etapa"}</DialogTitle>
        </DialogHeader>

        {!isFinal && !isPackage && (
          <div className="space-y-3">
            {requirementKey === "checklist_transporte" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Input placeholder="Produção" value={production} onChange={(e) => setProduction(e.target.value)} />
                <Input placeholder="Vidros" value={glass} onChange={(e) => setGlass(e.target.value)} />
                <Input type="date" value={deliveryUntil} onChange={(e) => setDeliveryUntil(e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="rounded-xl border p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">Quantidade: {item.quantity}</p></div>
                    {!isAcceptance && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={item.checked} onCheckedChange={(checked) => updateItem(index, { checked: checked === true })} />
                        Conferido
                      </label>
                    )}
                  </div>

                  {isAcceptance ? (
                    <div className="grid gap-2 md:grid-cols-5">
                      <div><p className="mb-1 text-[11px]">Instalação</p><StatusSelect value={item.installation} onChange={(v) => updateItem(index, { installation: v })} /></div>
                      <div><p className="mb-1 text-[11px]">Funcionalidade</p><StatusSelect value={item.functionality} onChange={(v) => updateItem(index, { functionality: v })} /></div>
                      <div><p className="mb-1 text-[11px]">Acabamento interno</p><StatusSelect value={item.interiorFinish} onChange={(v) => updateItem(index, { interiorFinish: v })} /></div>
                      <div><p className="mb-1 text-[11px]">Acabamento externo</p><StatusSelect value={item.exteriorFinish} onChange={(v) => updateItem(index, { exteriorFinish: v })} /></div>
                      <div><p className="mb-1 text-[11px]">Situação</p><StatusSelect value={item.status} onChange={(v) => updateItem(index, { status: v })} /></div>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Input placeholder="Largura" value={item.width} onChange={(e) => updateItem(index, { width: e.target.value })} />
                      <Input placeholder="Altura" value={item.height} onChange={(e) => updateItem(index, { height: e.target.value })} />
                      <Input placeholder="Localização" value={item.location} onChange={(e) => updateItem(index, { location: e.target.value })} />
                      {requirementKey === "checklist_instalacao" && <Input placeholder="Área" value={item.area} onChange={(e) => updateItem(index, { area: e.target.value })} />}
                    </div>
                  )}
                  <Textarea className="mt-2" rows={2} placeholder="Observação" value={item.observation} onChange={(e) => updateItem(index, { observation: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
        )}

        {isFinal && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["itensConferidos", "Itens instalados conferidos"],
              ["funcionamentoTestado", "Funcionamento testado"],
              ["acabamentoConferido", "Acabamentos conferidos"],
              ["limpezaFinal", "Limpeza final realizada"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 rounded-xl border p-4">
                <Checkbox checked={(finalChecks as any)[key]} onCheckedChange={(checked) => setFinalChecks((v) => ({ ...v, [key]: checked === true }))} />
                <span className="text-sm font-medium">{label}</span>
              </label>
            ))}
          </div>
        )}

        {isPackage && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <p className="font-medium">Documentos do pacote</p>
              <p className="mt-1 text-sm text-muted-foreground">O termo assinado da entrega será combinado com os manuais identificados nos anexos deste card.</p>
            </div>
            <div className="space-y-2">
              {attachments.filter((a) => /manual|garantia|uso|manuten/i.test(a.nome)).map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm">{attachment.nome}</span>
                  <span className="text-xs text-muted-foreground">Incluído</span>
                </div>
              ))}
              {manualAttachmentIds.length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-amber-700">
                  Nenhum manual identificado. Anexe o Manual de Uso/Manutenção ao card e volte para concluir o pacote.
                </div>
              )}
            </div>
          </div>
        )}

        {isAcceptance && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-medium">Quem está recebendo</p>
                <Select value={receiverRole} onValueChange={(v) => setReceiverRole(v as "cliente" | "delegado")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cliente">Cliente titular</SelectItem><SelectItem value="delegado">Pessoa autorizada</SelectItem></SelectContent></Select>
              </div>
              <div><p className="mb-1 text-sm font-medium">Nome do recebedor</p><Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} /></div>
              <Input placeholder="CPF / documento" value={receiverDocument} onChange={(e) => setReceiverDocument(e.target.value)} />
              <Input placeholder="Telefone" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} />
              <Input placeholder="E-mail" value={receiverEmail} onChange={(e) => setReceiverEmail(e.target.value)} />
              {receiverRole === "delegado" && <Input placeholder="Vínculo / função" value={relationship} onChange={(e) => setRelationship(e.target.value)} />}
              {receiverRole === "delegado" && <Textarea className="sm:col-span-2" placeholder="Como foi autorizado pelo cliente (portal, WhatsApp, e-mail etc.)" value={authorization} onChange={(e) => setAuthorization(e.target.value)} />}
            </div>

            <div>
              <p className="mb-1 text-sm font-medium">Resultado da entrega</p>
              <Select value={acceptanceType} onValueChange={(v) => setAcceptanceType(v as typeof acceptanceType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem_ressalvas">Aceite sem ressalvas</SelectItem><SelectItem value="com_ressalvas">Aceite com ressalvas</SelectItem></SelectContent></Select>
            </div>

            <Textarea rows={3} placeholder="Observações gerais / ressalvas" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Declaro que acompanhei a vistoria dos produtos/serviços relacionados neste documento, recebi as orientações necessárias de utilização, conservação e manutenção, bem como o respectivo Manual de Uso e Manutenção. Eventuais ressalvas ou pendências estão registradas neste termo.</p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Input placeholder="Nome do cliente / recebedor que assina" value={clientSigner} onChange={(e) => setClientSigner(e.target.value)} /><SignaturePad label="Assinatura do cliente / recebedor" onChange={setClientSignature} /></div>
              <div className="space-y-2"><Input placeholder="Nome do responsável da empresa" value={companySigner} onChange={(e) => setCompanySigner(e.target.value)} /><SignaturePad label="Assinatura do responsável da empresa" onChange={setCompanySignature} /></div>
            </div>
            {manualAttachmentIds.length > 0 && <p className="text-xs text-muted-foreground">{manualAttachmentIds.length} manual(is)/documento(s) identificado(s) serão incluídos no pacote de entrega.</p>}
          </div>
        )}

        {!isAcceptance && !isPackage && <Textarea rows={3} placeholder="Observações gerais" value={notes} onChange={(e) => setNotes(e.target.value)} />}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={() => void (isAcceptance ? submitAcceptance() : submitStageForm())}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isAcceptance ? "Assinar e concluir entrega" : isPackage ? "Enviar pacote ao cliente" : "Concluir formulário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}