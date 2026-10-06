import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardCheck,
  FileText,
  PackageSearch,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
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

type ScopeType = "general" | "segment" | "niche" | "category" | "product";
type EvidenceType = "none" | "photo" | "video" | "text" | "signature";
type ResponsibleType = "internal" | "client" | "both";

type DraftCheck = {
  label: string;
  required: boolean;
  blockAdvance: boolean;
  evidenceType: EvidenceType;
  responsibleType: ResponsibleType;
};

const DEFAULT_CHECKS: DraftCheck[] = [
  {
    label: "Conferir material e itens recebidos",
    required: true,
    blockAdvance: true,
    evidenceType: "photo",
    responsibleType: "internal",
  },
  {
    label: "Executar instalação conforme pedido",
    required: true,
    blockAdvance: true,
    evidenceType: "photo",
    responsibleType: "internal",
  },
  {
    label: "Conferência final e aceite",
    required: true,
    blockAdvance: true,
    evidenceType: "signature",
    responsibleType: "both",
  },
];

const scopeLabels: Record<ScopeType, string> = {
  general: "Todos os produtos / padrão geral",
  segment: "Um segmento",
  niche: "Um nicho",
  category: "Uma categoria",
  product: "Um produto específico",
};

const evidenceLabels: Record<EvidenceType, string> = {
  none: "Sem evidência",
  photo: "Foto",
  video: "Vídeo",
  text: "Texto / observação",
  signature: "Assinatura",
};

