import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { OrcamentoRevisoesCard } from "@/components/OrcamentoRevisoesCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  Plus,
  X,
  Loader2,
  Download,
  Eye,
  Sparkles,
  Palette,
  Image,
  Trash2,
  ChevronDown,
  ChevronUp,
  Package,
  Upload,
  Globe,
  ImagePlus,
  Receipt,
  ExternalLink,
  Clock,
  MessageCircle,
  CheckSquare,
  Link2,
  PencilLine,
  Save,
  XCircle,
  GripVertical,
  Settings2,
  Paperclip,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useListLeadProposals,
  useListLeadProducts,
  useCreateLeadProduct,
  useDeleteLeadProduct,
  useRequestUploadUrl,
  useListPropostas,
  useUpdatePropostaStatus,
  useGetBusinessProfileByTenant,
  getGetBusinessProfileByTenantQueryKey,
  getListPropostasQueryKey,
} from "@workspace/api-client-react";
import type { Proposta } from "@workspace/api-client-react";

// ── Inline editing script injected into proposal preview iframe ────────────────
const PROPOSTA_EDIT_SCRIPT = `<script id="__proposta_editor__">
(function(){
  var TAGS=['h1','h2','h3','h4','h5','h6','p','span','a','li','td','th','strong','em','small','blockquote'];
  var css=document.createElement('style');
  css.textContent=
    '[data-pe]:hover{outline:2px dashed #818cf8!important;outline-offset:2px;cursor:text!important;}'+
    '[data-pe]:focus{outline:2px solid #6366f1!important;outline-offset:2px;background:rgba(99,102,241,0.06)!important;border-radius:2px;}'+
    '#__pe_bar__{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;background:rgba(15,15,25,.94);padding:5px 10px;border-radius:10px;display:none;align-items:center;gap:5px;box-shadow:0 4px 20px rgba(0,0,0,.5);backdrop-filter:blur(12px);}'+
    '.__pe_btn{background:none;border:none;color:#e2e8f0;cursor:pointer;padding:3px 8px;border-radius:5px;font-size:13px;line-height:1.4;}'+
    '.__pe_btn:hover{background:rgba(255,255,255,.18);}'+
    '.__pe_sep{width:1px;height:18px;background:rgba(255,255,255,.2);margin:0 3px;}'+
    '.__pe_clr{width:26px;height:22px;padding:0;border:1px solid rgba(255,255,255,.2);border-radius:4px;cursor:pointer;background:transparent;}';
  document.head.appendChild(css);

  function send(){
    window.parent.postMessage({type:'proposta-edit',html:'<!DOCTYPE html>'+document.documentElement.outerHTML},'*');
  }

  var bar=null;
  function getBar(){
    if(bar)return bar;
    bar=document.createElement('div');bar.id='__pe_bar__';
    function btn(lbl,cmd,val){
      var b=document.createElement('button');b.className='__pe_btn';b.innerHTML=lbl;
      b.addEventListener('mousedown',function(e){e.preventDefault();document.execCommand(cmd,false,val||null);send();});
      return b;
    }
    function sep(){var s=document.createElement('div');s.className='__pe_sep';return s;}
    bar.appendChild(btn('<b>N</b>','bold'));
    bar.appendChild(btn('<i>I</i>','italic'));
    bar.appendChild(btn('<u>S</u>','underline'));
    bar.appendChild(sep());
    var szLbl=document.createElement('span');szLbl.textContent='Tam:';szLbl.style.cssText='color:#94a3b8;font-size:11px;white-space:nowrap;';
    bar.appendChild(szLbl);
    var sz=document.createElement('select');sz.style.cssText='background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#e2e8f0;padding:2px 5px;border-radius:5px;font-size:12px;cursor:pointer;';
    [['12px','12'],['14px','14'],['16px','16'],['20px','20'],['24px','24'],['32px','32'],['48px','48']].forEach(function(o){
      var opt=document.createElement('option');opt.value=o[0];opt.textContent=o[1]+'px';
      if(o[0]==='16px')opt.selected=true;
      sz.appendChild(opt);
    });
    sz.addEventListener('change',function(){
      document.execCommand('fontSize',false,'7');
      document.querySelectorAll('font[size="7"]').forEach(function(f){f.removeAttribute('size');f.style.fontSize=sz.value;});
      send();
    });
    bar.appendChild(sz);
    bar.appendChild(sep());
    var clrLbl=document.createElement('span');clrLbl.textContent='Cor:';clrLbl.style.cssText='color:#94a3b8;font-size:11px;';
    bar.appendChild(clrLbl);
    var clr=document.createElement('input');clr.type='color';clr.value='#111827';clr.className='__pe_clr';
    clr.addEventListener('change',function(){document.execCommand('foreColor',false,clr.value);send();});
    bar.appendChild(clr);
    document.body.appendChild(bar);
    return bar;
  }

  function setup(el){
    if(el.__pe)return;el.__pe=true;
    if(!el.textContent.trim())return;
    var blockTags=/^(DIV|SECTION|ARTICLE|NAV|HEADER|FOOTER|MAIN|ASIDE|UL|OL|TABLE|TBODY|TR|FORM)$/;
    if((el.tagName==='DIV'||el.tagName==='SPAN')&&Array.from(el.children).some(function(c){return blockTags.test(c.tagName);}))return;
    el.setAttribute('data-pe','1');
    el.addEventListener('click',function(e){e.stopPropagation();el.contentEditable='true';el.focus();getBar().style.display='flex';});
    el.addEventListener('blur',function(){
      setTimeout(function(){
        var a=document.activeElement;
        if(a&&a.closest&&a.closest('#__pe_bar__'))return;
        el.contentEditable='false';getBar().style.display='none';send();
      },150);
    });
    el.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();el.blur();}
      if(e.key==='Escape'){el.contentEditable='false';getBar().style.display='none';}
    });
  }

  TAGS.forEach(function(tag){document.querySelectorAll(tag).forEach(setup);});
  new MutationObserver(function(){TAGS.forEach(function(tag){document.querySelectorAll(tag).forEach(setup);});}).observe(document.body,{childList:true,subtree:true});
})();
<\/script>`;

interface LeadPropostaTabProps {
  leadId: string;
  tenantId: string;
  lead: any;
}

type ProposalBudgetRevision = {
  id: string;
  basePropostaId?: string | null;
  propostaRevisaoId?: string | null;
  revisaoNumero?: string | null;
  numeroOrcamento: string;
  dataOrcamento: string;
  propostaRevisao?: any | null;
};

type ProposalPresentationMode = "completo" | "resumo_etapa" | "preco_medio";
type ProposalPresentationFormat = "site_interativo" | "documento" | "hibrido";
type ProposalHouseStyle = "moderna" | "contemporanea" | "minimalista" | "classica" | "industrial";
type ProposalHouseStandard = "medio" | "alto_padrao" | "luxo";
type ProposalHouseType = "terrea" | "sobrado";

const PROPOSAL_PRESENTATION_OPTIONS: Array<{
  value: ProposalPresentationMode;
  label: string;
  description: string;
}> = [
  {
    value: "resumo_etapa",
    label: "Somente valor da etapa",
    description: "Oculta itens, quantidades e valores unitários; mostra apenas o total da etapa.",
  },
  {
    value: "preco_medio",
    label: "Valores individuais",
    description: "Mostra os itens e o valor por item, sem quantidade nem subtotal.",
  },
  {
    value: "completo",
    label: "Completo",
    description: "Mostra item, quantidade, valor unitário e subtotal.",
  },
];

function normalizeProposalPresentationMode(value: unknown): ProposalPresentationMode {
  return value === "resumo_etapa" || value === "preco_medio" || value === "completo"
    ? value
    : "completo";
}

const BASE = typeof import.meta.env !== "undefined" && import.meta.env.BASE_URL
  ? import.meta.env.BASE_URL.replace(/\/$/, "")
  : "";

function api(path: string) {
  return `${BASE}${path}`;
}

