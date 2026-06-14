import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSegmentTemplates,
  useCompleteOnboarding,
  getGetTenantQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Building2,
  ShoppingBag,
  Users,
  Radio,
  FileUp,
  X,
  Sparkles,
  FileText,
  AlertCircle,
} from "lucide-react";
import logoLight from "/logo-full-light.svg";

// ── Types ──────────────────────────────────────────────────────────────────
interface DocumentExtractionResult {
  nomeFantasia?: string | null;
  vertical?: string | null;
  produtos?: Array<{ nome: string; descricao?: string | null; preco?: number | null }> | null;
  diferenciais?: string | null;
  publicoAlvo?: string | null;
  concorrentes?: string[] | null;
  canaisVenda?: string[] | null;
  missao?: string | null;
  visao?: string | null;
  valores?: string[] | null;
  historia?: string | null;
  confianca?: number | null;
}

// ── Zod schemas ────────────────────────────────────────────────────────────
const productSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  descricao: z.string().optional(),
  preco: z.coerce.number().nonnegative().optional(),
});

const concorrenteSchema = z.object({ value: z.string() });

const formSchema = z.object({
  nomeFantasia: z.string().min(1, "Nome da empresa é obrigatório"),
  vertical: z.string().min(1, "Segmento é obrigatório"),
  logoUrl: z.string().optional(),
  produtos: z.array(productSchema).optional(),
  diferenciais: z.string().optional(),
  publicoAlvo: z.string().optional(),
  concorrentes: z.array(concorrenteSchema).optional(),
  canaisVenda: z.array(z.string()).optional(),
});

type WizardForm = z.infer<typeof formSchema>;

// ── Constants ──────────────────────────────────────────────────────────────
const CANAIS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "site", label: "Site próprio" },
  { id: "marketplace", label: "Marketplace" },
  { id: "fisico", label: "Loja física" },
];

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const ACCEPTED_EXT = ".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp";

const TOTAL_DATA_STEPS = 4;

