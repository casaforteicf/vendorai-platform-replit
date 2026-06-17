import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSegmentTemplates,
  useCompleteOnboarding,
  useUpdateTenant,
  getGetTenantQueryKey,
  useRequestUploadUrl,
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
  CreditCard,
  Compass,
  BookOpen,
  MapPin,
  BarChart2,
  Navigation,
  TrendingUp,
  Cpu,
  Target,
  MessageSquare,
  FolderOpen,
  Zap,
  Upload,
  ImageIcon,
} from "lucide-react";
import logoLight from "/logo-full-light.svg";

// ── Types ───────────────────────────────────────────────────────────────────
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

// ── Zod schemas ─────────────────────────────────────────────────────────────
const productSchema = z.object({
  nome: z.string(),
  descricao: z.string().optional(),
  preco: z.coerce.number().nonnegative().optional(),
});

const tagSchema = z.object({ value: z.string() });
const faqSchema = z.object({ pergunta: z.string(), resposta: z.string() });
const materialSchema = z.object({ titulo: z.string(), url: z.string() });
const audienceSegmentSchema = z.object({
  nome: z.string(),
  descricao: z.string().optional(),
  dores: z.string().optional(),
  motivacoes: z.string().optional(),
});

const formSchema = z.object({
  // Step 1 – Identidade
  nomeFantasia: z.string().min(1, "Nome da empresa é obrigatório"),
  vertical: z.string().min(1, "Segmento é obrigatório"),
  logoUrl: z.string().optional(),

  // Step 2 – Dados Cadastrais
  cnpj: z.string().optional(),
  nomeResponsavel: z.string().optional(),
  telefoneCadastro: z.string().optional(),
  emailCadastro: z.string().optional(),
  enderecoCadastro: z.string().optional(),
  siteCadastro: z.string().optional(),

  // Step 3 – Posicionamento / Missão
  missao: z.string().optional(),
  visao: z.string().optional(),
  slogan: z.string().optional(),
  valores: z.array(tagSchema).optional(),

  // Step 4 – História e Marca
  historia: z.string().optional(),
  anoFundacao: z.string().optional(),
  personalidadeMarca: z.array(z.string()).optional(),

  // Step 5 – Produtos / Serviços
  produtos: z.array(productSchema).optional(),
  diferenciais: z.string().optional(),

  // Step 6 – Segmentos de Audiência
  audienceSegments: z.array(audienceSegmentSchema).optional(),
  publicoAlvo: z.string().optional(),
  faixaEtaria: z.string().optional(),
  generoPredominante: z.string().optional(),
  rendaMensal: z.string().optional(),
  localizacaoCliente: z.string().optional(),

  // Step 7 – Perfil Demográfico
  cidadesAtuacao: z.string().optional(),
  tipoPessoa: z.string().optional(),
  decisorCompra: z.string().optional(),
  tamanhoEmpresaAlvo: z.string().optional(),

  // Step 8 – Concorrentes + SWOT
  concorrentes: z.array(tagSchema).optional(),
  forcas: z.array(tagSchema).optional(),
  fraquezas: z.array(tagSchema).optional(),
  oportunidades: z.array(tagSchema).optional(),
  ameacas: z.array(tagSchema).optional(),

  // Step 9 – Jornada de Compra
  etapasJornada: z.string().optional(),
  tempoDecisao: z.string().optional(),
  objecoesComuns: z.array(tagSchema).optional(),
  motivadoresCompra: z.array(tagSchema).optional(),

  // Step 10 – Canais de Atendimento
  canaisVenda: z.array(z.string()).optional(),

  // Step 11 – Processo de Vendas
  tipoFechamentoDefault: z.enum(["pedido", "contrato", "pedido_e_contrato"]).default("pedido"),
  ticketMedio: z.string().optional(),
  cicloVendas: z.string().optional(),
  metodoVendas: z.string().optional(),
  metaMensalClientes: z.string().optional(),
  tamanhoEquipe: z.string().optional(),

  // Step 12 – Processos e Tecnologia
  ferramentasEmUso: z.array(z.string()).optional(),
  integracoesDesejadas: z.string().optional(),
  processosManuais: z.string().optional(),

  // Step 13 – Métricas e Metas
  metaFaturamento: z.string().optional(),
  metaNovosClientes: z.string().optional(),
  taxaConversao: z.string().optional(),
  npsAtual: z.string().optional(),

  // Step 14 – Conhecimento para IA / FAQ
  tomVoz: z.string().optional(),
  regraAtendimento: z.string().optional(),
  faqItems: z.array(faqSchema).optional(),

  // Step 15 – Materiais e Documentos
  linksMateriais: z.array(materialSchema).optional(),
  politicasInfo: z.string().optional(),

  // Step 16 – Automação com IA
  agentesAtivos: z.array(z.string()).optional(),
  horarioAtendimento: z.string().optional(),
  saudacaoInicial: z.string().optional(),
  mensagemAusencia: z.string().optional(),
});

type WizardForm = z.infer<typeof formSchema>;

// ── Constants ────────────────────────────────────────────────────────────────
const CANAIS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "site", label: "Site próprio" },
  { id: "marketplace", label: "Marketplace" },
  { id: "fisico", label: "Loja física" },
  { id: "telefone", label: "Telefone" },
  { id: "email", label: "E-mail" },
  { id: "linkedin", label: "LinkedIn" },
];

const FERRAMENTAS = [
  { id: "whatsapp_business", label: "WhatsApp Business" },
  { id: "crm_generico", label: "CRM (genérico)" },
  { id: "hubspot", label: "HubSpot" },
  { id: "rdstation", label: "RD Station" },
  { id: "pipedrive", label: "Pipedrive" },
  { id: "planilha", label: "Planilha (Google/Excel)" },
  { id: "erp", label: "ERP / Sistema de gestão" },
  { id: "email_marketing", label: "E-mail marketing" },
  { id: "instagram_ads", label: "Instagram / Meta Ads" },
  { id: "nenhuma", label: "Nenhuma ferramenta ainda" },
];

