import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Plus, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InstallationTemplateDialog } from "@/components/InstallationTemplateDialog";

type InstallationVisit = {
  id: string;
  visitNumber: number;
  status: string;
  scheduledAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  customerAcceptanceStatus: string;
  receiverName?: string | null;
};

type InstallationItem = {
  id: string;
  visitId: string;
  productName: string;
  quantity: number;
  unitIndex?: number | null;
  location?: string | null;
  attributes?: Record<string, unknown>;
  checks?: Array<Record<string, unknown>>;
  status: string;
  observation?: string | null;
  evidenceRequired: boolean;
  required: boolean;
};

type InstallationOccurrence = {
  id: string;
  visitId: string;
  checklistItemId?: string | null;
  type: string;
  status: string;
  description?: string | null;
  resolution?: string | null;
};

type InstallationData = {
  currentVisitId: string;
  ready: boolean;
  visits: InstallationVisit[];
  items: InstallationItem[];
  occurrences: InstallationOccurrence[];
};

type WorkCardRef = {
  id: string;
  tenantId: string;
  etapa: string;
  codigo: string;
};

const STATUS_OPTIONS = [
  ["pending", "Pendente"],
  ["instalado", "Instalado"],
  ["conferido", "Conferido"],
  ["instalado_com_ressalva", "Instalado com ressalva"],
  ["nao_instalado", "Não instalado"],
  ["peca_faltante", "Peça faltante"],
  ["produto_avariado", "Produto avariado"],
  ["divergencia_medida", "Divergência de medida"],
  ["necessita_retorno", "Necessita retorno"],
] as const;

function statusLabel(value: string) {
  return STATUS_OPTIONS.find(([key]) => key === value)?.[1] ?? value;
}