const responsibleLabels: Record<ResponsibleType, string> = {
  internal: "Equipe / instalador",
  client: "Cliente",
  both: "Equipe ou cliente",
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("general");
  const [scopeValue, setScopeValue] = useState("");
  const [expandQuantity, setExpandQuantity] = useState(false);
  const [evidenceRequired, setEvidenceRequired] = useState(false);
  const [manualUrls, setManualUrls] = useState("");
  const [warrantyUrls, setWarrantyUrls] = useState("");
  const [postSaleEnabled, setPostSaleEnabled] = useState(true);
  const [postSaleAfterDays, setPostSaleAfterDays] = useState("7");
  const [postSaleAction, setPostSaleAction] = useState("create_task");
  const [checks, setChecks] = useState<DraftCheck[]>(DEFAULT_CHECKS);

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
      const templateRows = await api<Template[]>(`/api/tenants/${tenantId}/installation-templates`);
      setTemplates(templateRows);
    } catch (error) {
      toast({ title: "Não foi possível carregar os modelos", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, [open, tenantId]);

  const summary = useMemo(() => {
    const validChecks = checks.filter((check) => check.label.trim());
    const evidenceCount = validChecks.filter((check) => check.evidenceType !== "none").length;
    const requiredCount = validChecks.filter((check) => check.required).length;
    return {
      validChecks,
      evidenceCount,
      requiredCount,
    };
  }, [checks]);

  function resetForm() {
    setName("");
    setScopeType("general");
    setScopeValue("");
    setExpandQuantity(false);
    setEvidenceRequired(false);
    setManualUrls("");
    setWarrantyUrls("");
    setPostSaleEnabled(true);
    setPostSaleAfterDays("7");
    setPostSaleAction("create_task");
    setChecks(DEFAULT_CHECKS);
  }

  async function createTemplate() {
    if (!name.trim()) {
      toast({ title: "Informe o nome do modelo.", variant: "destructive" });
      return;
    }
    if (scopeType !== "general" && !scopeValue.trim()) {
      toast({ title: "Informe onde este modelo deve ser aplicado.", variant: "destructive" });
      return;
    }
    if (!summary.validChecks.length) {
      toast({ title: "Adicione pelo menos uma atividade.", variant: "destructive" });
      return;
    }

    const scopePayload = {
      segmentKey: scopeType === "segment" ? scopeValue.trim() : null,
      nicheKey: scopeType === "niche" ? scopeValue.trim() : null,
      categoryKey: scopeType === "category" ? scopeValue.trim() : null,
      productId: scopeType === "product" ? scopeValue.trim() : null,
    };

    setSaving(true);
    try {
      await api(`/api/tenants/${tenantId}/installation-templates`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ...scopePayload,
          active: true,
          rules: {
            expandQuantity,
            evidenceRequired,
            required: true,
            manualUrls: manualUrls.split(/[\n,;]/).map((value) => value.trim()).filter(Boolean),
            warrantyUrls: warrantyUrls.split(/[\n,;]/).map((value) => value.trim()).filter(Boolean),
            postSaleEnabled,
            postSaleAfterDays: postSaleEnabled && Number(postSaleAfterDays) > 0 ? Number(postSaleAfterDays) : null,
            postSaleAction: postSaleEnabled ? postSaleAction : null,
          },
          checks: summary.validChecks.map((check, index) => ({
            key: `check_${index + 1}`,
            label: check.label.trim(),
            required: check.required,
            blockAdvance: check.blockAdvance,
            evidenceType: check.evidenceType,
            responsibleType: check.responsibleType,
            completed: false,
          })),
        }),
      });
      resetForm();
      await loadTemplates();
      toast({ title: "Modelo de execução criado." });
    } catch (error) {
      toast({ title: "Não foi possível criar o modelo", description: String(error), variant: "destructive" });
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
      toast({ title: "Não foi possível alterar o modelo", description: String(error), variant: "destructive" });
    }
  }

  const scopePlaceholder =
    scopeType === "segment"
      ? "Ex.: Construção"
      : scopeType === "niche"
        ? "Ex.: Esquadrias"
        : scopeType === "category"
          ? "Ex.: Janelas de PVC"
          : "Busque pelo nome ou código do produto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Modelos de execução / instalação
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Configure uma vez o passo a passo. Quando uma execução correspondente for criada, o Vendor.ai aplica automaticamente as atividades, evidências e documentos deste modelo.
          </p>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-5">
            <section className="space-y-4 rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <PackageSearch className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">1. Identificação do modelo</h3>
                  <p className="text-xs text-muted-foreground">
                    Defina o nome e em quais instalações este processo deve ser aplicado.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Nome do modelo *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Instalação de esquadrias PVC"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Aplicar em</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={scopeType}
                    onChange={(e) => {
                      setScopeType(e.target.value as ScopeType);
                      setScopeValue("");
                    }}
                  >
                    {Object.entries(scopeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                {scopeType !== "general" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">
                      {scopeType === "product" ? "Produto específico" : scopeLabels[scopeType]}
                    </label>
                    <Input
                      value={scopeValue}
                      onChange={(e) => setScopeValue(e.target.value)}
                      placeholder={scopePlaceholder}
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-2 rounded-lg bg-muted/30 p-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={expandQuantity}
                    onChange={(e) => setExpandQuantity(e.target.checked)}
                  />
                  Conferir cada unidade separadamente
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={evidenceRequired}
                    onChange={(e) => setEvidenceRequired(e.target.checked)}
                  />
                  Exigir evidência nas atividades configuradas
                </label>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <ClipboardCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold">2. Passo a passo da execução</h3>
                    <p className="text-xs text-muted-foreground">
                      Cada atividade pode definir responsável, comprovação e bloqueio de avanço.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setChecks((current) => [
                      ...current,
                      {
                        label: "",
                        required: true,
                        blockAdvance: true,
                        evidenceType: "photo",
                        responsibleType: "internal",
                      },
                    ])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Atividade
                </Button>
              </div>

              <div className="space-y-3">
                {checks.map((check, index) => (
                  <div key={index} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                            {index + 1}
                          </span>
                          <Input
                            value={check.label}
                            onChange={(e) =>
                              setChecks((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, label: e.target.value } : item,
                                ),
                              )
                            }
                            placeholder="Ex.: Conferir nível, prumo e vedação"
                          />
                        </div>

                        <div className="grid gap-2 pl-9 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground">Quem executa / preenche</label>
                            <select
                              className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                              value={check.responsibleType}
                              onChange={(e) =>
                                setChecks((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, responsibleType: e.target.value as ResponsibleType }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {Object.entries(responsibleLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground">Comprovação</label>
                            <select
                              className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                              value={check.evidenceType}
                              onChange={(e) =>
                                setChecks((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, evidenceType: e.target.value as EvidenceType }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {Object.entries(evidenceLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 pl-9">
                          <label className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={check.required}
                              onChange={(e) =>
                                setChecks((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, required: e.target.checked } : item,
                                  ),
                                )
                              }
                            />
                            Obrigatória
                          </label>
                          <label className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={check.blockAdvance}
                              onChange={(e) =>
                                setChecks((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, blockAdvance: e.target.checked } : item,
                                  ),
                                )
                              }
                            />
                            Bloquear avanço enquanto pendente
                          </label>
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={checks.length <= 1}
                        onClick={() => setChecks((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        aria-label="Remover atividade"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4 rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">3. Documentos automáticos</h3>
                  <p className="text-xs text-muted-foreground">
                    Informe os materiais que devem acompanhar esta execução. Use um link por linha.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Manuais / instruções</label>
                  <textarea
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={manualUrls}
                    onChange={(e) => setManualUrls(e.target.value)}
                    placeholder="Cole os links dos manuais ou instruções"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Garantias / termos</label>
                  <textarea
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={warrantyUrls}
                    onChange={(e) => setWarrantyUrls(e.target.value)}
                    placeholder="Cole os links das garantias ou termos"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">4. Pós-venda</h3>
                  <p className="text-xs text-muted-foreground">
                    Defina se o sistema deve gerar automaticamente um acompanhamento depois da conclusão.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={postSaleEnabled}
                  onChange={(e) => setPostSaleEnabled(e.target.checked)}
                />
                Criar acompanhamento pós-instalação
              </label>

              {postSaleEnabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Após quantos dias?</label>
                    <Input
                      type="number"
                      min={1}
                      value={postSaleAfterDays}
                      onChange={(e) => setPostSaleAfterDays(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Ação automática</label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={postSaleAction}
                      onChange={(e) => setPostSaleAction(e.target.value)}
                    >
                      <option value="create_task">Criar tarefa de acompanhamento</option>
                      <option value="whatsapp">Preparar mensagem de WhatsApp</option>
                      <option value="review">Solicitar avaliação / feedback</option>
                      <option value="call">Criar tarefa de ligação</option>
                    </select>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-xl border bg-muted/20 p-4">
              <h3 className="text-sm font-semibold">Resumo do modelo</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Este modelo será aplicado em <strong className="text-foreground">{scopeLabels[scopeType]}</strong>
                {scopeType !== "general" && scopeValue.trim() ? <>: <strong className="text-foreground">{scopeValue.trim()}</strong></> : null}.
                {" "}Possui <strong className="text-foreground">{summary.validChecks.length}</strong> atividade(s),
                {" "}<strong className="text-foreground">{summary.requiredCount}</strong> obrigatória(s) e
                {" "}<strong className="text-foreground">{summary.evidenceCount}</strong> com comprovação configurada.
                {postSaleEnabled ? <> Pós-venda após <strong className="text-foreground">{postSaleAfterDays || "—"} dia(s)</strong>.</> : null}
              </p>
            </section>
          </div>

          <aside className="space-y-3">
            <div>
              <h3 className="font-semibold">Modelos configurados</h3>
              <p className="text-xs text-muted-foreground">
                Os modelos existentes são preservados. Desativar um modelo não apaga o histórico das execuções anteriores.
              </p>
            </div>

            {loading && <div className="h-24 animate-pulse rounded-lg bg-muted" />}

            {!loading && templates.length === 0 && (
              <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                Nenhum modelo cadastrado. Sem modelo específico, o Vendor.ai usa o checklist geral.
              </div>
            )}

            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{template.name}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[
                        template.productId && `Produto: ${template.productId}`,
                        template.categoryKey && `Categoria: ${template.categoryKey}`,
                        template.nicheKey && `Nicho: ${template.nicheKey}`,
                        template.segmentKey && `Segmento: ${template.segmentKey}`,
                      ].filter(Boolean).join(" • ") || "Padrão geral"}
                    </p>
                  </div>
                  <Badge variant={template.active ? "secondary" : "outline"}>
                    {template.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {template.checks?.length ?? 0} atividade(s) • versão {template.version}
                </p>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => void toggleTemplate(template)}
                >
                  {template.active ? "Desativar" : "Ativar"}
                </Button>
              </div>
            ))}
          </aside>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={saving} onClick={() => void createTemplate()}>
            {saving ? "Salvando..." : "Salvar modelo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