const AGENTES = [
  { id: "sdr", label: "SDR — Qualificação de leads" },
  { id: "closer", label: "Closer — Fechamento de vendas" },
  { id: "followup", label: "Follow-up — Reengajamento" },
  { id: "reactivation", label: "Reativação de clientes inativos" },
  { id: "scheduler", label: "Agendamento de reuniões" },
  { id: "service", label: "Suporte e atendimento pós-venda" },
  { id: "onboarding", label: "Onboarding de novos clientes" },
];

const PERSONALIDADES = [
  "Séria e profissional",
  "Descontraída e amigável",
  "Jovem e moderna",
  "Tradicional e confiável",
  "Inovadora e tecnológica",
  "Acolhedora e empática",
];

const TOTAL_DATA_STEPS = 16;
const CONCLUSION_STEP = 17;

const STEP_META = [
  { icon: Building2, label: "Identidade", section: "Sua Empresa" },
  { icon: CreditCard, label: "Cadastro", section: "Sua Empresa" },
  { icon: Compass, label: "Missão", section: "Sua Empresa" },
  { icon: BookOpen, label: "História", section: "Sua Empresa" },
  { icon: ShoppingBag, label: "Produtos", section: "Mercado & Clientes" },
  { icon: Users, label: "Cliente Ideal", section: "Mercado & Clientes" },
  { icon: MapPin, label: "Demográfico", section: "Mercado & Clientes" },
  { icon: BarChart2, label: "Concorrentes", section: "Mercado & Clientes" },
  { icon: Navigation, label: "Jornada", section: "Mercado & Clientes" },
  { icon: Radio, label: "Canais", section: "Operações" },
  { icon: TrendingUp, label: "Vendas", section: "Operações" },
  { icon: Cpu, label: "Tecnologia", section: "Operações" },
  { icon: Target, label: "Metas", section: "Operações" },
  { icon: MessageSquare, label: "FAQ / IA", section: "Inteligência IA" },
  { icon: FolderOpen, label: "Materiais", section: "Inteligência IA" },
  { icon: Zap, label: "Automação", section: "Inteligência IA" },
];

const SECTIONS = ["Sua Empresa", "Mercado & Clientes", "Operações", "Inteligência IA"];

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

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function currentSection(step: number): string {
  const meta = STEP_META[step - 1];
  return meta?.section ?? "";
}