export function InstallationChecklistPanel({
  card,
  token,
  isAdmin,
  onChanged,
}: {
  card: WorkCardRef;
  token: string;
  isAdmin: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<InstallationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [evidenceUploaded, setEvidenceUploaded] = useState<Record<string, boolean>>({});
  const [receiverName, setReceiverName] = useState("");
  const [receiverDocument, setReceiverDocument] = useState("");
  const [receiverRelationship, setReceiverRelationship] = useState("");
  const [customerSignatureUrl, setCustomerSignatureUrl] = useState("");
  const [companySignatureUrl, setCompanySignatureUrl] = useState("");
  const [accepting, setAccepting] = useState(false);
  const customerSignatureRef = useRef<HTMLInputElement>(null);
  const companySignatureRef = useRef<HTMLInputElement>(null);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }), [token]);

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...(options?.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || `Erro ${response.status}`);
    return body as T;
  }

  async function load() {
    setLoading(true);
    try {
      const response = await api<InstallationData>(`/api/work-cards/${card.id}/installation`);
      setData(response);
    } catch (error) {
      toast({
        title: "Não foi possível carregar o checklist de instalação",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [card.id]);

  const currentVisit = data?.visits.find((visit) => visit.id === data.currentVisitId) ?? null;
  const currentItems = data?.items.filter((item) => item.visitId === data.currentVisitId) ?? [];
  const openOccurrences = data?.occurrences.filter((item) =>
    item.status === "open" || item.status === "in_progress"
  ) ?? [];

  async function patchItem(item: InstallationItem, patch: Record<string, unknown>) {
    setBusyId(item.id);
    try {
      await api(`/api/installation-checklist-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await load();
      await onChanged();
    } catch (error) {
      toast({ title: "Não foi possível atualizar o item", description: String(error), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleCheck(item: InstallationItem, checkIndex: number) {
    const checks = (item.checks ?? []).map((check, index) =>
      index === checkIndex ? { ...check, completed: check.completed !== true } : check
    );
    await patchItem(item, { checks });
  }

  async function uploadToStorage(file: File) {
    const meta = await api<{ uploadURL: string; objectPath: string }>("/api/storage/uploads/request-url", {
      method: "POST",
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    });
    const put = await fetch(meta.uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
    return `/api/storage${meta.objectPath}`;
  }

  async function uploadEvidence(item: InstallationItem, file: File) {
    setBusyId(item.id);
    try {
      const url = await uploadToStorage(file);
      await api(`/api/work-cards/${card.id}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          nome: file.name,
          url,
          mimeType: file.type || "application/octet-stream",
          tamanho: file.size,
          origem: "installation_checklist",
          descricao: `Evidência de instalação — ${item.productName}`,
          metadata: { installationChecklistItemId: item.id },
        }),
      });
      setEvidenceUploaded((current) => ({ ...current, [item.id]: true }));
      await patchItem(item, { evidenceRequired: item.evidenceRequired });
      toast({ title: "Evidência registrada" });
    } catch (error) {
      toast({ title: "Não foi possível anexar a evidência", description: String(error), variant: "destructive" });
      setBusyId(null);
    }
  }

  async function createReturnVisit() {
    setBusyId("new-visit");
    try {
      await api(`/api/work-cards/${card.id}/installation/visits`, {
        method: "POST",
        body: JSON.stringify({ reason: "return_or_additional_visit" }),
      });
      await load();
      toast({ title: "Nova visita criada", description: "Pendências da visita anterior foram levadas para o novo atendimento." });
    } catch (error) {
      toast({ title: "Não foi possível criar nova visita", description: String(error), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function resolveOccurrence(occurrence: InstallationOccurrence) {
    setBusyId(occurrence.id);
    try {
      await api(`/api/installation-occurrences/${occurrence.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved", resolution: "Resolvida durante a instalação." }),
      });
      await load();
      await onChanged();
    } catch (error) {
      toast({ title: "Não foi possível resolver a ocorrência", description: String(error), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function uploadSignature(kind: "customer" | "company", file: File) {
    setBusyId(`signature-${kind}`);
    try {
      const url = await uploadToStorage(file);
      if (kind === "customer") setCustomerSignatureUrl(url);
      else setCompanySignatureUrl(url);
      toast({ title: kind === "customer" ? "Assinatura do cliente registrada" : "Assinatura da empresa registrada" });
    } catch (error) {
      toast({ title: "Não foi possível enviar a assinatura", description: String(error), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function acceptInstallation() {
    if (!currentVisit) return;
    if (!receiverName.trim() || !customerSignatureUrl || !companySignatureUrl) {
      toast({ title: "Informe o recebedor e as duas assinaturas.", variant: "destructive" });
      return;
    }
    setAccepting(true);
    try {
      const response = await api<{ acceptanceHash: string; document?: { url?: string } }>(
        `/api/installation-visits/${currentVisit.id}/accept`,
        {
          method: "POST",
          body: JSON.stringify({
            receiverName: receiverName.trim(),
            receiverDocument: receiverDocument.trim() || null,
            receiverRelationship: receiverRelationship.trim() || null,
            customerSignatureUrl,
            companySignatureUrl,
          }),
        },
      );
      toast({
        title: "Instalação aceita e documento final gerado",
        description: response.document?.url ? "O termo foi anexado ao processo e enviado ao cliente." : undefined,
      });
      await load();
      await onChanged();
    } catch (error) {
      toast({ title: "Não foi possível concluir o aceite", description: String(error), variant: "destructive" });
    } finally {
      setAccepting(false);
    }
  }

  if (loading && !data) {
    return <div className="rounded-xl border p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Checklist estruturado de instalação</h3>
            <Badge variant={data.ready ? "secondary" : "outline"}>
              {data.ready ? "Pronto" : "Em andamento"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Visita {currentVisit?.visitNumber ?? 1} · itens, verificações, evidências e ocorrências por produto.
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && <Button size="sm" variant="outline" onClick={() => setTemplatesOpen(true)}>Templates</Button>}
          <Button size="sm" variant="outline" disabled={busyId === "new-visit"} onClick={() => void createReturnVisit()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nova visita
          </Button>
        </div>
      </div>

      {openOccurrences.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300/40 bg-amber-50/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {openOccurrences.length} ocorrência(s) aberta(s)
          </div>
          {openOccurrences.map((occurrence) => (
            <div key={occurrence.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-2">
              <div>
                <p className="text-xs font-medium">{statusLabel(occurrence.type)}</p>
                {occurrence.description && <p className="text-xs text-muted-foreground">{occurrence.description}</p>}
              </div>
              <Button size="sm" variant="outline" disabled={busyId === occurrence.id} onClick={() => void resolveOccurrence(occurrence)}>
                Resolver
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {currentItems.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Nenhum item foi encontrado no lote deste card. Confira os itens do pedido antes de iniciar a instalação.
          </div>
        )}
        {currentItems.map((item) => (
          <div key={item.id} className="space-y-3 rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  {item.productName}{item.unitIndex ? ` · unidade ${item.unitIndex}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Qtd. {item.quantity}{item.location ? ` · ${item.location}` : ""}
                </p>
              </div>
              <Select
                value={item.status}
                disabled={busyId === item.id}
                onValueChange={(status) => void patchItem(item, { status })}
              >
                <SelectTrigger className="h-8 w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {(item.checks ?? []).length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {(item.checks ?? []).map((check, index) => {
                  const completed = check.completed === true;
                  return (
                    <button
                      type="button"
                      key={String(check.key ?? index)}
                      disabled={busyId === item.id}
                      onClick={() => void toggleCheck(item, index)}
                      className="flex items-start gap-2 rounded-md border p-2 text-left text-xs hover:bg-muted/50"
                    >
                      {completed
                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        : <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                      <span>{String(check.label ?? `Verificação ${index + 1}`)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <Textarea
              key={`obs-${item.id}-${item.observation ?? ""}`}
              defaultValue={item.observation ?? ""}
              rows={2}
              placeholder="Observação do item..."
              disabled={busyId === item.id}
              onBlur={(event) => {
                const observation = event.currentTarget.value.trim();
                if (observation !== (item.observation ?? "")) void patchItem(item, { observation: observation || null });
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                <Upload className="h-3.5 w-3.5" />
                {item.evidenceRequired ? "Anexar evidência obrigatória" : "Anexar evidência"}
                <input
                  type="file"
                  accept="image/*,video/*,.pdf"
                  className="hidden"
                  disabled={busyId === item.id}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void uploadEvidence(item, file);
                  }}
                />
              </label>
              {evidenceUploaded[item.id] && <span className="text-xs text-emerald-600">✓ Evidência registrada</span>}
              {item.evidenceRequired && !evidenceUploaded[item.id] && (
                <span className="text-xs text-amber-600">Evidência necessária para concluir</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {data.ready && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div>
            <h4 className="text-sm font-semibold">Aceite final da instalação</h4>
            <p className="text-xs text-muted-foreground">
              Disponível após a conferência técnica. O aceite gera documento imutável com hash e envia a cópia ao cliente.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Nome do recebedor *" />
            <Input value={receiverDocument} onChange={(e) => setReceiverDocument(e.target.value)} placeholder="Documento do recebedor" />
            <Input value={receiverRelationship} onChange={(e) => setReceiverRelationship(e.target.value)} placeholder="Vínculo com o cliente" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <input ref={customerSignatureRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) void uploadSignature("customer", file);
              }} />
              <Button type="button" variant="outline" className="w-full" onClick={() => customerSignatureRef.current?.click()}>
                {customerSignatureUrl ? "✓ Assinatura cliente" : "Enviar assinatura cliente"}
              </Button>
            </div>
            <div>
              <input ref={companySignatureRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) void uploadSignature("company", file);
              }} />
              <Button type="button" variant="outline" className="w-full" onClick={() => companySignatureRef.current?.click()}>
                {companySignatureUrl ? "✓ Assinatura empresa/instalador" : "Enviar assinatura empresa/instalador"}
              </Button>
            </div>
          </div>

          <Button
            type="button"
            disabled={
              accepting
              || !receiverName.trim()
              || !customerSignatureUrl
              || !companySignatureUrl
              || currentVisit?.customerAcceptanceStatus === "accepted"
            }
            onClick={() => void acceptInstallation()}
          >
            {accepting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando termo...</> : "Concluir aceite e gerar termo"}
          </Button>
          {currentVisit?.customerAcceptanceStatus === "accepted" && (
            <p className="text-xs text-emerald-600">✓ Aceite já concluído. O registro é imutável.</p>
          )}
        </div>
      )}

      <InstallationTemplateDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        tenantId={card.tenantId}
        token={token}
      />
    </div>
  );
}