export default function LeadPropostaTab({ leadId, tenantId, lead }: LeadPropostaTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("vendorai_token") ?? "";

  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [showProducts, setShowProducts] = useState(false);
  const [selectedOrcamentoId, setSelectedOrcamentoId] = useState<string>("__none__");
  const [proposalPresentationFormat, setProposalPresentationFormat] =
    useState<ProposalPresentationFormat>("site_interativo");
  const [proposalHouseStyle, setProposalHouseStyle] = useState<ProposalHouseStyle>("contemporanea");
  const [proposalHouseStandard, setProposalHouseStandard] = useState<ProposalHouseStandard>("alto_padrao");
  const [proposalHouseType, setProposalHouseType] = useState<ProposalHouseType>("sobrado");
  const [proposalVisualElements, setProposalVisualElements] = useState<string[]>(["piscina", "paisagismo", "pedra natural", "madeira", "esquadrias amplas"]);
  const [proposalPresentationDefaultMode, setProposalPresentationDefaultMode] =
    useState<ProposalPresentationMode>("completo");
  const [proposalPresentationStageModes, setProposalPresentationStageModes] =
    useState<Record<string, ProposalPresentationMode>>({});
  const [proposalShowTechnicalDetails, setProposalShowTechnicalDetails] = useState(true);
  const [proposalTechnicalDetailStages, setProposalTechnicalDetailStages] =
    useState<Record<string, boolean>>({});
  const [proposalShowGrandTotal, setProposalShowGrandTotal] = useState(true);
  const [proposalBuiltArea, setProposalBuiltArea] = useState("");
  const [proposalExcludedText, setProposalExcludedText] = useState("");

  // Refinement dialog
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineNotes, setRefineNotes] = useState("");
  const [refineFromVersion, setRefineFromVersion] = useState<number | null>(null);

  // Lead editable fields
  const [mercadoSegmento, setMercadoSegmento] = useState(lead?.mercadoSegmento ?? "");
  const [logoUrl, setLogoUrl] = useState(lead?.logoUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(lead?.websiteUrl ?? "");
  const [corDestaque, setCorDestaque] = useState(lead?.corDestaque ?? "#A78BFA");
  const [corSecundaria, setCorSecundaria] = useState(lead?.corSecundaria ?? "");
  const [savingLead, setSavingLead] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const requestUploadUrl = useRequestUploadUrl();

  // Business profile — para exibir status do modelo de proposta
  const profileQuery = useGetBusinessProfileByTenant(tenantId, {
    query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId, retry: false },
  });
  type ProposalLineTemplate = { id: string; name: string; productLine: string; url: string; isDefault?: boolean };
  const profileDiscovery = (((profileQuery.data as any)?.discoveryData ?? {}) as Record<string, unknown>);
  const proposalLineTemplates: ProposalLineTemplate[] = Array.isArray(profileDiscovery.proposalTemplates)
    ? (profileDiscovery.proposalTemplates as ProposalLineTemplate[]).filter((item) => item && typeof item.id === "string" && typeof item.url === "string")
    : [];
  const legacyProposalTemplate = !!(profileQuery.data as any)?.proposalTemplateUrl;
  const hasProposalTemplate = legacyProposalTemplate || proposalLineTemplates.length > 0;
  const proposalTemplateName = (profileQuery.data as any)?.proposalTemplateName as string | null;
  const [selectedProposalTemplateId, setSelectedProposalTemplateId] = useState<string>("__auto__");
  type ProposalBuilderTemplate = {
    id: string;
    name: string;
    vertical?: string;
    isDefault?: boolean;
    modules?: Array<{ key: string; enabled?: boolean; order?: number; required?: boolean }>;
    visualStyle?: {
      preset?: "premium_arquitetonico" | "corporativo" | "catalogo_comercial" | "minimalista" | "tecnico";
      heroVariant?: "fotografico" | "minimalista" | "institucional" | "produto";
      stageVariant?: "cards" | "timeline" | "accordion" | "lista_tecnica";
      investmentVariant?: "valor_global" | "por_etapa" | "por_item";
      density?: "arejado" | "equilibrado" | "compacto";
      imageEmphasis?: "alta" | "media" | "baixa";
    };
    aiRules?: {
      tone?: string;
      technicalLevel?: string;
      imageRules?: string[];
      contentRules?: string[];
      avoid?: string[];
    };
  };
  const proposalBuilderTemplates: ProposalBuilderTemplate[] = Array.isArray(profileDiscovery.proposalBuilderTemplates)
    ? (profileDiscovery.proposalBuilderTemplates as ProposalBuilderTemplate[]).filter(
        (item) => item && typeof item.id === "string" && typeof item.name === "string",
      )
    : [];
  const activeProposalBuilderTemplateId =
    typeof profileDiscovery.activeProposalBuilderTemplateId === "string"
      ? profileDiscovery.activeProposalBuilderTemplateId
      : null;
  const [selectedProposalBuilderTemplateId, setSelectedProposalBuilderTemplateId] = useState<string>("__auto__");
  const [generatingProposalBuilderTemplate, setGeneratingProposalBuilderTemplate] = useState(false);
  const [proposalBuilderEditorOpen, setProposalBuilderEditorOpen] = useState(false);
  const [proposalBuilderEditorSaving, setProposalBuilderEditorSaving] = useState(false);
  const [proposalBuilderPreviewDevice, setProposalBuilderPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [proposalBuilderSelectedModuleKey, setProposalBuilderSelectedModuleKey] = useState<string | null>(null);
  const [proposalBuilderEditorName, setProposalBuilderEditorName] = useState("");
  const [proposalBuilderEditorPreset, setProposalBuilderEditorPreset] = useState<"premium_arquitetonico" | "corporativo" | "catalogo_comercial" | "minimalista" | "tecnico">("premium_arquitetonico");
  const [proposalBuilderHeroVariant, setProposalBuilderHeroVariant] = useState<"fotografico" | "minimalista" | "institucional" | "produto">("fotografico");
  const [proposalBuilderStageVariant, setProposalBuilderStageVariant] = useState<"cards" | "timeline" | "accordion" | "lista_tecnica">("cards");
  const [proposalBuilderInvestmentVariant, setProposalBuilderInvestmentVariant] = useState<"valor_global" | "por_etapa" | "por_item">("por_etapa");
  const [proposalBuilderDensity, setProposalBuilderDensity] = useState<"arejado" | "equilibrado" | "compacto">("arejado");
  const [proposalBuilderImageEmphasis, setProposalBuilderImageEmphasis] = useState<"alta" | "media" | "baixa">("alta");
  const [proposalBuilderTone, setProposalBuilderTone] = useState("");
  const [proposalBuilderTechnicalLevel, setProposalBuilderTechnicalLevel] = useState("");
  const [proposalBuilderImageRules, setProposalBuilderImageRules] = useState("");
  const [proposalBuilderContentRules, setProposalBuilderContentRules] = useState("");
  const [proposalBuilderAvoidRules, setProposalBuilderAvoidRules] = useState("");
  const [proposalBuilderEditorModules, setProposalBuilderEditorModules] = useState<
    Array<{ key: string; enabled?: boolean; order?: number; required?: boolean }>
  >([]);
  const [proposalBuilderDraggedIndex, setProposalBuilderDraggedIndex] = useState<number | null>(null);

  // Renderizações 3D pertencem ao fluxo Arch e só devem aparecer em segmentos
  // em que esse material faz sentido. Uma flag explícita em discoveryData pode
  // sobrescrever a inferência conservadora pelo segmento do tenant.
  const explicit3dCapability = profileDiscovery.proposal3dRendersEnabled;
  const tenantSegmentNormalized = String((profileQuery.data as any)?.vertical ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const supports3DRenders = typeof explicit3dCapability === "boolean"
    ? explicit3dCapability
    : /(construcao|reforma|arquitetura|interiores|esquadrias|marcenaria)/.test(tenantSegmentNormalized);

  // Imagens da proposta
  const [proposalImages, setProposalImages] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [generatingStageImages, setGeneratingStageImages] = useState(false);
  const [generatingCoverImage, setGeneratingCoverImage] = useState(false);
  const [selectedStageImageIds, setSelectedStageImageIds] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  type ProposalAttachment = { nome: string; url: string; mimeType?: string; tamanho?: number };
  const [proposalAttachments, setProposalAttachments] = useState<ProposalAttachment[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Seletor de imagens — aba ativa
  const [imageSourceTab, setImageSourceTab] = useState<"upload" | "renders">("upload");
  // Renders 3D disponíveis para seleção
  const [renders, setRenders] = useState<{ id: string; imageUrl: string; cenaNome?: string | null; createdAt: string }[]>([]);
  const [rendersLoading, setRendersLoading] = useState(false);
  const [rendersLoaded, setRendersLoaded] = useState(false);

  // Inline editing
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [editableHtml, setEditableHtml] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editDirty, setEditDirty] = useState(false);

  // Product form
  const [newProductNome, setNewProductNome] = useState("");
  const [newProductImagem, setNewProductImagem] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [changingLabel, setChangingLabel] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const updatePropostaStatus = useUpdatePropostaStatus({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  async function handleAcceptProposal(propostaId: string, via: "manual" | "whatsapp") {
    setAcceptingId(propostaId);
    try {
      const res = await fetch(api(`/api/propostas/${propostaId}/accept-manual`), {
        method: "POST",
        headers: { ...headers },
        body: JSON.stringify({ via }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast({ title: "Proposta já aceita anteriormente" });
      } else if (!res.ok) {
        throw new Error(body.error ?? "Erro ao aceitar proposta");
      } else {
        toast({ title: via === "whatsapp" ? "Proposta marcada como aceita via WhatsApp!" : "Proposta marcada como aceita manualmente!" });
        queryClient.invalidateQueries({ queryKey: ["listLeadProposals", leadId] });
        queryClient.invalidateQueries({ queryKey: ["listPropostas", tenantId] });
      }
    } catch (e: any) {
      toast({ title: "Erro ao aceitar proposta", description: e?.message, variant: "destructive" });
    } finally {
      setAcceptingId(null);
    }
  }

  async function copyPublicLink(proposalVersionId: string) {
    const url = `${window.location.origin}/p/${proposalVersionId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link do Portal do Cliente copiado!", description: url });
    } catch {
      toast({ title: "Link do Portal do Cliente", description: url });
    }
  }

  const ORCAMENTO_LABELS = [
    { value: "em_analise", label: "Em Análise", color: "bg-blue-50 text-blue-700 border-blue-200",   targetStatus: "enviada" },
    { value: "aprovado",   label: "Aprovado",   color: "bg-green-50 text-green-700 border-green-200", targetStatus: "aceita" },
    { value: "descartado", label: "Descartado", color: "bg-red-50 text-red-600 border-red-200",       targetStatus: "rejeitada" },
    { value: "finalizado", label: "Finalizado", color: "bg-gray-100 text-gray-600 border-gray-200",   targetStatus: "expirada" },
  ] as const;
  type OrcLabel = (typeof ORCAMENTO_LABELS)[number]["value"];

  function getOrcLabel(status: string): OrcLabel {
    if (status === "aceita")    return "aprovado";
    if (status === "rejeitada") return "descartado";
    if (status === "expirada")  return "finalizado";
    return "em_analise";
  }

  function isTerminalStatus(status: string) {
    return status === "aceita" || status === "rejeitada" || status === "expirada";
  }

  async function handleChangeLabel(orcId: string, currentStatus: string, newLabel: string) {
    const cfg = ORCAMENTO_LABELS.find(l => l.value === newLabel);
    if (!cfg || getOrcLabel(currentStatus) === newLabel) return;
    setChangingLabel(orcId);
    try {
      await updatePropostaStatus.mutateAsync({ id: orcId, data: { status: cfg.targetStatus } });
      queryClient.invalidateQueries({ queryKey: ["listPropostas", tenantId] });
      toast({ title: `Orçamento marcado como "${cfg.label}"` });
    } catch (e: any) {
      toast({ title: "Não foi possível alterar etiqueta", description: e?.error || e?.message, variant: "destructive" });
    } finally {
      setChangingLabel(null);
    }
  }

  async function downloadOrcamentoPdf(orcId: string, titulo: string) {
    try {
      const res = await fetch(`/api/propostas/${orcId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Falha ao gerar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Orcamento_${orcId.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erro ao gerar PDF", variant: "destructive" });
    }
  }

  // React Query hooks
  const {
    data: proposals = [],
    isLoading: loadingProposals,
  } = useListLeadProposals(leadId, { request: { headers: { Authorization: `Bearer ${token}` } } });

  const {
    data: orcamentos = [],
    isLoading: loadingOrcamentos,
  } = useListPropostas(tenantId, { leadId }, { request: { headers: { Authorization: `Bearer ${token}` } } });

  const {
    data: budgetRevisions = [],
    isLoading: loadingBudgetRevisions,
  } = useQuery<ProposalBudgetRevision[]>({
    queryKey: ["orcamento-revisoes", leadId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/leads/${leadId}/orcamento-revisoes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(body?.error ?? "Não foi possível carregar as revisões do orçamento.");
      }
      return Array.isArray(body) ? body : [];
    },
    enabled: !!leadId && !!tenantId && !!token,
  });

  const proposalBudgetOptions = (() => {
    const revisionByProposalId = new Map(
      budgetRevisions
        .filter((revision) => revision.propostaRevisaoId)
        .map((revision) => [revision.propostaRevisaoId as string, revision] as const),
    );
    const merged = new Map<string, any>();

    (orcamentos as any[]).forEach((budget) => {
      const revision = revisionByProposalId.get(String(budget.id));
      merged.set(String(budget.id), revision ? { ...budget, __revision: revision } : budget);
    });

    budgetRevisions.forEach((revision) => {
      const revisionBudget = revision.propostaRevisao;
      if (!revision.propostaRevisaoId || !revisionBudget) return;
      const existing = merged.get(revision.propostaRevisaoId);
      merged.set(revision.propostaRevisaoId, {
        ...(existing ?? revisionBudget),
        __revision: revision,
      });
    });

    return Array.from(merged.values());
  })();

  const {
    data: products = [],
    isLoading: loadingProducts,
  } = useListLeadProducts(leadId, { request: { headers: { Authorization: `Bearer ${token}` } } });

  const productProposalImages = Array.from(new Set(
    (products as any[])
      .map((product) => typeof product?.imagemUrl === "string" ? product.imagemUrl.trim() : "")
      .filter((url): url is string => Boolean(url)),
  ));
  const effectiveProposalImages = Array.from(new Set([
    ...proposalImages,
    ...productProposalImages,
  ]));
  const proposalHasMinimumImages = effectiveProposalImages.length >= 2; // recomendado, não bloqueante
  const proposalPrimaryPageCount = selectedOrcamentoId !== "__none__" ? 5 : 4;

  const createProductMutation = useCreateLeadProduct({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });
  const deleteProductMutation = useDeleteLeadProduct({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  const selectedOrcamento = proposalBudgetOptions.find((orc) => orc.id === selectedOrcamentoId) ?? null;
  const selectedStageImages: Record<string, string> =
    selectedOrcamento?.apresentacao?.imagensEtapas && typeof selectedOrcamento.apresentacao.imagensEtapas === "object"
      ? selectedOrcamento.apresentacao.imagensEtapas
      : {};
  const selectedOrcamentoStages = (() => {
    const items = Array.isArray(selectedOrcamento?.itens) ? selectedOrcamento.itens : [];
    const hasStages = items.some((item: any) => item?.etapaId || item?.etapaNome || item?.etapaOrdem);
    if (!hasStages) return [] as Array<{ id: string; ordem: number; nome: string; total: number }>;

    const groups = new Map<string, { id: string; ordem: number; nome: string; total: number }>();
    items.forEach((item: any, index: number) => {
      const rawOrder = Number(item?.etapaOrdem);
      const ordem = Number.isFinite(rawOrder) && rawOrder > 0 ? rawOrder : index + 1;
      const nome = String(item?.etapaNome || `Etapa ${ordem}`);
      const id = String(item?.etapaId || `__stage_${ordem}_${nome}`);
      const current = groups.get(id) ?? { id, ordem, nome, total: 0 };
      current.total += Number(item?.quantidade || 0) * Number(item?.valorUnitario || 0);
      groups.set(id, current);
    });

    return Array.from(groups.values()).sort((a, b) => a.ordem - b.ordem);
  })();

  function toggleStageImageSelection(stageId: string) {
    setSelectedStageImageIds((current) => {
      if (current.includes(stageId)) return current.filter((id) => id !== stageId);
      if (current.length >= 3) {
        toast({
          title: "Máximo de 3 imagens por ação",
          description: "Para proteger o consumo de IA, gere no máximo 3 etapas por vez.",
          variant: "destructive",
        });
        return current;
      }
      return [...current, stageId];
    });
  }

  async function generateRepresentativeStageImages(regenerate = false) {
    if (!selectedOrcamento?.id || selectedOrcamentoStages.length === 0) {
      toast({ title: "Selecione um orçamento com etapas.", variant: "destructive" });
      return;
    }

    if (selectedStageImageIds.length === 0) {
      toast({
        title: "Selecione as etapas",
        description: "Escolha de 1 a 3 etapas para gerar imagens. A geração automática foi desativada.",
        variant: "destructive",
      });
      return;
    }

    if (selectedStageImageIds.length > 3) {
      toast({
        title: "Máximo de 3 imagens por ação",
        description: "Reduza a seleção antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    const selectedNames = selectedOrcamentoStages
      .filter((stage) => selectedStageImageIds.includes(stage.id))
      .map((stage) => stage.nome);
    const existingSelected = selectedStageImageIds.filter((id) => Boolean(selectedStageImages[id]));

    const confirmationText = regenerate
      ? `Regenerar ${selectedStageImageIds.length} imagem(ns)? Isso fará uma nova chamada paga de IA para: ${selectedNames.join(", ")}.`
      : `Gerar ${selectedStageImageIds.length} imagem(ns) com IA para: ${selectedNames.join(", ")}? Somente estas etapas serão processadas.`;

    if (regenerate && existingSelected.length === 0) {
      toast({
        title: "Nenhuma imagem existente selecionada",
        description: "Use Gerar fotos para etapas ainda sem imagem.",
        variant: "destructive",
      });
      return;
    }

    if (!window.confirm(confirmationText)) return;

    const userActionId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `stage-image-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setGeneratingStageImages(true);
    try {
      const response = await fetch(api(`/api/leads/${leadId}/proposals/stage-images`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          propostaId: selectedOrcamento.id,
          stageIds: selectedStageImageIds,
          userActionId,
          regenerate,
          confirmRegenerate: regenerate,
          estiloCasa: proposalHouseStyle,
          padraoCasa: proposalHouseStandard,
          tipoCasa: proposalHouseType,
          elementosVisuais: proposalVisualElements,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível gerar as imagens das etapas.");
      }

      await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId }) });
      const generatedCount = Number(body.generated ?? 0);
      const reusedCount = Number(body.reused ?? 0);
      const errorCount = Array.isArray(body.errors) ? body.errors.length : 0;
      setSelectedStageImageIds([]);
      toast({
        title: generatedCount > 0
          ? `${generatedCount} imagem(ns) de etapa gerada(s)`
          : "Imagens das etapas já disponíveis",
        description: [
          reusedCount > 0 ? `${reusedCount} reutilizada(s)` : "",
          errorCount > 0 ? `${errorCount} etapa(s) com falha` : "",
        ].filter(Boolean).join(" · ") || "As imagens ficam vinculadas ao orçamento e entram automaticamente na proposta.",
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar imagens das etapas",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setGeneratingStageImages(false);
    }
  }

  async function generatePremiumCoverImage() {
    if (!selectedOrcamento?.id) {
      toast({ title: "Selecione um orçamento.", variant: "destructive" });
      return;
    }
    if (!window.confirm("Gerar uma nova capa premium com IA usando o estilo selecionado? Esta ação consome 1 geração de imagem.")) return;

    const userActionId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `cover-image-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setGeneratingCoverImage(true);
    try {
      const response = await fetch(api(`/api/leads/${leadId}/proposals/cover-image`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          propostaId: selectedOrcamento.id,
          userActionId,
          estiloCasa: proposalHouseStyle,
          padraoCasa: proposalHouseStandard,
          tipoCasa: proposalHouseType,
          elementosVisuais: proposalVisualElements,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível gerar a capa premium.");

      await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId }) });
      toast({
        title: "Capa premium gerada",
        description: "A imagem ficou vinculada ao orçamento e será usada como capa da próxima proposta.",
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar capa",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setGeneratingCoverImage(false);
    }
  }

  function handleProposalBudgetChange(value: string) {
    setSelectedOrcamentoId(value);
    setProposalPresentationStageModes({});
    setProposalTechnicalDetailStages({});
    setSelectedStageImageIds([]);

    if (value === "__none__") {
      setProposalPresentationFormat("site_interativo");
      setProposalHouseStyle("contemporanea");
      setProposalHouseStandard("alto_padrao");
      setProposalHouseType("sobrado");
      setProposalVisualElements(["piscina", "paisagismo", "pedra natural", "madeira", "esquadrias amplas"]);
      setProposalPresentationDefaultMode("completo");
      setProposalShowTechnicalDetails(true);
      setProposalShowGrandTotal(true);
      setProposalExcludedText("");
      return;
    }

    const budget = proposalBudgetOptions.find((orc) => orc.id === value);
    const presentation = budget?.apresentacao;
    setProposalPresentationFormat(
      presentation?.formato === "documento" || presentation?.formato === "hibrido"
        ? presentation.formato
        : "site_interativo",
    );
    setProposalHouseStyle(
      presentation?.estiloCasa === "moderna"
      || presentation?.estiloCasa === "minimalista"
      || presentation?.estiloCasa === "classica"
      || presentation?.estiloCasa === "industrial"
        ? presentation.estiloCasa
        : "contemporanea",
    );
    setProposalHouseStandard(
      presentation?.padraoCasa === "medio" || presentation?.padraoCasa === "luxo"
        ? presentation.padraoCasa
        : "alto_padrao",
    );
    setProposalHouseType(presentation?.tipoCasa === "terrea" ? "terrea" : "sobrado");
    setProposalVisualElements(
      Array.isArray(presentation?.elementosVisuais)
        ? presentation.elementosVisuais.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
        : ["piscina", "paisagismo", "pedra natural", "madeira", "esquadrias amplas"],
    );
    setProposalPresentationDefaultMode(normalizeProposalPresentationMode(presentation?.modoPadrao));
    setProposalPresentationStageModes(
      presentation?.etapas && typeof presentation.etapas === "object"
        ? Object.fromEntries(
            Object.entries(presentation.etapas)
              .filter(([, mode]) => mode === "completo" || mode === "resumo_etapa" || mode === "preco_medio")
              .map(([stageId, mode]) => [stageId, mode as ProposalPresentationMode]),
          )
        : {},
    );
    setProposalShowTechnicalDetails(
      typeof presentation?.mostrarDetalhamentoTecnico === "boolean"
        ? presentation.mostrarDetalhamentoTecnico
        : true,
    );
    setProposalTechnicalDetailStages(
      presentation?.detalhamentoTecnicoEtapas && typeof presentation.detalhamentoTecnicoEtapas === "object"
        ? Object.fromEntries(
            Object.entries(presentation.detalhamentoTecnicoEtapas)
              .filter(([, value]) => typeof value === "boolean")
              .map(([stageId, value]) => [stageId, Boolean(value)]),
          )
        : {},
    );
    setProposalShowGrandTotal(
      typeof presentation?.mostrarTotalGeral === "boolean" ? presentation.mostrarTotalGeral : true,
    );
    setProposalBuiltArea(
      Number.isFinite(Number(presentation?.areaTotalConstruida)) && Number(presentation?.areaTotalConstruida) > 0
        ? String(presentation.areaTotalConstruida)
        : "",
    );
    setProposalExcludedText(
      Array.isArray(presentation?.itensNaoInclusos)
        ? presentation.itensNaoInclusos.filter((item: unknown) => typeof item === "string").join("\n")
        : "",
    );
  }

  function currentProposalPresentation() {
    return {
      formato: proposalPresentationFormat,
      estiloCasa: proposalHouseStyle,
      padraoCasa: proposalHouseStandard,
      tipoCasa: proposalHouseType,
      elementosVisuais: proposalVisualElements,
      modoPadrao: proposalPresentationDefaultMode,
      etapas: proposalPresentationStageModes,
      mostrarDetalhamentoTecnico: proposalShowTechnicalDetails,
      detalhamentoTecnicoEtapas: proposalTechnicalDetailStages,
      mostrarTotalGeral: proposalShowGrandTotal,
      areaTotalConstruida:
        Number.isFinite(Number(proposalBuiltArea.replace(",", "."))) && Number(proposalBuiltArea.replace(",", ".")) > 0
          ? Number(proposalBuiltArea.replace(",", "."))
          : undefined,
      itensNaoInclusos: proposalExcludedText
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  useEffect(() => {
    const budgets = proposalBudgetOptions;
    if (loadingOrcamentos || loadingBudgetRevisions || budgets.length === 0) return;
    const selectionIsValid = budgets.some((orc) => orc.id === selectedOrcamentoId);
    if (!selectionIsValid) {
      const latestBudget = budgets[budgets.length - 1];
      if (latestBudget?.id) handleProposalBudgetChange(latestBudget.id);
    }
  }, [loadingOrcamentos, loadingBudgetRevisions, orcamentos, budgetRevisions, selectedOrcamentoId]);

  useEffect(() => {
    // Sync lead fields when lead prop changes
    setMercadoSegmento(lead?.mercadoSegmento ?? "");
    setLogoUrl(lead?.logoUrl ?? "");
    setWebsiteUrl(lead?.websiteUrl ?? "");
    setCorDestaque(lead?.corDestaque ?? "#A78BFA");
    setCorSecundaria(lead?.corSecundaria ?? "");
  }, [lead]);

  useEffect(() => {
    if (!supports3DRenders && imageSourceTab === "renders") {
      setImageSourceTab("upload");
    }
  }, [supports3DRenders, imageSourceTab]);

  // Listen for inline edits from the preview iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "proposta-edit" && typeof e.data.html === "string") {
        setEditableHtml(e.data.html);
        setEditDirty(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  function injectScreenStyles(html: string): string {
    const override = `<style id="__screen_override__">@media screen{html,body{overflow-x:hidden!important}body{box-sizing:border-box!important}.page{width:100%!important;max-width:100%!important;box-sizing:border-box!important;overflow-x:hidden!important}}</style>`;
    if (html.includes("</head>")) return html.replace("</head>", override + "</head>");
    if (html.includes("<body")) return html.replace("<body", override + "<body");
    return override + html;
  }

  function injectEditScript(html: string): string {
    if (html.includes("</body>")) return html.replace("</body>", PROPOSTA_EDIT_SCRIPT + "</body>");
    return html + PROPOSTA_EDIT_SCRIPT;
  }

  function stripEditScript(html: string): string {
    return html.replace(/<script id="__proposta_editor__">[\s\S]*?<\/script>/g, "");
  }

  function enterEditMode() {
    if (!previewHtml) return;
    setEditableHtml(injectEditScript(previewHtml));
    setEditDirty(false);
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditMode(false);
    setEditableHtml(null);
    setEditDirty(false);
  }

  async function saveEditedHtml() {
    const html = editableHtml ? stripEditScript(editableHtml) : previewHtml;
    if (!html || !activeVersion) return;
    setEditSaving(true);
    try {
      const res = await fetch(api(`/api/leads/${leadId}/proposals/${activeVersion}`), {
        method: "PATCH",
        headers,
        body: JSON.stringify({ htmlContent: html }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      setPreviewHtml(html);
      setEditMode(false);
      setEditableHtml(null);
      setEditDirty(false);
      toast({ title: "Edições salvas com sucesso!" });
    } catch {
      toast({ title: "Erro ao salvar edições", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  }

  async function uploadStorageFile(file: File, fallbackContentType = "application/octet-stream"): Promise<string> {
    const contentType = file.type || fallbackContentType;
    const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
      requestUploadUrl.mutate(
        { data: { name: file.name, size: file.size, contentType } },
        { onSuccess: resolve, onError: reject },
      );
    });
    const uploadRes = await fetch(result.uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": contentType },
    });
    if (!uploadRes.ok) throw new Error(`Upload falhou (HTTP ${uploadRes.status})`);
    return `/api/storage${result.objectPath}`;
  }

  async function uploadImageFile(file: File): Promise<string> {
    return uploadStorageFile(file, "image/jpeg");
  }

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione um arquivo de imagem (PNG, JPG, SVG...)", variant: "destructive" });
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
      setLogoUrl(result.objectPath);
      toast({ title: "Logo carregada com sucesso!" });
    } catch {
      toast({ title: "Erro no upload. Tente novamente.", variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  }

  async function fetchRenders() {
    if (rendersLoaded || !supports3DRenders) return;
    setRendersLoading(true);
    try {
      const res = await fetch(api("/api/arch/renders/gallery?limit=40"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRenders(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignorar — aba simplesmente ficará vazia
    } finally {
      setRendersLoading(false);
      setRendersLoaded(true);
    }
  }

  function toggleRenderImage(url: string) {
    setProposalImages((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  }

  function proposalImageSlotLabel(index: number) {
    const slots = selectedOrcamentoId !== "__none__"
      ? ["Capa", "Situação / problema", "Implicação / valor", "Solução", "Orçamento"]
      : ["Capa", "Situação / problema", "Implicação / valor", "Solução"];
    return slots[index] ?? `Visual extra ${index - slots.length + 1}`;
  }

  function moveProposalImage(index: number, direction: -1 | 1) {
    setProposalImages((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const current = next[index];
      const swap = next[target];
      if (!current || !swap) return prev;
      next[index] = swap;
      next[target] = current;
      return next;
    });
  }

  async function handleProposalAttachmentUpload(files: FileList) {
    setAttachmentUploading(true);
    const uploaded: ProposalAttachment[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast({ title: `${file.name} excede 20MB`, variant: "destructive" });
          continue;
        }
        const url = await uploadStorageFile(file);
        uploaded.push({
          nome: file.name,
          url,
          mimeType: file.type || undefined,
          tamanho: file.size,
        });
      }
      if (uploaded.length) {
        setProposalAttachments((prev) => [...prev, ...uploaded]);
        toast({ title: `${uploaded.length} anexo(s) adicionado(s) à proposta` });
      }
    } catch (error) {
      toast({
        title: "Erro no upload de anexo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setAttachmentUploading(false);
    }
  }

  async function handleProposalImageUpload(files: FileList) {
    setImageUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: `${file.name} excede 10MB`, variant: "destructive" });
          continue;
        }
        const url = await uploadImageFile(file);
        uploaded.push(url);
      }
      if (uploaded.length) {
        setProposalImages((prev) => [...prev, ...uploaded]);
        toast({ title: `${uploaded.length} imagem(ns) adicionada(s)` });
      }
    } catch {
      toast({ title: "Erro no upload de imagem", variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
  }

  const PROPOSAL_MODULE_LABELS: Record<string, string> = {
    capa: "Capa",
    apresentacao_empresa: "Apresentação da empresa",
    produto_servico: "Produto / serviço",
    curiosidades_conteudo: "Curiosidades e conteúdo",
    cases_provas: "Cases e provas",
    faq: "Perguntas frequentes",
    diferenciais: "Diferenciais",
    resumo_executivo: "Resumo executivo",
    escopo: "Escopo",
    etapas_orcamento: "Etapas do orçamento",
    imagem_por_etapa: "Imagem por etapa",
    tabela_itens: "Tabela de itens",
    cronograma: "Cronograma",
    fisico_financeiro: "Físico-financeiro",
    condicoes_comerciais: "Condições comerciais",
    validade_inicio: "Validade e previsão de início",
    aceite: "Aceite",
    anexos: "Anexos",
    portal_cliente: "Portal do Cliente",
  };

  function resolveProposalBuilderTemplateForEditor() {
    if (!proposalBuilderTemplates.length) return null;
    if (selectedProposalBuilderTemplateId !== "__auto__") {
      return proposalBuilderTemplates.find((item) => item.id === selectedProposalBuilderTemplateId) ?? null;
    }
    if (activeProposalBuilderTemplateId) {
      const active = proposalBuilderTemplates.find((item) => item.id === activeProposalBuilderTemplateId);
      if (active) return active;
    }
    return proposalBuilderTemplates.find((item) => item.isDefault) ?? proposalBuilderTemplates[0] ?? null;
  }

  function openProposalBuilderEditor() {
    const template = resolveProposalBuilderTemplateForEditor();
    if (!template) {
      toast({
        title: "Crie primeiro um modelo com IA",
        description: "Depois você poderá ligar, desligar e reorganizar os módulos visualmente.",
      });
      return;
    }
    const modules = [...(template.modules ?? [])]
      .sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999))
      .map((item, index) => ({ ...item, order: index + 1 }));
    setProposalBuilderEditorName(template.name);
    setProposalBuilderEditorPreset(template.visualStyle?.preset ?? "premium_arquitetonico");
    setProposalBuilderHeroVariant(template.visualStyle?.heroVariant ?? "fotografico");
    setProposalBuilderStageVariant(template.visualStyle?.stageVariant ?? "cards");
    setProposalBuilderInvestmentVariant(template.visualStyle?.investmentVariant ?? "por_etapa");
    setProposalBuilderDensity(template.visualStyle?.density ?? "arejado");
    setProposalBuilderImageEmphasis(template.visualStyle?.imageEmphasis ?? "alta");
    setProposalBuilderTone(template.aiRules?.tone ?? "");
    setProposalBuilderTechnicalLevel(template.aiRules?.technicalLevel ?? "");
    setProposalBuilderImageRules((template.aiRules?.imageRules ?? []).join("\n"));
    setProposalBuilderContentRules((template.aiRules?.contentRules ?? []).join("\n"));
    setProposalBuilderAvoidRules((template.aiRules?.avoid ?? []).join("\n"));
    setProposalBuilderEditorModules(modules);
    setProposalBuilderDraggedIndex(null);
    setProposalBuilderSelectedModuleKey(modules.find((item) => item.enabled !== false)?.key ?? null);
    setProposalBuilderEditorOpen(true);
  }

  function toggleProposalBuilderModule(index: number, enabled: boolean) {
    setProposalBuilderEditorModules((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, enabled: item.required ? true : enabled }
          : item
      ),
    );
  }

  function reorderProposalBuilderModule(from: number, to: number) {
    setProposalBuilderEditorModules((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return next.map((item, index) => ({ ...item, order: index + 1 }));
    });
  }

  function addProposalBuilderModule(key: string) {
    if (proposalBuilderEditorModules.some((item) => item.key === key)) {
      setProposalBuilderEditorModules((prev) =>
        prev.map((item) => item.key === key ? { ...item, enabled: true } : item),
      );
      return;
    }
    setProposalBuilderEditorModules((prev) => [
      ...prev,
      { key, enabled: true, order: prev.length + 1, required: key === "capa" || key === "condicoes_comerciais" || key === "aceite" },
    ]);
  }

  function removeProposalBuilderModule(key: string) {
    setProposalBuilderEditorModules((prev) =>
      prev
        .filter((item) => item.key !== key || item.required)
        .map((item, index) => ({ ...item, order: index + 1 })),
    );
  }

  const proposalBuilderAvailableModules = Object.entries(PROPOSAL_MODULE_LABELS)
    .filter(([key]) => !proposalBuilderEditorModules.some((item) => item.key === key));

  async function saveProposalBuilderEditor() {
    const template = resolveProposalBuilderTemplateForEditor();
    if (!template || !tenantId || !token) return;
    setProposalBuilderEditorSaving(true);
    try {
      const res = await fetch(
        api(`/api/tenants/${tenantId}/proposal-builder/templates/${template.id}`),
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            name: proposalBuilderEditorName.trim() || template.name,
            isDefault: template.isDefault !== false,
            visualStyle: {
              preset: proposalBuilderEditorPreset,
              heroVariant: proposalBuilderHeroVariant,
              stageVariant: proposalBuilderStageVariant,
              investmentVariant: proposalBuilderInvestmentVariant,
              density: proposalBuilderDensity,
              imageEmphasis: proposalBuilderImageEmphasis,
            },
            aiRules: {
              tone: proposalBuilderTone.trim(),
              technicalLevel: proposalBuilderTechnicalLevel.trim(),
              imageRules: proposalBuilderImageRules.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
              contentRules: proposalBuilderContentRules.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
              avoid: proposalBuilderAvoidRules.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
            },
            modules: proposalBuilderEditorModules.map((item, index) => ({
              ...item,
              order: index + 1,
              enabled: item.required ? true : item.enabled !== false,
            })),
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Não foi possível salvar o modelo");
      await queryClient.invalidateQueries({ queryKey: getGetBusinessProfileByTenantQueryKey(tenantId) });
      setProposalBuilderEditorOpen(false);
      toast({
        title: "Modelo de proposta atualizado",
        description: "A nova ordem e os módulos ativos serão usados nas próximas propostas.",
      });
    } catch (e: any) {
      toast({
        title: "Erro ao salvar modelo",
        description: e?.message || "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    } finally {
      setProposalBuilderEditorSaving(false);
    }
  }

  async function createProposalBuilderTemplateWithAI() {
    if (!tenantId || !token) return;
    setGeneratingProposalBuilderTemplate(true);
    try {
      const res = await fetch(api(`/api/tenants/${tenantId}/proposal-builder/templates/ai-bootstrap`), {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Não foi possível criar o modelo com IA");
      const templateId = body?.template?.id;
      if (typeof templateId === "string") {
        setSelectedProposalBuilderTemplateId(templateId);
      }
      await queryClient.invalidateQueries({ queryKey: getGetBusinessProfileByTenantQueryKey(tenantId) });
      toast({
        title: "Modelo inteligente criado",
        description: "A IA organizou os módulos e regras da proposta para este tenant. Você pode usar o modelo imediatamente.",
      });
    } catch (e: any) {
      toast({
        title: "Erro ao criar modelo de proposta",
        description: e?.message || "Não foi possível criar o modelo com IA.",
        variant: "destructive",
      });
    } finally {
      setGeneratingProposalBuilderTemplate(false);
    }
  }

  const proposalBuilderPreviewTotal = Number(selectedOrcamento?.valorTotal ?? 0);
  const proposalBuilderPreviewDeadline = String(selectedOrcamento?.prazoEntrega ?? "").trim();
  const proposalBuilderPreviewCompany = String((profileQuery.data as any)?.nomeFantasia || (profileQuery.data as any)?.razaoSocial || "Sua empresa");
  const proposalBuilderPreviewLogo = String((profileQuery.data as any)?.logoUrl || "");
  const proposalBuilderPreviewTitle = String(selectedOrcamento?.titulo || "Proposta comercial");
  const proposalBuilderPreviewClient = String((lead as any)?.nome || "Cliente");
  const proposalBuilderPreviewExcluded = Array.isArray(selectedOrcamento?.apresentacao?.itensNaoInclusos)
    ? selectedOrcamento.apresentacao.itensNaoInclusos.filter((item: unknown): item is string => typeof item === "string")
    : [];

  function proposalBuilderMoney(value: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(value) ? value : 0);
  }

  function proposalBuilderMoveModule(key: string, direction: -1 | 1) {
    const index = proposalBuilderEditorModules.findIndex((item) => item.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= proposalBuilderEditorModules.length) return;
    reorderProposalBuilderModule(index, target);
  }

  async function saveLeadFields() {
    if (!leadId || !token) return;
    setSavingLead(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          mercadoSegmento: mercadoSegmento || null,
          logoUrl: logoUrl || null,
          websiteUrl: websiteUrl || null,
          corDestaque: corDestaque || null,
          corSecundaria: corSecundaria || null,
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      toast({ title: "Dados do lead salvos" });
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingLead(false);
    }
  }

  function openRefineDialog(fromVersion?: number) {
    setRefineNotes("");
    setRefineFromVersion(fromVersion ?? null);
    setRefineOpen(true);
  }

  async function generateProposal(notes?: string) {
    if (!leadId || !token) return;
    if (selectedOrcamentoId === "__none__") {
      toast({
        title: "Selecione o orçamento",
        description: "A proposta precisa estar vinculada a um orçamento.",
        variant: "destructive",
      });
      return;
    }

    const imagesForProposal = effectiveProposalImages.slice(0, 12);
    const payload = {
      segmento: mercadoSegmento || undefined,
      logoUrl: logoUrl || undefined,
      websiteUrl: websiteUrl || undefined,
      corDestaque: corDestaque || undefined,
      corSecundaria: corSecundaria || undefined,
      imagens: imagesForProposal,
      anexos: proposalAttachments,
      objetivo: lead?.objetivo || undefined,
      propostaId: selectedOrcamentoId,
      apresentacao: currentProposalPresentation(),
      proposalTemplateId: selectedProposalTemplateId !== "__auto__" ? selectedProposalTemplateId : undefined,
      proposalBuilderTemplateId:
        selectedProposalBuilderTemplateId !== "__auto__"
          ? selectedProposalBuilderTemplateId
          : undefined,
      refinementNotes: notes?.trim() || undefined,
    };

    setRefineOpen(false);
    setGenerating(true);

    try {
      const startResponse = await fetch(`/api/leads/${leadId}/proposals/async`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const startRaw = await startResponse.text();
      let startBody: any = null;
      try {
        startBody = startRaw ? JSON.parse(startRaw) : null;
      } catch {
        startBody = null;
      }

      if (!startResponse.ok || !startBody?.jobId) {
        const message =
          startBody?.error
          || startBody?.message
          || (startRaw && !/^\s*</.test(startRaw) ? startRaw.slice(0, 400) : "")
          || `Não foi possível iniciar a geração (HTTP ${startResponse.status})`;
        throw new Error(String(message));
      }

      const jobId = String(startBody.jobId);
      toast({
        title: "Gerando proposta",
        description: "A geração foi iniciada e continuará mesmo que leve alguns minutos.",
      });

      let generatedVersion: number | null = null;
      let generationError: string | null = null;

      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
        }

        const statusResponse = await fetch(
          `/api/leads/${leadId}/proposals/generation/${encodeURIComponent(jobId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!statusResponse.ok) {
          if (statusResponse.status === 404 && attempt < 3) continue;
          const statusBody = await statusResponse.json().catch(() => null);
          throw new Error(statusBody?.error || `Falha ao consultar geração (HTTP ${statusResponse.status})`);
        }

        const statusBody = await statusResponse.json() as {
          status?: "processing" | "success" | "error";
          version?: number;
          error?: string;
        };

        if (statusBody.status === "success" && Number(statusBody.version) > 0) {
          generatedVersion = Number(statusBody.version);
          break;
        }
        if (statusBody.status === "error") {
          generationError = statusBody.error || "A geração da proposta falhou.";
          break;
        }
      }

      if (generationError) throw new Error(generationError);
      if (!generatedVersion) {
        throw new Error("A geração ultrapassou 5 minutos. Tente novamente ou verifique o provedor de IA.");
      }

      await queryClient.invalidateQueries({ queryKey: ["listLeadProposals", leadId] });
      setActiveVersion(generatedVersion);
      toast({ title: `Proposta v${generatedVersion} gerada com sucesso` });
      await previewProposal(generatedVersion);
    } catch (e: any) {
      const msg = String(e?.error || e?.message || "Erro ao gerar proposta");
      toast({
        title: "Erro na geração",
        description: msg.length > 420 ? `${msg.slice(0, 420)}…` : msg,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function previewProposal(version: number) {
    if (!leadId || !token) return;

    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.document.title = "Carregando proposta...";
      previewWindow.document.body.innerHTML = '<div style="font-family:system-ui,sans-serif;padding:24px;color:#475569">Carregando proposta...</div>';
    }

    try {
      const res = await fetch(`/api/leads/${leadId}/proposals/${version}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Falha ao carregar proposta (${res.status})`);
      const htmlContent = await res.text();
      if (!htmlContent.trim()) {
        throw new Error("Conteúdo da proposta não disponível");
      }

      setPreviewHtml(htmlContent);
      setActiveVersion(version);

      if (previewWindow && !previewWindow.closed) {
        const blobUrl = window.URL.createObjectURL(
          new Blob([htmlContent], { type: "text/html;charset=utf-8" }),
        );
        previewWindow.location.replace(blobUrl);
        previewWindow.focus();
        window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
      } else {
        setPreviewOpen(true);
        toast({
          title: "Pré-visualização aberta no sistema",
          description: "O navegador bloqueou a nova aba. Libere pop-ups para abrir a proposta em uma aba separada.",
        });
      }
    } catch (e: any) {
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      toast({
        title: "Erro ao visualizar proposta",
        description: e?.message || "Não foi possível carregar a proposta.",
        variant: "destructive",
      });
    }
  }

  function openWhatsAppProposal(version: number) {
    const raw = lead?.telefone ?? "";
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      toast({ title: "Lead sem telefone cadastrado", variant: "destructive" });
      return;
    }
    const phone = digits.startsWith("55") ? digits : `55${digits}`;
    const nome = lead?.nome ? ` ${lead.nome.split(" ")[0]}` : "";
    const msg = encodeURIComponent(
      `Olá${nome}! Preparei a proposta v${version} do projeto para você. Posso compartilhar os detalhes e avançarmos juntos?`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank", "noopener");
  }

  function downloadProposal(version: number, format: "html" | "pdf" = "html") {
    if (!leadId || !token) return;
    const url = `/api/leads/${leadId}/proposals/${version}/${format === "pdf" ? "pdf" : "download"}`;
    const clientName = (lead?.empresa || lead?.nome || "Cliente")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "Cliente";
    const proposalNumber = "P001";
    const revisionNumber = `R${String(version).padStart(2, "0")}`;
    const extension = format === "pdf" ? "pdf" : "html";
    const filename = `Proposta_${clientName}_${proposalNumber}_${revisionNumber}.${extension}`;
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", filename);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Falha no download");
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        a.href = blobUrl;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch((e: any) => {
        toast({ title: "Erro no download", description: e.message, variant: "destructive" });
      });
  }

  async function addProduct() {
    if (!newProductNome.trim() || !leadId || !token) return;
    setAddingProduct(true);
    try {
      await createProductMutation.mutateAsync({
        leadId,
        data: { nome: newProductNome.trim(), imagemUrl: newProductImagem || null },
      });
      toast({ title: "Produto adicionado" });
      setNewProductNome("");
      setNewProductImagem("");
      queryClient.invalidateQueries({ queryKey: ["listLeadProducts", leadId] });
    } catch (e: any) {
      const msg = e?.error || e?.message || "Falha ao adicionar produto";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setAddingProduct(false);
    }
  }


  function formatCurrency(value?: string | null) {
    if (!value) return "—";
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  async function removeProduct(productId: string) {
    if (!leadId || !token) return;
    if (!confirm("Remover este produto?")) return;
    try {
      await deleteProductMutation.mutateAsync({ leadId, productId });
      toast({ title: "Produto removido" });
      queryClient.invalidateQueries({ queryKey: ["listLeadProducts", leadId] });
    } catch (e: any) {
      const msg = e?.error || e?.message || "Falha ao remover";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  }

  function openBudgetCreation() {
    const budgetButton = document.querySelector<HTMLElement>('[data-testid="btn-new-budget"]');
    if (budgetButton) {
      budgetButton.click();
      return;
    }
    toast({
      title: "Criar orçamento para este cliente",
      description: "Use a ação “Gerar orçamento” no topo do atendimento para manter o contexto do lead.",
    });
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden">
      {/* Contexto da proposta — personalização + materiais */}
      <Card data-testid="card-proposta-config" className="order-2">
        <CardHeader className="pb-3 min-w-0">
          <CardTitle className="text-sm font-semibold flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex min-w-0 items-center gap-2">
              <Palette className="h-4 w-4" />
              Contexto da proposta
              {proposalImages.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {proposalImages.length} {proposalImages.length === 1 ? "imagem selecionada" : "imagens selecionadas"}
                </Badge>
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-9 w-full text-xs gap-1 sm:h-7 sm:w-auto"
              onClick={saveLeadFields}
              disabled={savingLead}
            >
              {savingLead ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Salvar contexto
            </Button>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            A marca da empresa vem automaticamente do Kit da Marca. Aqui você define o contexto do cliente e as imagens da apresentação.
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
              Identidade e personalização
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Segmento de Mercado</label>
                <Input
                  value={mercadoSegmento}
                  onChange={(e) => setMercadoSegmento(e.target.value)}
                  placeholder="Ex: Varejo, Construção, SaaS..."
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Logo do Cliente</label>
                <div className="flex items-center gap-2">
                  {logoUrl && (
                    <img
                      src={logoUrl.startsWith("/objects/") ? `/api/storage${logoUrl}` : logoUrl}
                      alt="Logo"
                      className="h-8 w-8 object-contain rounded border bg-white"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <Input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://... ou faça upload →"
                    className="h-8 text-sm flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 shrink-0"
                    disabled={logoUploading}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {logoUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  </Button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleLogoUpload(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">URL do Site do Cliente</label>
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://www.cliente.com.br"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cor Destaque (primária)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={corDestaque}
                    onChange={(e) => setCorDestaque(e.target.value)}
                    className="h-8 w-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={corDestaque}
                    onChange={(e) => setCorDestaque(e.target.value)}
                    placeholder="#A78BFA"
                    className="h-8 text-sm flex-1"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cor Secundária</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={corSecundaria || "#ffffff"}
                    onChange={(e) => setCorSecundaria(e.target.value)}
                    className="h-8 w-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={corSecundaria}
                    onChange={(e) => setCorSecundaria(e.target.value)}
                    placeholder="Opcional"
                    className="h-8 text-sm flex-1"
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="border-t" />

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-foreground">
              <span className="flex items-center gap-2">
                <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                Materiais visuais
              </span>
              <Badge
                variant="outline"
                className={proposalHasMinimumImages ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}
              >
                {effectiveProposalImages.length} selecionada(s)
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              Recomendado: {proposalPrimaryPageCount} imagens diferentes, uma para cada página principal. Imagens não são obrigatórias; o sistema usa as disponíveis e pode completar automaticamente quando houver contexto suficiente.
            </p>

            {productProposalImages.filter((url) => !proposalImages.includes(url)).length > 0 && (
              <p className="rounded-md border border-dashed bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                {productProposalImages.filter((url) => !proposalImages.includes(url)).length} imagem(ns) de produto será(ão) usada(s) automaticamente depois das imagens selecionadas.
              </p>
            )}

            {proposalImages.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground font-medium">
                    Ordem da apresentação — cada imagem ocupa uma página:
                  </p>
                  <span className={`text-[10px] font-medium ${effectiveProposalImages.length >= proposalPrimaryPageCount ? "text-emerald-600" : "text-amber-600"}`}>
                    {Math.min(effectiveProposalImages.length, proposalPrimaryPageCount)}/{proposalPrimaryPageCount} páginas principais cobertas
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {proposalImages.map((url, idx) => (
                    <div key={`${url}-${idx}`} className="relative group rounded overflow-hidden border aspect-video bg-muted">
                      <span className="absolute top-0.5 left-0.5 z-10 max-w-[78%] truncate bg-black/75 text-white text-[9px] font-medium px-1 py-0.5 rounded">
                        {idx + 1} · {proposalImageSlotLabel(idx)}
                      </span>
                      <img
                        src={url}
                        alt={`Imagem ${idx + 1} — ${proposalImageSlotLabel(idx)}`}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="absolute bottom-0.5 left-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => moveProposalImage(idx, -1)}
                          disabled={idx === 0}
                          className="bg-black/65 text-white rounded p-0.5 disabled:opacity-30"
                          aria-label="Mover imagem para antes"
                          title="Mover para antes"
                        >
                          <ChevronUp className="h-2.5 w-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveProposalImage(idx, 1)}
                          disabled={idx === proposalImages.length - 1}
                          className="bg-black/65 text-white rounded p-0.5 disabled:opacity-30"
                          aria-label="Mover imagem para depois"
                          title="Mover para depois"
                        >
                          <ChevronDown className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProposalImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remover imagem"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex rounded-md border overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setImageSourceTab("upload")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors ${
                  imageSourceTab === "upload"
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                <Upload className="h-3 w-3" />
                Importar
              </button>

              {supports3DRenders && (
                <button
                  type="button"
                  onClick={() => {
                    setImageSourceTab("renders");
                    void fetchRenders();
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 border-l transition-colors ${
                    imageSourceTab === "renders"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  Renderizações 3D
                </button>
              )}
            </div>

            {imageSourceTab === "upload" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Para máxima qualidade, use uma imagem diferente por página: capa, contexto, valor, solução e, quando houver, orçamento.
                </p>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void handleProposalImageUpload(e.target.files);
                      e.target.value = "";
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs gap-2"
                  disabled={imageUploading}
                  onClick={() => imageInputRef.current?.click()}
                >
                  {imageUploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  {imageUploading ? "Enviando..." : "Selecionar arquivos"}
                </Button>
              </div>
            )}

            {supports3DRenders && imageSourceTab === "renders" && (
              <div className="space-y-2">
                {rendersLoading ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="aspect-video bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : renders.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-xs text-muted-foreground">
                      Nenhuma renderização encontrada.
                    </p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      Gere renders no módulo Arch para usar aqui.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Clique para adicionar ou remover da seleção:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-0.5">
                      {renders.map((r) => {
                        const selected = proposalImages.includes(r.imageUrl);
                        return (
                          <button
                            type="button"
                            key={r.id}
                            onClick={() => toggleRenderImage(r.imageUrl)}
                            className={`relative rounded overflow-hidden border-2 aspect-video bg-muted transition-all ${
                              selected
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-transparent hover:border-muted-foreground/40"
                            }`}
                            title={r.cenaNome ?? "Render"}
                          >
                            <img
                              src={r.imageUrl}
                              alt={r.cenaNome ?? "Render"}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).closest("button")?.classList.add("hidden");
                              }}
                            />
                            {selected && (
                              <span className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                                  {proposalImages.indexOf(r.imageUrl) + 1}
                                </span>
                              </span>
                            )}
                            {r.cenaNome && (
                              <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] px-1 py-0.5 truncate text-left">
                                {r.cenaNome}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      {/* Orçamentos vinculados — primeira etapa do fluxo */}
      <Card data-testid="card-orcamentos-lead" className="order-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Orçamentos
              {orcamentos.length > 0 && (
                <Badge variant="outline" className="text-xs">{orcamentos.length}</Badge>
              )}
            </span>
            <button
              type="button"
              onClick={openBudgetCreation}
              className="text-xs font-normal text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              + Novo orçamento
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 overflow-hidden">
          {loadingOrcamentos ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}
            </div>
          ) : orcamentos.length === 0 ? (
            <div className="flex flex-wrap items-center gap-2 py-2 text-xs text-muted-foreground">
              <span>Nenhum orçamento criado para este lead.</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={openBudgetCreation}>
                Criar orçamento para este cliente
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {orcamentos.map((orc) => {
                const currentLabel = getOrcLabel(orc.status);
                const labelCfg = ORCAMENTO_LABELS.find(l => l.value === currentLabel)!;
                const terminal = isTerminalStatus(orc.status);
                const isChanging = changingLabel === orc.id;
                const expirou = orc.validadeAte && new Date(orc.validadeAte) < new Date();
                return (
                  <div
                    key={orc.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-medium truncate">{orc.titulo}</p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="font-semibold text-foreground">{formatCurrency(orc.valorTotal)}</span>
                        {orc.numero && <span className="font-mono">{orc.numero}</span>}
                        {orc.validadeAte && (
                          <span className={`flex items-center gap-1 ${expirou ? "text-orange-500" : ""}`}>
                            <Clock className="h-3 w-3" />
                            {new Date(orc.validadeAte).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {terminal ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${labelCfg.color}`}>
                          {labelCfg.label}
                        </span>
                      ) : (
                        <Select
                          value={currentLabel}
                          onValueChange={(v) => handleChangeLabel(orc.id, orc.status, v)}
                          disabled={isChanging}
                        >
                          <SelectTrigger className={`h-7 text-[10px] w-32 border font-medium focus:ring-0 ${labelCfg.color}`}>
                            {isChanging ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
                          </SelectTrigger>
                          <SelectContent>
                            {ORCAMENTO_LABELS.map(l => (
                              <SelectItem key={l.value} value={l.value} className="text-xs">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${l.color}`}>
                                  {l.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Link
                        href={`/propostas?edit=${encodeURIComponent(orc.id)}&returnTo=${encodeURIComponent(`/leads/${leadId}`)}`}
                      >
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Abrir/editar orçamento">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Baixar PDF"
                        onClick={() => downloadOrcamentoPdf(orc.id, orc.titulo)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Negociação e revisões — última etapa */}
      <div className="order-5">
        <OrcamentoRevisoesCard leadId={leadId} tenantId={tenantId} />
      </div>

      {/* Proposta comercial */}
      <Card data-testid="card-propostas-geradas" className="order-4 min-w-0 max-w-full overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Proposta comercial
              {proposals.length > 0 && (
                <Badge variant="outline" className="text-xs ml-1">{proposals.length}</Badge>
              )}
            </span>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => openRefineDialog()}
              disabled={generating || loadingOrcamentos || loadingBudgetRevisions || proposalBudgetOptions.length === 0 || selectedOrcamentoId === "__none__"}
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {generating ? "Gerando..." : "Gerar Proposta"}
            </Button>
          </CardTitle>
          {/* Modelo inteligente modular do tenant */}
          <div className="mt-2 space-y-2 rounded-lg border bg-muted/20 p-2.5">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold">Modelo inteligente da proposta</p>
                <p className="text-[11px] text-muted-foreground">
                  A IA organiza módulos, ordem, tom e regras visuais por tenant e segmento.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {proposalBuilderTemplates.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={openProposalBuilderEditor}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Studio de Propostas
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={createProposalBuilderTemplateWithAI}
                  disabled={generatingProposalBuilderTemplate}
                >
                  {generatingProposalBuilderTemplate
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Sparkles className="h-3.5 w-3.5 text-violet-500" />}
                  {proposalBuilderTemplates.length ? "Criar nova versão com IA" : "Criar modelo com IA"}
                </Button>
              </div>
            </div>

            {proposalBuilderTemplates.length > 0 && (
              <Select
                value={selectedProposalBuilderTemplateId}
                onValueChange={setSelectedProposalBuilderTemplateId}
              >
                <SelectTrigger className="h-9 min-w-0 w-full max-w-full text-xs [&>span]:truncate">
                  <SelectValue placeholder="Modelo modular do tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">
                    Automático — {activeProposalBuilderTemplateId ? "usar modelo ativo" : "usar padrão seguro"}
                  </SelectItem>
                  {proposalBuilderTemplates.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}{item.isDefault ? " · padrão" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {(proposalBuilderTemplates.length > 0 || hasProposalTemplate) && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {proposalBuilderTemplates.length > 0 && (
                  <span>
                    {proposalBuilderTemplates.length} modelo(s) modular(es) · regras aplicadas na geração
                  </span>
                )}
                <Link href="/configuracoes?tab=perfil" className="flex items-center gap-1 text-muted-foreground hover:text-primary no-underline">
                  <Upload className="h-3 w-3" /> Kit da Marca e documentos
                </Link>
              </div>
            )}
          </div>

          {/* Modelo documental por linha, quando o tenant já possui um arquivo de referência */}
          <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            {proposalLineTemplates.length > 0 ? (
              <Select value={selectedProposalTemplateId} onValueChange={setSelectedProposalTemplateId}>
                <SelectTrigger className="h-9 min-w-0 w-full max-w-full text-xs sm:h-8 sm:w-[280px] [&>span]:truncate">
                  <SelectValue placeholder="Referência documental" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Automático — referência padrão</SelectItem>
                  {proposalLineTemplates.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name} — {item.productLine}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : hasProposalTemplate ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                <FileText className="h-3 w-3" /> Referência ativa: {proposalTemplateName || "modelo-proposta"}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {/* Seletor de orçamento a incluir */}
          {proposalBudgetOptions.length > 0 && (
            <div className="mb-4 min-w-0 space-y-1 overflow-hidden border-b pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground font-medium">
                  Orçamento ou revisão usada nesta proposta *
                </label>
                {selectedOrcamentoId !== "__none__" && (
                  <span className="text-[11px] text-emerald-600">
                    Selecionado · a proposta usará exatamente esta versão
                  </span>
                )}
              </div>
              <Select
                value={selectedOrcamentoId}
                onValueChange={handleProposalBudgetChange}
              >
                <SelectTrigger className="h-10 min-w-0 w-full max-w-full text-sm [&>span]:truncate">
                  <SelectValue placeholder="Selecione o orçamento ou revisão" />
                </SelectTrigger>
                <SelectContent>
                  {proposalBudgetOptions.map((orc) => {
                    const total = orc.valorTotal
                      ? Number(orc.valorTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : null;
                    const revision = orc.__revision as ProposalBudgetRevision | undefined;
                    const versionLabel = revision
                      ? `Revisão ${revision.revisaoNumero || revision.numeroOrcamento}`
                      : "Orçamento base";
                    return (
                      <SelectItem key={orc.id} value={orc.id}>
                        {versionLabel} — {orc.titulo}{total ? ` — ${total}` : ""}
                        {orc.numero ? ` (Nº ${orc.numero})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <div className="mt-3 rounded-xl border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">Anexos da proposta</p>
                    <p className="text-[11px] text-muted-foreground">
                      Anexe memoriais, plantas, especificações, planilhas, PDFs ou outros documentos que devem acompanhar esta versão.
                    </p>
                  </div>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"
                    onChange={(event) => {
                      if (event.target.files?.length) void handleProposalAttachmentUpload(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    disabled={attachmentUploading}
                    onClick={() => attachmentInputRef.current?.click()}
                  >
                    {attachmentUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                    {attachmentUploading ? "Enviando..." : "Anexar arquivos"}
                  </Button>
                </div>
                {proposalAttachments.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {proposalAttachments.map((anexo, index) => (
                      <div key={`${anexo.url}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs">
                        <a href={anexo.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 hover:underline">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{anexo.nome}</span>
                        </a>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          title="Remover anexo"
                          onClick={() => setProposalAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedOrcamentoId !== "__none__" && (
                <div className="mt-3 space-y-3 rounded-xl border bg-muted/20 p-3">
                  <div>
                    <p className="text-sm font-semibold">Como apresentar o orçamento ao cliente</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Separe o detalhamento financeiro do técnico. O orçamento interno continua completo, independentemente do que for exibido.
                    </p>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
                    <div className="space-y-1.5 lg:col-span-3">
                      <label className="text-xs font-medium text-muted-foreground">Formato da proposta</label>
                      <Select
                        value={proposalPresentationFormat}
                        onValueChange={(value) => setProposalPresentationFormat(value as ProposalPresentationFormat)}
                      >
                        <SelectTrigger className="h-9 w-full max-w-[360px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="site_interativo">Site interativo</SelectItem>
                          <SelectItem value="documento">Documento / PDF</SelectItem>
                          <SelectItem value="hibrido">Híbrido — site + PDF</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {proposalPresentationFormat === "site_interativo"
                          ? "Portal do Cliente em formato de microsite responsivo e interativo."
                          : proposalPresentationFormat === "hibrido"
                            ? "Portal do Cliente interativo com opção de impressão/PDF."
                            : "Modelo tradicional em páginas, otimizado para impressão e PDF."}
                      </p>
                    </div>
                    <div className="space-y-2 lg:col-span-3 rounded-xl border bg-background p-3">
                      <div>
                        <p className="text-xs font-semibold">Estilo visual da casa</p>
                        <p className="text-[11px] text-muted-foreground">
                          Essas escolhas orientam a capa e todas as imagens das etapas. Para CasaForteICF, o padrão recomendado é alto padrão.
                        </p>
                      </div>
                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">Estilo</label>
                          <Select value={proposalHouseStyle} onValueChange={(value) => setProposalHouseStyle(value as ProposalHouseStyle)}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="contemporanea">Contemporânea</SelectItem>
                              <SelectItem value="moderna">Moderna</SelectItem>
                              <SelectItem value="minimalista">Minimalista</SelectItem>
                              <SelectItem value="classica">Clássica</SelectItem>
                              <SelectItem value="industrial">Industrial</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">Padrão</label>
                          <Select value={proposalHouseStandard} onValueChange={(value) => setProposalHouseStandard(value as ProposalHouseStandard)}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="medio">Médio</SelectItem>
                              <SelectItem value="alto_padrao">Alto padrão</SelectItem>
                              <SelectItem value="luxo">Luxo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">Tipologia</label>
                          <Select value={proposalHouseType} onValueChange={(value) => setProposalHouseType(value as ProposalHouseType)}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="terrea">Casa térrea</SelectItem>
                              <SelectItem value="sobrado">Sobrado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">Elementos desejados</label>
                        <Input
                          value={proposalVisualElements.join(", ")}
                          onChange={(e) => setProposalVisualElements(
                            e.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12),
                          )}
                          placeholder="Ex.: piscina, paisagismo, pedra natural, madeira, esquadrias amplas"
                          className="h-9"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Separe por vírgulas. A IA deve manter essa linguagem visual em todas as imagens, sem trocar o assunto técnico da etapa.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs"
                          disabled={generatingCoverImage}
                          onClick={() => void generatePremiumCoverImage()}
                        >
                          {generatingCoverImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {generatingCoverImage ? "Gerando capa..." : "Gerar capa premium"}
                        </Button>
                        {selectedOrcamento?.apresentacao?.imagemCapa ? (
                          <img
                            src={selectedOrcamento.apresentacao.imagemCapa}
                            alt="Capa premium da proposta"
                            className="h-14 w-24 rounded-md border object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Nenhuma capa premium gerada ainda.</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 lg:col-span-3">
                      <label className="text-xs font-medium text-muted-foreground">Área total construída</label>
                      <div className="relative max-w-[240px]">
                        <Input
                          inputMode="decimal"
                          value={proposalBuiltArea}
                          onChange={(e) => setProposalBuiltArea(e.target.value.replace(/[^0-9.,]/g, ""))}
                          placeholder="Ex.: 250"
                          className="h-9 pr-10"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">m²</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Informe a área total real da obra, incluindo anexos como quiosque, garagem ou edícula quando fizerem parte do contrato.
                      </p>
                    </div>
                    <div className="space-y-1.5 lg:col-span-3">
                      <label className="text-xs font-medium text-muted-foreground">O que não está incluso</label>
                      <Textarea
                        value={proposalExcludedText}
                        onChange={(e) => setProposalExcludedText(e.target.value)}
                        placeholder={"Ex.:\nPaisagismo\nMóveis planejados\nTaxas e emolumentos"}
                        className="min-h-[110px] resize-y bg-background"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Edite livremente. Use uma linha para cada item não contemplado; esta informação será salva no orçamento e exibida na proposta.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Detalhamento financeiro</label>
                      <Select
                        value={proposalPresentationDefaultMode}
                        onValueChange={(value) =>
                          setProposalPresentationDefaultMode(value as ProposalPresentationMode)
                        }
                      >
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROPOSAL_PRESENTATION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {PROPOSAL_PRESENTATION_OPTIONS.find(
                          (option) => option.value === proposalPresentationDefaultMode,
                        )?.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 lg:min-w-[215px]">
                      <div>
                        <p className="text-xs font-medium">Detalhamento técnico</p>
                        <p className="text-[11px] text-muted-foreground">Mostrar itens e escopo contemplado</p>
                      </div>
                      <Switch checked={proposalShowTechnicalDetails} onCheckedChange={setProposalShowTechnicalDetails} />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 lg:min-w-[180px]">
                      <div>
                        <p className="text-xs font-medium">Total geral</p>
                        <p className="text-[11px] text-muted-foreground">Mostrar no final</p>
                      </div>
                      <Switch checked={proposalShowGrandTotal} onCheckedChange={setProposalShowGrandTotal} />
                    </div>
                  </div>

                  {selectedOrcamentoStages.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold">Configuração por etapa</p>
                          <span className="text-[11px] text-muted-foreground">
                            Você pode definir separadamente o financeiro, o detalhamento técnico e a foto de cada etapa.
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">
                            Selecione até 3 etapas · {selectedStageImageIds.length}/3
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            disabled={generatingStageImages || selectedStageImageIds.length === 0}
                            onClick={() => void generateRepresentativeStageImages(false)}
                          >
                            {generatingStageImages ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            {generatingStageImages
                              ? "Gerando..."
                              : `Gerar ${selectedStageImageIds.length || ""} foto${selectedStageImageIds.length === 1 ? "" : "s"}`}
                          </Button>
                          {Object.keys(selectedStageImages).length > 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-[11px]"
                              disabled={generatingStageImages || selectedStageImageIds.length === 0}
                              onClick={() => void generateRepresentativeStageImages(true)}
                            >
                              Regenerar selecionadas
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {selectedOrcamentoStages.map((stage) => (
                          <div
                            key={stage.id}
                            className="grid gap-2 rounded-lg border bg-background p-2.5 lg:grid-cols-[minmax(0,1fr)_210px_170px] lg:items-center"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <input
                                type="checkbox"
                                aria-label={`Selecionar etapa ${stage.nome} para geração de imagem`}
                                checked={selectedStageImageIds.includes(stage.id)}
                                disabled={generatingStageImages}
                                onChange={() => toggleStageImageSelection(stage.id)}
                                className="h-4 w-4 shrink-0"
                              />
                              {selectedStageImages[stage.id] ? (
                                <img
                                  src={selectedStageImages[stage.id]}
                                  alt={`Imagem representativa da etapa ${stage.nome}`}
                                  className="h-12 w-20 shrink-0 rounded-md border object-cover"
                                  onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                                />
                              ) : (
                                <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/30 text-[9px] text-muted-foreground">
                                  Sem imagem
                                </div>
                              )}
                              <div className="min-w-0">
                                <p
                                  className="text-xs font-medium leading-snug whitespace-normal break-words"
                                  title={stage.nome}
                                >
                                  {stage.nome}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {stage.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </p>
                                {selectedStageImages[stage.id] ? (
                                  <p className="text-[10px] text-emerald-600">Imagem representativa vinculada</p>
                                ) : null}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Financeiro</span>
                              <Select
                                value={proposalPresentationStageModes[stage.id] ?? "__default__"}
                                onValueChange={(value) =>
                                  setProposalPresentationStageModes((current) => {
                                    const next = { ...current };
                                    if (value === "__default__") {
                                      delete next[stage.id];
                                    } else {
                                      next[stage.id] = value as ProposalPresentationMode;
                                    }
                                    return next;
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 w-full text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__default__">Usar padrão</SelectItem>
                                  {PROPOSAL_PRESENTATION_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1">
                              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Técnico</span>
                              <Select
                                value={
                                  Object.prototype.hasOwnProperty.call(proposalTechnicalDetailStages, stage.id)
                                    ? (proposalTechnicalDetailStages[stage.id] ? "mostrar" : "ocultar")
                                    : "__default__"
                                }
                                onValueChange={(value) =>
                                  setProposalTechnicalDetailStages((current) => {
                                    const next = { ...current };
                                    if (value === "__default__") {
                                      delete next[stage.id];
                                    } else {
                                      next[stage.id] = value === "mostrar";
                                    }
                                    return next;
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 w-full text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__default__">Usar padrão</SelectItem>
                                  <SelectItem value="mostrar">Mostrar escopo</SelectItem>
                                  <SelectItem value="ocultar">Ocultar escopo</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    Exemplo: Fundação pode mostrar somente o valor macro no financeiro e, ao mesmo tempo, listar tecnicamente tudo o que está contemplado — sem revelar quantidades nem preços unitários.
                  </p>
                </div>
              )}
            </div>
          )}

          {loadingProposals ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : !proposals.length ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Nenhuma proposta gerada ainda.
              </p>
              <Button
                size="sm"
                className="gap-1"
                onClick={() => openRefineDialog()}
                disabled={generating}
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Gerar primeira proposta
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {[...proposals]
                .sort((a, b) => b.version - a.version)
                .map((p) => (
                  <div key={p.id} className="py-3 px-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        v{p.version}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {p.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Visualizar"
                        onClick={() => previewProposal(p.version)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Download HTML"
                        onClick={() => downloadProposal(p.version, "html")}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Download PDF"
                        onClick={() => downloadProposal(p.version, "pdf")}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                        title="Melhorar proposta"
                        onClick={() => openRefineDialog(p.version)}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Avançar no projeto via WhatsApp"
                        onClick={() => openWhatsAppProposal(p.version)}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                        title="Copiar link do Portal"
                        onClick={() => copyPublicLink(p.id)}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                      {p.status !== "accepted" && p.status !== "rejected" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-green-700 hover:text-green-800 hover:bg-green-50"
                              title="Marcar como aceita"
                              disabled={acceptingId === p.id}
                            >
                              {acceptingId === p.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <CheckSquare className="h-3.5 w-3.5" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[160px]">
                            <DropdownMenuItem onClick={() => handleAcceptProposal(p.id, "whatsapp")}>
                              <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
                              Via WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAcceptProposal(p.id, "manual")}>
                              <CheckSquare className="h-4 w-4 mr-2 text-blue-600" />
                              Manualmente
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Studio de Propostas — construtor visual por empresa */}
      <Dialog open={proposalBuilderEditorOpen} onOpenChange={setProposalBuilderEditorOpen}>
        <DialogContent className="h-[94vh] w-[calc(100vw-24px)] max-w-none overflow-hidden p-0 sm:h-[94vh] sm:w-[calc(100vw-32px)] sm:max-w-[calc(100vw-32px)] sm:p-0 xl:w-[96vw] xl:max-w-[96vw]">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="h-4 w-4" />
                  Studio de Propostas
                </DialogTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Crie o padrão comercial desta empresa e reutilize em todas as próximas propostas.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={proposalBuilderPreviewDevice === "desktop" ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setProposalBuilderPreviewDevice("desktop")}
                >
                  Desktop
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={proposalBuilderPreviewDevice === "mobile" ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setProposalBuilderPreviewDevice("mobile")}
                >
                  Mobile
                </Button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(420px,1fr)_330px]">
              <aside className="min-h-0 overflow-y-auto border-r bg-muted/10 p-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Nome do modelo</label>
                  <Input
                    value={proposalBuilderEditorName}
                    onChange={(e) => setProposalBuilderEditorName(e.target.value)}
                    placeholder="Ex.: CasaForte · Residencial Premium"
                    className="h-9"
                  />
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold">Estrutura</p>
                  <p className="text-[10px] text-muted-foreground">Arraste para ordenar. Desative ou remova blocos opcionais.</p>
                </div>

                <div className="mt-2 space-y-1.5">
                  {proposalBuilderEditorModules.map((module, index) => (
                    <div
                      key={module.key}
                      draggable
                      onDragStart={() => setProposalBuilderDraggedIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (proposalBuilderDraggedIndex != null) reorderProposalBuilderModule(proposalBuilderDraggedIndex, index);
                        setProposalBuilderDraggedIndex(null);
                      }}
                      onDragEnd={() => setProposalBuilderDraggedIndex(null)}
                      className={`group flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 ${
                        proposalBuilderDraggedIndex === index ? "opacity-50 ring-2 ring-primary/20" : ""
                      }`}
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium">{PROPOSAL_MODULE_LABELS[module.key] ?? module.key}</p>
                      </div>
                      <Switch
                        checked={module.required ? true : module.enabled !== false}
                        disabled={module.required}
                        onCheckedChange={(checked) => toggleProposalBuilderModule(index, checked)}
                      />
                      {!module.required && (
                        <button
                          type="button"
                          className="hidden text-muted-foreground hover:text-destructive group-hover:block"
                          title="Remover bloco"
                          onClick={() => removeProposalBuilderModule(module.key)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-dashed bg-background p-3">
                  <p className="text-xs font-semibold">Adicionar bloco</p>
                  <div className="mt-2 grid gap-1.5">
                    {proposalBuilderAvailableModules.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground">Todos os blocos disponíveis já estão no modelo.</p>
                    ) : proposalBuilderAvailableModules.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className="flex items-center justify-between rounded-md border px-2.5 py-2 text-left text-[11px] hover:bg-muted"
                        onClick={() => addProposalBuilderModule(key)}
                      >
                        <span>{label}</span>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              </aside>

              <main className="min-h-0 overflow-auto bg-[#eceff3] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold">Proposta para editar e organizar</p>
                    <p className="text-[10px] text-muted-foreground">
                      Prévia com os dados reais do orçamento selecionado. Arraste os blocos diretamente na proposta ou use as setas.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{proposalBuilderEditorPreset.replace(/_/g, " ")}</Badge>
                    <Badge variant="outline">{proposalBuilderPreviewClient}</Badge>
                  </div>
                </div>

                <div
                  className={`mx-auto min-h-[720px] overflow-hidden border bg-white shadow-xl transition-all ${
                    proposalBuilderPreviewDevice === "mobile" ? "w-[390px] rounded-[24px]" : "w-full max-w-[980px] rounded-xl"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setProposalBuilderSelectedModuleKey("capa")}
                    className={`block w-full text-left ${
                      proposalBuilderSelectedModuleKey === "capa" ? "ring-2 ring-inset ring-primary/50" : ""
                    }`}
                  >
                    <div className={`relative overflow-hidden ${
                      proposalBuilderEditorPreset === "premium_arquitetonico"
                        ? "bg-slate-950 text-white"
                        : proposalBuilderEditorPreset === "corporativo"
                          ? "bg-slate-900 text-white"
                          : proposalBuilderEditorPreset === "minimalista"
                            ? "bg-white text-slate-950"
                            : "bg-slate-100 text-slate-950"
                    }`}>
                      {proposalHouseStandard !== "medio" && selectedOrcamento?.apresentacao?.imagemCapa ? (
                        <img src={selectedOrcamento.apresentacao.imagemCapa} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
                      ) : null}
                      <div className={`relative p-7 ${
                        proposalBuilderDensity === "compacto" ? "py-6" : proposalBuilderDensity === "equilibrado" ? "py-9" : "py-12"
                      }`}>
                        <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.18em]">
                          <span className="flex items-center gap-2">
                            {proposalBuilderPreviewLogo ? <img src={proposalBuilderPreviewLogo} alt="" className="h-7 max-w-[120px] object-contain" /> : null}
                            {!proposalBuilderPreviewLogo ? proposalBuilderPreviewCompany : null}
                          </span>
                          <span>Proposta comercial</span>
                        </div>
                        <div className="mt-12 max-w-[700px]">
                          <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">{proposalBuilderHeroVariant}</p>
                          <h2 className={`mt-2 font-black tracking-tight ${
                            proposalBuilderPreviewDevice === "mobile" ? "text-4xl" : "text-6xl"
                          }`}>
                            {proposalBuilderPreviewTitle.replace(/^Orçamento\s*[—-]?\s*/i, "")}
                          </h2>
                          <p className="mt-3 text-sm opacity-80">Cliente: {proposalBuilderPreviewClient}</p>
                          <div className="mt-5 flex flex-wrap gap-2 text-xs">
                            {proposalBuilderPreviewTotal > 0 && <span className="rounded-full border border-current/20 px-3 py-1.5">{proposalBuilderMoney(proposalBuilderPreviewTotal)}</span>}
                            {proposalBuilderPreviewDeadline && <span className="rounded-full border border-current/20 px-3 py-1.5">{proposalBuilderPreviewDeadline}</span>}
                            <span className="rounded-full border border-current/20 px-3 py-1.5">{selectedOrcamentoStages.length} etapas</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className={`space-y-3 ${
                    proposalBuilderDensity === "compacto" ? "p-4" : proposalBuilderDensity === "equilibrado" ? "p-6" : "p-8"
                  }`}>
                    {proposalBuilderEditorModules
                      .filter((module) => module.enabled !== false && module.key !== "capa")
                      .map((module, index) => (
                        <div
                          key={module.key}
                          draggable
                          onDragStart={() => setProposalBuilderDraggedIndex(proposalBuilderEditorModules.findIndex((item) => item.key === module.key))}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            const to = proposalBuilderEditorModules.findIndex((item) => item.key === module.key);
                            if (proposalBuilderDraggedIndex != null && to >= 0) reorderProposalBuilderModule(proposalBuilderDraggedIndex, to);
                            setProposalBuilderDraggedIndex(null);
                          }}
                          onDragEnd={() => setProposalBuilderDraggedIndex(null)}
                          onClick={() => setProposalBuilderSelectedModuleKey(module.key)}
                          className={`group relative cursor-pointer rounded-xl border bg-white p-4 transition ${
                            proposalBuilderSelectedModuleKey === module.key ? "border-primary ring-2 ring-primary/20" : "hover:border-slate-300"
                          }`}
                        >
                          <div className="absolute right-2 top-2 z-10 hidden items-center gap-1 rounded-md border bg-white/95 p-1 shadow-sm group-hover:flex">
                            <button type="button" className="rounded p-1 hover:bg-muted" title="Subir bloco" onClick={(e) => { e.stopPropagation(); proposalBuilderMoveModule(module.key, -1); }}><ChevronUp className="h-3.5 w-3.5" /></button>
                            <button type="button" className="rounded p-1 hover:bg-muted" title="Descer bloco" onClick={(e) => { e.stopPropagation(); proposalBuilderMoveModule(module.key, 1); }}><ChevronDown className="h-3.5 w-3.5" /></button>
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>

                          <div className="pr-20">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {PROPOSAL_MODULE_LABELS[module.key] ?? module.key}
                            </p>
                          </div>

                          <div className="mt-3">
                            {module.key === "resumo_executivo" ? (
                              <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] text-muted-foreground">Investimento</p><p className="mt-1 text-sm font-bold">{proposalBuilderMoney(proposalBuilderPreviewTotal)}</p></div>
                                <div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] text-muted-foreground">Prazo</p><p className="mt-1 text-sm font-bold">{proposalBuilderPreviewDeadline || "A definir"}</p></div>
                                <div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] text-muted-foreground">Etapas</p><p className="mt-1 text-sm font-bold">{selectedOrcamentoStages.length}</p></div>
                              </div>
                            ) : module.key === "apresentacao_empresa" ? (
                              <div><h3 className="text-lg font-semibold">{proposalBuilderPreviewCompany}</h3><p className="mt-1 text-sm text-muted-foreground">Apresentação institucional, diferenciais e posicionamento da empresa.</p></div>
                            ) : module.key === "diferenciais" ? (
                              <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-slate-950 p-3 text-xs text-white">Qualidade e execução</div><div className="rounded-lg bg-slate-950 p-3 text-xs text-white">Gestão e transparência</div></div>
                            ) : module.key === "etapas_orcamento" ? (
                              <div className={`grid gap-2 ${proposalBuilderStageVariant === "cards" && proposalBuilderPreviewDevice === "desktop" ? "grid-cols-2" : "grid-cols-1"}`}>
                                {selectedOrcamentoStages.slice(0, 6).map((stage) => (
                                  <div key={stage.id} className="overflow-hidden rounded-lg border bg-muted/20">
                                    {selectedStageImages[stage.id] ? <img src={selectedStageImages[stage.id]} alt="" className="h-24 w-full object-cover" /> : null}
                                    <div className="p-3 text-xs">
                                      <p className="font-semibold">{stage.ordem}. {stage.nome}</p>
                                      <p className="mt-1 text-muted-foreground">{proposalBuilderMoney(stage.total)}</p>
                                    </div>
                                  </div>
                                ))}
                                {!selectedOrcamentoStages.length && <p className="text-xs text-muted-foreground">O orçamento selecionado ainda não possui etapas estruturadas.</p>}
                              </div>
                            ) : module.key === "imagem_por_etapa" || module.key === "cases_provas" ? (
                              <div className={`grid gap-2 ${proposalBuilderImageEmphasis === "alta" && proposalBuilderPreviewDevice === "desktop" ? "grid-cols-3" : "grid-cols-2"}`}>
                                {selectedOrcamentoStages.filter((stage) => selectedStageImages[stage.id]).slice(0, 6).map((stage) => (
                                  <div key={stage.id} className="overflow-hidden rounded-lg border"><img src={selectedStageImages[stage.id]} alt={stage.nome} className="h-28 w-full object-cover" /><p className="p-2 text-[10px] font-medium">{stage.nome}</p></div>
                                ))}
                                {!selectedOrcamentoStages.some((stage) => selectedStageImages[stage.id]) && <div className="col-span-full rounded-lg border border-dashed p-4 text-xs text-muted-foreground">Nenhuma imagem específica de etapa vinculada.</div>}
                              </div>
                            ) : module.key === "tabela_itens" ? (
                              <div className="overflow-hidden rounded-lg border text-xs">
                                {Array.isArray(selectedOrcamento?.itens) && selectedOrcamento.itens.slice(0, 6).map((item: any, i: number) => (
                                  <div key={i} className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 last:border-b-0"><span>{item.nome}</span><strong>{proposalBuilderMoney(Number(item.quantidade || 0) * Number(item.valorUnitario || 0))}</strong></div>
                                ))}
                              </div>
                            ) : module.key === "cronograma" || module.key === "fisico_financeiro" ? (
                              <div className="space-y-2">
                                {selectedOrcamentoStages.slice(0, 6).map((stage, n) => {
                                  const pct = proposalBuilderPreviewTotal > 0 ? Math.max(4, Math.min(100, stage.total / proposalBuilderPreviewTotal * 100)) : 10 + n * 10;
                                  return <div key={stage.id} className="grid grid-cols-[minmax(90px,180px)_1fr_100px] items-center gap-2 text-[10px]"><span className="truncate">{stage.nome}</span><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div><span className="text-right">{proposalBuilderMoney(stage.total)}</span></div>;
                                })}
                              </div>
                            ) : module.key === "condicoes_comerciais" || module.key === "validade_inicio" ? (
                              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                                <div className="rounded-lg bg-muted/40 p-3"><span className="text-muted-foreground">Valor global</span><strong className="mt-1 block">{proposalBuilderMoney(proposalBuilderPreviewTotal)}</strong></div>
                                <div className="rounded-lg bg-muted/40 p-3"><span className="text-muted-foreground">Prazo</span><strong className="mt-1 block">{proposalBuilderPreviewDeadline || "A definir"}</strong></div>
                              </div>
                            ) : module.key === "escopo" ? (
                              <div className="space-y-1 text-xs text-muted-foreground">{selectedOrcamentoStages.slice(0, 5).map((stage) => <p key={stage.id}>• {stage.nome}</p>)}</div>
                            ) : module.key === "aceite" ? (
                              <div className="space-y-4 text-xs"><p>Li e concordo com as condições desta proposta.</p><div className="grid grid-cols-[1fr_160px] gap-4"><div className="border-b py-3 text-muted-foreground">Nome / assinatura</div><div className="border-b py-3 text-muted-foreground">Data</div></div><Button size="sm" className="pointer-events-none">Aprovar proposta</Button></div>
                            ) : module.key === "portal_cliente" ? (
                              <div className="rounded-lg bg-slate-950 p-4 text-white"><p className="text-sm font-semibold">Portal do Cliente</p><p className="mt-1 text-xs text-white/70">Cronograma, documentos, acompanhamento e atualizações após a aprovação.</p></div>
                            ) : module.key === "anexos" ? (
                              <div className="space-y-2 text-xs">{proposalAttachments.length ? proposalAttachments.slice(0, 5).map((item) => <div key={item.url} className="rounded-lg border p-2">{item.nome}</div>) : <p className="text-muted-foreground">Nenhum anexo selecionado nesta proposta.</p>}</div>
                            ) : module.key === "faq" ? (
                              <div className="space-y-2 text-xs"><div className="rounded-lg border p-3"><strong>Como funciona?</strong><p className="mt-1 text-muted-foreground">Conteúdo definido pelo modelo e pela IA da empresa.</p></div><div className="rounded-lg border p-3"><strong>O que está incluso?</strong><p className="mt-1 text-muted-foreground">Informações ligadas ao orçamento selecionado.</p></div></div>
                            ) : module.key === "produto_servico" ? (
                              <div><h3 className="text-base font-semibold">{proposalBuilderPreviewTitle}</h3><p className="mt-1 text-xs text-muted-foreground">Produto ou serviço principal desta proposta.</p></div>
                            ) : module.key === "curiosidades_conteudo" ? (
                              <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground">Conteúdo educativo, curiosidades e informações que ajudam o cliente a entender melhor a solução.</div>
                            ) : (
                              <div className="space-y-2"><div className="h-2.5 w-4/5 rounded bg-muted" /><div className="h-2.5 w-full rounded bg-muted" /><div className="h-2.5 w-3/5 rounded bg-muted" /></div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </main>

              <aside className="min-h-0 overflow-y-auto border-l bg-background p-4">
                <div>
                  <p className="text-xs font-semibold">Design do modelo</p>
                  <p className="text-[10px] text-muted-foreground">Configurações salvas para a empresa.</p>
                </div>

                <div className="mt-3 space-y-3 rounded-xl border p-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Preset visual</label>
                    <Select value={proposalBuilderEditorPreset} onValueChange={(value) => setProposalBuilderEditorPreset(value as any)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="premium_arquitetonico">Premium arquitetônico</SelectItem>
                        <SelectItem value="corporativo">Corporativo</SelectItem>
                        <SelectItem value="catalogo_comercial">Catálogo comercial</SelectItem>
                        <SelectItem value="minimalista">Minimalista</SelectItem>
                        <SelectItem value="tecnico">Técnico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Capa</label><Select value={proposalBuilderHeroVariant} onValueChange={(value) => setProposalBuilderHeroVariant(value as any)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fotografico">Fotográfica</SelectItem><SelectItem value="minimalista">Minimalista</SelectItem><SelectItem value="institucional">Institucional</SelectItem><SelectItem value="produto">Produto</SelectItem></SelectContent></Select></div>
                    <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Etapas</label><Select value={proposalBuilderStageVariant} onValueChange={(value) => setProposalBuilderStageVariant(value as any)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cards">Cards</SelectItem><SelectItem value="accordion">Expansível</SelectItem><SelectItem value="timeline">Timeline</SelectItem><SelectItem value="lista_tecnica">Lista técnica</SelectItem></SelectContent></Select></div>
                    <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Investimento</label><Select value={proposalBuilderInvestmentVariant} onValueChange={(value) => setProposalBuilderInvestmentVariant(value as any)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="valor_global">Valor global</SelectItem><SelectItem value="por_etapa">Por etapa</SelectItem><SelectItem value="por_item">Por item</SelectItem></SelectContent></Select></div>
                    <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Densidade</label><Select value={proposalBuilderDensity} onValueChange={(value) => setProposalBuilderDensity(value as any)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="arejado">Arejado</SelectItem><SelectItem value="equilibrado">Equilibrado</SelectItem><SelectItem value="compacto">Compacto</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Ênfase em imagens</label><Select value={proposalBuilderImageEmphasis} onValueChange={(value) => setProposalBuilderImageEmphasis(value as any)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="alta">Alta</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="baixa">Baixa</SelectItem></SelectContent></Select></div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold">Regras da IA</p>
                  <div className="mt-2 space-y-2">
                    <Input value={proposalBuilderTone} onChange={(e) => setProposalBuilderTone(e.target.value)} placeholder="Tom da proposta" className="h-8 text-xs" />
                    <Input value={proposalBuilderTechnicalLevel} onChange={(e) => setProposalBuilderTechnicalLevel(e.target.value)} placeholder="Nível técnico" className="h-8 text-xs" />
                    <Textarea value={proposalBuilderImageRules} onChange={(e) => setProposalBuilderImageRules(e.target.value)} placeholder="Regras de imagens — uma por linha" className="min-h-[90px] text-xs" />
                    <Textarea value={proposalBuilderContentRules} onChange={(e) => setProposalBuilderContentRules(e.target.value)} placeholder="Regras de conteúdo — uma por linha" className="min-h-[90px] text-xs" />
                    <Textarea value={proposalBuilderAvoidRules} onChange={(e) => setProposalBuilderAvoidRules(e.target.value)} placeholder="O que evitar — uma regra por linha" className="min-h-[80px] text-xs" />
                  </div>
                </div>
              </aside>
            </div>

            <DialogFooter className="border-t px-5 py-3">
              <div className="mr-auto text-[10px] text-muted-foreground">
                As alterações afetam novas propostas que utilizarem este modelo; valores continuam vindo do orçamento selecionado.
              </div>
              <Button variant="outline" onClick={() => setProposalBuilderEditorOpen(false)} disabled={proposalBuilderEditorSaving}>Cancelar</Button>
              <Button onClick={saveProposalBuilderEditor} disabled={proposalBuilderEditorSaving || proposalBuilderEditorModules.length === 0} className="gap-1.5">
                {proposalBuilderEditorSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar modelo da empresa
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refinement Dialog */}
      <Dialog open={refineOpen} onOpenChange={setRefineOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              {refineFromVersion != null
                ? `Melhorar proposta v${refineFromVersion}`
                : "Gerar proposta"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              {refineFromVersion != null
                ? "Descreva o que deve mudar na nova versão. A IA vai gerar uma versão melhorada com suas instruções."
                : "Adicione instruções opcionais para personalizar a proposta. Deixe em branco para gerar automaticamente."}
            </p>

            {/* Quick-pick chips */}
            <div className="flex flex-wrap gap-1.5">
              {[
                "Tom mais formal",
                "Tom mais direto e descontraído",
                "Foco no custo-benefício",
                "Destaque o prazo de entrega",
                "Reforce os diferenciais",
                "Seja mais conciso",
                "Abordagem mais técnica",
                "Mais ênfase nos resultados",
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() =>
                    setRefineNotes((prev) =>
                      prev.trim()
                        ? `${prev.trim()}\
${chip}`
                        : chip
                    )
                  }
                  className="text-xs px-2.5 py-1 rounded-full border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                >
                  + {chip}
                </button>
              ))}
            </div>

            <Textarea
              placeholder="Ex: Use tom mais formal. Destaque a garantia de 12 meses. Inclua um CTA mais urgente no final."
              value={refineNotes}
              onChange={(e) => setRefineNotes(e.target.value)}
              rows={4}
              className="text-sm resize-none"
            />
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefineOpen(false)}
            >
              Cancelar
            </Button>
            {refineFromVersion == null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => generateProposal(undefined)}
                disabled={generating}
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Gerar sem instruções
              </Button>
            )}
            <Button
              size="sm"
              className="gap-1.5 bg-violet-600 hover:bg-violet-700"
              onClick={() => generateProposal(refineNotes || undefined)}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {refineFromVersion != null ? "Gerar versão melhorada" : "Gerar proposta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={(open) => { if (!open) { cancelEditMode(); setPreviewOpen(false); } }}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-4">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Pré-visualização — Proposta v{activeVersion}
                {editMode && (
                  <span className="ml-1 text-[10px] font-normal bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-2 py-0.5 rounded-full">
                    Modo edição — clique em qualquer texto para editar
                  </span>
                )}
              </DialogTitle>
              {!editMode ? (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 mr-6" onClick={enterEditMode}>
                  <PencilLine className="h-3.5 w-3.5" />
                  Editar texto
                </Button>
              ) : (
                <div className="flex items-center gap-2 mr-6">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-muted-foreground" onClick={cancelEditMode} disabled={editSaving}>
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={saveEditedHtml} disabled={editSaving || !editDirty}>
                    {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {editSaving ? "Salvando…" : "Salvar edições"}
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded border overflow-hidden">
            {previewHtml ? (
              <iframe
                ref={iframeRef}
                title="Preview"
                srcDoc={injectScreenStyles(editMode && editableHtml ? editableHtml : (previewHtml ?? ""))}
                className="w-full h-full"
                sandbox="allow-same-origin allow-scripts"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Carregando...
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {!editMode && (
              <>
                <Button variant="outline" size="sm" className="gap-1"
                  onClick={() => activeVersion && downloadProposal(activeVersion, "html")}>
                  <Download className="h-3.5 w-3.5" />
                  Download HTML
                </Button>
                <Button variant="outline" size="sm" className="gap-1"
                  onClick={() => activeVersion && downloadProposal(activeVersion, "pdf")}>
                  <FileText className="h-3.5 w-3.5" />
                  Download PDF
                </Button>
              </>
            )}
            <Button size="sm" variant={editMode ? "outline" : "default"} onClick={() => { cancelEditMode(); setPreviewOpen(false); }}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