// ── TagListInput: reusable add/remove list ───────────────────────────────────
function TagListInput({
  placeholder,
  fields,
  onAppend,
  onRemove,
  register,
  namePrefix,
  maxItems = 8,
}: {
  placeholder: string;
  fields: { id: string }[];
  onAppend: () => void;
  onRemove: (i: number) => void;
  register: (name: string) => object;
  namePrefix: string;
  maxItems?: number;
}) {
  return (
    <div className="space-y-2">
      {fields.map((field, i) => (
        <div key={field.id} className="flex gap-2">
          <Input
            placeholder={placeholder}
            {...register(`${namePrefix}.${i}.value`)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="flex-shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(i)}
            disabled={fields.length === 1}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {fields.length < maxItems && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onAppend}
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
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

  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<DocumentExtractionResult | null>(null);
  const [extraDocData, setExtraDocData] = useState<Record<string, unknown>>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const logoInputRef    = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const { data: segments = [], isLoading: segmentsLoading } = useListSegmentTemplates();
  const completeMutation   = useCompleteOnboarding();
  const updateTenantMutation = useUpdateTenant();
  const requestUploadUrl   = useRequestUploadUrl();

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione um arquivo de imagem (PNG, JPG, SVG, etc.)", variant: "destructive" });
      return;
    }
    setLogoUploading(true);
    try {
      const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const uploadRes = await fetch(result.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Upload falhou");
      form.setValue("logoUrl", result.objectPath, { shouldValidate: true });
      toast({ title: "Logo carregada com sucesso!" });
    } catch {
      toast({ title: "Erro no upload. Tente novamente.", variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  }

  const form = useForm<WizardForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nomeFantasia: "",
      vertical: "",
      logoUrl: "",
      cnpj: "",
      nomeResponsavel: "",
      telefoneCadastro: "",
      emailCadastro: "",
      enderecoCadastro: "",
      siteCadastro: "",
      missao: "",
      visao: "",
      slogan: "",
      valores: [{ value: "" }],
      historia: "",
      anoFundacao: "",
      personalidadeMarca: [],
      produtos: [{ nome: "", descricao: "", preco: undefined }],
      diferenciais: "",
      audienceSegments: [{ nome: "", descricao: "", dores: "", motivacoes: "" }],
      publicoAlvo: "",
      faixaEtaria: "",
      generoPredominante: "",
      rendaMensal: "",
      localizacaoCliente: "",
      cidadesAtuacao: "",
      tipoPessoa: "",
      decisorCompra: "",
      tamanhoEmpresaAlvo: "",
      concorrentes: [{ value: "" }],
      forcas: [{ value: "" }],
      fraquezas: [{ value: "" }],
      oportunidades: [{ value: "" }],
      ameacas: [{ value: "" }],
      etapasJornada: "",
      tempoDecisao: "",
      objecoesComuns: [{ value: "" }],
      motivadoresCompra: [{ value: "" }],
      canaisVenda: [],
      tipoFechamentoDefault: "pedido" as const,
      ticketMedio: "",
      cicloVendas: "",
      metodoVendas: "",
      metaMensalClientes: "",
      tamanhoEquipe: "",
      ferramentasEmUso: [],
      integracoesDesejadas: "",
      processosManuais: "",
      metaFaturamento: "",
      metaNovosClientes: "",
      taxaConversao: "",
      npsAtual: "",
      tomVoz: "",
      regraAtendimento: "",
      faqItems: [{ pergunta: "", resposta: "" }],
      linksMateriais: [{ titulo: "", url: "" }],
      politicasInfo: "",
      agentesAtivos: [],
      horarioAtendimento: "",
      saudacaoInicial: "",
      mensagemAusencia: "",
    },
  });

  // ── Field arrays ──────────────────────────────────────────────────────────
  const {
    fields: produtoFields,
    append: appendProduto,
    remove: removeProduto,
    replace: replaceProdutos,
  } = useFieldArray({ control: form.control, name: "produtos" });

  const {
    fields: valoresFields,
    append: appendValor,
    remove: removeValor,
    replace: replaceValores,
  } = useFieldArray({ control: form.control, name: "valores" });

  const {
    fields: concorrenteFields,
    append: appendConcorrente,
    remove: removeConcorrente,
    replace: replaceConcorrentes,
  } = useFieldArray({ control: form.control, name: "concorrentes" });

  const {
    fields: forcasFields,
    append: appendForca,
    remove: removeForca,
  } = useFieldArray({ control: form.control, name: "forcas" });

  const {
    fields: fraquezasFields,
    append: appendFraqueza,
    remove: removeFraqueza,
  } = useFieldArray({ control: form.control, name: "fraquezas" });

  const {
    fields: oportunidadesFields,
    append: appendOportunidade,
    remove: removeOportunidade,
  } = useFieldArray({ control: form.control, name: "oportunidades" });

  const {
    fields: ameacasFields,
    append: appendAmeaca,
    remove: removeAmeaca,
  } = useFieldArray({ control: form.control, name: "ameacas" });

  const {
    fields: audienceSegmentFields,
    append: appendAudienceSegment,
    remove: removeAudienceSegment,
  } = useFieldArray({ control: form.control, name: "audienceSegments" });

  const {
    fields: objecoesFields,
    append: appendObjecao,
    remove: removeObjecao,
  } = useFieldArray({ control: form.control, name: "objecoesComuns" });

  const {
    fields: motivadoresFields,
    append: appendMotivador,
    remove: removeMotivador,
  } = useFieldArray({ control: form.control, name: "motivadoresCompra" });

  const {
    fields: faqFields,
    append: appendFaq,
    remove: removeFaq,
  } = useFieldArray({ control: form.control, name: "faqItems" });

  const {
    fields: materiaisFields,
    append: appendMaterial,
    remove: removeMaterial,
  } = useFieldArray({ control: form.control, name: "linksMateriais" });

  // ── File handling ─────────────────────────────────────────────────────────
  function addFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming).filter(
      (f) =>
        ACCEPTED_TYPES.includes(f.type) ||
        f.name.endsWith(".docx") ||
        f.name.endsWith(".doc")
    );
    setDocFiles((prev) => [...prev, ...arr].slice(0, 3));
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

  // ── AI analysis ───────────────────────────────────────────────────────────
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
      setAnalysisError(err instanceof Error ? err.message : "Erro ao analisar documentos");
    } finally {
      setIsAnalyzing(false);
    }
  }

  // ── Apply extraction to form ───────────────────────────────────────────────
  function applyExtractionAndAdvance() {
    if (!extraction) {
      setStep(1);
      return;
    }

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
      const valid = extraction.canaisVenda.filter((c) => CANAIS.map((x) => x.id).includes(c));
      if (valid.length) form.setValue("canaisVenda", valid);
    }

    const extra: Record<string, unknown> = {};
    if (extraction.missao) {
      extra["missao"] = extraction.missao;
      form.setValue("missao", extraction.missao);
    }
    if (extraction.visao) {
      extra["visao"] = extraction.visao;
      form.setValue("visao", extraction.visao);
    }
    if (extraction.valores?.length) {
      extra["valores"] = extraction.valores;
      replaceValores(extraction.valores.map((v) => ({ value: v })));
    }
    if (extraction.historia) {
      extra["historia"] = extraction.historia;
      form.setValue("historia", extraction.historia);
    }
    setExtraDocData(extra);
    setStep(1);
  }

  // ── Wizard navigation ─────────────────────────────────────────────────────
  async function handleNext() {
    if (step === 1) {
      const valid = await form.trigger(["nomeFantasia", "vertical"]);
      if (!valid) return;
    }
    if (step === TOTAL_DATA_STEPS) {
      setSubmitting(true);   // show spinner immediately before useEffect fires
      setStep(CONCLUSION_STEP);
      return;
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    if (step === 1) {
      setStep(0);
      return;
    }
    setStep((s) => Math.max(s - 1, 1));
  }

  function toggleCheckbox(field: "canaisVenda" | "ferramentasEmUso" | "agentesAtivos", id: string) {
    const current = form.getValues(field) ?? [];
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    form.setValue(field, next);
  }

  function togglePersonalidade(value: string) {
    const current = form.getValues("personalidadeMarca") ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    form.setValue("personalidadeMarca", next);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submitWizard(values: WizardForm) {
    if (!user?.tenantId) return;
    setSubmitting(true);
    setSubmitError(null);

    const tenantId = user.tenantId;

    const produtosFiltrados = (values.produtos ?? [])
      .filter((p) => p.nome.trim())
      .map((p) => ({ nome: p.nome, descricao: p.descricao, preco: p.preco }));

    const concorrentesFiltrados = (values.concorrentes ?? [])
      .map((c) => c.value.trim())
      .filter(Boolean);

    const flatTag = (arr: { value: string }[] | undefined) =>
      (arr ?? []).map((v) => v.value.trim()).filter(Boolean);

    const discoveryData: Record<string, unknown> = {
      ...extraDocData,
      // Step 2
      cnpj: values.cnpj || undefined,
      nomeResponsavel: values.nomeResponsavel || undefined,
      telefone: values.telefoneCadastro || undefined,
      email: values.emailCadastro || undefined,
      endereco: values.enderecoCadastro || undefined,
      site: values.siteCadastro || undefined,
      // Step 3
      missao: values.missao || undefined,
      visao: values.visao || undefined,
      slogan: values.slogan || undefined,
      valores: flatTag(values.valores),
      // Step 4
      historia: values.historia || undefined,
      anoFundacao: values.anoFundacao || undefined,
      personalidadeMarca: values.personalidadeMarca,
      // Step 6 – Segmentos de Audiência
      audienceSegments: (values.audienceSegments ?? [])
        .filter((s) => s.nome.trim())
        .map((s) => ({
          nome: s.nome,
          descricao: s.descricao || undefined,
          dores: s.dores || undefined,
          motivacoes: s.motivacoes || undefined,
        })),
      faixaEtaria: values.faixaEtaria || undefined,
      generoPredominante: values.generoPredominante || undefined,
      rendaMensal: values.rendaMensal || undefined,
      localizacaoCliente: values.localizacaoCliente || undefined,
      // Step 7
      cidadesAtuacao: values.cidadesAtuacao || undefined,
      tipoPessoa: values.tipoPessoa || undefined,
      decisorCompra: values.decisorCompra || undefined,
      tamanhoEmpresaAlvo: values.tamanhoEmpresaAlvo || undefined,
      // Step 8 – SWOT
      forcas: flatTag(values.forcas),
      fraquezas: flatTag(values.fraquezas),
      oportunidades: flatTag(values.oportunidades),
      ameacas: flatTag(values.ameacas),
      // Step 9
      etapasJornada: values.etapasJornada || undefined,
      tempoDecisao: values.tempoDecisao || undefined,
      objecoesComuns: flatTag(values.objecoesComuns),
      motivadoresCompra: flatTag(values.motivadoresCompra),
      // Step 11
      ticketMedio: values.ticketMedio || undefined,
      cicloVendas: values.cicloVendas || undefined,
      metodoVendas: values.metodoVendas || undefined,
      metaMensalClientes: values.metaMensalClientes || undefined,
      tamanhoEquipe: values.tamanhoEquipe || undefined,
      // Step 12
      ferramentasEmUso: values.ferramentasEmUso,
      integracoesDesejadas: values.integracoesDesejadas || undefined,
      processosManuais: values.processosManuais || undefined,
      // Step 13
      metaFaturamento: values.metaFaturamento || undefined,
      metaNovosClientes: values.metaNovosClientes || undefined,
      taxaConversao: values.taxaConversao || undefined,
      npsAtual: values.npsAtual || undefined,
      // Step 14
      tomVoz: values.tomVoz || undefined,
      regraAtendimento: values.regraAtendimento || undefined,
      faqItems: (values.faqItems ?? []).filter((f) => f.pergunta.trim() || f.resposta.trim()),
      // Step 15
      linksMateriais: (values.linksMateriais ?? []).filter((l) => l.url.trim()),
      politicasInfo: values.politicasInfo || undefined,
      // Step 16
      agentesAtivos: values.agentesAtivos,
      horarioAtendimento: values.horarioAtendimento || undefined,
      saudacaoInicial: values.saudacaoInicial || undefined,
      mensagemAusencia: values.mensagemAusencia || undefined,
    };

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
          discoveryData,
        },
      },
      {
        onSuccess: (result) => {
          if (values.tipoFechamentoDefault) {
            updateTenantMutation.mutate({ id: tenantId, data: { tipoFechamentoDefault: values.tipoFechamentoDefault } });
          }
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
    if (step !== CONCLUSION_STEP) return;
    form.handleSubmit(submitWizard, (validationErrors) => {
      // Form validation failed — show error so user can go back and fix
      setSubmitting(false);
      const fields = Object.keys(validationErrors).join(", ");
      setSubmitError(
        `Erro de validação: verifique os campos obrigatórios (${fields || "formulário"}) e tente novamente.`
      );
    })();
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
              <span className="font-medium text-foreground">{currentSection(step)}</span>
              <span>Etapa {step} de {TOTAL_DATA_STEPS}</span>
            </div>
            <Progress value={progressPct} className="h-1.5" />
          </div>
        )}
      </header>

      <main className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-xl space-y-6">

          {/* ── Step nav pills ── */}
          {isDataStep && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {STEP_META.map((s, i) => {
                const idx = i + 1;
                const Icon = s.icon;
                const active = idx === step;
                const done = idx < step;
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground font-semibold"
                        : done
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                    <span className="hidden md:inline">{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 0 — Pré-preenchimento com IA
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
                    Envie e a IA extrai as informações automaticamente para pré-preencher o wizard.
                  </p>
                </div>

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
                  <p className="text-sm font-medium">Arraste arquivos ou clique para selecionar</p>
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

                {docFiles.length > 0 && (
                  <div className="space-y-2">
                    {docFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
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

                {docFiles.length > 0 && !extraction && (
                  <Button onClick={analyzeDocuments} disabled={isAnalyzing} className="w-full gap-2">
                    {isAnalyzing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Analisando documentos...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" />Analisar com IA</>
                    )}
                  </Button>
                )}

                {analysisError && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{analysisError}</span>
                  </div>
                )}

                {extraction && (
                  <div className="rounded-lg border bg-muted/30 divide-y text-sm">
                    <div className="px-4 py-3 font-semibold flex items-center gap-2">
                      {hasUsefulData ? (
                        <><CheckCircle2 className="h-4 w-4 text-green-500" />{found} {found === 1 ? "campo encontrado" : "campos encontrados"}</>
                      ) : (
                        <><AlertCircle className="h-4 w-4 text-muted-foreground" />Não encontramos dados suficientes</>
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
                    {extraction.produtos?.length ? (
                      <div className="px-4 py-2 flex gap-2">
                        <span className="text-muted-foreground w-32 flex-shrink-0">Produtos</span>
                        <span className="font-medium">{extraction.produtos.length} encontrado{extraction.produtos.length > 1 ? "s" : ""}</span>
                      </div>
                    ) : null}
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

                {extraction && (
                  <div className="flex flex-col gap-2">
                    <Button onClick={applyExtractionAndAdvance} className="w-full gap-2" disabled={!hasUsefulData}>
                      <ChevronRight className="h-4 w-4" />
                      {hasUsefulData ? "Aplicar dados e continuar →" : "Continuar sem dados"}
                    </Button>
                    {hasUsefulData && (
                      <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setStep(1)}>
                        Continuar sem aplicar
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {step === 0 && !extraction && (
            <div className="text-center">
              <Button variant="ghost" className="text-muted-foreground gap-1.5" onClick={() => setStep(1)}>
                Pular e preencher manualmente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 1 — Identidade do negócio
          ══════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Identidade do negócio</h2>
                  <p className="text-sm text-muted-foreground mt-1">Como seus clientes te conhecem?</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nomeFantasia">
                    Nome da empresa <span className="text-destructive">*</span>
                  </Label>
                  <Input id="nomeFantasia" placeholder="Ex: Estética da Ana" {...form.register("nomeFantasia")} />
                  {form.formState.errors.nomeFantasia && (
                    <p className="text-xs text-destructive">{form.formState.errors.nomeFantasia.message}</p>
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
                        <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>
                      ))}
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.formState.errors.vertical && (
                    <p className="text-xs text-destructive">{form.formState.errors.vertical.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Logo da empresa</Label>
                  {/* hidden file input */}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                      e.target.value = "";
                    }}
                  />

                  {form.watch("logoUrl") ? (
                    /* Preview + remove */
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <img
                        src={
                          form.watch("logoUrl")!.startsWith("/objects/")
                            ? `/api/storage${form.watch("logoUrl")}`
                            : form.watch("logoUrl")!
                        }
                        alt="Logo preview"
                        className="h-14 w-auto max-w-[180px] rounded object-contain"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">Logo carregada</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={logoUploading}
                          className="gap-1.5 text-xs"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Trocar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => form.setValue("logoUrl", "")}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Upload area */
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading}
                      className="w-full flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {logoUploading ? (
                        <>
                          <Loader2 className="h-8 w-8 text-primary animate-spin" />
                          <span className="text-sm text-muted-foreground">Enviando...</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                          <span className="text-sm font-medium">Clique para selecionar a logo</span>
                          <span className="text-xs text-muted-foreground">PNG, JPG, SVG ou WebP · recomendado 200×60 px</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 2 — Dados Cadastrais
          ══════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Dados Cadastrais</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Informações de contato e identificação da empresa. Todos opcionais.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ / CPF</Label>
                    <Input id="cnpj" placeholder="00.000.000/0001-00" {...form.register("cnpj")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="anoFundacao2">Ano de fundação</Label>
                    <Input id="anoFundacao2" placeholder="Ex: 2018" {...form.register("anoFundacao")} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nomeResponsavel">Nome do responsável</Label>
                  <Input id="nomeResponsavel" placeholder="Nome completo do proprietário ou gestor" {...form.register("nomeResponsavel")} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="telefoneCadastro">Telefone comercial</Label>
                    <Input id="telefoneCadastro" placeholder="(11) 99999-9999" {...form.register("telefoneCadastro")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emailCadastro">E-mail comercial</Label>
                    <Input id="emailCadastro" type="email" placeholder="contato@empresa.com" {...form.register("emailCadastro")} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="enderecoCadastro">Endereço / Cidade</Label>
                  <Input id="enderecoCadastro" placeholder="Rua, número — Bairro, Cidade — UF" {...form.register("enderecoCadastro")} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="siteCadastro">Site</Label>
                  <Input id="siteCadastro" placeholder="https://seusite.com.br" {...form.register("siteCadastro")} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 3 — Posicionamento / Missão
          ══════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Posicionamento e Missão</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    O propósito e identidade estratégica da empresa.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="missao">Missão</Label>
                  <Textarea
                    id="missao"
                    placeholder="Por que a empresa existe? O que ela entrega de valor para o mundo?"
                    rows={3}
                    {...form.register("missao")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visao">Visão</Label>
                  <Textarea
                    id="visao"
                    placeholder="Onde a empresa quer chegar? Como quer ser reconhecida em 5-10 anos?"
                    rows={2}
                    {...form.register("visao")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slogan">Slogan / Tagline</Label>
                  <Input id="slogan" placeholder='Ex: "Beleza que transforma"' {...form.register("slogan")} />
                </div>

                <div className="space-y-2">
                  <Label>Valores da empresa</Label>
                  <p className="text-xs text-muted-foreground">Ex: Transparência, Inovação, Cuidado com o cliente</p>
                  <TagListInput
                    placeholder="Ex: Transparência"
                    fields={valoresFields}
                    onAppend={() => appendValor({ value: "" })}
                    onRemove={removeValor}
                    register={form.register}
                    namePrefix="valores"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 4 — História e Marca
          ══════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">História e Marca</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    A origem e a personalidade da marca — o que a torna única.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="historia">História da empresa</Label>
                  <Textarea
                    id="historia"
                    placeholder="Como a empresa nasceu? Qual foi o problema que motivou sua criação? Conte a história de forma autêntica..."
                    rows={5}
                    {...form.register("historia")}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Personalidade da marca</Label>
                  <p className="text-xs text-muted-foreground">Selecione os atributos que melhor descrevem sua marca (pode marcar vários)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PERSONALIDADES.map((p) => {
                      const checked = (form.watch("personalidadeMarca") ?? []).includes(p);
                      return (
                        <label
                          key={p}
                          className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer text-sm transition-colors ${
                            checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => togglePersonalidade(p)} />
                          {p}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 5 — Produtos / Serviços
          ══════════════════════════════════════════════════════════════ */}
          {step === 5 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Produtos e Serviços</h2>
                  <p className="text-sm text-muted-foreground mt-1">O que você vende e o que te diferencia.</p>
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
                      <Input placeholder="Descrição (opcional)" {...form.register(`produtos.${i}.descricao`)} />
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">R$</span>
                        <Input
                          type="number"
                          placeholder="Preço (opcional)"
                          {...form.register(`produtos.${i}.preco`)}
                          className="w-36"
                        />
                      </div>
                    </div>
                  ))}
                  {produtoFields.length < 8 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => appendProduto({ nome: "", descricao: "", preco: undefined })}
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
                    placeholder="O que te diferencia da concorrência? Ex: atendimento personalizado, entrega em 24h, ingredientes naturais..."
                    rows={3}
                    {...form.register("diferenciais")}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 6 — Perfil do Cliente Ideal (ICP)
          ══════════════════════════════════════════════════════════════ */}
          {step === 6 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Segmentos de Audiência</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Defina os perfis de clientes que a IA usará para personalizar abordagens e campanhas. Quanto mais detalhado, melhor.
                  </p>
                </div>

                {/* Audience Segment Cards */}
                <div className="space-y-3">
                  {audienceSegmentFields.map((field, idx) => (
                    <div key={field.id} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Perfil {idx + 1}</span>
                        {audienceSegmentFields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAudienceSegment(idx)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label>Nome do segmento *</Label>
                        <Input
                          placeholder="Ex: Empreendedores PME, Jovens 20-30, Donas de casa com filhos…"
                          {...form.register(`audienceSegments.${idx}.nome`)}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Quem são? (perfil)</Label>
                        <Textarea
                          placeholder="Descreva: faixa etária, profissão, estilo de vida, comportamento de compra…"
                          rows={2}
                          {...form.register(`audienceSegments.${idx}.descricao`)}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Principais dores / problemas</Label>
                          <Textarea
                            placeholder="O que mais incomoda esse perfil? Que problema precisa resolver?"
                            rows={2}
                            {...form.register(`audienceSegments.${idx}.dores`)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>O que busca / motivações</Label>
                          <Textarea
                            placeholder="O que esse cliente quer conquistar? O que o motiva a comprar?"
                            rows={2}
                            {...form.register(`audienceSegments.${idx}.motivacoes`)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => appendAudienceSegment({ nome: "", descricao: "", dores: "", motivacoes: "" })}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar perfil de audiência
                </Button>

                {/* Demographic summary */}
                <div className="pt-2 border-t space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Dados Demográficos Gerais
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Faixa etária predominante</Label>
                      <Select
                        value={form.watch("faixaEtaria")}
                        onValueChange={(v) => form.setValue("faixaEtaria", v)}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="18-24">18–24 anos</SelectItem>
                          <SelectItem value="25-34">25–34 anos</SelectItem>
                          <SelectItem value="35-44">35–44 anos</SelectItem>
                          <SelectItem value="45-54">45–54 anos</SelectItem>
                          <SelectItem value="55+">55+ anos</SelectItem>
                          <SelectItem value="variada">Variada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Gênero predominante</Label>
                      <Select
                        value={form.watch("generoPredominante")}
                        onValueChange={(v) => form.setValue("generoPredominante", v)}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feminino">Feminino</SelectItem>
                          <SelectItem value="masculino">Masculino</SelectItem>
                          <SelectItem value="misto">Misto / Neutro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Renda mensal média</Label>
                      <Select
                        value={form.watch("rendaMensal")}
                        onValueChange={(v) => form.setValue("rendaMensal", v)}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ate2sm">Até 2 salários mínimos</SelectItem>
                          <SelectItem value="2a5sm">2 a 5 salários mínimos</SelectItem>
                          <SelectItem value="5a10sm">5 a 10 salários mínimos</SelectItem>
                          <SelectItem value="acima10sm">Acima de 10 salários mínimos</SelectItem>
                          <SelectItem value="variada">Variada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="localizacaoCliente">Localização principal</Label>
                      <Input
                        id="localizacaoCliente"
                        placeholder="Ex: São Paulo capital"
                        {...form.register("localizacaoCliente")}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 7 — Perfil Demográfico
          ══════════════════════════════════════════════════════════════ */}
          {step === 7 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Perfil Demográfico</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Onde e para quem você atua — área geográfica e tipo de cliente.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cidadesAtuacao">Cidades / Regiões de atuação</Label>
                  <Input
                    id="cidadesAtuacao"
                    placeholder="Ex: São Paulo, ABC Paulista, interior de SP"
                    {...form.register("cidadesAtuacao")}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo de cliente</Label>
                  <div className="flex gap-3">
                    {["B2C", "B2B", "Ambos"].map((t) => {
                      const checked = form.watch("tipoPessoa") === t;
                      return (
                        <label
                          key={t}
                          className={`flex-1 flex items-center justify-center gap-2 rounded-lg border p-3 cursor-pointer text-sm font-medium transition-colors ${
                            checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <input
                            type="radio"
                            className="hidden"
                            value={t}
                            checked={checked}
                            onChange={() => form.setValue("tipoPessoa", t)}
                          />
                          {t}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    B2C = pessoa física · B2B = empresa · Ambos = os dois
                  </p>
                </div>

                {(form.watch("tipoPessoa") === "B2B" || form.watch("tipoPessoa") === "Ambos") && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="decisorCompra">Decisor de compra (B2B)</Label>
                      <Input
                        id="decisorCompra"
                        placeholder="Ex: Diretor de Marketing, Gerente de RH, sócio-proprietário"
                        {...form.register("decisorCompra")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tamanho da empresa alvo (B2B)</Label>
                      <Select
                        value={form.watch("tamanhoEmpresaAlvo")}
                        onValueChange={(v) => form.setValue("tamanhoEmpresaAlvo", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="micro">Micro (até 9 funcionários)</SelectItem>
                          <SelectItem value="pequena">Pequena (10–49 funcionários)</SelectItem>
                          <SelectItem value="media">Média (50–249 funcionários)</SelectItem>
                          <SelectItem value="grande">Grande (250+)</SelectItem>
                          <SelectItem value="todas">Todos os tamanhos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 8 — Concorrentes + Análise SWOT
          ══════════════════════════════════════════════════════════════ */}
          {step === 8 && (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div>
                  <h2 className="text-xl font-bold">Concorrentes e Análise SWOT</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Quem são seus competidores e qual é o posicionamento estratégico da empresa.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Principais concorrentes</Label>
                  <TagListInput
                    placeholder="Nome do concorrente"
                    fields={concorrenteFields}
                    onAppend={() => appendConcorrente({ value: "" })}
                    onRemove={removeConcorrente}
                    register={form.register}
                    namePrefix="concorrentes"
                    maxItems={5}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-green-700 dark:text-green-400">💪 Forças</Label>
                    <TagListInput
                      placeholder="Ex: Atendimento rápido"
                      fields={forcasFields}
                      onAppend={() => appendForca({ value: "" })}
                      onRemove={removeForca}
                      register={form.register}
                      namePrefix="forcas"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-red-700 dark:text-red-400">⚠️ Fraquezas</Label>
                    <TagListInput
                      placeholder="Ex: Equipe pequena"
                      fields={fraquezasFields}
                      onAppend={() => appendFraqueza({ value: "" })}
                      onRemove={removeFraqueza}
                      register={form.register}
                      namePrefix="fraquezas"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-blue-700 dark:text-blue-400">🚀 Oportunidades</Label>
                    <TagListInput
                      placeholder="Ex: Mercado em crescimento"
                      fields={oportunidadesFields}
                      onAppend={() => appendOportunidade({ value: "" })}
                      onRemove={removeOportunidade}
                      register={form.register}
                      namePrefix="oportunidades"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-orange-700 dark:text-orange-400">🌩️ Ameaças</Label>
                    <TagListInput
                      placeholder="Ex: Concorrentes com preço menor"
                      fields={ameacasFields}
                      onAppend={() => appendAmeaca({ value: "" })}
                      onRemove={removeAmeaca}
                      register={form.register}
                      namePrefix="ameacas"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 9 — Jornada de Compra
          ══════════════════════════════════════════════════════════════ */}
          {step === 9 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Jornada de Compra</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Como o cliente descobre, avalia e decide comprar de você.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="etapasJornada">Etapas da jornada do cliente</Label>
                  <Textarea
                    id="etapasJornada"
                    placeholder="Ex: Conhece pelo Instagram → Salva o post → Manda DM → Recebe orçamento → Fecha em 2 dias"
                    rows={3}
                    {...form.register("etapasJornada")}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tempo médio de decisão de compra</Label>
                  <Select
                    value={form.watch("tempoDecisao")}
                    onValueChange={(v) => form.setValue("tempoDecisao", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="menos1dia">Menos de 1 dia (compra impulsiva)</SelectItem>
                      <SelectItem value="1a7dias">1 a 7 dias</SelectItem>
                      <SelectItem value="1a4semanas">1 a 4 semanas</SelectItem>
                      <SelectItem value="1a3meses">1 a 3 meses</SelectItem>
                      <SelectItem value="mais3meses">Mais de 3 meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Principais objeções de compra</Label>
                  <p className="text-xs text-muted-foreground">O que impede o cliente de fechar? Ex: Preço, desconfiança, comparação com concorrente</p>
                  <TagListInput
                    placeholder="Ex: Preço alto"
                    fields={objecoesFields}
                    onAppend={() => appendObjecao({ value: "" })}
                    onRemove={removeObjecao}
                    register={form.register}
                    namePrefix="objecoesComuns"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Motivadores de compra</Label>
                  <p className="text-xs text-muted-foreground">O que leva o cliente a comprar? Ex: Urgência, recomendação, promoção, resultado rápido</p>
                  <TagListInput
                    placeholder="Ex: Indicação de amigo"
                    fields={motivadoresFields}
                    onAppend={() => appendMotivador({ value: "" })}
                    onRemove={removeMotivador}
                    register={form.register}
                    namePrefix="motivadoresCompra"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 10 — Canais de Atendimento
          ══════════════════════════════════════════════════════════════ */}
          {step === 10 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Canais de Atendimento</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Por onde você atende ou vende? Selecione todos que se aplicam.
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
                          onCheckedChange={() => toggleCheckbox("canaisVenda", canal.id)}
                        />
                        <span className="font-medium">{canal.label}</span>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 11 — Processo de Vendas
          ══════════════════════════════════════════════════════════════ */}
          {step === 11 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Processo de Vendas</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Como funciona o seu processo comercial hoje.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Modelo comercial</Label>
                  <p className="text-xs text-muted-foreground">Como seus negócios são fechados? Define o padrão para novos deals.</p>
                  <Select
                    value={form.watch("tipoFechamentoDefault")}
                    onValueChange={(v) => form.setValue("tipoFechamentoDefault", v as "pedido" | "contrato" | "pedido_e_contrato")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pedido">Pedido — confirmação simples, sem assinatura</SelectItem>
                      <SelectItem value="contrato">Contrato — assinatura eletrônica obrigatória</SelectItem>
                      <SelectItem value="pedido_e_contrato">Pedido e Contrato — escolhido em cada negócio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ticketMedio">Ticket médio</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">R$</span>
                      <Input id="ticketMedio" placeholder="Ex: 350" {...form.register("ticketMedio")} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cicloVendas">Ciclo de vendas médio</Label>
                    <Input id="cicloVendas" placeholder="Ex: 3 dias, 2 semanas" {...form.register("cicloVendas")} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Método / abordagem de vendas</Label>
                  <Select
                    value={form.watch("metodoVendas")}
                    onValueChange={(v) => form.setValue("metodoVendas", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o método principal..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consultiva">Venda consultiva (foco na dor do cliente)</SelectItem>
                      <SelectItem value="transacional">Transacional (volume, agilidade)</SelectItem>
                      <SelectItem value="spin">SPIN Selling</SelectItem>
                      <SelectItem value="challenger">Challenger Sale</SelectItem>
                      <SelectItem value="inbound">Inbound (lead chega até nós)</SelectItem>
                      <SelectItem value="indicacao">Por indicação</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="metaMensalClientes">Meta mensal de novos clientes</Label>
                    <Input id="metaMensalClientes" type="number" placeholder="Ex: 20" {...form.register("metaMensalClientes")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tamanhoEquipe">Tamanho da equipe comercial</Label>
                    <Input id="tamanhoEquipe" type="number" placeholder="Ex: 3 vendedores" {...form.register("tamanhoEquipe")} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 12 — Processos e Tecnologia
          ══════════════════════════════════════════════════════════════ */}
          {step === 12 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Processos e Tecnologia</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ferramentas que você já usa e onde há oportunidade de automação.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Ferramentas em uso hoje</Label>
                  <div className="grid gap-2">
                    {FERRAMENTAS.map((f) => {
                      const checked = (form.watch("ferramentasEmUso") ?? []).includes(f.id);
                      return (
                        <label
                          key={f.id}
                          className={`flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer text-sm transition-colors ${
                            checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCheckbox("ferramentasEmUso", f.id)}
                          />
                          {f.label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="integracoesDesejadas">Integrações que você gostaria de ter</Label>
                  <Input
                    id="integracoesDesejadas"
                    placeholder="Ex: Integrar WhatsApp com CRM, conectar loja com sistema de pagamento..."
                    {...form.register("integracoesDesejadas")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="processosManuais">Maiores gargalos / processos ainda manuais</Label>
                  <Textarea
                    id="processosManuais"
                    placeholder="Ex: Responder orçamentos no WhatsApp manualmente, follow-up por planilha, agendamento por telefone..."
                    rows={3}
                    {...form.register("processosManuais")}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 13 — Métricas e Metas
          ══════════════════════════════════════════════════════════════ */}
          {step === 13 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Métricas e Metas</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Os números que guiam o crescimento do negócio.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="metaFaturamento">Meta de faturamento mensal</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">R$</span>
                      <Input id="metaFaturamento" placeholder="Ex: 50000" {...form.register("metaFaturamento")} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="metaNovosClientes">Meta de novos clientes / mês</Label>
                    <Input id="metaNovosClientes" type="number" placeholder="Ex: 30" {...form.register("metaNovosClientes")} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="taxaConversao">Taxa de conversão atual</Label>
                    <div className="flex items-center gap-2">
                      <Input id="taxaConversao" placeholder="Ex: 15" {...form.register("taxaConversao")} />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Quantos leads viram clientes</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npsAtual">NPS atual</Label>
                    <Input id="npsAtual" placeholder="Ex: 72 (ou 'não meço')" {...form.register("npsAtual")} />
                    <p className="text-xs text-muted-foreground">Satisfação dos clientes (0–100)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 14 — Conhecimento para IA / FAQ
          ══════════════════════════════════════════════════════════════ */}
          {step === 14 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Conhecimento para a IA</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure como a IA deve falar e o que ela deve saber responder.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Tom de voz preferido</Label>
                  <Select
                    value={form.watch("tomVoz")}
                    onValueChange={(v) => form.setValue("tomVoz", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Como a IA deve se comunicar?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="formal">Formal e profissional</SelectItem>
                      <SelectItem value="profissional">Profissional e direto</SelectItem>
                      <SelectItem value="amigavel">Amigável e próximo</SelectItem>
                      <SelectItem value="casual">Casual e descontraído</SelectItem>
                      <SelectItem value="jovem">Jovem e moderno (gírias leves)</SelectItem>
                      <SelectItem value="acolhedor">Acolhedor e empático</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="regraAtendimento">Regras de atendimento</Label>
                  <Textarea
                    id="regraAtendimento"
                    placeholder="Ex: Nunca ofereça desconto sem consultar o gestor. Sempre pergunte o nome do cliente. Não mencione concorrentes..."
                    rows={3}
                    {...form.register("regraAtendimento")}
                  />
                </div>

                <div className="space-y-3">
                  <Label>FAQ — Perguntas e respostas frequentes</Label>
                  <p className="text-xs text-muted-foreground">
                    Cadastre as dúvidas mais comuns dos clientes com suas respostas. A IA usará isso para responder automaticamente.
                  </p>
                  {faqFields.map((field, i) => (
                    <div key={field.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <Input
                            placeholder={`Pergunta ${i + 1}... Ex: Vocês entregam em domicílio?`}
                            {...form.register(`faqItems.${i}.pergunta`)}
                          />
                          <Textarea
                            placeholder="Resposta..."
                            rows={2}
                            {...form.register(`faqItems.${i}.resposta`)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeFaq(i)}
                          disabled={faqFields.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {faqFields.length < 10 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => appendFaq({ pergunta: "", resposta: "" })}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar pergunta
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 15 — Materiais e Documentos
          ══════════════════════════════════════════════════════════════ */}
          {step === 15 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Materiais e Documentos</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Links para catálogos, apresentações e políticas que a IA pode referenciar.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>Links de materiais</Label>
                  {materiaisFields.map((field, i) => (
                    <div key={field.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <Input
                            placeholder="Título do material (Ex: Catálogo de produtos)"
                            {...form.register(`linksMateriais.${i}.titulo`)}
                          />
                          <Input
                            placeholder="URL (https://...)"
                            {...form.register(`linksMateriais.${i}.url`)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeMaterial(i)}
                          disabled={materiaisFields.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {materiaisFields.length < 10 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => appendMaterial({ titulo: "", url: "" })}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar material
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="politicasInfo">Políticas e informações importantes</Label>
                  <Textarea
                    id="politicasInfo"
                    placeholder="Ex: Política de troca e devolução, condições de pagamento, garantia dos serviços, horário de funcionamento..."
                    rows={4}
                    {...form.register("politicasInfo")}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 16 — Automação com IA
          ══════════════════════════════════════════════════════════════ */}
          {step === 16 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Automação com IA</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Quais agentes de IA você quer ativar e como eles devem se comportar.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Agentes que você quer ativar agora</Label>
                  <p className="text-xs text-muted-foreground">Pode ativar ou desativar a qualquer momento no painel de agentes.</p>
                  <div className="space-y-2">
                    {AGENTES.map((a) => {
                      const checked = (form.watch("agentesAtivos") ?? []).includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                            checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCheckbox("agentesAtivos", a.id)}
                          />
                          <span className="text-sm">{a.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="horarioAtendimento">Horário de atendimento</Label>
                  <Input
                    id="horarioAtendimento"
                    placeholder="Ex: Seg–Sex 8h–18h, Sáb 9h–13h"
                    {...form.register("horarioAtendimento")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="saudacaoInicial">Mensagem de saudação inicial</Label>
                  <Textarea
                    id="saudacaoInicial"
                    placeholder="Ex: Olá! Seja bem-vindo à [empresa]! Sou a assistente virtual e estou aqui para ajudar. Como posso te ajudar hoje?"
                    rows={3}
                    {...form.register("saudacaoInicial")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mensagemAusencia">Mensagem de ausência (fora do horário)</Label>
                  <Textarea
                    id="mensagemAusencia"
                    placeholder="Ex: Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve. Deixe sua mensagem!"
                    rows={3}
                    {...form.register("mensagemAusencia")}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ETAPA 17 — Conclusão
          ══════════════════════════════════════════════════════════════ */}
          {step === CONCLUSION_STEP && (
            <Card>
              <CardContent className="pt-10 pb-10 flex flex-col items-center text-center gap-6">
                {submitting && (
                  <>
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <div>
                      <p className="text-lg font-semibold">Salvando suas configurações...</p>
                      <p className="text-sm text-muted-foreground mt-1">Isso levará apenas um momento.</p>
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
                              {configResult.kbArtigosGerados === 1 ? "artigo adicionado" : "artigos adicionados"}{" "}
                              à base de conhecimento
                            </span>
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
                      <Button variant="outline" onClick={() => setStep(TOTAL_DATA_STEPS)}>
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

          {/* ── Navigation (data steps 1–16) ── */}
          {isDataStep && (
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={handleBack} className="gap-1.5">
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