const STEP_META = [
  { icon: Building2, label: "Identidade" },
  { icon: ShoppingBag, label: "Produtos" },
  { icon: Users, label: "Mercado" },
  { icon: Radio, label: "Canais" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function fieldCount(result: DocumentExtractionResult): number {
  let n = 0;
  if (result.nomeFantasia) n++;
  if (result.vertical) n++;
  if (result.diferenciais) n++;
  if (result.publicoAlvo) n++;
  if (result.produtos?.length) n++;
  if (result.concorrentes?.length) n++;
  if (result.canaisVenda?.length) n++;
  if (result.missao) n++;
  if (result.visao) n++;
  if (result.historia) n++;
  if (result.valores?.length) n++;
  return n;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Onboarding() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [configResult, setConfigResult] = useState<{
    promptsApplied: string[];
    funilCriado: boolean;
    kbArtigosGerados: number;
  } | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Document upload state ──────────────────────────────────────────────
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<DocumentExtractionResult | null>(null);
  const [extraDocData, setExtraDocData] = useState<Record<string, unknown>>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: segments = [], isLoading: segmentsLoading } =
    useListSegmentTemplates();
  const completeMutation = useCompleteOnboarding();

  const form = useForm<WizardForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nomeFantasia: "",
      vertical: "",
      logoUrl: "",
      produtos: [{ nome: "", descricao: "", preco: undefined }],
      diferenciais: "",
      publicoAlvo: "",
      concorrentes: [{ value: "" }],
      canaisVenda: [],
    },
  });

  const {
    fields: produtoFields,
    append: appendProduto,
    remove: removeProduto,
    replace: replaceProdutos,
  } = useFieldArray({ control: form.control, name: "produtos" });

  const {
    fields: concorrenteFields,
    append: appendConcorrente,
    remove: removeConcorrente,
    replace: replaceConcorrentes,
  } = useFieldArray({ control: form.control, name: "concorrentes" });

  // ── File handling ──────────────────────────────────────────────────────
  function addFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming).filter((f) =>
      ACCEPTED_TYPES.includes(f.type) || f.name.endsWith(".docx") || f.name.endsWith(".doc")
    );
    setDocFiles((prev) => {
      const merged = [...prev, ...arr];
      return merged.slice(0, 3);
    });
    setExtraction(null);
    setAnalysisError(null);
  }

  function removeFile(idx: number) {
    setDocFiles((prev) => prev.filter((_, i) => i !== idx));
    setExtraction(null);
    setAnalysisError(null);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  // ── AI analysis ────────────────────────────────────────────────────────
  async function analyzeDocuments() {
    if (!user?.tenantId || docFiles.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setExtraction(null);

    const formData = new FormData();
    docFiles.forEach((f) => formData.append("files", f));

    const token = localStorage.getItem("vendorai_token");
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

    try {
      const resp = await fetch(
        `${base}/api/tenants/${user.tenantId}/onboarding/analyze-documents`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Erro ao analisar documentos");
      }

      const result: DocumentExtractionResult = await resp.json();
      setExtraction(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao analisar documentos";
      setAnalysisError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }

  // ── Apply extraction to form ────────────────────────────────────────────
  function applyExtractionAndAdvance() {
    if (!extraction) { setStep(1); return; }

    if (extraction.nomeFantasia) form.setValue("nomeFantasia", extraction.nomeFantasia);
    if (extraction.vertical) form.setValue("vertical", extraction.vertical);
    if (extraction.diferenciais) form.setValue("diferenciais", extraction.diferenciais);
    if (extraction.publicoAlvo) form.setValue("publicoAlvo", extraction.publicoAlvo);

    if (extraction.produtos?.length) {
      replaceProdutos(
        extraction.produtos.map((p) => ({
          nome: p.nome,
          descricao: p.descricao ?? undefined,
          preco: p.preco ?? undefined,
        }))
      );
    }

    if (extraction.concorrentes?.length) {
      replaceConcorrentes(extraction.concorrentes.map((v) => ({ value: v })));
    }

    if (extraction.canaisVenda?.length) {
      const valid = extraction.canaisVenda.filter((c) =>
        CANAIS.map((x) => x.id).includes(c)
      );
      if (valid.length) form.setValue("canaisVenda", valid);
    }

    // Store extra fields (missao, visao, valores, historia) for discoveryData
    const extra: Record<string, unknown> = {};
    if (extraction.missao) extra["missao"] = extraction.missao;
    if (extraction.visao) extra["visao"] = extraction.visao;
    if (extraction.valores?.length) extra["valores"] = extraction.valores;
    if (extraction.historia) extra["historia"] = extraction.historia;
    setExtraDocData(extra);

    setStep(1);
  }

  // ── Wizard navigation ──────────────────────────────────────────────────
  async function handleNext() {
    if (step === 1) {
      const valid = await form.trigger(["nomeFantasia", "vertical"]);
      if (!valid) return;
    }
    if (step === TOTAL_DATA_STEPS) {
      setStep(5);
      return;
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    if (step === 1) { setStep(0); return; }
    setStep((s) => Math.max(s - 1, 1));
  }

  function toggleCanal(canal: string) {
    const current = form.getValues("canaisVenda") ?? [];
    const next = current.includes(canal)
      ? current.filter((c) => c !== canal)
      : [...current, canal];
    form.setValue("canaisVenda", next);
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  async function submitWizard(values: WizardForm) {
    if (!user?.tenantId) return;
    setSubmitting(true);
    setSubmitError(null);

    const tenantId = user.tenantId;

    const produtosFiltrados = (values.produtos ?? [])
      .filter((p) => p.nome.trim())
      .map((p) => ({
        nome: p.nome,
        descricao: p.descricao,
        preco: p.preco,
      }));

    const concorrentesFiltrados = (values.concorrentes ?? [])
      .map((c) => c.value.trim())
      .filter(Boolean);

    completeMutation.mutate(
      {
        tenantId,
        data: {
          nomeFantasia: values.nomeFantasia,
          vertical: values.vertical,
          logoUrl: values.logoUrl || undefined,
          produtos: produtosFiltrados.length > 0 ? produtosFiltrados : undefined,
          diferenciais: values.diferenciais || undefined,
          publicoAlvo: values.publicoAlvo || undefined,
          concorrentes: concorrentesFiltrados.length > 0 ? concorrentesFiltrados : undefined,
          canaisVenda: (values.canaisVenda ?? []).length > 0 ? values.canaisVenda : undefined,
          discoveryData: Object.keys(extraDocData).length > 0 ? extraDocData : undefined,
        },
      },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
          setSubmitting(false);
          setConfigResult({
            promptsApplied: result.promptsApplied,
            funilCriado: result.funilCriado,
            kbArtigosGerados: result.kbArtigosGerados,
          });
          setTimeout(() => setLocation("/"), 3000);
        },
        onError: (err) => {
          setSubmitting(false);
          setSubmitError(err.message || "Erro ao salvar. Tente novamente.");
          toast({
            title: "Erro ao salvar configurações",
            description: err.message || "Tente novamente.",
            variant: "destructive",
          });
        },
      }
    );
  }

  useEffect(() => {
    if (step === 5 && !submitting && !submitError) {
      form.handleSubmit(submitWizard)();
    }
  }, [step]);

  const isDataStep = step >= 1 && step <= TOTAL_DATA_STEPS;
  const progressPct = isDataStep ? ((step - 1) / TOTAL_DATA_STEPS) * 100 : step > TOTAL_DATA_STEPS ? 100 : 0;

  const found = extraction ? fieldCount(extraction) : 0;
  const hasUsefulData = found >= 1;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <img src={logoLight} alt="Vendor.ai" className="h-8 w-auto" />
        {isDataStep && (
          <div className="flex-1 max-w-md">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Configuração inicial</span>
              <span>{step} de {TOTAL_DATA_STEPS}</span>
            </div>
            <Progress value={progressPct} className="h-1.5" />
          </div>
        )}
      </header>

      <main className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-xl space-y-6">

          {/* ── Step nav pills (data steps only) ── */}
          {isDataStep && (
            <div className="flex gap-2 mb-6">
              {STEP_META.map((s, i) => {
                const idx = i + 1;
                const Icon = s.icon;
                const active = idx === step;
                const done = idx < step;
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 0 — Documentos (opcional)
          ══════════════════════════════════════════════════════════════ */}
          {step === 0 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-bold">Preencha com IA</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tem um manual da marca, apresentação ou documento institucional?
                    Envie e a IA extrai as informações automaticamente.
                  </p>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <FileUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Arraste arquivos ou clique para selecionar
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DOCX, TXT ou imagem — até 3 arquivos, máx. 10 MB cada
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_EXT}
                    className="hidden"
                    onChange={(e) => e.target.files && addFiles(e.target.files)}
                  />
                </div>

                {/* File list */}
                {docFiles.length > 0 && (
                  <div className="space-y-2">
                    {docFiles.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {(f.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Analyse button */}
                {docFiles.length > 0 && !extraction && (
                  <Button
                    onClick={analyzeDocuments}
                    disabled={isAnalyzing}
                    className="w-full gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analisando documentos...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Analisar com IA
                      </>
                    )}
                  </Button>
                )}

                {/* Error */}
                {analysisError && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{analysisError}</span>
                  </div>
                )}

                {/* Results */}
                {extraction && (
                  <div className="rounded-lg border bg-muted/30 divide-y text-sm">
                    <div className="px-4 py-3 font-semibold flex items-center gap-2">
                      {hasUsefulData ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          {found} {found === 1 ? "campo encontrado" : "campos encontrados"}
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          Não encontramos dados suficientes
                        </>
                      )}
                    </div>

                    {extraction.nomeFantasia && (
                      <div className="px-4 py-2 flex gap-2">
                        <span className="text-muted-foreground w-32 flex-shrink-0">Empresa</span>
                        <span className="font-medium">{extraction.nomeFantasia}</span>
                      </div>
                    )}
                    {extraction.vertical && (
                      <div className="px-4 py-2 flex gap-2">
                        <span className="text-muted-foreground w-32 flex-shrink-0">Segmento</span>
                        <span className="font-medium">{extraction.vertical}</span>
                      </div>
                    )}
                    {extraction.produtos?.length && (
                      <div className="px-4 py-2 flex gap-2">
                        <span className="text-muted-foreground w-32 flex-shrink-0">Produtos</span>
                        <span className="font-medium">{extraction.produtos.length} encontrado{extraction.produtos.length > 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {extraction.diferenciais && (
                      <div className="px-4 py-2 flex gap-2">
                        <span className="text-muted-foreground w-32 flex-shrink-0">Diferencial</span>
                        <span className="line-clamp-2">{extraction.diferenciais}</span>
                      </div>
                    )}
                    {extraction.publicoAlvo && (
                      <div className="px-4 py-2 flex gap-2">
                        <span className="text-muted-foreground w-32 flex-shrink-0">Público-alvo</span>
                        <span className="line-clamp-2">{extraction.publicoAlvo}</span>
                      </div>
                    )}
                    {extraction.missao && (
                      <div className="px-4 py-2 flex gap-2">
                        <span className="text-muted-foreground w-32 flex-shrink-0">Missão</span>
                        <span className="line-clamp-2">{extraction.missao}</span>
                      </div>
                    )}
                    {extraction.historia && (
                      <div className="px-4 py-2 flex gap-2">
                        <span className="text-muted-foreground w-32 flex-shrink-0">História</span>
                        <span className="line-clamp-2">{extraction.historia}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons after analysis */}
                {extraction && (
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={applyExtractionAndAdvance}
                      className="w-full gap-2"
                      disabled={!hasUsefulData}
                    >
                      <ChevronRight className="h-4 w-4" />
                      {hasUsefulData
                        ? "Aplicar dados e continuar →"
                        : "Continuar sem dados"}
                    </Button>
                    {hasUsefulData && (
                      <Button
                        variant="ghost"
                        className="w-full text-muted-foreground"
                        onClick={() => setStep(1)}
                      >
                        Continuar sem aplicar
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Skip step 0 */}
          {step === 0 && !extraction && (
            <div className="text-center">
              <Button
                variant="ghost"
                className="text-muted-foreground gap-1.5"
                onClick={() => setStep(1)}
              >
                Pular e preencher manualmente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 1 — Identidade
          ══════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Identidade do negócio</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Como seus clientes te conhecem?
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nomeFantasia">
                    Nome da empresa <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="nomeFantasia"
                    placeholder="Ex: Estética da Ana"
                    {...form.register("nomeFantasia")}
                  />
                  {form.formState.errors.nomeFantasia && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.nomeFantasia.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>
                    Segmento <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.watch("vertical")}
                    onValueChange={(v) => form.setValue("vertical", v)}
                    disabled={segmentsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o segmento..." />
                    </SelectTrigger>
                    <SelectContent>
                      {segments.map((s) => (
                        <SelectItem key={s.id} value={s.nome}>
                          {s.nome}
                        </SelectItem>
                      ))}
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.formState.errors.vertical && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.vertical.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logoUrl">URL da logo</Label>
                  <Input
                    id="logoUrl"
                    placeholder="https://seusite.com/logo.png"
                    {...form.register("logoUrl")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Opcional. Cole o link público da sua logo.
                  </p>
                  {form.watch("logoUrl") && (
                    <img
                      src={form.watch("logoUrl")}
                      alt="Preview"
                      className="h-12 w-auto rounded border object-contain"
                      onError={(e) =>
                        ((e.target as HTMLImageElement).style.display = "none")
                      }
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 2 — Produtos
          ══════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">O que você vende</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Principais produtos ou serviços
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>Produtos / Serviços</Label>
                  {produtoFields.map((field, i) => (
                    <div key={field.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex gap-2 items-start">
                        <Input
                          placeholder="Nome do produto ou serviço"
                          {...form.register(`produtos.${i}.nome`)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeProduto(i)}
                          disabled={produtoFields.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Descrição (opcional)"
                        {...form.register(`produtos.${i}.descricao`)}
                      />
                      <Input
                        type="number"
                        placeholder="Preço (opcional)"
                        {...form.register(`produtos.${i}.preco`)}
                        className="w-36"
                      />
                    </div>
                  ))}
                  {produtoFields.length < 5 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        appendProduto({ nome: "", descricao: "", preco: undefined })
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar produto
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diferenciais">Diferencial competitivo</Label>
                  <Textarea
                    id="diferenciais"
                    placeholder="O que te diferencia da concorrência? Ex: atendimento rápido, produtos importados, preço acessível..."
                    rows={3}
                    {...form.register("diferenciais")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="publicoAlvo">Público-alvo</Label>
                  <Textarea
                    id="publicoAlvo"
                    placeholder="Quem é seu cliente ideal? Ex: mulheres 25-45 anos, empresas de médio porte..."
                    rows={2}
                    {...form.register("publicoAlvo")}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 3 — Concorrentes
          ══════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Concorrentes</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Quem são seus principais competidores?
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Concorrentes (opcional)</Label>
                  {concorrenteFields.map((field, i) => (
                    <div key={field.id} className="flex gap-2">
                      <Input
                        placeholder={`Concorrente ${i + 1}`}
                        {...form.register(`concorrentes.${i}.value`)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeConcorrente(i)}
                        disabled={concorrenteFields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {concorrenteFields.length < 5 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => appendConcorrente({ value: "" })}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar concorrente
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Pode pular se preferir. Até 5 concorrentes.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 4 — Canais
          ══════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Canais de atendimento</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Por onde você atende ou vende? (selecione todos que se aplicam)
                  </p>
                </div>

                <div className="grid gap-3">
                  {CANAIS.map((canal) => {
                    const canais = form.watch("canaisVenda") ?? [];
                    const checked = canais.includes(canal.id);
                    return (
                      <label
                        key={canal.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          id={canal.id}
                          checked={checked}
                          onCheckedChange={() => toggleCanal(canal.id)}
                        />
                        <span className="font-medium">{canal.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pode pular se preferir.
                </p>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 5 — Concluindo
          ══════════════════════════════════════════════════════════════ */}
          {step === 5 && (
            <Card>
              <CardContent className="pt-10 pb-10 flex flex-col items-center text-center gap-6">
                {submitting && (
                  <>
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <div>
                      <p className="text-lg font-semibold">
                        Salvando suas configurações...
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Isso levará apenas um momento.
                      </p>
                    </div>
                  </>
                )}

                {!submitting && !submitError && configResult && (
                  <>
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                    <div className="w-full space-y-4">
                      <div className="text-center">
                        <p className="text-lg font-semibold">Tudo configurado!</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Redirecionando para o dashboard em instantes...
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 divide-y text-sm">
                        {configResult.promptsApplied.length > 0 && (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <span>
                              <strong>{configResult.promptsApplied.length}</strong> agentes de IA configurados automaticamente
                            </span>
                          </div>
                        )}
                        {configResult.funilCriado && (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <span>Funil de vendas criado para seu segmento</span>
                          </div>
                        )}
                        {configResult.kbArtigosGerados > 0 && (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <span>
                              <strong>{configResult.kbArtigosGerados}</strong>{" "}
                              {configResult.kbArtigosGerados === 1
                                ? "artigo adicionado"
                                : "artigos adicionados"}{" "}
                              à base de conhecimento
                            </span>
                          </div>
                        )}
                        {Object.keys(extraDocData).length > 0 && (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <span>Missão, visão e valores salvos do documento</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {submitError && (
                  <div className="space-y-4 w-full">
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                      {submitError}
                    </div>
                    <div className="flex gap-3 justify-center">
                      <Button variant="outline" onClick={() => setStep(4)}>
                        Voltar
                      </Button>
                      <Button
                        onClick={() => {
                          setSubmitError(null);
                          form.handleSubmit(submitWizard)();
                        }}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Navigation buttons (data steps 1-4) ── */}
          {isDataStep && (
            <div className="flex justify-between pt-2">
              <Button
                variant="ghost"
                onClick={handleBack}
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={handleNext} className="gap-1.5">
                {step === TOTAL_DATA_STEPS ? "Concluir" : "Próximo"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
