import { useEffect, useState } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Template = {
  id: string;
  name: string;
  segmentKey?: string | null;
  nicheKey?: string | null;
  categoryKey?: string | null;
  productId?: string | null;
  active: boolean;
  version: number;
  rules?: Record<string, unknown>;
  checks?: Array<Record<string, unknown>>;
};

type DraftCheck = { label: string; required: boolean };

type InstallationMetrics = {
  installations: number;
  accepted: number;
  firstVisitAccepted: number;
  returns: number;
  visits: number;
  checklistItems: number;
  completedChecklistItems: number;
  completionRate: number;
  occurrences: number;
  openOccurrences: number;
  occurrenceTypes: Record<string, number>;
};

export function InstallationTemplateDialog({
  open,
  onOpenChange,
  tenantId,
  token,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  token: string;
}) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [metrics, setMetrics] = useState<InstallationMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [segmentKey, setSegmentKey] = useState("");
  const [nicheKey, setNicheKey] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const [productId, setProductId] = useState("");
  const [expandQuantity, setExpandQuantity] = useState(false);
  const [evidenceRequired, setEvidenceRequired] = useState(false);
  const [manualUrls, setManualUrls] = useState("");
  const [warrantyUrls, setWarrantyUrls] = useState("");
  const [postSaleAfterDays, setPostSaleAfterDays] = useState("7");
  const [checks, setChecks] = useState<DraftCheck[]>([
    { label: "Instalação/execução conforme pedido", required: true },
    { label: "Conferência final", required: true },
  ]);

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...(options?.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || body.message || "Não foi possível concluir a operação");
    return body as T;
  }

  async function loadTemplates() {
    if (!tenantId || !open) return;
    setLoading(true);
    try {
      const [templateRows, metricData] = await Promise.all([
        api<Template[]>(`/api/tenants/${tenantId}/installation-templates`),
        api<InstallationMetrics>(`/api/tenants/${tenantId}/installation-metrics`),
      ]);
      setTemplates(templateRows);
      setMetrics(metricData);
    } catch (error) {
      toast({ title: "Não foi possível carregar os templates", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTemplates(); }, [open, tenantId]);

  async function createTemplate() {
    if (!name.trim()) {
      toast({ title: "Informe o nome do template.", variant: "destructive" });
      return;
    }
    const validChecks = checks.filter((check) => check.label.trim());
    if (!validChecks.length) {
      toast({ title: "Adicione pelo menos uma verificação.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api(`/api/tenants/${tenantId}/installation-templates`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          segmentKey: segmentKey.trim() || null,
          nicheKey: nicheKey.trim() || null,
          categoryKey: categoryKey.trim() || null,
          productId: productId.trim() || null,
          active: true,
          rules: {
            expandQuantity,
            evidenceRequired,
            required: true,
            manualUrls: manualUrls.split(/[\n,;]/).map((value) => value.trim()).filter(Boolean),
            warrantyUrls: warrantyUrls.split(/[\n,;]/).map((value) => value.trim()).filter(Boolean),
            postSaleAfterDays: Number(postSaleAfterDays) > 0 ? Number(postSaleAfterDays) : null,
          },
          checks: validChecks.map((check, index) => ({
            key: `check_${index + 1}`,
            label: check.label.trim(),
            required: check.required,
            completed: false,
          })),
        }),
      });
      setName("");
      setSegmentKey("");
      setNicheKey("");
      setCategoryKey("");
      setProductId("");
      setExpandQuantity(false);
      setEvidenceRequired(false);
      setManualUrls("");
      setWarrantyUrls("");
      setPostSaleAfterDays("7");
      setChecks([
        { label: "Instalação/execução conforme pedido", required: true },
        { label: "Conferência final", required: true },
      ]);
      await loadTemplates();
      toast({ title: "Template de instalação criado." });
    } catch (error) {
      toast({ title: "Não foi possível criar o template", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleTemplate(template: Template) {
    try {
      await api(`/api/tenants/${tenantId}/installation-templates/${template.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !template.active }),
      });
      await loadTemplates();
    } catch (error) {
      toast({ title: "Não foi possível alterar o template", description: String(error), variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> Templates de instalação</DialogTitle>
        </DialogHeader>

        {metrics && (
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Instalações", metrics.installations],
              ["Aceites", metrics.accepted],
              ["1ª visita", metrics.firstVisitAccepted],
              ["Retornos", metrics.returns],
              ["Pendências", metrics.openOccurrences],
              ["Conclusão", `${metrics.completionRate}%`],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border bg-muted/20 p-3">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Novo template</h3>
              <p className="text-xs text-muted-foreground">O escopo mais específico prevalece: produto → categoria → nicho → segmento → padrão geral.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium">Nome *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Instalação de esquadrias PVC" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Segmento</label>
                <Input value={segmentKey} onChange={(e) => setSegmentKey(e.target.value)} placeholder="Ex.: construção" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Nicho</label>
                <Input value={nicheKey} onChange={(e) => setNicheKey(e.target.value)} placeholder="Ex.: esquadrias" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Categoria</label>
                <Input value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} placeholder="Ex.: janela" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Produto ID</label>
                <Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="Opcional — produto específico" />
              </div>
            </div>

            <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={expandQuantity} onChange={(e) => setExpandQuantity(e.target.checked)} />
                Conferir cada unidade separadamente
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={evidenceRequired} onChange={(e) => setEvidenceRequired(e.target.checked)} />
                Exigir evidência por item
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Manuais aplicáveis</label>
                <textarea
                  className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={manualUrls}
                  onChange={(e) => setManualUrls(e.target.value)}
                  placeholder="Um link por linha"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Garantias aplicáveis</label>
                <textarea
                  className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={warrantyUrls}
                  onChange={(e) => setWarrantyUrls(e.target.value)}
                  placeholder="Um link por linha"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Pós-venda após quantos dias?</label>
                <Input type="number" min={1} value={postSaleAfterDays} onChange={(e) => setPostSaleAfterDays(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold">Verificações obrigatórias</h4>
                  <p className="text-xs text-muted-foreground">Ex.: nivelamento, vedação, acabamento, teste funcional.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setChecks((current) => [...current, { label: "", required: true }])}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Verificação
                </Button>
              </div>
              {checks.map((check, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={check.label}
                    onChange={(e) => setChecks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item))}
                    placeholder="Descrição da verificação"
                  />
                  <label className="flex shrink-0 items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={check.required}
                      onChange={(e) => setChecks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, required: e.target.checked } : item))}
                    />
                    Obrigatória
                  </label>
                  <Button type="button" size="icon" variant="ghost" disabled={checks.length <= 1} onClick={() => setChecks((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="font-semibold">Templates configurados</h3>
              <p className="text-xs text-muted-foreground">Templates inativos ficam preservados para histórico, mas não são aplicados em novas instalações.</p>
            </div>
            {loading && <div className="h-24 animate-pulse rounded-lg bg-muted" />}
            {!loading && templates.length === 0 && <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Nenhum template cadastrado. Sem template específico, o Vendor.ai usa o checklist geral.</div>}
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{template.name}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[template.productId && `Produto: ${template.productId}`, template.categoryKey && `Categoria: ${template.categoryKey}`, template.nicheKey && `Nicho: ${template.nicheKey}`, template.segmentKey && `Segmento: ${template.segmentKey}`].filter(Boolean).join(" • ") || "Padrão geral"}
                    </p>
                  </div>
                  <Badge variant={template.active ? "secondary" : "outline"}>{template.active ? "Ativo" : "Inativo"}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{template.checks?.length ?? 0} verificação(ões) • versão {template.version}</p>
                <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void toggleTemplate(template)}>
                  {template.active ? "Desativar" : "Ativar"}
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={saving} onClick={() => void createTemplate()}>{saving ? "Salvando..." : "Criar template"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}