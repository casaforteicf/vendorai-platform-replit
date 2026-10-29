import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { normalizeTenantLogoUrl } from "@/components/TenantBrand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { OrcamentoRevisoesCard } from "@/components/OrcamentoRevisoesCard";
import { BudgetContractualEditor } from "@/components/BudgetContractualEditor";
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
  MoreHorizontal,
  ListChecks,
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
  css.id='__proposta_editor_style__';
  document.head.appendChild(css);

  var sendTimer=null;
  function send(){
    // Only notify the parent that the document changed. Sending the whole HTML
    // here made React replace iframe.srcDoc on every keystroke, which reloaded
    // the preview and kicked the user back to the top.
    window.parent.postMessage({type:'proposta-edit-dirty'},'*');
  }
  function scheduleSend(){
    if(sendTimer)clearTimeout(sendTimer);
    sendTimer=setTimeout(send,120);
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
    el.addEventListener('input',scheduleSend);
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
  onCreateBudget?: () => void;
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

type ProposalStageVisualHint = {
  visualType: string;
  label: string;
  description: string;
  suggestions: string[];
};

function proposalStageVisualHint(stageName: string): ProposalStageVisualHint {
  const name = String(stageName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/projeto|legaliza|aprovacao|alvara|documentacao|arquitet/.test(name)) {
    return {
      visualType: "planejamento_aprovacao",
      label: "Planejamento, projeto e aprovação",
      description: "A imagem deve mostrar plantas, documentação, análise técnica e interação profissional — não obra pesada.",
      suggestions: [
        "Mostrar planta e documentação",
        "Reunião técnica com cliente",
        "Aprovação e legalização",
        "Arquiteto e engenheiro analisando projeto",
      ],
    };
  }
  if (/servicos preliminares|limpeza do terreno|canteiro|sondagem|spt|locacao/.test(name)) {
    return {
      visualType: "preparacao_inicial",
      label: "Preparação inicial da obra",
      description: "Mostrar limpeza, locação, canteiro, gabarito ou sondagem conforme o escopo.",
      suggestions: ["Preparação do terreno", "Locação da obra", "Organização do canteiro", "Mais técnico"],
    };
  }
  if (/terraplen|movimentacao de terra|nivelamento/.test(name)) {
    return {
      visualType: "movimento_terra",
      label: "Movimentação de terra",
      description: "Mostrar escavação, nivelamento ou compactação com equipamento coerente.",
      suggestions: ["Máquinas em operação", "Nivelamento do terreno", "Preparação do solo", "Mais realista"],
    };
  }
  if (/radier|fundac|sapata|baldrame|estaca/.test(name)) {
    return {
      visualType: "fundacao",
      label: "Fundação",
      description: "Mostrar somente o sistema de fundação realmente previsto no escopo.",
      suggestions: ["Ferragem e formas", "Base estrutural", "Execução técnica da fundação", "Mais detalhado"],
    };
  }
  if (/laje/.test(name)) {
    return {
      visualType: "laje",
      label: "Laje",
      description: "Mostrar execução da laje conforme o sistema previsto.",
      suggestions: ["Execução da laje", "Ferragem e formas", "Mais técnico", "Mais realista"],
    };
  }
  if (/cobertura|telha|rufo|calha|telhado/.test(name)) {
    return {
      visualType: "cobertura",
      label: "Cobertura",
      description: "Mostrar telhado, estrutura, telhas, rufos ou calhas conforme o escopo.",
      suggestions: ["Estrutura do telhado", "Montagem da cobertura", "Mais comercial", "Mais técnico"],
    };
  }
  if (/hidraul|hidrossanit|tubulacao|esgoto|agua|pex|cisterna|boiler|pressur/.test(name)) {
    return {
      visualType: "instalacao_hidraulica",
      label: "Instalações hidráulicas",
      description: "Mostrar tubulações, conexões, shafts e pontos hidráulicos coerentes.",
      suggestions: ["Tubulações aparentes", "Pontos hidráulicos", "Infraestrutura técnica", "Mais detalhado"],
    };
  }
  if (/eletric|quadro|cabo|eletroduto|corrugad|fiacao|iluminacao/.test(name)) {
    return {
      visualType: "instalacao_eletrica",
      label: "Instalações elétricas",
      description: "Mostrar eletrodutos, caixas, cabeamento e quadro elétrico coerentes.",
      suggestions: ["Eletrodutos e pontos", "Infraestrutura elétrica", "Mais técnico", "Mais detalhado"],
    };
  }
  if (/esquadria|porta|janela/.test(name)) {
    return {
      visualType: "esquadrias",
      label: "Esquadrias",
      description: "Mostrar instalação ou detalhe técnico-comercial da esquadria prevista.",
      suggestions: ["Instalação de esquadrias", "Detalhe de portas e janelas", "Mais premium", "Mais comercial"],
    };
  }
  if (/porcelanato|revestimento|ceramica/.test(name)) {
    return {
      visualType: "revestimento_acabamento",
      label: "Revestimentos",
      description: "Mostrar aplicação e acabamento do revestimento real da etapa.",
      suggestions: ["Aplicação de revestimentos", "Acabamento interno", "Mais premium", "Mais comercial"],
    };
  }
  if (/forro.*pintura|pintura.*forro/.test(name)) {
    return {
      visualType: "acabamento_interno",
      label: "Forro e pintura",
      description: "Mostrar acabamento de forro e paredes, sem desviar para estrutura ou fachada.",
      suggestions: ["Forro de gesso", "Parede pintada", "Acabamento premium", "Mais realista"],
    };
  }
  if (/forro|gesso/.test(name)) {
    return {
      visualType: "forro",
      label: "Forro",
      description: "Mostrar forro, recortes, sancas e detalhes de execução coerentes.",
      suggestions: ["Forro de gesso", "Detalhe de acabamento", "Mais técnico", "Mais premium"],
    };
  }
  if (/massa corrida|pintura/.test(name)) {
    return {
      visualType: "pintura",
      label: "Pintura",
      description: "Mostrar preparação ou acabamento de pintura com foco na superfície.",
      suggestions: ["Preparação de parede", "Pintura final", "Mais premium", "Mais realista"],
    };
  }
  if (/icf|estrutura|elevacao|paredes/.test(name)) {
    return {
      visualType: "estrutura",
      label: "Estrutura",
      description: "Mostrar o sistema estrutural real da etapa, sem inventar outro método.",
      suggestions: ["Montagem estrutural", "Paredes em execução", "Mostrar sistema construtivo", "Mais técnico"],
    };
  }
  if (/limpeza final|entrega/.test(name)) {
    return {
      visualType: "entrega_final",
      label: "Limpeza final e entrega",
      description: "Mostrar ambiente concluído, limpo e pronto para uso.",
      suggestions: ["Ambiente finalizado", "Entrega ao cliente", "Mais comercial", "Mais premium"],
    };
  }

  return {
    visualType: "etapa_generica",
    label: "Etapa do orçamento",
    description: "A imagem deve seguir o nome e o escopo real desta etapa, sem usar cena genérica incompatível.",
    suggestions: ["Mais técnico", "Mais comercial", "Mais realista"],
  };
}

const BASE = typeof import.meta.env !== "undefined" && import.meta.env.BASE_URL
  ? import.meta.env.BASE_URL.replace(/\/$/, "")
  : "";

function api(path: string) {
  return `${BASE}${path}`;
}

export default function LeadPropostaTab({ leadId, tenantId, lead, onCreateBudget }: LeadPropostaTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("vendorai_token") ?? "";

  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [proposalSourcesOpen, setProposalSourcesOpen] = useState(false);
  const [proposalSourcesLoading, setProposalSourcesLoading] = useState(false);
  const [proposalSources, setProposalSources] = useState<any>(null);
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
  const [proposalAppearanceOpen, setProposalAppearanceOpen] = useState(false);
  const [proposalAttachmentsOpen, setProposalAttachmentsOpen] = useState(false);
  const [proposalAdvancedOpen, setProposalAdvancedOpen] = useState(false);
  const [proposalStagesOpen, setProposalStagesOpen] = useState(false);
  const [proposalVisualCenterOpen, setProposalVisualCenterOpen] = useState(false);
  const [proposalFallbackLibraryOpen, setProposalFallbackLibraryOpen] = useState(false);
  const [proposalModelOpen, setProposalModelOpen] = useState(false);
  const [proposalDraftSavedAt, setProposalDraftSavedAt] = useState<string | null>(null);

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
    modules?: Array<{
      key: string;
      enabled?: boolean;
      order?: number;
      required?: boolean;
      title?: string;
      description?: string;
      dataSource?: "tenant" | "budget" | "client" | "catalog" | "manual" | "mixed";
      contentPrompt?: string;
      image?: {
        mode?: "none" | "manual" | "library" | "ai" | "automatic";
        url?: string;
        prompt?: string;
        aspectRatio?: "16:9" | "4:3" | "1:1";
        fit?: "cover" | "contain";
        position?: "center" | "top" | "bottom" | "left" | "right";
        overlay?: number;
      };
    }>;
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
  const activeProposalBuilderTemplate =
    proposalBuilderTemplates.find((item) => item.id === activeProposalBuilderTemplateId)
    ?? proposalBuilderTemplates.find((item) => item.isDefault)
    ?? proposalBuilderTemplates[0]
    ?? null;
  const normalizeProposalTemplateName = (value: unknown) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const canonicalConstructionTemplateNames = new Set([
    "casa alto padrao",
    "casa medio padrao",
    "casa etapa cinza",
    "piscina icf",
    "somente formas icf",
  ]);
  const hasCanonicalConstructionTemplates = proposalBuilderTemplates.some((item) =>
    canonicalConstructionTemplateNames.has(normalizeProposalTemplateName(item.name)),
  );
  const proposalBuilderTemplatesForSelection = proposalBuilderTemplates.filter((item) => {
    if (item.id === activeProposalBuilderTemplate?.id) return false;
    if (!hasCanonicalConstructionTemplates) return true;
    const normalized = normalizeProposalTemplateName(item.name);
    if (canonicalConstructionTemplateNames.has(normalized)) return true;
    return !/(proposta de construcao|obra proposta completa|proposta comercial padrao)/.test(normalized);
  });
  const [selectedProposalBuilderTemplateId, setSelectedProposalBuilderTemplateId] = useState<string>("__auto__");
  const [generatingProposalBuilderTemplate, setGeneratingProposalBuilderTemplate] = useState(false);
  const [proposalBuilderAIBrief, setProposalBuilderAIBrief] = useState("");
  const [proposalBuilderEditorOpen, setProposalBuilderEditorOpen] = useState(false);
  const [proposalBuilderEditorTemplateId, setProposalBuilderEditorTemplateId] = useState<string | null>(null);
  const [proposalBuilderEditorSaving, setProposalBuilderEditorSaving] = useState(false);
  const [proposalBuilderTemplateAction, setProposalBuilderTemplateAction] = useState<"duplicate" | "default" | null>(null);
  const [proposalBuilderPreviewDevice, setProposalBuilderPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [proposalBuilderPreviewMode, setProposalBuilderPreviewMode] = useState<"template" | "budget">("template");
  const [proposalBuilderSelectedModuleKey, setProposalBuilderSelectedModuleKey] = useState<string | null>(null);
  const [proposalBuilderGeneratingModuleImage, setProposalBuilderGeneratingModuleImage] = useState<string | null>(null);
  const [proposalBuilderDevelopingPage, setProposalBuilderDevelopingPage] = useState<string | null>(null);
  const [proposalBuilderPageAIInstruction, setProposalBuilderPageAIInstruction] = useState("");
  const [proposalBuilderAdvancedOpen, setProposalBuilderAdvancedOpen] = useState(false);
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
    Array<{
      key: string;
      enabled?: boolean;
      order?: number;
      required?: boolean;
      title?: string;
      description?: string;
      dataSource?: "tenant" | "budget" | "client" | "catalog" | "manual" | "mixed";
      contentPrompt?: string;
      image?: { mode?: "none" | "manual" | "library" | "ai" | "automatic"; url?: string; prompt?: string; aspectRatio?: "16:9" | "4:3" | "1:1"; fit?: "cover" | "contain"; position?: "center" | "top" | "bottom" | "left" | "right"; overlay?: number };
    }>
  >([]);
  const [proposalBuilderDraggedIndex, setProposalBuilderDraggedIndex] = useState<number | null>(null);
  const [proposalBuilderModuleImageUploading, setProposalBuilderModuleImageUploading] = useState<string | null>(null);
  const [proposalImageBankOpen, setProposalImageBankOpen] = useState(false);
  type ProposalMediaLibraryAsset = {
    id: string;
    type: string;
    storageUrl: string;
    originalFilename?: string | null;
    createdAt?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  const [proposalMediaLibraryOpen, setProposalMediaLibraryOpen] = useState(false);
  const [proposalMediaLibraryLoading, setProposalMediaLibraryLoading] = useState(false);
  const [proposalMediaLibrarySearch, setProposalMediaLibrarySearch] = useState("");
  const [proposalMediaLibraryAssets, setProposalMediaLibraryAssets] = useState<ProposalMediaLibraryAsset[]>([]);
  const proposalBuilderModuleImageInputRef = useRef<HTMLInputElement>(null);

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
  const [stageImageUploadTarget, setStageImageUploadTarget] = useState<string | null>(null);
  const [stageMediaLibraryTarget, setStageMediaLibraryTarget] = useState<string | null>(null);
  const [stageImageDialogTarget, setStageImageDialogTarget] = useState<string | null>(null);
  const [stageImageDialogPrompt, setStageImageDialogPrompt] = useState("");
  const [stageImageGeneratingTarget, setStageImageGeneratingTarget] = useState<string | null>(null);
  const [stageImageUploading, setStageImageUploading] = useState(false);
  const [coverImageUploading, setCoverImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const stageImageInputRef = useRef<HTMLInputElement>(null);
  const coverImageInputRef = useRef<HTMLInputElement>(null);

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

  type ProposalPreflightPending = {
    code: string;
    severity: "blocker" | "warning";
    source: "business_plan" | "company" | "client" | "catalog" | "budget" | "media";
    field?: string;
    message: string;
  };
  type ProposalPreflight = {
    ready: boolean;
    blockers: number;
    warnings: number;
    pending: ProposalPreflightPending[];
  };

  const { data: proposalPreflight, isFetching: proposalPreflightLoading } = useQuery<ProposalPreflight>({
    queryKey: ["proposal-preflight", leadId, selectedOrcamentoId],
    queryFn: async () => {
      if (!selectedOrcamentoId || selectedOrcamentoId === "__none__") {
        return {
          ready: false,
          blockers: 1,
          warnings: 0,
          pending: [{
            code: "BUDGET_MISSING",
            severity: "blocker" as const,
            source: "budget" as const,
            message: "Selecione um orçamento/revisão antes de gerar a proposta.",
          }],
        };
      }
      const response = await fetch(
        api(`/api/leads/${leadId}/proposal-preflight?propostaId=${encodeURIComponent(selectedOrcamentoId)}`),
        { headers },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível validar a proposta.");
      return body as ProposalPreflight;
    },
    enabled: !!leadId && !!token && selectedOrcamentoId !== "__none__",
    staleTime: 15_000,
  });
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
  const stageImageDialogStage = stageImageDialogTarget
    ? selectedOrcamentoStages.find((stage) => stage.id === stageImageDialogTarget) ?? null
    : null;
  const stageImageDialogVisualHint = stageImageDialogStage
    ? proposalStageVisualHint(stageImageDialogStage.nome)
    : null;
  const stageMediaLibraryStage = stageMediaLibraryTarget
    ? selectedOrcamentoStages.find((stage) => stage.id === stageMediaLibraryTarget) ?? null
    : null;

  function selectNextMissingStageImages() {
    const missing = selectedOrcamentoStages
      .filter((stage) => !selectedStageImages[stage.id])
      .slice(0, 3)
      .map((stage) => stage.id);
    setSelectedStageImageIds(missing);
    if (missing.length === 0) {
      toast({ title: "Todas as etapas já possuem imagem" });
    }
  }

  function applyFinancialModeToAllStages(mode: ProposalPresentationMode | "__default__") {
    if (mode === "__default__") {
      setProposalPresentationStageModes({});
      return;
    }
    setProposalPresentationStageModes(
      Object.fromEntries(selectedOrcamentoStages.map((stage) => [stage.id, mode])),
    );
  }

  function applyTechnicalVisibilityToAllStages(mode: "mostrar" | "ocultar" | "__default__") {
    if (mode === "__default__") {
      setProposalTechnicalDetailStages({});
      return;
    }
    setProposalTechnicalDetailStages(
      Object.fromEntries(selectedOrcamentoStages.map((stage) => [stage.id, mode === "mostrar"])),
    );
  }

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

  function proposalDraftStorageKey(budgetId: string) {
    return `vendorai:proposal-composer:${tenantId}:${leadId}:${budgetId}`;
  }

  function restoreProposalComposerDraft(budgetId: string) {
    if (typeof window === "undefined" || budgetId === "__none__") return;
    try {
      const raw = window.sessionStorage.getItem(proposalDraftStorageKey(budgetId));
      if (!raw) return;
      const draft = JSON.parse(raw) as Record<string, any>;
      const presentation = draft.presentation && typeof draft.presentation === "object" ? draft.presentation : null;
      if (presentation) {
        if (presentation.formato === "site_interativo" || presentation.formato === "documento" || presentation.formato === "hibrido") setProposalPresentationFormat(presentation.formato);
        if (["moderna","contemporanea","minimalista","classica","industrial"].includes(String(presentation.estiloCasa))) setProposalHouseStyle(presentation.estiloCasa);
        if (["medio","alto_padrao","luxo"].includes(String(presentation.padraoCasa))) setProposalHouseStandard(presentation.padraoCasa);
        if (presentation.tipoCasa === "terrea" || presentation.tipoCasa === "sobrado") setProposalHouseType(presentation.tipoCasa);
        if (Array.isArray(presentation.elementosVisuais)) setProposalVisualElements(presentation.elementosVisuais.filter((item: unknown): item is string => typeof item === "string"));
        if (presentation.modoPadrao) setProposalPresentationDefaultMode(normalizeProposalPresentationMode(presentation.modoPadrao));
        if (presentation.etapas && typeof presentation.etapas === "object") setProposalPresentationStageModes(presentation.etapas);
        if (typeof presentation.mostrarDetalhamentoTecnico === "boolean") setProposalShowTechnicalDetails(presentation.mostrarDetalhamentoTecnico);
        if (presentation.detalhamentoTecnicoEtapas && typeof presentation.detalhamentoTecnicoEtapas === "object") setProposalTechnicalDetailStages(presentation.detalhamentoTecnicoEtapas);
        if (typeof presentation.mostrarTotalGeral === "boolean") setProposalShowGrandTotal(presentation.mostrarTotalGeral);
        if (Number.isFinite(Number(presentation.areaTotalConstruida)) && Number(presentation.areaTotalConstruida) > 0) setProposalBuiltArea(String(presentation.areaTotalConstruida));
        if (Array.isArray(presentation.itensNaoInclusos)) setProposalExcludedText(presentation.itensNaoInclusos.filter((item: unknown) => typeof item === "string").join("\n"));
      }
      if (typeof draft.builderTemplateId === "string") setSelectedProposalBuilderTemplateId(draft.builderTemplateId);
      if (typeof draft.documentTemplateId === "string") setSelectedProposalTemplateId(draft.documentTemplateId);
      if (Array.isArray(draft.attachments)) setProposalAttachments(draft.attachments);
      if (Array.isArray(draft.images)) setProposalImages(draft.images.filter((item: unknown): item is string => typeof item === "string"));
      if (typeof draft.savedAt === "string") setProposalDraftSavedAt(draft.savedAt);
    } catch {
      // Rascunho de sessão inválido: ignora e usa os dados persistidos do orçamento.
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

    // Se o usuário voltar/recarregar a tela durante a mesma sessão, recupera ajustes ainda não gerados.
    queueMicrotask(() => restoreProposalComposerDraft(value));
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
    if (typeof window === "undefined" || selectedOrcamentoId === "__none__") return;
    const timer = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        window.sessionStorage.setItem(
          proposalDraftStorageKey(selectedOrcamentoId),
          JSON.stringify({
            presentation: currentProposalPresentation(),
            builderTemplateId: selectedProposalBuilderTemplateId,
            documentTemplateId: selectedProposalTemplateId,
            attachments: proposalAttachments,
            images: proposalImages,
            savedAt,
          }),
        );
        setProposalDraftSavedAt(savedAt);
      } catch {
        // O rascunho local é apenas uma proteção de UX; falha nele não pode bloquear a proposta.
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [
    selectedOrcamentoId,
    proposalPresentationFormat,
    proposalHouseStyle,
    proposalHouseStandard,
    proposalHouseType,
    proposalVisualElements,
    proposalPresentationDefaultMode,
    proposalPresentationStageModes,
    proposalShowTechnicalDetails,
    proposalTechnicalDetailStages,
    proposalShowGrandTotal,
    proposalBuiltArea,
    proposalExcludedText,
    selectedProposalBuilderTemplateId,
    selectedProposalTemplateId,
    proposalAttachments,
    proposalImages,
  ]);

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
      if (e.source !== iframeRef.current?.contentWindow) return;
      // srcDoc/about:srcdoc can report an opaque "null" origin in desktop/webview
      // contexts. Source validation above ties the message to this exact preview iframe.
      if (e.origin !== window.location.origin && e.origin !== "null") return;
      if (e.data?.type === "proposta-edit-dirty") {
        // Do not update editableHtml while typing: editableHtml feeds iframe.srcDoc,
        // so changing it would remount/reload the iframe and reset scroll/focus.
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
    if (typeof DOMParser === "undefined") {
      return html
        .replace(/<script id="__proposta_editor__">[\s\S]*?<\/script>/g, "")
        .replace(/<style id="__proposta_editor_style__">[\s\S]*?<\/style>/g, "")
        .replace(/<div id="__pe_bar__"[\s\S]*?<\/div>/g, "");
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.getElementById("__proposta_editor__")?.remove();
    doc.getElementById("__proposta_editor_style__")?.remove();
    doc.getElementById("__pe_bar__")?.remove();
    doc.querySelectorAll("[data-pe]").forEach((el) => {
      el.removeAttribute("data-pe");
      el.removeAttribute("contenteditable");
    });
    return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
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
    // Read directly from the same-origin srcDoc iframe so saving does not depend
    // on blur/postMessage timing. This also captures the text still being edited.
    const frameDocument = iframeRef.current?.contentDocument;
    const frameHtml = frameDocument?.documentElement?.outerHTML
      ? "<!DOCTYPE html>" + frameDocument.documentElement.outerHTML
      : null;
    const html = stripEditScript(frameHtml || editableHtml || previewHtml || "");
    if (!html || !activeVersion) return;
    setEditSaving(true);
    try {
      const res = await fetch(api(`/api/leads/${leadId}/proposals/${activeVersion}`), {
        method: "PATCH",
        headers,
        body: JSON.stringify({ htmlContent: html, createRevision: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Falha ao salvar");
      const nextVersion = Number(body.version || activeVersion);
      setPreviewHtml(html);
      setActiveVersion(nextVersion);
      setEditMode(false);
      setEditableHtml(null);
      setEditDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["listLeadProposals", leadId] });
      toast({
        title: `Revisão R${String(nextVersion).padStart(2, "0")} criada`,
        description: "A versão anterior foi preservada no histórico.",
      });
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
    return `Imagem adicional ${index + 1}`;
  }

  async function setProposalCoverFromUrl(imageUrl: string) {
    if (!selectedOrcamento?.id) return;
    try {
      const response = await fetch(api(`/api/leads/${leadId}/proposals/cover-image/manual`), {
        method: "POST",
        headers,
        body: JSON.stringify({ propostaId: selectedOrcamento.id, imageUrl }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível definir a capa.");
      await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId }) });
      toast({ title: "Imagem definida como capa da proposta" });
    } catch (error) {
      toast({
        title: "Erro ao definir capa",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
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

  async function handleCoverImageUpload(file: File) {
    if (!selectedOrcamento?.id) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione uma imagem válida.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: `${file.name} excede 10MB`, variant: "destructive" });
      return;
    }

    setCoverImageUploading(true);
    try {
      const imageUrl = await uploadImageFile(file);
      const response = await fetch(api(`/api/leads/${leadId}/proposals/cover-image/manual`), {
        method: "POST",
        headers,
        body: JSON.stringify({ propostaId: selectedOrcamento.id, imageUrl }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível definir a capa.");
      await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId }) });
      toast({ title: "Capa da proposta atualizada" });
    } catch (error) {
      toast({
        title: "Erro ao alterar capa",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCoverImageUploading(false);
    }
  }

  async function removeManualCoverImage() {
    if (!selectedOrcamento?.id) return;
    try {
      const response = await fetch(api(`/api/leads/${leadId}/proposals/cover-image/manual`), {
        method: "POST",
        headers,
        body: JSON.stringify({ propostaId: selectedOrcamento.id, imageUrl: "" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível remover a capa.");
      await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId }) });
      toast({ title: "Capa específica removida", description: "A proposta voltará a usar a capa padrão do modelo ou a biblioteca visual." });
    } catch (error) {
      toast({
        title: "Erro ao remover capa",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function applyStageImage(stageId: string, imageUrl: string) {
    if (!selectedOrcamento?.id) return;
    const response = await fetch(api(`/api/leads/${leadId}/proposals/stage-image/manual`), {
      method: "POST",
      headers,
      body: JSON.stringify({
        propostaId: selectedOrcamento.id,
        stageId,
        imageUrl,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Não foi possível vincular a imagem à etapa.");
    await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId }) });
  }

  function openStageMediaLibrary(stageId: string) {
    setStageMediaLibraryTarget(stageId);
    setProposalMediaLibrarySearch("");
    void fetchProposalMediaLibrary(true);
  }

  function openStageImageDialog(stageId: string) {
    const stage = selectedOrcamentoStages.find((item) => item.id === stageId);
    if (!stage) return;
    setStageImageDialogTarget(stageId);
    setStageImageDialogPrompt("");
  }

  async function generateSingleStageImage(stageId: string, customPrompt = "") {
    if (!selectedOrcamento?.id) return;
    const stage = selectedOrcamentoStages.find((item) => item.id === stageId);
    if (!stage) return;

    const alreadyHasImage = Boolean(selectedStageImages[stageId]);
    const userActionId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `stage-image-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setStageImageGeneratingTarget(stageId);
    try {
      const response = await fetch(api(`/api/leads/${leadId}/proposals/stage-images`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          propostaId: selectedOrcamento.id,
          stageIds: [stageId],
          userActionId,
          regenerate: alreadyHasImage,
          confirmRegenerate: alreadyHasImage,
          estiloCasa: proposalHouseStyle,
          padraoCasa: proposalHouseStandard,
          tipoCasa: proposalHouseType,
          elementosVisuais: proposalVisualElements,
          customPrompt: customPrompt.trim(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível gerar a imagem da etapa.");
      await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId }) });
      await fetchProposalMediaLibrary(true);
      setStageImageDialogTarget(null);
      setStageImageDialogPrompt("");
      toast({
        title: alreadyHasImage ? "Imagem regenerada com IA" : "Imagem gerada com IA",
        description: `Etapa: ${stage.nome}. A mídia foi vinculada à etapa e salva na Biblioteca de Mídias.`,
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar imagem",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setStageImageGeneratingTarget(null);
    }
  }

  async function handleStageImageUpload(file: File) {
    if (!stageImageUploadTarget || !selectedOrcamento?.id) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione uma imagem válida.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: `${file.name} excede 10MB`, variant: "destructive" });
      return;
    }

    setStageImageUploading(true);
    try {
      const imageUrl = await uploadImageFile(file);
      const response = await fetch(api(`/api/leads/${leadId}/proposals/stage-image/manual`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          propostaId: selectedOrcamento.id,
          stageId: stageImageUploadTarget,
          imageUrl,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível vincular a imagem à etapa.");
      await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId }) });
      toast({ title: "Imagem da etapa atualizada" });
    } catch (error) {
      toast({
        title: "Erro ao alterar imagem da etapa",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setStageImageUploading(false);
      setStageImageUploadTarget(null);
    }
  }

  async function removeManualStageImage(stageId: string) {
    if (!selectedOrcamento?.id) return;
    try {
      const response = await fetch(api(`/api/leads/${leadId}/proposals/stage-image/manual`), {
        method: "POST",
        headers,
        body: JSON.stringify({ propostaId: selectedOrcamento.id, stageId, imageUrl: "" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível remover a imagem.");
      await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId }) });
      toast({ title: "Imagem da etapa removida" });
    } catch (error) {
      toast({
        title: "Erro ao remover imagem",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
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
    if (proposalBuilderEditorOpen && proposalBuilderEditorTemplateId) {
      const editorTarget = proposalBuilderTemplates.find((item) => item.id === proposalBuilderEditorTemplateId);
      if (editorTarget) return editorTarget;
    }
    if (selectedProposalBuilderTemplateId !== "__auto__") {
      return proposalBuilderTemplates.find((item) => item.id === selectedProposalBuilderTemplateId) ?? null;
    }
    if (activeProposalBuilderTemplateId) {
      const active = proposalBuilderTemplates.find((item) => item.id === activeProposalBuilderTemplateId);
      if (active) return active;
    }
    return proposalBuilderTemplates.find((item) => item.isDefault) ?? proposalBuilderTemplates[0] ?? null;
  }

  function loadProposalBuilderEditor(template: ProposalBuilderTemplate) {
    const modules = [...(template.modules ?? [])]
      .sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999))
      .map((item, index) => ({ ...item, order: index + 1 }));
    setProposalBuilderEditorTemplateId(template.id);
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
    loadProposalBuilderEditor(template);
    setProposalBuilderPreviewMode(selectedOrcamentoId !== "__none__" ? "budget" : "template");
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

  function updateProposalBuilderModuleConfig(
    key: string,
    patch: Partial<(typeof proposalBuilderEditorModules)[number]>,
  ) {
    setProposalBuilderEditorModules((prev) =>
      prev.map((item) => item.key === key ? { ...item, ...patch } : item),
    );
  }

  function updateProposalBuilderModuleImage(
    key: string,
    patch: Partial<NonNullable<(typeof proposalBuilderEditorModules)[number]["image"]>>,
  ) {
    setProposalBuilderEditorModules((prev) =>
      prev.map((item) => item.key === key
        ? { ...item, image: { mode: item.image?.mode ?? "automatic", aspectRatio: item.image?.aspectRatio ?? "16:9", fit: item.image?.fit ?? "cover", position: item.image?.position ?? "center", overlay: Number.isFinite(Number(item.image?.overlay)) ? Number(item.image?.overlay) : 45, ...item.image, ...patch } }
        : item),
    );
  }

  function proposalMediaLibraryUrl(storageUrl: string): string {
    if (!storageUrl) return "";
    if (storageUrl.startsWith("/api/storage/objects/")) return storageUrl;
    if (storageUrl.startsWith("/objects/")) return `/api/storage/objects/${storageUrl.slice("/objects/".length)}`;
    return normalizeTenantLogoUrl(storageUrl);
  }

  async function fetchProposalMediaLibrary(force = false) {
    if (!tenantId || !token || (proposalMediaLibraryAssets.length > 0 && !force)) return;
    setProposalMediaLibraryLoading(true);
    try {
      const response = await fetch(api(`/api/tenants/${tenantId}/media/assets?type=image&limit=150`), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível abrir a Biblioteca de Mídias.");

      let assets = Array.isArray(body.assets) ? body.assets as ProposalMediaLibraryAsset[] : [];

      // Backfill de imagens já existentes em propostas antigas. Antes da regra global
      // de Biblioteca de Mídias, capa e imagens de etapas podiam ficar vinculadas apenas
      // ao orçamento/proposta. Ao abrir a Biblioteca no Studio, registramos essas mídias
      // no tenant sem gerar novamente e sem consumir IA.
      const legacyCandidates = Array.from(new Set([
        String(selectedOrcamento?.apresentacao?.imagemCapa || "").trim(),
        ...Object.values(selectedStageImages).map((url) => String(url || "").trim()),
        ...proposalImages.map((url) => String(url || "").trim()),
      ].filter(Boolean)));

      const existingUrls = new Set(
        assets
          .map((asset) => proposalMediaLibraryUrl(String(asset.storageUrl || "")))
          .filter(Boolean),
      );

      const missing = legacyCandidates.filter(
        (url) => !existingUrls.has(proposalMediaLibraryUrl(url)),
      );

      if (missing.length > 0) {
        const registered: ProposalMediaLibraryAsset[] = [];
        for (const [index, storageUrl] of missing.entries()) {
          try {
            const register = await fetch(api(`/api/tenants/${tenantId}/media/assets`), {
              method: "POST",
              headers,
              body: JSON.stringify({
                type: "image",
                role: "output",
                source: "generated",
                storageUrl,
                originalFilename: `proposta-legado-${index + 1}.jpg`,
                mimeType: "image/jpeg",
                metadata: {
                  module: "propostas",
                  importedFromExistingProposal: true,
                  propostaId: selectedOrcamento?.id ?? null,
                },
              }),
            });
            const registeredBody = await register.json().catch(() => ({}));
            if (register.ok && registeredBody.asset) registered.push(registeredBody.asset);
          } catch {
            // A imagem continua utilizável na proposta mesmo se o backfill individual falhar.
          }
        }
        if (registered.length > 0) assets = [...registered, ...assets];
      }

      setProposalMediaLibraryAssets(assets);
    } catch (error) {
      toast({
        title: "Biblioteca indisponível",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProposalMediaLibraryLoading(false);
    }
  }

  function openProposalMediaLibrary(moduleKey: string) {
    setProposalBuilderSelectedModuleKey(moduleKey);
    setProposalMediaLibraryOpen(true);
    void fetchProposalMediaLibrary();
  }

  async function handleProposalBuilderModuleImageUpload(moduleKey: string, file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione uma imagem válida.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: `${file.name} excede 10MB`, variant: "destructive" });
      return;
    }
    setProposalBuilderModuleImageUploading(moduleKey);
    try {
      const prepare = await fetch(api(`/api/tenants/${tenantId}/media/assets/request-upload`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: file.name,
          contentType: file.type || "image/jpeg",
          type: "image",
          size: file.size,
        }),
      });
      const prepared = await prepare.json().catch(() => ({}));
      if (!prepare.ok) throw new Error(prepared.error ?? "Não foi possível preparar o upload.");

      const uploadResponse = await fetch(prepared.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      if (!uploadResponse.ok) throw new Error("Falha ao enviar a imagem.");

      const register = await fetch(api(`/api/tenants/${tenantId}/media/assets`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "image",
          role: "source",
          source: "upload",
          storageUrl: prepared.objectPath,
          originalFilename: file.name,
          mimeType: file.type || "image/jpeg",
          fileSize: file.size,
          metadata: {
            uploadedFrom: "proposal_builder",
            module: "propostas",
            proposalBuilderModuleKey: moduleKey,
          },
        }),
      });
      const registered = await register.json().catch(() => ({}));
      if (!register.ok) throw new Error(registered.error ?? "Não foi possível registrar a imagem na Biblioteca.");

      const imageUrl = proposalMediaLibraryUrl(prepared.objectPath);
      updateProposalBuilderModuleImage(moduleKey, { mode: "manual", url: imageUrl });
      setProposalMediaLibraryAssets((current) => registered.asset ? [registered.asset, ...current.filter((asset) => asset.id !== registered.asset.id)] : current);
      toast({ title: "Imagem adicionada", description: "A imagem também foi salva na Biblioteca de Mídias." });
    } catch (error) {
      toast({
        title: "Erro ao adicionar imagem",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProposalBuilderModuleImageUploading(null);
      if (proposalBuilderModuleImageInputRef.current) proposalBuilderModuleImageInputRef.current.value = "";
    }
  }

  function chooseProposalBuilderModuleImage(moduleKey: string) {
    setProposalBuilderSelectedModuleKey(moduleKey);
    window.setTimeout(() => proposalBuilderModuleImageInputRef.current?.click(), 0);
  }

  async function developProposalBuilderPage(moduleKey: string, instructionOverride?: string) {
    const template = resolveProposalBuilderTemplateForEditor();
    const module = proposalBuilderEditorModules.find((item) => item.key === moduleKey);
    if (!template || !tenantId || !token || !module) return;

    const instruction = (instructionOverride ?? proposalBuilderPageAIInstruction).trim();
    setProposalBuilderDevelopingPage(moduleKey);
    try {
      const response = await fetch(api(`/api/tenants/${tenantId}/proposal-builder/templates/${template.id}/modules/${moduleKey}/develop`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          instruction,
          styleHint: [
            `preset ${proposalBuilderEditorPreset.replace(/_/g, " ")}`,
            `densidade ${proposalBuilderDensity}`,
            `ênfase em imagens ${proposalBuilderImageEmphasis}`,
          ].join(", "),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível desenvolver esta página.");

      const developed = body.module ?? {};
      const explicitImageMode =
        module.image?.mode === "manual"
        || module.image?.mode === "library"
        || module.image?.mode === "ai";
      updateProposalBuilderModuleConfig(moduleKey, {
        title: developed.title ?? module.title,
        description: developed.description ?? module.description,
        contentPrompt: developed.contentPrompt ?? module.contentPrompt,
        // Desenvolver a página com IA não pode trocar/aplicar imagem automaticamente.
        // Se o usuário já escolheu/gerou uma imagem explicitamente, ela é preservada.
        // Em modo automático, removemos URL legado e mantemos apenas a direção visual.
        image: {
          ...(module.image ?? { mode: "automatic", aspectRatio: "16:9" }),
          ...(explicitImageMode ? {} : { url: "" }),
          prompt: developed.image?.prompt ?? module.image?.prompt,
        },
      });
      setProposalBuilderPageAIInstruction("");
      toast({
        title: "Página desenvolvida com IA",
        description: "Texto e direção visual atualizados. A imagem só muda quando você escolher Biblioteca, Upload ou Gerar IA.",
      });
    } catch (error) {
      toast({
        title: "Erro ao desenvolver página",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProposalBuilderDevelopingPage(null);
    }
  }

  async function generateProposalBuilderModuleImage(moduleKey: string) {
    const template = resolveProposalBuilderTemplateForEditor();
    const module = proposalBuilderEditorModules.find((item) => item.key === moduleKey);
    if (!template || !tenantId || !token || !module) return;
    if (!window.confirm(`Gerar uma imagem padrão com IA para o bloco "${module.title || PROPOSAL_MODULE_LABELS[module.key] || module.key}"? Esta ação consome 1 geração.`)) return;
    setProposalBuilderGeneratingModuleImage(moduleKey);
    try {
      const response = await fetch(api(`/api/tenants/${tenantId}/proposal-builder/templates/${template.id}/modules/${moduleKey}/generate-image`), {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: module.image?.prompt || "" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível gerar a imagem do bloco.");
      updateProposalBuilderModuleImage(moduleKey, { mode: "ai", url: body.imageUrl });
      await queryClient.invalidateQueries({ queryKey: getGetBusinessProfileByTenantQueryKey(tenantId) });
      await fetchProposalMediaLibrary(true);
      toast({ title: "Imagem do bloco gerada", description: "A imagem foi salva no modelo e na Biblioteca de Mídias." });
    } catch (error) {
      toast({ title: "Erro ao gerar imagem", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setProposalBuilderGeneratingModuleImage(null);
    }
  }

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
            isDefault: Boolean(template.isDefault),
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

  async function duplicateProposalBuilderTemplate() {
    const template = resolveProposalBuilderTemplateForEditor();
    if (!template || !tenantId || !token) return;
    setProposalBuilderTemplateAction("duplicate");
    try {
      const response = await fetch(api(`/api/tenants/${tenantId}/proposal-builder/templates/${template.id}/duplicate`), {
        method: "POST",
        headers,
        body: JSON.stringify({ name: `${template.name} · Cópia` }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível duplicar o modelo.");
      if (body.template) loadProposalBuilderEditor(body.template as ProposalBuilderTemplate);
      await queryClient.invalidateQueries({ queryKey: getGetBusinessProfileByTenantQueryKey(tenantId) });
      toast({
        title: "Modelo duplicado",
        description: "A cópia foi criada e está aberta para edição. O modelo padrão não foi alterado.",
      });
    } catch (error) {
      toast({
        title: "Erro ao duplicar modelo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProposalBuilderTemplateAction(null);
    }
  }

  async function setProposalBuilderTemplateAsDefault() {
    const template = resolveProposalBuilderTemplateForEditor();
    if (!template || !tenantId || !token || template.isDefault) return;
    setProposalBuilderTemplateAction("default");
    try {
      const response = await fetch(api(`/api/tenants/${tenantId}/proposal-builder/templates/${template.id}/set-default`), {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível definir o modelo padrão.");
      setSelectedProposalBuilderTemplateId("__auto__");
      await queryClient.invalidateQueries({ queryKey: getGetBusinessProfileByTenantQueryKey(tenantId) });
      toast({
        title: "Modelo padrão atualizado",
        description: `${template.name} passa a ser usado automaticamente nas próximas propostas.`,
      });
    } catch (error) {
      toast({
        title: "Erro ao definir modelo padrão",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProposalBuilderTemplateAction(null);
    }
  }

  async function createProposalBuilderTemplateWithAI() {
    if (!tenantId || !token) return;
    setGeneratingProposalBuilderTemplate(true);
    try {
      const res = await fetch(api(`/api/tenants/${tenantId}/proposal-builder/templates/ai-bootstrap`), {
        method: "POST",
        headers,
        body: JSON.stringify({ instruction: proposalBuilderAIBrief.trim() || undefined }),
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

  const proposalBuilderPreviewTotal = proposalBuilderPreviewMode === "budget" ? Number(selectedOrcamento?.valorTotal ?? 0) : 1250000;
  const proposalBuilderPreviewDeadline = (() => {
    if (proposalBuilderPreviewMode !== "budget") return "Prazo conforme orçamento";
    const presentation = (selectedOrcamento?.apresentacao ?? {}) as any;
    const schedules = Object.values(presentation?.cronogramaEtapas ?? {}) as any[];
    const starts: Date[] = [];
    const ends: Date[] = [];
    const pushDate = (target: Date[], raw: unknown) => {
      if (typeof raw !== "string" || !raw.trim()) return;
      const value = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
      if (!Number.isNaN(value.getTime())) target.push(value);
    };
    schedules.forEach((schedule) => {
      pushDate(starts, schedule?.inicioPrevisto);
      pushDate(ends, schedule?.fimPrevisto);
      if (Array.isArray(schedule?.fases)) {
        schedule.fases.forEach((phase: any) => {
          pushDate(starts, phase?.inicioPrevisto);
          pushDate(ends, phase?.fimPrevisto);
        });
      }
    });
    if (starts.length && ends.length) {
      const first = starts.sort((a, b) => a.getTime() - b.getTime())[0]!;
      const last = ends.sort((a, b) => b.getTime() - a.getTime())[0]!;
      const days = Math.max(1, Math.ceil((last.getTime() - first.getTime()) / 86_400_000) + 1);
      return `${days} dias`;
    }
    return String(selectedOrcamento?.prazoEntrega ?? "").trim() || "A definir";
  })();
  const proposalBuilderPreviewCompany = String((profileQuery.data as any)?.nomeFantasia || (profileQuery.data as any)?.razaoSocial || "Sua empresa");
  const proposalBuilderPreviewLogo = normalizeTenantLogoUrl(String((profileQuery.data as any)?.logoUrl || ""));
  const proposalBuilderPreviewTitle = proposalBuilderPreviewMode === "budget"
    ? String(selectedOrcamento?.titulo || "Proposta comercial")
    : "Título da proposta";
  const proposalBuilderPreviewClient = proposalBuilderPreviewMode === "budget"
    ? String((lead as any)?.nome || "Cliente")
    : "Nome do cliente";
  const proposalBuilderDifferentialsModule = proposalBuilderEditorModules.find((item) => item.key === "diferenciais");
  const proposalBuilderProductModule = proposalBuilderEditorModules.find((item) => item.key === "produto_servico");
  const proposalBuilderDiscovery = ((profileQuery.data as any)?.discoveryData ?? {}) as Record<string, unknown>;
  const proposalBuilderCoverValueStatement =
    (typeof proposalBuilderDiscovery.posicionamento === "string" && proposalBuilderDiscovery.posicionamento.trim()
      ? proposalBuilderDiscovery.posicionamento.trim()
      : "")
    || proposalBuilderProductModule?.description
    || proposalBuilderDifferentialsModule?.description
    || "Uma proposta clara, comercial e orientada aos benefícios reais da solução para o cliente.";
  const proposalBuilderTemplateSampleStages = [
    { id: "__sample_1", ordem: 1, nome: "Primeira etapa / serviço", total: 250000 },
    { id: "__sample_2", ordem: 2, nome: "Segunda etapa / serviço", total: 180000 },
    { id: "__sample_3", ordem: 3, nome: "Terceira etapa / serviço", total: 320000 },
    { id: "__sample_4", ordem: 4, nome: "Acabamentos / entrega", total: 500000 },
  ];
  const proposalBuilderDisplayStages = proposalBuilderPreviewMode === "budget"
    ? selectedOrcamentoStages
    : proposalBuilderTemplateSampleStages;

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

  const proposalComposerTemplate = resolveProposalBuilderTemplateForEditor();
  const proposalComposerTemplateCover = proposalComposerTemplate?.modules?.find((item) => item.key === "capa")?.image?.url ?? "";
  const proposalComposerLogo = normalizeTenantLogoUrl(
    String((profileQuery.data as any)?.logoUrl || logoUrl || ""),
  );
  const proposalComposerCover = String(
    selectedOrcamento?.apresentacao?.imagemCapa
      || proposalComposerTemplateCover
      || proposalImages[0]
      || "",
  );
  const proposalComposerTemplateImageModules = (proposalComposerTemplate?.modules ?? [])
    .filter((module) => module.enabled !== false && module.image?.mode !== "none" && Boolean(module.image?.url));
  const proposalComposerTemplateImageCount = proposalComposerTemplateImageModules.length;
  const proposalComposerStageImageCount = selectedOrcamentoStages.filter((stage) => Boolean(selectedStageImages[stage.id])).length;
  const proposalComposerStageCoverage = selectedOrcamentoStages.length > 0
    ? Math.round((proposalComposerStageImageCount / selectedOrcamentoStages.length) * 100)
    : 100;
  const proposalComposerChecks = [
    {
      key: "budget",
      label: "Orçamento/revisão",
      detail: selectedOrcamento ? selectedOrcamento.titulo : "Selecione a versão comercial",
      ok: Boolean(selectedOrcamento),
    },
    {
      key: "model",
      label: "Modelo da empresa",
      detail: proposalComposerTemplate?.name || "Modelo automático",
      ok: Boolean(proposalComposerTemplate),
    },
    {
      key: "brand",
      label: "Marca",
      detail: proposalComposerLogo ? "Logo disponível" : "Logo ainda não configurada",
      ok: Boolean(proposalComposerLogo),
    },
    {
      key: "cover",
      label: "Capa",
      detail: proposalComposerCover ? "Imagem definida" : "Pode gerar ou selecionar uma imagem",
      ok: Boolean(proposalComposerCover),
    },
    {
      key: "stages",
      label: "Imagens das etapas",
      detail: selectedOrcamentoStages.length
        ? `${proposalComposerStageImageCount}/${selectedOrcamentoStages.length} prontas · ${proposalComposerStageCoverage}%`
        : "Sem etapas estruturadas",
      ok: selectedOrcamentoStages.length === 0 || proposalComposerStageImageCount === selectedOrcamentoStages.length,
    },
  ];
  const proposalComposerReadyCount = proposalComposerChecks.filter((item) => item.ok).length;
  const proposalRequiresCompleteStageImages = proposalPresentationFormat !== "documento" && selectedOrcamentoStages.length > 0;
  const proposalComposerBlockingIssues = proposalComposerChecks.filter((item) =>
    !item.ok && (item.key === "budget" || (item.key === "stages" && proposalRequiresCompleteStageImages)),
  );
  const proposalComposerWarnings = proposalComposerChecks.filter((item) =>
    !item.ok && !proposalComposerBlockingIssues.some((blocking) => blocking.key === item.key),
  );

  const proposalPreflightPending = proposalPreflight?.pending ?? [];
  const proposalPreflightBlockers = proposalPreflightPending.filter((item) => item.severity === "blocker");
  const proposalPreflightWarnings = proposalPreflightPending.filter((item) => item.severity === "warning");
  const proposalGenerationBlocked =
    proposalComposerBlockingIssues.length > 0 || proposalPreflightBlockers.length > 0;

  function proposalPreflightCorrectionLabel(item: ProposalPreflightPending) {
    if (item.source === "budget") return "Corrigir orçamento";
    if (item.source === "company") return "Corrigir empresa";
    if (item.source === "media") return "Corrigir mídia";
    return null;
  }

  function openProposalPreflightCorrection(item: ProposalPreflightPending) {
    if (item.source === "budget" && selectedOrcamentoId !== "__none__") {
      window.location.href = `${import.meta.env.BASE_URL}propostas?edit=${encodeURIComponent(selectedOrcamentoId)}&returnTo=${encodeURIComponent(`/leads/${leadId}`)}`;
      return;
    }
    if (item.source === "company") {
      window.location.href = `${import.meta.env.BASE_URL}configuracoes?tab=perfil`;
      return;
    }
    if (item.source === "media") {
      setProposalVisualCenterOpen(true);
      setRefineOpen(false);
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

    try {
      const preflightResponse = await fetch(
        api(`/api/leads/${leadId}/proposal-preflight?propostaId=${encodeURIComponent(selectedOrcamentoId)}`),
        { headers },
      );
      const preflightBody = await preflightResponse.json().catch(() => null);
      if (!preflightResponse.ok) throw new Error(preflightBody?.error ?? "Falha ao validar a proposta.");
      const blockers = Array.isArray(preflightBody?.pending)
        ? preflightBody.pending.filter((item: any) => item?.severity === "blocker")
        : [];
      if (blockers.length > 0) {
        toast({
          title: "Corrija as pendências antes de gerar",
          description: blockers.map((item: any) => item.message).join(" · ").slice(0, 420),
          variant: "destructive",
        });
        return;
      }
    } catch (error) {
      toast({
        title: "Não foi possível validar a proposta",
        description: error instanceof Error ? error.message : "Tente novamente.",
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
      try {
        window.sessionStorage.removeItem(proposalDraftStorageKey(selectedOrcamentoId));
        setProposalDraftSavedAt(null);
      } catch {
        // sem impacto na geração
      }
      setActiveVersion(generatedVersion);
      toast({ title: `Proposta v${generatedVersion} gerada com sucesso`, description: "Revise a versão antes de compartilhar com o cliente." });
      await reviewProposal(generatedVersion);
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

  async function reviewProposal(version: number, startEditing = false) {
    if (!leadId || !token) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/proposals/${version}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Falha ao carregar proposta (${res.status})`);
      const htmlContent = await res.text();
      if (!htmlContent.trim()) throw new Error("Conteúdo da proposta não disponível");

      setPreviewHtml(htmlContent);
      setActiveVersion(version);
      setPreviewOpen(true);
      setEditDirty(false);

      if (startEditing) {
        setEditableHtml(injectEditScript(htmlContent));
        setEditMode(true);
      } else {
        setEditableHtml(null);
        setEditMode(false);
      }
    } catch (e: any) {
      toast({
        title: "Erro ao revisar proposta",
        description: e?.message || "Não foi possível carregar a proposta.",
        variant: "destructive",
      });
    }
  }

  async function openProposalSources() {
    if (!activeVersion || !leadId || !token) return;
    setProposalSourcesLoading(true);
    setProposalSourcesOpen(true);
    try {
      const response = await fetch(api(`/api/leads/${leadId}/proposals/${activeVersion}`), {
        headers,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível carregar as fontes desta versão.");
      let json: any = {};
      try {
        json = typeof body?.jsonContent === "string" ? JSON.parse(body.jsonContent) : body?.jsonContent ?? {};
      } catch {
        json = {};
      }
      setProposalSources({
        version: body?.version ?? activeVersion,
        createdAt: body?.createdAt ?? null,
        snapshot: json?._sourceSnapshot ?? null,
        meta: json?._proposalMeta ?? null,
      });
    } catch (error) {
      setProposalSources(null);
      toast({
        title: "Erro ao carregar fontes",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProposalSourcesLoading(false);
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

  function proposalVersionStatusLabel(status: string) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "ready") return "Pronta";
    if (normalized === "accepted") return "Aceita";
    if (normalized === "rejected") return "Recusada";
    if (normalized === "sent") return "Enviada";
    return status || "Pronta";
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

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden">
      {/* Orçamento e revisões — origem comercial da proposta */}
      <div className="order-1">
        <OrcamentoRevisoesCard leadId={leadId} tenantId={tenantId} onCreateBudget={onCreateBudget} />
        {selectedOrcamento && selectedOrcamentoId !== "__none__" && selectedOrcamento.status === "rascunho" && (
          <div className="mt-3">
            <BudgetContractualEditor
              key={selectedOrcamentoId}
              budgetId={selectedOrcamentoId}
              token={token}
              onSaved={() => {
                void queryClient.invalidateQueries({ queryKey: ["listPropostas", tenantId] });
                void queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId }) });
              }}
            />
          </div>
        )}
      </div>

      {/* Proposta comercial */}
      <Card data-testid="card-propostas-geradas" className="order-3 min-w-0 max-w-full overflow-hidden">
        <CardHeader className="px-3 pb-3 pt-4 sm:px-6">
          <CardTitle className="flex flex-col items-stretch gap-3 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Proposta comercial
              {proposals.length > 0 && (
                <Badge variant="outline" className="text-xs ml-1">{proposals.length}</Badge>
              )}
            </span>
            <Button
              size="sm"
              className="h-9 w-full gap-1.5 text-xs sm:h-8 sm:w-auto"
              onClick={() => openRefineDialog()}
              disabled={generating || loadingOrcamentos || loadingBudgetRevisions || proposalBudgetOptions.length === 0 || selectedOrcamentoId === "__none__"}
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {generating ? "Gerando..." : "Gerar Proposta"}
            </Button>
          </CardTitle>
          {/* Configuração compacta da proposta */}
          <div className="mt-2 rounded-xl border bg-muted/20 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold">Modelo da proposta</p>
                  <Badge variant="outline" className="max-w-[260px] truncate text-[10px]">
                    {proposalComposerTemplate?.name || "Automático"}
                  </Badge>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  O modelo define páginas, textos-base e imagens padrão. No dia a dia, só troque se necessário.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={openProposalBuilderEditor}
                  disabled={!proposalBuilderTemplates.length}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Editar modelo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setProposalModelOpen((value) => !value)}
                >
                  {proposalModelOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Trocar
                </Button>
              </div>
            </div>

            {proposalModelOpen && (
              <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  {proposalBuilderTemplates.length > 0 && (
                    <Select
                      value={selectedProposalBuilderTemplateId}
                      onValueChange={setSelectedProposalBuilderTemplateId}
                    >
                      <SelectTrigger className="h-9 min-w-0 w-full text-xs [&>span]:truncate">
                        <SelectValue placeholder="Modelo da empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">
                          Modelo padrão atual — {activeProposalBuilderTemplate?.name || "padrão da empresa"}
                        </SelectItem>
                        {proposalBuilderTemplatesForSelection.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {(proposalLineTemplates.length > 0 || hasProposalTemplate) && (
                    <button
                      type="button"
                      onClick={() => setProposalAdvancedOpen((value) => !value)}
                      className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {proposalAdvancedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      Referência documental opcional
                    </button>
                  )}

                  {proposalAdvancedOpen && (proposalLineTemplates.length > 0 || hasProposalTemplate) && (
                    <div className="pt-1">
                      {proposalLineTemplates.length > 0 ? (
                        <Select value={selectedProposalTemplateId} onValueChange={setSelectedProposalTemplateId}>
                          <SelectTrigger className="h-9 min-w-0 w-full text-xs [&>span]:truncate">
                            <SelectValue placeholder="Referência documental" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__auto__">Automático — referência padrão</SelectItem>
                            {proposalLineTemplates.map((item) => (
                              <SelectItem key={item.id} value={item.id}>{item.name} — {item.productLine}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                          <FileText className="h-3 w-3" /> {proposalTemplateName || "Referência padrão ativa"}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <Link href="/configuracoes?tab=perfil" className="flex h-9 items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-primary no-underline">
                  <Upload className="h-3.5 w-3.5" /> Kit da Marca
                </Link>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-4 sm:px-6">
          <div className="mb-4 rounded-xl border bg-background p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">Pronto para gerar</p>
                  <Badge
                    variant="outline"
                    className={proposalPreflightBlockers.length > 0
                      ? "border-red-200 bg-red-50 text-red-700"
                      : proposalComposerReadyCount === proposalComposerChecks.length
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"}
                  >
                    {proposalComposerReadyCount}/{proposalComposerChecks.length}
                    {proposalPreflightBlockers.length > 0 ? ` · ${proposalPreflightBlockers.length} bloqueio(s)` : ""}
                  </Badge>
                  {proposalDraftSavedAt && (
                    <span className="text-[10px] text-muted-foreground">
                      salvo às {new Date(proposalDraftSavedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Orçamento, modelo e imagens. Só mostre detalhes quando houver algo pendente.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {proposalComposerChecks.map((item) => (
                  <Badge
                    key={item.key}
                    variant="outline"
                    className={item.ok
                      ? "border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-[10px] text-amber-700"}
                    title={item.detail}
                  >
                    {item.ok ? "✓ " : "• "}{item.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {proposalPreflightPending.length > 0 && (
            <div className={`mb-4 rounded-xl border p-3 ${proposalPreflightBlockers.length > 0
              ? "border-red-200 bg-red-50/70"
              : "border-amber-200 bg-amber-50/70"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className={`text-sm font-semibold ${proposalPreflightBlockers.length > 0 ? "text-red-900" : "text-amber-900"}`}>
                    {proposalPreflightBlockers.length > 0 ? "Pendências que impedem a geração" : "Avisos do orçamento e da proposta"}
                  </p>
                  <p className={`mt-0.5 text-[11px] ${proposalPreflightBlockers.length > 0 ? "text-red-700" : "text-amber-700"}`}>
                    {proposalPreflightBlockers.length > 0
                      ? "Corrija os itens abaixo antes de gerar a proposta."
                      : "Estes itens não bloqueiam a geração, mas vale revisar."}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {proposalPreflightBlockers.length > 0 && (
                    <Badge variant="outline" className="border-red-300 bg-white text-[10px] text-red-700">
                      {proposalPreflightBlockers.length} bloqueio(s)
                    </Badge>
                  )}
                  {proposalPreflightWarnings.length > 0 && (
                    <Badge variant="outline" className="border-amber-300 bg-white text-[10px] text-amber-700">
                      {proposalPreflightWarnings.length} aviso(s)
                    </Badge>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {proposalPreflightPending.slice(0, 10).map((item) => (
                  <div
                    key={`preflight-main-${item.code}-${item.field ?? "none"}`}
                    className="flex items-start gap-2 rounded-lg border bg-white px-2.5 py-2"
                  >
                    <XCircle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${item.severity === "blocker" ? "text-red-500" : "text-amber-500"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-foreground">{item.message}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {item.source === "budget" ? "Orçamento" :
                          item.source === "client" ? "Cliente" :
                          item.source === "company" ? "Empresa" :
                          item.source === "business_plan" ? "Plano de Negócios" :
                          item.source === "catalog" ? "Catálogo" : "Mídia"}
                        {item.field ? ` · Campo: ${item.field}` : ""}
                      </p>
                    </div>
                    {proposalPreflightCorrectionLabel(item) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 px-2 text-[10px]"
                        onClick={() => openProposalPreflightCorrection(item)}
                      >
                        {proposalPreflightCorrectionLabel(item)}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4 overflow-hidden rounded-xl border bg-background">
            <button
              type="button"
              onClick={() => setProposalVisualCenterOpen((value) => !value)}
              className="flex w-full items-start justify-between gap-3 p-3 text-left"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Imagens da proposta</p>
                  <Badge variant="outline" className="text-[10px]">{proposalComposerCover ? "capa ✓" : "capa pendente"}</Badge>
                  
                  <Badge variant="outline" className="text-[10px]">{proposalComposerStageImageCount}/{selectedOrcamentoStages.length || 0} etapas</Badge>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Envie várias imagens, escolha a capa, organize a galeria e mantenha as imagens das etapas no mesmo lugar.
                </p>
              </div>
              {proposalVisualCenterOpen ? <ChevronUp className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />}
            </button>

            {proposalVisualCenterOpen && (
              <div className="space-y-3 border-t p-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
                  <strong>Galeria da proposta:</strong> envie várias imagens de uma vez, reordene, remova e escolha qualquer uma como capa.
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.length) void handleProposalImageUpload(event.target.files);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 w-full gap-1.5 text-xs sm:w-auto"
                  disabled={imageUploading}
                  onClick={() => imageInputRef.current?.click()}
                >
                  {imageUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {imageUploading ? "Enviando..." : "Adicionar várias imagens"}
                </Button>
                <input
                  ref={coverImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleCoverImageUpload(file);
                    event.target.value = "";
                  }}
                />
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">Capa da proposta</p>
                        <p className="text-[10px] text-muted-foreground">
                          {selectedOrcamento?.apresentacao?.imagemCapa
                            ? "Imagem específica desta proposta"
                            : proposalComposerTemplateCover
                              ? "Usando capa padrão do modelo"
                              : proposalImages[0]
                                ? "Usando biblioteca visual como fallback"
                                : "Sem capa definida"}
                        </p>
                      </div>
                      <Badge variant={proposalComposerCover ? "secondary" : "outline"} className="text-[10px]">
                        {proposalComposerCover ? "Pronta" : "Pendente"}
                      </Badge>
                    </div>
                    {proposalComposerCover ? (
                      <img src={normalizeTenantLogoUrl(proposalComposerCover)} alt="Capa da proposta" className="mt-2 h-28 w-full rounded-md border object-cover" />
                    ) : (
                      <div className="mt-2 flex h-28 items-center justify-center rounded-md border border-dashed bg-muted/20 text-[10px] text-muted-foreground">
                        Nenhuma imagem
                      </div>
                    )}
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 w-full gap-1.5 text-xs"
                        disabled={generatingCoverImage || !selectedOrcamento}
                        onClick={() => void generatePremiumCoverImage()}
                      >
                        {generatingCoverImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Gerar com IA
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 w-full gap-1.5 text-xs"
                        disabled={coverImageUploading || !selectedOrcamento}
                        onClick={() => coverImageInputRef.current?.click()}
                      >
                        {coverImageUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Enviar capa
                      </Button>
                    </div>
                    {selectedOrcamento?.apresentacao?.imagemCapa && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-1 h-8 w-full text-[11px] text-destructive"
                        onClick={() => void removeManualCoverImage()}
                      >
                        Remover capa específica e usar padrão do modelo
                      </Button>
                    )}
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">Imagens das etapas</p>
                        <p className="text-[10px] text-muted-foreground">
                          {selectedOrcamentoStages.length
                            ? `${proposalComposerStageImageCount} de ${selectedOrcamentoStages.length} prontas`
                            : "O orçamento não possui etapas estruturadas"}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{proposalComposerStageCoverage}%</Badge>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${proposalComposerStageCoverage}%` }} />
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 w-full gap-1.5 text-xs"
                        disabled={generatingStageImages || selectedOrcamentoStages.length === 0 || proposalComposerStageImageCount === selectedOrcamentoStages.length}
                        onClick={() => {
                          selectNextMissingStageImages();
                          setProposalStagesOpen(true);
                        }}
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        Selecionar próximas 3 sem imagem
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 w-full gap-1.5 text-xs"
                        disabled={generatingStageImages || selectedStageImageIds.length === 0}
                        onClick={() => void generateRepresentativeStageImages(false)}
                      >
                        {generatingStageImages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Gerar {selectedStageImageIds.length || ""} selecionada{selectedStageImageIds.length === 1 ? "" : "s"}
                      </Button>
                    </div>
                  </div>
                </div>

                <section className="overflow-hidden rounded-xl border bg-background">
                <button
                type="button"
                onClick={() => setProposalFallbackLibraryOpen((value) => !value)}
                className="flex w-full items-start justify-between gap-3 p-3 text-left"
                >
                <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
                <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Galeria da proposta</span>
                <Badge
                variant="outline"
                className={proposalHasMinimumImages ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}
                >
                {effectiveProposalImages.length} imagem(ns)
                </Badge>
                <Badge variant="outline" className="text-[10px]">múltiplas</Badge>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                Todas as imagens adicionais desta proposta. Você pode ordenar, remover ou definir uma delas como capa.
                </p>
                </div>
                {proposalFallbackLibraryOpen ? <ChevronUp className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />}
                </button>

                {proposalFallbackLibraryOpen && (
                <div className="space-y-3 border-t p-3">

                {productProposalImages.filter((url) => !proposalImages.includes(url)).length > 0 && (
                <p className="rounded-md border border-dashed bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                {productProposalImages.filter((url) => !proposalImages.includes(url)).length} imagem(ns) de produto será(ão) usada(s) automaticamente depois das imagens selecionadas.
                </p>
                )}

                {proposalImages.length > 0 && (
                <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground font-medium">
                Imagens da galeria:
                </p>
                <span className={`text-[10px] font-medium ${effectiveProposalImages.length >= proposalPrimaryPageCount ? "text-emerald-600" : "text-amber-600"}`}>
                {effectiveProposalImages.length} imagem(ns) disponíveis
                </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {proposalImages.map((url, idx) => (
                <div key={`${url}-${idx}`} className="relative group rounded overflow-hidden border aspect-video bg-muted">
                <span className="absolute top-0.5 left-0.5 z-10 max-w-[78%] truncate bg-black/75 text-white text-[9px] font-medium px-1 py-0.5 rounded">
                {idx + 1} · {selectedOrcamento?.apresentacao?.imagemCapa === url ? "CAPA" : proposalImageSlotLabel(idx)}
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
                onClick={() => void setProposalCoverFromUrl(url)}
                className="bg-black/65 text-white rounded px-1.5 py-0.5 text-[9px]"
                title="Usar como capa"
                >
                Capa
                </button>
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
                Estas imagens são auxiliares e não substituem capa, imagem do bloco ou imagem específica de uma etapa.
                </p>

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
                {imageUploading ? "Enviando..." : "Enviar várias imagens"}
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
                </div>
                )}
                </section>

              </div>
            )}
          </div>

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

              <div className="mt-3 overflow-hidden rounded-xl border bg-background">
                <button
                  type="button"
                  onClick={() => setProposalAttachmentsOpen((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-semibold">Anexos da proposta</p>
                      {proposalAttachments.length > 0 && <Badge variant="secondary" className="h-5 text-[10px]">{proposalAttachments.length}</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      Plantas, memoriais, especificações, PDFs e outros documentos.
                    </p>
                  </div>
                  {proposalAttachmentsOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                </button>
                {proposalAttachmentsOpen && (
                  <div className="border-t p-3">
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
                      className="h-10 w-full gap-1.5 text-xs sm:h-8 sm:w-auto"
                      disabled={attachmentUploading}
                      onClick={() => attachmentInputRef.current?.click()}
                    >
                      {attachmentUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                      {attachmentUploading ? "Enviando..." : "Adicionar arquivos"}
                    </Button>
                    {proposalAttachments.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {proposalAttachments.map((anexo, index) => (
                          <div key={`${anexo.url}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs">
                            <a href={anexo.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 hover:underline">
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{anexo.nome}</span>
                            </a>
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Remover anexo" onClick={() => setProposalAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedOrcamentoId !== "__none__" && (
                <div className="mt-3 overflow-hidden rounded-xl border bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setProposalAppearanceOpen((value) => !value)}
                    className="flex w-full items-start justify-between gap-3 p-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Palette className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-semibold">Apresentação e experiência do cliente</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {proposalPresentationFormat === "site_interativo" ? "Site interativo" : proposalPresentationFormat === "hibrido" ? "Site + PDF" : "PDF"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{proposalHouseStyle}</Badge>
                        <Badge variant="outline" className="text-[10px]">{proposalHouseStandard.replace("_", " ")}</Badge>
                        {proposalBuiltArea && <Badge variant="outline" className="text-[10px]">{proposalBuiltArea} m²</Badge>}
                      </div>
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Formato, estilo visual, capa, área, exclusões, detalhamento e regras por etapa.
                      </p>
                    </div>
                    {proposalAppearanceOpen ? <ChevronUp className="mt-1 h-4 w-4 shrink-0" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0" />}
                  </button>

                  {proposalAppearanceOpen && (
                    <div className="space-y-3 border-t p-3">
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
                      <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
                        A geração, upload e troca de imagens ficam centralizados em <strong>Imagens da proposta</strong>. Aqui você define apenas a direção visual usada pela IA.
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
                    </div>
                  )}

                  {selectedOrcamentoStages.length > 0 && (
                    <div className="overflow-hidden rounded-xl border bg-background">
                      <button
                        type="button"
                        onClick={() => setProposalStagesOpen((value) => !value)}
                        className="flex w-full items-start justify-between gap-3 p-3 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold">Etapas da proposta</p>
                            <Badge variant="outline" className="text-[10px]">{selectedOrcamentoStages.length}</Badge>
                            <Badge variant="outline" className="text-[10px]">{selectedOrcamentoStages.length} etapas</Badge>
                          </div>
                          <span className="mt-1 block text-[10px] text-muted-foreground">
                            Financeiro e detalhamento técnico. As imagens das etapas são gerenciadas somente em “Imagens da proposta”.
                          </span>
                        </div>
                        {proposalStagesOpen ? <ChevronUp className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />}
                      </button>
                      {proposalStagesOpen && (
                        <div className="space-y-2 border-t p-3">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold">Configuração por etapa</p>
                            <span className="text-[11px] text-muted-foreground">
                              Use os controles em massa primeiro e ajuste apenas as exceções abaixo.
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">Imagens: gerenciar em “Imagens da proposta”</span>
                        </div>

                        <div className="grid gap-2 rounded-lg border bg-muted/20 p-2.5 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Aplicar financeiro em todas</label>
                            <Select onValueChange={(value) => applyFinancialModeToAllStages(value as ProposalPresentationMode | "__default__")}>
                              <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="Escolher padrão em massa" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">Usar padrão geral</SelectItem>
                                {PROPOSAL_PRESENTATION_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Aplicar técnico em todas</label>
                            <Select onValueChange={(value) => applyTechnicalVisibilityToAllStages(value as "mostrar" | "ocultar" | "__default__")}>
                              <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="Escolher padrão em massa" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">Usar padrão geral</SelectItem>
                                <SelectItem value="mostrar">Mostrar escopo em todas</SelectItem>
                                <SelectItem value="ocultar">Ocultar escopo em todas</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                        </div>
                      </div>

                      <input
                        ref={stageImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleStageImageUpload(file);
                          event.target.value = "";
                        }}
                      />
                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {selectedOrcamentoStages.map((stage) => (
                          <div
                            key={stage.id}
                            className="grid gap-2 rounded-lg border bg-background p-2.5 lg:grid-cols-[minmax(0,1fr)_210px_170px] lg:items-center"
                          >
                            <div className="min-w-0">
                              <div className="flex items-start gap-2">
                                {selectedStageImages[stage.id] ? (
                                  <img
                                    src={normalizeTenantLogoUrl(selectedStageImages[stage.id])}
                                    alt={stage.nome}
                                    className="h-14 w-16 shrink-0 rounded-md border object-cover"
                                  />
                                ) : (
                                  <div className="flex h-14 w-16 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/30 text-[9px] text-muted-foreground">
                                    sem imagem
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium leading-snug whitespace-normal break-words" title={stage.nome}>
                                    {stage.nome}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {stage.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      className="text-[9px] font-medium text-primary hover:underline"
                                      onClick={() => openStageMediaLibrary(stage.id)}
                                    >
                                      Biblioteca
                                    </button>
                                    <span className="text-[9px] text-muted-foreground">·</span>
                                    <button
                                      type="button"
                                      className="text-[9px] font-medium text-primary hover:underline"
                                      disabled={stageImageUploading}
                                      onClick={() => {
                                        setStageImageUploadTarget(stage.id);
                                        stageImageInputRef.current?.click();
                                      }}
                                    >
                                      Upload
                                    </button>
                                    <span className="text-[9px] text-muted-foreground">·</span>
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-1 text-[9px] font-medium text-violet-700 hover:underline disabled:opacity-50"
                                      disabled={stageImageGeneratingTarget === stage.id}
                                      onClick={() => openStageImageDialog(stage.id)}
                                    >
                                      {stageImageGeneratingTarget === stage.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                                      {selectedStageImages[stage.id] ? "Regenerar IA" : "Gerar com IA"}
                                    </button>
                                    {selectedStageImages[stage.id] && (
                                      <>
                                        <span className="text-[9px] text-muted-foreground">·</span>
                                        <button
                                          type="button"
                                          className="text-[9px] text-destructive hover:underline"
                                          onClick={() => void removeManualStageImage(stage.id)}
                                        >
                                          Remover
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
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
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    Exemplo: Fundação pode mostrar somente o valor macro no financeiro e, ao mesmo tempo, listar tecnicamente tudo o que está contemplado — sem revelar quantidades nem preços unitários.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mb-4 hidden items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3 sm:flex">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold">Pronto para gerar</p>
                <Badge
                  variant="outline"
                  className={!proposalGenerationBlocked
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"}
                >
                  {!proposalGenerationBlocked
                    ? "sem bloqueios"
                    : String(proposalComposerBlockingIssues.length + proposalPreflightBlockers.length) + " bloqueio(s)"}
                </Badge>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Revise os pontos pendentes e gere somente quando orçamento, formato e imagens obrigatórias estiverem coerentes.
              </p>
            </div>
            <Button
              type="button"
              className="h-9 shrink-0 gap-1.5"
              onClick={() => openRefineDialog()}
              disabled={generating || selectedOrcamentoId === "__none__"}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {generating ? "Gerando..." : "Revisar e gerar"}
            </Button>
          </div>
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
                disabled={generating || selectedOrcamentoId === "__none__"}
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Gerar primeira proposta
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-xs font-semibold">Histórico de versões</p>
                <span className="text-[10px] text-muted-foreground">Mais recente primeiro</span>
              </div>
              {[...proposals]
                .sort((a, b) => b.version - a.version)
                .map((p) => (
                  <div key={p.id} className="flex flex-col gap-3 rounded-xl border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          R{String(p.version).padStart(2, "0")}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {proposalVersionStatusLabel(p.status)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Versão gerada da proposta comercial deste cliente.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 gap-1.5 text-xs sm:flex-none"
                        onClick={() => reviewProposal(p.version)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Revisar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 gap-1.5 text-xs sm:flex-none"
                        onClick={() => reviewProposal(p.version, true)}
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 gap-1.5 text-xs text-blue-600 sm:flex-none"
                        onClick={() => copyPublicLink(p.id)}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Compartilhar
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Mais ações">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[210px]">
                          <DropdownMenuItem onClick={() => downloadProposal(p.version, "pdf")}>
                            <FileText className="mr-2 h-4 w-4" />
                            Baixar PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => downloadProposal(p.version, "html")}>
                            <Download className="mr-2 h-4 w-4" />
                            Baixar HTML
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openRefineDialog(p.version)}>
                            <Sparkles className="mr-2 h-4 w-4 text-violet-600" />
                            Criar nova revisão com IA
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openWhatsAppProposal(p.version)}>
                            <MessageCircle className="mr-2 h-4 w-4 text-green-600" />
                            Enviar mensagem no WhatsApp
                          </DropdownMenuItem>
                          {p.status !== "accepted" && p.status !== "rejected" && (
                            <>
                              <DropdownMenuItem onClick={() => handleAcceptProposal(p.id, "whatsapp")}>
                                <MessageCircle className="mr-2 h-4 w-4 text-green-600" />
                                Marcar aceite via WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAcceptProposal(p.id, "manual")}>
                                <CheckSquare className="mr-2 h-4 w-4 text-blue-600" />
                                Marcar aceite manual
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div className="sticky bottom-2 z-20 mt-4 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur sm:hidden">
            <Button
              type="button"
              className="h-11 w-full gap-2"
              onClick={() => openRefineDialog()}
              disabled={generating || selectedOrcamentoId === "__none__"}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {generating ? "Gerando proposta..." : "Revisar e gerar proposta"}
            </Button>
          </div>
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
                  Edite a estrutura do modelo ou visualize a proposta preenchida com o orçamento selecionado. A geração final segue esta mesma ordem de páginas.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="mr-2 flex items-center rounded-lg border bg-muted/30 p-1">
                  <Button type="button" size="sm" variant={proposalBuilderPreviewMode === "template" ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setProposalBuilderPreviewMode("template")}>
                    Estrutura do modelo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={proposalBuilderPreviewMode === "budget" ? "default" : "ghost"}
                    className="h-7 text-xs"
                    onClick={() => setProposalBuilderPreviewMode("budget")}
                    disabled={selectedOrcamentoId === "__none__"}
                  >
                    Prévia com orçamento real
                  </Button>
                </div>
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
                <div className="rounded-xl border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold">Modelo em edição</p>
                      <p className="text-[10px] text-muted-foreground">Escolha qualquer modelo da empresa para editar sem alterar a proposta atual.</p>
                    </div>
                    {resolveProposalBuilderTemplateForEditor()?.isDefault && (
                      <Badge variant="secondary" className="text-[10px]">Padrão</Badge>
                    )}
                  </div>
                  <Select
                    value={proposalBuilderEditorTemplateId || resolveProposalBuilderTemplateForEditor()?.id || ""}
                    onValueChange={(templateId) => {
                      const template = proposalBuilderTemplates.find((item) => item.id === templateId);
                      if (template) loadProposalBuilderEditor(template);
                    }}
                  >
                    <SelectTrigger className="mt-2 h-9 w-full text-xs [&>span]:truncate">
                      <SelectValue placeholder="Escolha o modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {proposalBuilderTemplates.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}{item.isDefault ? " · padrão" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-[11px]"
                      disabled={proposalBuilderTemplateAction !== null}
                      onClick={() => void duplicateProposalBuilderTemplate()}
                    >
                      {proposalBuilderTemplateAction === "duplicate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Duplicar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-[11px]"
                      disabled={proposalBuilderTemplateAction !== null || Boolean(resolveProposalBuilderTemplateForEditor()?.isDefault)}
                      onClick={() => void setProposalBuilderTemplateAsDefault()}
                    >
                      {proposalBuilderTemplateAction === "default" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                      {resolveProposalBuilderTemplateForEditor()?.isDefault ? "Já é padrão" : "Definir padrão"}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Nome do modelo</label>
                  <Input
                    value={proposalBuilderEditorName}
                    onChange={(e) => setProposalBuilderEditorName(e.target.value)}
                    placeholder="Ex.: CasaForte · Residencial Premium"
                    className="h-9"
                  />
                </div>

                <div className="mt-3 rounded-xl border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold">Gerar modelo com IA</p>
                      <p className="text-[10px] text-muted-foreground">A IA cria estrutura, textos-base e regras de imagens sem usar dados de um cliente específico.</p>
                    </div>
                    <Sparkles className="h-4 w-4 text-violet-500" />
                  </div>
                  <Textarea
                    value={proposalBuilderAIBrief}
                    onChange={(e) => setProposalBuilderAIBrief(e.target.value)}
                    placeholder="Ex.: proposta premium para construtora ICF, foco em casas de alto padrão, pouco texto, imagens arquitetônicas e cronograma visual."
                    className="mt-2 min-h-[86px] text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2 h-8 w-full gap-1.5 text-xs"
                    disabled={generatingProposalBuilderTemplate}
                    onClick={() => void createProposalBuilderTemplateWithAI()}
                  >
                    {generatingProposalBuilderTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {generatingProposalBuilderTemplate ? "Criando modelo..." : "Criar nova versão com IA"}
                  </Button>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold">Páginas da proposta</p>
                  <p className="text-[10px] text-muted-foreground">Cada item abaixo é um bloco da proposta. Quando o conteúdo não couber em uma página, o sistema cria continuações automaticamente sem cortar informações.</p>
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
                      onClick={() => setProposalBuilderSelectedModuleKey(module.key)}
                      className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
                        proposalBuilderSelectedModuleKey === module.key
                          ? "border-primary bg-primary/5 ring-2 ring-primary/10"
                          : "bg-background hover:border-primary/30 hover:bg-muted/30"
                      } ${proposalBuilderDraggedIndex === index ? "opacity-50 ring-2 ring-primary/20" : ""}`}
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium">Bloco {index + 1} · {module.title || PROPOSAL_MODULE_LABELS[module.key] || module.key}</p>
                      </div>
                      <PencilLine className={`h-3.5 w-3.5 shrink-0 ${proposalBuilderSelectedModuleKey === module.key ? "text-primary" : "text-muted-foreground/60 opacity-0 group-hover:opacity-100"}`} />
                      <Switch
                        checked={module.required ? true : module.enabled !== false}
                        disabled={module.required}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(checked) => toggleProposalBuilderModule(index, checked)}
                      />
                      {!module.required && (
                        <button
                          type="button"
                          className="hidden text-muted-foreground hover:text-destructive group-hover:block"
                          title="Remover página"
                          onClick={(event) => { event.stopPropagation(); removeProposalBuilderModule(module.key); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-dashed bg-background p-3">
                  <p className="text-xs font-semibold">Adicionar página</p>
                  <div className="mt-2 grid gap-1.5">
                    {proposalBuilderAvailableModules.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground">Todas as páginas disponíveis já estão no modelo.</p>
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
                    <p className="text-xs font-semibold">Editor de página</p>
                    <p className="text-[10px] text-muted-foreground">
                      {proposalBuilderPreviewMode === "template"
                        ? "Preview em página fixa: imagem, conteúdo e margens ficam limitados ao canvas e não podem empurrar ou cortar o restante do layout."
                        : "Simulação opcional usando o orçamento selecionado; a página mantém o mesmo canvas e proporção do modelo final."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="outline">
                      Bloco {Math.max(1, proposalBuilderEditorModules.findIndex((item) => item.key === proposalBuilderSelectedModuleKey) + 1)} de {proposalBuilderEditorModules.length}
                    </Badge>
                    <Badge variant="outline">{proposalBuilderEditorPreset.replace(/_/g, " ")}</Badge>
                    <Badge variant="outline">{proposalBuilderPreviewClient}</Badge>
                  </div>
                </div>

                <div
                  className={`mx-auto aspect-[210/297] overflow-hidden border bg-white shadow-xl transition-all ${
                    proposalBuilderPreviewDevice === "mobile"
                      ? "w-[390px] max-w-full rounded-[24px]"
                      : "w-full max-w-[760px] rounded-xl"
                  }`}
                >
                  {proposalBuilderSelectedModuleKey === "capa" && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setProposalBuilderSelectedModuleKey("capa")}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setProposalBuilderSelectedModuleKey("capa"); }}
                    className={`group relative block h-full w-full cursor-pointer text-left ${
                      proposalBuilderSelectedModuleKey === "capa" ? "ring-2 ring-inset ring-primary/50" : ""
                    }`}
                  >
                    <div className="absolute right-3 top-3 z-30 hidden items-center gap-1 rounded-lg border bg-white/95 p-1 shadow-md group-hover:flex">
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); setProposalBuilderSelectedModuleKey("capa"); }}>
                        <PencilLine className="mr-1 h-3 w-3" /> Editar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); chooseProposalBuilderModuleImage("capa"); }}>
                        <ImagePlus className="mr-1 h-3 w-3" /> Imagem
                      </Button>
                    </div>
                    <div className={`relative h-full min-h-full overflow-hidden ${
                      proposalBuilderEditorPreset === "premium_arquitetonico"
                        ? "bg-slate-950 text-white"
                        : proposalBuilderEditorPreset === "corporativo"
                          ? "bg-slate-900 text-white"
                          : proposalBuilderEditorPreset === "minimalista"
                            ? "bg-white text-slate-950"
                            : "bg-slate-100 text-slate-950"
                    }`}>
                      {proposalHouseStandard !== "medio" && (
                        proposalBuilderEditorModules.find((item) => item.key === "capa")?.image?.url
                        || (proposalBuilderPreviewMode === "budget" ? selectedOrcamento?.apresentacao?.imagemCapa : "")
                      ) ? (
                        <img
                          src={normalizeTenantLogoUrl(String(
                            proposalBuilderEditorModules.find((item) => item.key === "capa")?.image?.url
                            || selectedOrcamento?.apresentacao?.imagemCapa
                            || ""
                          ))}
                          alt=""
                          className={`absolute inset-0 h-full w-full ${
                            proposalBuilderEditorModules.find((item) => item.key === "capa")?.image?.fit === "contain"
                              ? "object-contain bg-slate-950"
                              : "object-cover"
                          }`}
                          style={{
                            objectPosition: proposalBuilderEditorModules.find((item) => item.key === "capa")?.image?.position ?? "center",
                            opacity: 1,
                          }}
                        />
                      ) : null}
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background: `rgba(0,0,0,${Math.max(0, Math.min(80, Number(proposalBuilderEditorModules.find((item) => item.key === "capa")?.image?.overlay ?? 45))) / 100})`,
                        }}
                      />
                      <div className={`relative z-10 flex h-full min-h-full flex-col p-7 ${
                        proposalBuilderDensity === "compacto" ? "py-6" : proposalBuilderDensity === "equilibrado" ? "py-9" : "py-12"
                      }`}>
                        <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.18em]">
                          <span className="flex items-center gap-2">
                            {proposalBuilderPreviewLogo ? <img src={proposalBuilderPreviewLogo} alt="" className="h-7 max-w-[120px] object-contain" /> : null}
                            {!proposalBuilderPreviewLogo ? proposalBuilderPreviewCompany : null}
                          </span>
                          <span>Proposta comercial</span>
                        </div>
                        <div className="flex flex-1 flex-col justify-center py-8 max-w-[700px]">
                          <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">Proposta de valor</p>
                          <h2 className={`mt-2 font-black tracking-tight ${
                            proposalBuilderPreviewDevice === "mobile" ? "text-4xl" : "text-6xl"
                          }`}>
                            {proposalBuilderPreviewTitle.replace(/^Orçamento\s*[—-]?\s*/i, "")}
                          </h2>
                          <p className="mt-3 max-w-[620px] text-sm leading-relaxed opacity-85">{proposalBuilderCoverValueStatement}</p>
                          <p className="mt-2 text-xs opacity-75">Cliente: {proposalBuilderPreviewClient}</p>
                          <div className="mt-5 flex flex-wrap gap-2 text-xs">
                            {proposalBuilderPreviewTotal > 0 && <span className="rounded-full border border-current/20 px-3 py-1.5">{proposalBuilderMoney(proposalBuilderPreviewTotal)}</span>}
                            {proposalBuilderPreviewDeadline && <span className="rounded-full border border-current/20 px-3 py-1.5">{proposalBuilderPreviewDeadline}</span>}
                            <span className="rounded-full border border-current/20 px-3 py-1.5">{proposalBuilderDisplayStages.length} etapas</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}

                  <div className={`space-y-3 ${
                    proposalBuilderDensity === "compacto" ? "p-4" : proposalBuilderDensity === "equilibrado" ? "p-6" : "p-8"
                  }`}>
                    {proposalBuilderEditorModules
                      .filter((module) => module.enabled !== false && module.key !== "capa" && module.key === proposalBuilderSelectedModuleKey)
                      .map((module) => (
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
                            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); setProposalBuilderSelectedModuleKey(module.key); }}>
                              <PencilLine className="mr-1 h-3 w-3" /> Editar
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); chooseProposalBuilderModuleImage(module.key); }}>
                              <ImagePlus className="mr-1 h-3 w-3" /> Imagem
                            </Button>
                            <button type="button" className="rounded p-1 hover:bg-muted" title="Subir bloco" onClick={(e) => { e.stopPropagation(); proposalBuilderMoveModule(module.key, -1); }}><ChevronUp className="h-3.5 w-3.5" /></button>
                            <button type="button" className="rounded p-1 hover:bg-muted" title="Descer bloco" onClick={(e) => { e.stopPropagation(); proposalBuilderMoveModule(module.key, 1); }}><ChevronDown className="h-3.5 w-3.5" /></button>
                          </div>

                          <div className="flex items-center justify-between gap-3 pr-20">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {PROPOSAL_MODULE_LABELS[module.key] ?? module.key}
                            </p>
                            <span className="text-[9px] text-muted-foreground">edição direta</span>
                          </div>

                          <div className="mt-3">
                            {module.image?.url && module.image.mode !== "none" ? (
                              <div className="group/image relative mb-4 overflow-hidden rounded-lg border bg-muted/20">
                                <img
                                  src={normalizeTenantLogoUrl(module.image.url)}
                                  alt={module.title || PROPOSAL_MODULE_LABELS[module.key] || module.key}
                                  className={`h-48 w-full ${module.image?.fit === "contain" ? "object-contain bg-muted/30" : "object-cover"}`}
                                  style={{ objectPosition: module.image?.position ?? "center" }}
                                />
                                <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-2 pt-8">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-[10px]"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openProposalMediaLibrary(module.key);
                                    }}
                                  >
                                    Biblioteca
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-[10px]"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      chooseProposalBuilderModuleImage(module.key);
                                    }}
                                  >
                                    Upload
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-[10px]"
                                    disabled={proposalBuilderGeneratingModuleImage === module.key}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void generateProposalBuilderModuleImage(module.key);
                                    }}
                                  >
                                    {proposalBuilderGeneratingModuleImage === module.key ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                                    Gerar IA
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-[10px] text-destructive"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updateProposalBuilderModuleImage(module.key, { url: "", mode: "none" });
                                    }}
                                  >
                                    Remover
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="mb-4 flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-4">
                                <p className="text-[10px] text-muted-foreground">Esta página ainda não possui imagem.</p>
                                <div className="flex flex-wrap justify-center gap-1.5">
                                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={(event) => { event.stopPropagation(); openProposalMediaLibrary(module.key); }}>Biblioteca</Button>
                                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={(event) => { event.stopPropagation(); chooseProposalBuilderModuleImage(module.key); }}>Upload</Button>
                                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={proposalBuilderGeneratingModuleImage === module.key} onClick={(event) => { event.stopPropagation(); void generateProposalBuilderModuleImage(module.key); }}>
                                    {proposalBuilderGeneratingModuleImage === module.key ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                                    Gerar IA
                                  </Button>
                                </div>
                              </div>
                            )}
                            {module.key !== "apresentacao_empresa" && module.description ? <p className="mb-3 text-xs text-muted-foreground">{module.description}</p> : null}
                            {module.key === "resumo_executivo" ? (
                              <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] text-muted-foreground">Investimento</p><p className="mt-1 text-sm font-bold">{proposalBuilderMoney(proposalBuilderPreviewTotal)}</p></div>
                                <div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] text-muted-foreground">Prazo</p><p className="mt-1 text-sm font-bold">{proposalBuilderPreviewDeadline || "A definir"}</p></div>
                                <div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] text-muted-foreground">Etapas</p><p className="mt-1 text-sm font-bold">{proposalBuilderDisplayStages.length}</p></div>
                              </div>
                            ) : module.key === "apresentacao_empresa" ? (
                              <div className="max-w-3xl space-y-3" onClick={(event) => event.stopPropagation()}>
                                <Input
                                  value={module.title ?? ""}
                                  onChange={(event) => updateProposalBuilderModuleConfig(module.key, { title: event.target.value })}
                                  placeholder="Título da página"
                                  className="h-auto border-transparent bg-transparent px-0 py-1 text-2xl font-semibold tracking-tight shadow-none focus-visible:border-primary/30 focus-visible:ring-2 focus-visible:ring-primary/10"
                                />
                                <Input
                                  value={module.description ?? ""}
                                  onChange={(event) => updateProposalBuilderModuleConfig(module.key, { description: event.target.value })}
                                  placeholder="Subtítulo ou mensagem de apoio"
                                  className="h-auto border-transparent bg-transparent px-0 py-1 text-sm font-medium text-muted-foreground shadow-none focus-visible:border-primary/30 focus-visible:ring-2 focus-visible:ring-primary/10"
                                />
                                <Textarea
                                  value={module.contentPrompt ?? ""}
                                  onChange={(event) => updateProposalBuilderModuleConfig(module.key, { contentPrompt: event.target.value })}
                                  placeholder={`${proposalBuilderPreviewCompany} apresenta sua trajetória, posicionamento, diferenciais e a forma como conduz cada projeto com qualidade e transparência.`}
                                  className="min-h-[150px] resize-y border-transparent bg-transparent px-0 py-1 text-sm leading-7 text-slate-700 shadow-none focus-visible:border-primary/30 focus-visible:ring-2 focus-visible:ring-primary/10"
                                />
                                <p className="text-[9px] text-muted-foreground">Clique e digite diretamente. As alterações entram somente nesta página do modelo.</p>
                              </div>
                            ) : module.key === "diferenciais" ? (
                              <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-slate-950 p-3 text-xs text-white">Qualidade e execução</div><div className="rounded-lg bg-slate-950 p-3 text-xs text-white">Gestão e transparência</div></div>
                            ) : module.key === "etapas_orcamento" ? (
                              <div className={`grid gap-2 ${proposalBuilderStageVariant === "cards" && proposalBuilderPreviewDevice === "desktop" ? "grid-cols-2" : "grid-cols-1"}`}>
                                {proposalBuilderDisplayStages.slice(0, 6).map((stage) => (
                                  <div key={stage.id} className="overflow-hidden rounded-lg border bg-muted/20">
                                    {selectedStageImages[stage.id] ? <img src={selectedStageImages[stage.id]} alt="" className="h-24 w-full object-cover" /> : null}
                                    <div className="p-3 text-xs">
                                      <p className="font-semibold">{stage.ordem}. {stage.nome}</p>
                                      <p className="mt-1 text-muted-foreground">{proposalBuilderMoney(stage.total)}</p>
                                    </div>
                                  </div>
                                ))}
                                {!proposalBuilderDisplayStages.length && <p className="text-xs text-muted-foreground">O orçamento selecionado ainda não possui etapas estruturadas.</p>}
                              </div>
                            ) : module.key === "imagem_por_etapa" || module.key === "cases_provas" ? (
                              <div className={`grid gap-2 ${proposalBuilderImageEmphasis === "alta" && proposalBuilderPreviewDevice === "desktop" ? "grid-cols-3" : "grid-cols-2"}`}>
                                {proposalBuilderDisplayStages.filter((stage) => selectedStageImages[stage.id]).slice(0, 6).map((stage) => (
                                  <div key={stage.id} className="overflow-hidden rounded-lg border"><img src={selectedStageImages[stage.id]} alt={stage.nome} className="h-28 w-full object-cover" /><p className="p-2 text-[10px] font-medium">{stage.nome}</p></div>
                                ))}
                                {!proposalBuilderDisplayStages.some((stage) => selectedStageImages[stage.id]) && <div className="col-span-full rounded-lg border border-dashed p-4 text-xs text-muted-foreground">Nenhuma imagem específica de etapa vinculada.</div>}
                              </div>
                            ) : module.key === "tabela_itens" ? (
                              <div className="overflow-hidden rounded-lg border text-xs">
                                {Array.isArray(selectedOrcamento?.itens) && selectedOrcamento.itens.slice(0, 6).map((item: any, i: number) => (
                                  <div key={i} className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 last:border-b-0"><span>{item.nome}</span><strong>{proposalBuilderMoney(Number(item.quantidade || 0) * Number(item.valorUnitario || 0))}</strong></div>
                                ))}
                              </div>
                            ) : module.key === "cronograma" || module.key === "fisico_financeiro" ? (
                              <div className="space-y-2">
                                {proposalBuilderDisplayStages.slice(0, 6).map((stage, n) => {
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
                <input
                  ref={proposalBuilderModuleImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file && proposalBuilderSelectedModuleKey) {
                      void handleProposalBuilderModuleImageUpload(proposalBuilderSelectedModuleKey, file);
                    }
                  }}
                />
                {proposalBuilderSelectedModuleKey && (
                  <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Página selecionada</p>
                    <p className="mt-1 text-sm font-semibold">
                      {PROPOSAL_MODULE_LABELS[proposalBuilderSelectedModuleKey] ?? proposalBuilderSelectedModuleKey}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => proposalBuilderMoveModule(proposalBuilderSelectedModuleKey, -1)}>
                        <ChevronUp className="mr-1 h-3.5 w-3.5" /> Subir
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => proposalBuilderMoveModule(proposalBuilderSelectedModuleKey, 1)}>
                        <ChevronDown className="mr-1 h-3.5 w-3.5" /> Descer
                      </Button>
                      {(() => {
                        const selectedModule = proposalBuilderEditorModules.find((item) => item.key === proposalBuilderSelectedModuleKey);
                        if (!selectedModule || selectedModule.required) return null;
                        return (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => toggleProposalBuilderModule(
                                proposalBuilderEditorModules.findIndex((item) => item.key === proposalBuilderSelectedModuleKey),
                                selectedModule.enabled === false,
                              )}
                            >
                              {selectedModule.enabled === false ? "Mostrar" : "Ocultar"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs text-destructive"
                              onClick={() => {
                                removeProposalBuilderModule(proposalBuilderSelectedModuleKey);
                                setProposalBuilderSelectedModuleKey(null);
                              }}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
                            </Button>
                          </>
                        );
                      })()}
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Clique em outra página na coluna esquerda para editar conteúdo, imagem, origem dos dados e posição.
                    </p>

                    {(() => {
                      const selectedModule = proposalBuilderEditorModules.find((item) => item.key === proposalBuilderSelectedModuleKey);
                      if (!selectedModule) return null;
                      return (
                        <div className="mt-4 space-y-3 border-t border-primary/15 pt-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground">Título da página</label>
                            <Input
                              value={selectedModule.title ?? PROPOSAL_MODULE_LABELS[selectedModule.key] ?? selectedModule.key}
                              onChange={(e) => updateProposalBuilderModuleConfig(selectedModule.key, { title: e.target.value })}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground">Subtítulo / objetivo</label>
                            <Textarea
                              value={selectedModule.description ?? ""}
                              onChange={(e) => updateProposalBuilderModuleConfig(selectedModule.key, { description: e.target.value })}
                              placeholder="Explique o objetivo desta página na proposta."
                              className="min-h-[70px] text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground">Fonte dos dados</label>
                            <Select
                              value={selectedModule.dataSource ?? "mixed"}
                              onValueChange={(value) => updateProposalBuilderModuleConfig(selectedModule.key, { dataSource: value as any })}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="tenant">Empresa / tenant</SelectItem>
                                <SelectItem value="budget">Orçamento</SelectItem>
                                <SelectItem value="client">Cliente</SelectItem>
                                <SelectItem value="catalog">Catálogo</SelectItem>
                                <SelectItem value="manual">Conteúdo manual</SelectItem>
                                <SelectItem value="mixed">Misto / automático</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground">Conteúdo da página</label>
                            <Textarea
                              value={selectedModule.contentPrompt ?? ""}
                              onChange={(e) => updateProposalBuilderModuleConfig(selectedModule.key, { contentPrompt: e.target.value })}
                              placeholder="Conteúdo final que será usado nesta página do modelo."
                              className="min-h-[120px] text-xs"
                            />
                          </div>

                          <div className="rounded-lg border bg-background p-2.5">
                            <p className="text-[10px] font-semibold">Imagem desta página</p>
                            <p className="mt-1 text-[9px] text-muted-foreground">
                              Destino: Página {Math.max(1, proposalBuilderEditorModules.findIndex((item) => item.key === selectedModule.key) + 1)} · {selectedModule.title || PROPOSAL_MODULE_LABELS[selectedModule.key] || selectedModule.key}.
                            </p>
                            {selectedModule.image?.url ? (
                              <img
                                src={normalizeTenantLogoUrl(selectedModule.image.url)}
                                alt=""
                                className={`mt-2 h-28 w-full rounded-md border ${selectedModule.image?.fit === "contain" ? "object-contain bg-muted/30" : "object-cover"}`}
                                style={{ objectPosition: selectedModule.image?.position ?? "center" }}
                              />
                            ) : (
                              <div className="mt-2 flex h-20 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                                Sem imagem padrão
                              </div>
                            )}
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <Select
                                value={selectedModule.image?.mode ?? "automatic"}
                                onValueChange={(value) => updateProposalBuilderModuleImage(selectedModule.key, { mode: value as any })}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="automatic">Automática</SelectItem>
                                  <SelectItem value="ai">Gerada por IA</SelectItem>
                                  <SelectItem value="manual">Manual / URL</SelectItem>
                                  <SelectItem value="library">Biblioteca</SelectItem>
                                  <SelectItem value="none">Sem imagem</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={selectedModule.image?.aspectRatio ?? "16:9"}
                                onValueChange={(value) => updateProposalBuilderModuleImage(selectedModule.key, { aspectRatio: value as any })}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="16:9">16:9</SelectItem>
                                  <SelectItem value="4:3">4:3</SelectItem>
                                  <SelectItem value="1:1">1:1</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] font-medium text-muted-foreground">Enquadramento</label>
                                <Select
                                  value={selectedModule.image?.fit ?? "cover"}
                                  onValueChange={(value) => updateProposalBuilderModuleImage(selectedModule.key, { fit: value as "cover" | "contain" })}
                                >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="contain">Ajustar · imagem inteira</SelectItem>
                                    <SelectItem value="cover">Preencher · pode cortar</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-medium text-muted-foreground">Foco da imagem</label>
                                <Select
                                  value={selectedModule.image?.position ?? "center"}
                                  onValueChange={(value) => updateProposalBuilderModuleImage(selectedModule.key, { position: value as any })}
                                >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="center">Centro</SelectItem>
                                    <SelectItem value="top">Topo</SelectItem>
                                    <SelectItem value="bottom">Base</SelectItem>
                                    <SelectItem value="left">Esquerda</SelectItem>
                                    <SelectItem value="right">Direita</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {selectedModule.key === "capa" && (
                              <div className="mt-2 rounded-lg border bg-muted/20 p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-[10px] font-medium">Escurecimento da capa</p>
                                    <p className="text-[9px] text-muted-foreground">Controla a leitura do texto sem alterar a imagem original.</p>
                                  </div>
                                  <span className="text-[10px] font-semibold">{Math.max(0, Math.min(80, Number(selectedModule.image?.overlay ?? 45)))}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="80"
                                  step="5"
                                  value={Math.max(0, Math.min(80, Number(selectedModule.image?.overlay ?? 45)))}
                                  onChange={(event) => updateProposalBuilderModuleImage(selectedModule.key, { overlay: Number(event.target.value) })}
                                  className="mt-2 w-full"
                                />
                              </div>
                            )}
                            <Input
                              value={selectedModule.image?.url ?? ""}
                              onChange={(e) => updateProposalBuilderModuleImage(selectedModule.key, { mode: "manual", url: e.target.value })}
                              placeholder="URL da imagem ou arquivo da biblioteca"
                              className="mt-2 h-8 text-xs"
                            />
                            <Textarea
                              value={selectedModule.image?.prompt ?? ""}
                              onChange={(e) => updateProposalBuilderModuleImage(selectedModule.key, { prompt: e.target.value })}
                              placeholder="Prompt da imagem deste bloco. Ex.: casa contemporânea brasileira de alto padrão, fotografia arquitetônica..."
                              className="mt-2 min-h-[80px] text-xs"
                            />
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 text-xs"
                                onClick={() => openProposalMediaLibrary(selectedModule.key)}
                              >
                                <Image className="h-3.5 w-3.5" />
                                Biblioteca
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 text-xs"
                                disabled={proposalBuilderModuleImageUploading === selectedModule.key}
                                onClick={() => chooseProposalBuilderModuleImage(selectedModule.key)}
                              >
                                {proposalBuilderModuleImageUploading === selectedModule.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                Upload
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                disabled={proposalBuilderGeneratingModuleImage === selectedModule.key}
                                onClick={() => void generateProposalBuilderModuleImage(selectedModule.key)}
                              >
                                {proposalBuilderGeneratingModuleImage === selectedModule.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                Gerar IA
                              </Button>
                            </div>

                            {proposalMediaLibraryOpen && proposalBuilderSelectedModuleKey === selectedModule.key && (
                              <div className="mt-3 rounded-xl border bg-muted/20 p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-[11px] font-semibold">Biblioteca de Mídias</p>
                                    <p className="text-[9px] text-muted-foreground">Escolha uma imagem já salva neste tenant.</p>
                                  </div>
                                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => setProposalMediaLibraryOpen(false)}>
                                    Fechar
                                  </Button>
                                </div>
                                <Input
                                  value={proposalMediaLibrarySearch}
                                  onChange={(event) => setProposalMediaLibrarySearch(event.target.value)}
                                  placeholder="Buscar por nome, módulo ou descrição"
                                  className="mt-2 h-8 text-xs"
                                />
                                {proposalMediaLibraryLoading ? (
                                  <div className="flex h-28 items-center justify-center">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                  </div>
                                ) : (
                                  <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
                                    {proposalMediaLibraryAssets
                                      .filter((asset) => {
                                        const term = proposalMediaLibrarySearch.trim().toLowerCase();
                                        if (!term) return true;
                                        const metadata = asset.metadata ?? {};
                                        const haystack = [
                                          asset.originalFilename ?? "",
                                          String(metadata["description"] ?? ""),
                                          String(metadata["module"] ?? ""),
                                          String(metadata["operation"] ?? ""),
                                          String(metadata["folderPath"] ?? ""),
                                        ].join(" ").toLowerCase();
                                        return haystack.includes(term);
                                      })
                                      .map((asset) => {
                                        const url = proposalMediaLibraryUrl(asset.storageUrl);
                                        const selected = selectedModule.image?.url === url;
                                        return (
                                          <button
                                            key={asset.id}
                                            type="button"
                                            className={`group overflow-hidden rounded-lg border bg-background text-left transition ${selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50"}`}
                                            onClick={() => {
                                              updateProposalBuilderModuleImage(selectedModule.key, { mode: "library", url });
                                              setProposalMediaLibraryOpen(false);
                                              toast({ title: "Imagem aplicada ao bloco", description: "A mídia original continua disponível na Biblioteca." });
                                            }}
                                          >
                                            <img src={url} alt="" className="aspect-[4/3] w-full bg-muted object-cover" />
                                            <span className="block truncate px-1.5 py-1 text-[9px] text-muted-foreground">
                                              {asset.originalFilename || "Imagem da biblioteca"}
                                            </span>
                                          </button>
                                        );
                                      })}
                                  </div>
                                )}
                                {!proposalMediaLibraryLoading && proposalMediaLibraryAssets.length === 0 && (
                                  <p className="py-5 text-center text-[10px] text-muted-foreground">Nenhuma imagem salva na Biblioteca.</p>
                                )}
                              </div>
                            )}

                            {effectiveProposalImages.length > 0 && (
                              <div className="mt-3">
                                <p className="text-[10px] font-medium text-muted-foreground">Imagens já usadas nesta proposta</p>
                                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                                  {effectiveProposalImages.slice(0, 8).map((url) => (
                                    <button
                                      key={url}
                                      type="button"
                                      className={`overflow-hidden rounded border ${selectedModule.image?.url === url ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/40"}`}
                                      onClick={() => updateProposalBuilderModuleImage(selectedModule.key, { mode: "library", url })}
                                      title="Usar esta imagem no bloco"
                                    >
                                      <img src={normalizeTenantLogoUrl(url)} alt="" className="h-12 w-full object-cover" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {selectedModule.image?.url && (
                              <Button type="button" size="sm" variant="ghost" className="mt-2 h-8 w-full text-xs text-destructive" onClick={() => updateProposalBuilderModuleImage(selectedModule.key, { url: "", mode: "none" })}>
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover imagem do bloco
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="mb-4 rounded-xl border p-3">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 text-left"
                    onClick={() => setProposalImageBankOpen((open) => !open)}
                  >
                    <div>
                      <p className="text-xs font-semibold">Imagens de orçamento e etapas</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Mídias do orçamento usadas pela capa e pelas etapas. A imagem específica de cada página é configurada acima.
                      </p>
                    </div>
                    {proposalImageBankOpen ? <ChevronUp className="mt-0.5 h-4 w-4 text-muted-foreground" /> : <ChevronDown className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                  </button>

                  {!proposalImageBankOpen && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="rounded-lg bg-muted/40 p-2.5">
                        <span className="text-muted-foreground">Capa</span>
                        <strong className="mt-1 block">{selectedOrcamento?.apresentacao?.imagemCapa ? "imagem pronta" : "sem imagem"}</strong>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2.5">
                        <span className="text-muted-foreground">Etapas</span>
                        <strong className="mt-1 block">{Object.keys(selectedStageImages).length}/{selectedOrcamentoStages.length || 0} com imagem</strong>
                      </div>
                    </div>
                  )}

                  {proposalImageBankOpen && (<div className="mt-3">

                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-[10px] text-blue-900">
                    <strong>Destino da capa:</strong> Página 1 · Capa. A imagem também fica disponível na Biblioteca de Mídias.
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 w-full gap-1.5 text-xs sm:h-8 sm:w-auto"
                      disabled={generatingCoverImage}
                      onClick={() => void generatePremiumCoverImage()}
                    >
                      {generatingCoverImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                      {selectedOrcamento?.apresentacao?.imagemCapa ? "Regenerar capa" : "Gerar capa da casa"}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 w-full gap-1.5 text-xs sm:h-8 sm:w-auto"
                      disabled={generatingStageImages || selectedStageImageIds.length === 0}
                      onClick={() => void generateRepresentativeStageImages(false)}
                    >
                      {generatingStageImages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Gerar etapas selecionadas
                    </Button>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground">Selecione até 3 etapas por ação</p>
                    <p className="text-[10px] text-muted-foreground">
                      Destino automático: Página “Etapas do orçamento” e Página “Imagem por etapa”, quando essas páginas estiverem ativas no modelo.
                    </p>
                    {selectedOrcamentoStages.slice(0, 14).map((stage) => {
                      const selected = selectedStageImageIds.includes(stage.id);
                      const hasImage = Boolean(selectedStageImages[stage.id]);
                      return (
                        <button
                          key={stage.id}
                          type="button"
                          onClick={() => toggleStageImageSelection(stage.id)}
                          className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[10px] transition ${
                            selected ? "border-primary bg-primary/5" : "bg-background hover:bg-muted"
                          }`}
                        >
                          <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                            selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                          }`}>
                            {selected ? "✓" : ""}
                          </span>
                          {hasImage ? (
                            <img
                              src={normalizeTenantLogoUrl(selectedStageImages[stage.id])}
                              alt=""
                              className="h-9 w-12 shrink-0 rounded border object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded border border-dashed bg-muted/30 text-[8px] text-muted-foreground">
                              sem foto
                            </div>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{stage.ordem}. {stage.nome}</span>
                            <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">
                              Vai para: Etapas do orçamento + Imagem por etapa
                            </span>
                          </span>
                          <span className={hasImage ? "text-emerald-600" : "text-amber-600"}>
                            {hasImage ? "pronta" : "gerar"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 rounded-lg bg-muted/40 p-2.5 text-[10px] text-muted-foreground">
                    A geração usa o estilo da casa escolhido na proposta, mantém a regra técnica de cada etapa e salva a mídia para reutilização posterior.
                  </div>
                  </div>)}
                </div>

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

                {proposalBuilderSelectedModuleKey && (
                  <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">Desenvolver esta página com IA</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                          A IA cria título, subtítulo, conteúdo e direção visual. Depois você pode ajustar tudo manualmente.
                        </p>
                      </div>
                    </div>

                    <Textarea
                      value={proposalBuilderPageAIInstruction}
                      onChange={(event) => setProposalBuilderPageAIInstruction(event.target.value)}
                      placeholder="Ex.: apresentar a CasaForteICF com foco em credibilidade, tecnologia ICF, conforto e atendimento nacional."
                      className="mt-3 min-h-[86px] bg-background text-xs"
                    />

                    <Button
                      type="button"
                      size="sm"
                      className="mt-2 h-9 w-full gap-1.5 text-xs"
                      disabled={proposalBuilderDevelopingPage === proposalBuilderSelectedModuleKey}
                      onClick={() => void developProposalBuilderPage(proposalBuilderSelectedModuleKey)}
                    >
                      {proposalBuilderDevelopingPage === proposalBuilderSelectedModuleKey
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Sparkles className="h-3.5 w-3.5" />}
                      {proposalBuilderDevelopingPage === proposalBuilderSelectedModuleKey ? "Desenvolvendo página..." : "Desenvolver com IA"}
                    </Button>

                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {[
                        ["Mais comercial", "Torne a página mais comercial, persuasiva e objetiva, sem exageros."],
                        ["Mais técnico", "Torne a página mais técnica e informativa, mantendo leitura simples para o cliente."],
                        ["Mais visual", "Reduza o texto e priorize uma composição visual premium com mensagens curtas."],
                        ["Mais resumido", "Resuma a página ao essencial, com linguagem direta e elegante."],
                      ].map(([label, instruction]) => (
                        <Button
                          key={label}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-[10px]"
                          disabled={proposalBuilderDevelopingPage === proposalBuilderSelectedModuleKey}
                          onClick={() => void developProposalBuilderPage(proposalBuilderSelectedModuleKey, instruction)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>

                    <p className="mt-2 text-[9px] text-muted-foreground">
                      O resultado entra no editor da página; nada é definitivo até você salvar o modelo.
                    </p>
                  </div>
                )}

                <div className="mt-3 rounded-xl border bg-background">
                  <button
                    type="button"
                    onClick={() => setProposalBuilderAdvancedOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-3 p-3 text-left"
                  >
                    <div>
                      <p className="text-xs font-semibold">Configurações avançadas</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Regras internas da IA e comportamento global do modelo.</p>
                    </div>
                    {proposalBuilderAdvancedOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {proposalBuilderAdvancedOpen && (
                    <div className="space-y-2 border-t p-3">
                      <Input value={proposalBuilderTone} onChange={(e) => setProposalBuilderTone(e.target.value)} placeholder="Tom da proposta" className="h-8 text-xs" />
                      <Input value={proposalBuilderTechnicalLevel} onChange={(e) => setProposalBuilderTechnicalLevel(e.target.value)} placeholder="Nível técnico" className="h-8 text-xs" />
                      <Textarea value={proposalBuilderImageRules} onChange={(e) => setProposalBuilderImageRules(e.target.value)} placeholder="Regras de imagens — uma por linha" className="min-h-[78px] text-xs" />
                      <Textarea value={proposalBuilderContentRules} onChange={(e) => setProposalBuilderContentRules(e.target.value)} placeholder="Regras de conteúdo — uma por linha" className="min-h-[78px] text-xs" />
                      <Textarea value={proposalBuilderAvoidRules} onChange={(e) => setProposalBuilderAvoidRules(e.target.value)} placeholder="O que evitar — uma regra por linha" className="min-h-[70px] text-xs" />
                    </div>
                  )}
                </div>
              </aside>
            </div>

            <DialogFooter className="sticky bottom-0 z-10 border-t bg-background/95 px-5 py-3 backdrop-blur">
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
      <Dialog
        open={Boolean(stageImageDialogTarget)}
        onOpenChange={(open) => {
          if (!open && !stageImageGeneratingTarget) {
            setStageImageDialogTarget(null);
            setStageImageDialogPrompt("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              {stageImageDialogStage && selectedStageImages[stageImageDialogStage.id] ? "Regenerar imagem da etapa" : "Gerar imagem da etapa"}
            </DialogTitle>
          </DialogHeader>

          {stageImageDialogStage && (
            <div className="space-y-4">
              <div className="flex gap-3 rounded-xl border bg-muted/20 p-3">
                {selectedStageImages[stageImageDialogStage.id] ? (
                  <img
                    src={normalizeTenantLogoUrl(selectedStageImages[stageImageDialogStage.id])}
                    alt={stageImageDialogStage.nome}
                    className="h-24 w-32 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded-lg border border-dashed bg-background text-xs text-muted-foreground">
                    Sem imagem atual
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{stageImageDialogStage.nome}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stageImageDialogStage.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    A IA já recebe automaticamente o nome e o escopo real desta etapa. Use o campo abaixo para dizer exatamente o que quer ver na imagem.
                  </p>
                  {stageImageDialogVisualHint && (
                    <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-[10px] text-violet-900">
                      <strong>{stageImageDialogVisualHint.label}:</strong> {stageImageDialogVisualHint.description}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold">O que você quer gerar?</label>
                <Textarea
                  value={stageImageDialogPrompt}
                  onChange={(event) => setStageImageDialogPrompt(event.target.value)}
                  placeholder={stageImageDialogVisualHint?.visualType === "planejamento_aprovacao"
                    ? 'Ex.: mostrar arquiteto e cliente analisando planta e documentação de aprovação em ambiente técnico profissional, sem obra pesada.'
                    : `Ex.: representar "${stageImageDialogStage.nome}" com uma cena profissional, coerente com o escopo da etapa, foco no processo técnico e aparência fotográfica realista.`}
                  className="min-h-[130px] resize-y"
                />
                <div className="flex flex-wrap gap-2">
                  {(stageImageDialogVisualHint?.suggestions ?? ["Mais técnico", "Mais comercial", "Mais realista"]).map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={() => setStageImageDialogPrompt((current) => current ? `${current}. ${suggestion}.` : `${suggestion}.`)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                A geração só acontece depois de clicar em <strong>Gerar imagem</strong>. Esta ação consome 1 geração de IA e substitui a imagem atual quando houver.
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStageImageDialogTarget(null);
                setStageImageDialogPrompt("");
              }}
              disabled={Boolean(stageImageGeneratingTarget)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={!stageImageDialogStage || Boolean(stageImageGeneratingTarget)}
              onClick={() => {
                if (stageImageDialogStage) void generateSingleStageImage(stageImageDialogStage.id, stageImageDialogPrompt);
              }}
            >
              {stageImageGeneratingTarget ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {stageImageGeneratingTarget ? "Gerando..." : "Gerar imagem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(stageMediaLibraryTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setStageMediaLibraryTarget(null);
            setProposalMediaLibrarySearch("");
          }
        }}
      >
        <DialogContent className="vendor-scrollbar max-h-[88vh] w-[calc(100vw-32px)] max-w-5xl overflow-y-auto p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Biblioteca de Mídias
            </DialogTitle>
            {stageMediaLibraryStage && (
              <p className="text-xs text-muted-foreground">
                Escolha uma imagem para a etapa <strong>{stageMediaLibraryStage.nome}</strong>.
              </p>
            )}
          </DialogHeader>

          <div>
            <div className="shrink-0 border-b bg-muted/10 p-4">
              <Input
                autoFocus
                value={proposalMediaLibrarySearch}
                onChange={(event) => setProposalMediaLibrarySearch(event.target.value)}
                placeholder="Buscar por nome, descrição, módulo ou origem..."
                className="h-10"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {proposalMediaLibraryAssets.filter((asset) => {
                    const term = proposalMediaLibrarySearch.trim().toLowerCase();
                    if (!term) return true;
                    const metadata = asset.metadata ?? {};
                    return [
                      asset.originalFilename ?? "",
                      String(metadata["description"] ?? ""),
                      String(metadata["module"] ?? ""),
                      String(metadata["operation"] ?? ""),
                    ].join(" ").toLowerCase().includes(term);
                  }).length} imagem(ns)
                </span>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void fetchProposalMediaLibrary(true)}>
                  Atualizar biblioteca
                </Button>
              </div>
            </div>

            <div className="p-4">
              {proposalMediaLibraryLoading ? (
                <div className="flex h-[420px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (() => {
                const filteredAssets = proposalMediaLibraryAssets.filter((asset) => {
                  const term = proposalMediaLibrarySearch.trim().toLowerCase();
                  if (!term) return true;
                  const metadata = asset.metadata ?? {};
                  return [
                    asset.originalFilename ?? "",
                    String(metadata["description"] ?? ""),
                    String(metadata["module"] ?? ""),
                    String(metadata["operation"] ?? ""),
                  ].join(" ").toLowerCase().includes(term);
                });

                if (filteredAssets.length === 0) {
                  return (
                    <div className="flex h-[360px] flex-col items-center justify-center rounded-xl border border-dashed text-center">
                      <Image className="h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-3 text-sm font-medium">Nenhuma imagem encontrada</p>
                      <p className="mt-1 max-w-md text-xs text-muted-foreground">
                        Tente outro termo ou atualize a Biblioteca. Imagens geradas pelo sistema ficam disponíveis aqui para reutilização.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {filteredAssets.map((asset) => {
                      const url = proposalMediaLibraryUrl(asset.storageUrl);
                      const metadata = asset.metadata ?? {};
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          className="group overflow-hidden rounded-xl border bg-background text-left transition hover:border-primary hover:shadow-md"
                          onClick={async () => {
                            if (!stageMediaLibraryStage) return;
                            try {
                              await applyStageImage(stageMediaLibraryStage.id, url);
                              setStageMediaLibraryTarget(null);
                              setProposalMediaLibrarySearch("");
                              toast({
                                title: "Imagem aplicada",
                                description: `Etapa: ${stageMediaLibraryStage.nome}`,
                              });
                            } catch (error) {
                              toast({
                                title: "Erro ao aplicar imagem",
                                description: error instanceof Error ? error.message : "Tente novamente.",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <div className="aspect-[4/3] overflow-hidden bg-muted">
                            <img src={url} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                          </div>
                          <div className="space-y-1 p-2.5">
                            <p className="truncate text-xs font-medium">{asset.originalFilename || "Imagem"}</p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {String(metadata["module"] || metadata["operation"] || "Biblioteca de Mídias")}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-5 py-3">
            <Button type="button" variant="outline" onClick={() => setStageMediaLibraryTarget(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {refineFromVersion == null && (
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">Revisão antes de gerar</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Confirme orçamento, modelo, marca e material visual antes de criar a versão.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={!proposalGenerationBlocked && proposalComposerWarnings.length === 0 && proposalPreflightWarnings.length === 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : proposalGenerationBlocked
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"}
                  >
                    {proposalGenerationBlocked
                      ? `${proposalComposerBlockingIssues.length + proposalPreflightBlockers.length} bloqueio(s)`
                      : `${proposalComposerReadyCount}/${proposalComposerChecks.length} pronto`}
                  </Badge>
                </div>

                <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {proposalComposerChecks.map((item) => (
                    <div key={item.key} className="flex items-start gap-2 rounded-lg border bg-background px-2.5 py-2">
                      {item.ok
                        ? <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        : <XCircle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${proposalComposerBlockingIssues.some((blocking) => blocking.key === item.key) ? "text-red-500" : "text-amber-500"}`} />}
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium">{item.label}</p>
                        <p className="line-clamp-2 text-[10px] text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-lg border bg-background p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold">Dados e fontes</p>
                    <Badge variant="outline" className={
                      proposalPreflightBlockers.length > 0
                        ? "border-red-200 bg-red-50 text-[10px] text-red-700"
                        : proposalPreflightWarnings.length > 0
                          ? "border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                    }>
                      {proposalPreflightLoading
                        ? "validando…"
                        : proposalPreflightBlockers.length > 0
                          ? `${proposalPreflightBlockers.length} bloqueio(s)`
                          : proposalPreflightWarnings.length > 0
                            ? `${proposalPreflightWarnings.length} aviso(s)`
                            : "fontes completas"}
                    </Badge>
                  </div>
                  {proposalPreflightPending.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {proposalPreflightPending.slice(0, 8).map((item) => (
                        <div
                          key={`${item.code}-${item.field ?? "none"}`}
                          className={`flex items-start justify-between gap-2 rounded-md border px-2 py-1.5 text-[10px] ${item.severity === "blocker"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-amber-200 bg-amber-50 text-amber-800"}`}
                        >
                          <span className="min-w-0">
                            <span className="font-semibold">
                              {item.source === "budget" ? "Orçamento" :
                                item.source === "client" ? "Cliente" :
                                item.source === "company" ? "Empresa" :
                                item.source === "business_plan" ? "Plano de Negócios" :
                                item.source === "catalog" ? "Catálogo" : "Mídia"}:
                            </span>{" "}{item.message}
                          </span>
                          {proposalPreflightCorrectionLabel(item) && (
                            <button
                              type="button"
                              className="shrink-0 font-semibold underline underline-offset-2"
                              onClick={() => openProposalPreflightCorrection(item)}
                            >
                              Corrigir
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : !proposalPreflightLoading ? (
                    <p className="mt-2 text-[10px] text-emerald-700">
                      Cliente, orçamento e fontes essenciais validados.
                    </p>
                  ) : null}
                </div>

                {(proposalComposerWarnings.length > 0 || proposalComposerBlockingIssues.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...proposalComposerWarnings, ...proposalComposerBlockingIssues].some((item) => item.key === "cover" || item.key === "stages") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => {
                          setRefineOpen(false);
                          setProposalVisualCenterOpen(true);
                        }}
                      >
                        <ImagePlus className="mr-1 h-3.5 w-3.5" />
                        Corrigir imagens
                      </Button>
                    )}
                    {proposalComposerWarnings.some((item) => item.key === "model") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => {
                          setRefineOpen(false);
                          openProposalBuilderEditor();
                        }}
                      >
                        <Settings2 className="mr-1 h-3.5 w-3.5" />
                        Escolher modelo
                      </Button>
                    )}
                  </div>
                )}

                {proposalComposerBlockingIssues.length > 0 ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] text-red-700">
                    {proposalComposerBlockingIssues.some((item) => item.key === "budget")
                      ? "A geração está bloqueada até selecionar um orçamento/revisão."
                      : "A proposta interativa exige imagem específica em todas as etapas. Complete as imagens antes de gerar."}
                  </p>
                ) : proposalComposerWarnings.length > 0 ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-700">
                    Há itens opcionais pendentes. Eles podem ser corrigidos agora ou a proposta pode seguir usando os fallbacks disponíveis.
                  </p>
                ) : null}
              </div>
            )}

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
                disabled={generating || proposalGenerationBlocked}
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Gerar sem instruções
              </Button>
            )}
            <Button
              size="sm"
              className="gap-1.5 bg-violet-600 hover:bg-violet-700"
              onClick={() => generateProposal(refineNotes || undefined)}
              disabled={generating || (refineFromVersion == null && proposalGenerationBlocked)}
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

      <Dialog open={proposalSourcesOpen} onOpenChange={setProposalSourcesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Fontes utilizadas — Proposta v{proposalSources?.version ?? activeVersion}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto py-1">
            {proposalSourcesLoading ? (
              <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando rastreabilidade…
              </div>
            ) : proposalSources?.snapshot ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Plano de Negócios</p>
                    <p className="mt-1 text-xs font-medium">
                      {proposalSources.snapshot.businessPlan?.approvedContext ? "Contexto aprovado congelado" : "Sem contexto aprovado"}
                    </p>
                    <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[10px] text-muted-foreground">
                      {proposalSources.snapshot.businessPlan?.approvedContext || "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Orçamento</p>
                    <p className="mt-1 text-xs font-medium">
                      {proposalSources.snapshot.budget?.title || "Não vinculado"}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      ID: {proposalSources.snapshot.budget?.id || "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cliente</p>
                    <p className="mt-1 text-xs font-medium">
                      {proposalSources.snapshot.client?.lead?.empresa || proposalSources.snapshot.client?.lead?.nome || "—"}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Briefing {proposalSources.snapshot.client?.briefing ? "incluído" : "não disponível"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Catálogo e mídias</p>
                    <p className="mt-1 text-xs font-medium">
                      {(proposalSources.snapshot.catalog?.linkedProducts?.length ?? 0)} produto(s) · {(proposalSources.snapshot.media?.proposalImages?.length ?? 0)} imagem(ns)
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {(proposalSources.snapshot.media?.attachments?.length ?? 0)} anexo(s)
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">Snapshot histórico</p>
                    <Badge variant="outline" className="text-[10px]">
                      {proposalSources.snapshot.capturedAt
                        ? new Date(proposalSources.snapshot.capturedAt).toLocaleString("pt-BR")
                        : "data indisponível"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Esta versão preserva as fontes usadas na geração. Alterações futuras nos cadastros não reescrevem este registro.
                  </p>
                </div>

                {(proposalSources.snapshot.pending?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">Pendências existentes na emissão</p>
                    <div className="mt-2 space-y-1">
                      {proposalSources.snapshot.pending.map((item: any, index: number) => (
                        <p key={`${item.code}-${index}`} className="text-[10px] text-amber-800">
                          • {item.message}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Esta versão é anterior à rastreabilidade completa e não possui snapshot de fontes salvo.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProposalSourcesOpen(false)}>
              Fechar
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
                  Revisar e editar
                </Button>
              ) : (
                <div className="flex items-center gap-2 mr-6">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-muted-foreground" onClick={cancelEditMode} disabled={editSaving}>
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={saveEditedHtml} disabled={editSaving}>
                    {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {editSaving ? "Salvando…" : "Salvar como nova revisão"}
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
                <Button variant="outline" size="sm" className="gap-1" onClick={openProposalSources}>
                  <ListChecks className="h-3.5 w-3.5" />
                  Fontes utilizadas
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
