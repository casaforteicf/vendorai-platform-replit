import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  useGenerateLeadProposal,
  useCreateLeadProduct,
  useDeleteLeadProduct,
  useRequestUploadUrl,
  useListPropostas,
  useUpdatePropostaStatus,
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

  // Imagens da proposta
  const [proposalImages, setProposalImages] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

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

  function copyPublicLink(publicToken: string | null | undefined) {
    if (!publicToken) {
      toast({ title: "Link público não disponível para esta proposta", variant: "destructive" });
      return;
    }
    const url = `${window.location.origin}/p/${publicToken}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copiado para a área de transferência!" });
    }).catch(() => {
      toast({ title: `Link: ${url}` });
    });
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
    data: products = [],
    isLoading: loadingProducts,
  } = useListLeadProducts(leadId, { request: { headers: { Authorization: `Bearer ${token}` } } });

  const generateMutation = useGenerateLeadProposal({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });
  const createProductMutation = useCreateLeadProduct({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });
  const deleteProductMutation = useDeleteLeadProduct({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  useEffect(() => {
    // Sync lead fields when lead prop changes
    setMercadoSegmento(lead?.mercadoSegmento ?? "");
    setLogoUrl(lead?.logoUrl ?? "");
    setWebsiteUrl(lead?.websiteUrl ?? "");
    setCorDestaque(lead?.corDestaque ?? "#A78BFA");
    setCorSecundaria(lead?.corSecundaria ?? "");
  }, [lead]);

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

  async function uploadImageFile(file: File): Promise<string> {
    const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
      requestUploadUrl.mutate(
        { data: { name: file.name, size: file.size, contentType: file.type || "image/jpeg" } },
        { onSuccess: resolve, onError: reject },
      );
    });
    const uploadRes = await fetch(result.uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "image/jpeg" },
    });
    if (!uploadRes.ok) throw new Error("Upload falhou");
    return `/api/storage/${result.objectPath}`;
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
    if (rendersLoaded) return;
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
    setRefineOpen(false);
    setGenerating(true);
    try {
      const created = await generateMutation.mutateAsync({
        leadId,
        data: {
          segmento: mercadoSegmento || undefined,
          logoUrl: logoUrl || undefined,
          websiteUrl: websiteUrl || undefined,
          corDestaque: corDestaque || undefined,
          corSecundaria: corSecundaria || undefined,
          imagens: proposalImages.length > 0 ? proposalImages : undefined,
          objetivo: lead?.objetivo || undefined,
          propostaId: selectedOrcamentoId !== "__none__" ? selectedOrcamentoId : undefined,
          refinementNotes: notes?.trim() || undefined,
        } as any,
      });
      toast({ title: `Proposta v${created.version} gerada com sucesso` });
      queryClient.invalidateQueries({ queryKey: ["listLeadProposals", leadId] });
      setActiveVersion(created.version);
      if (created.htmlContent) {
        setPreviewHtml(created.htmlContent);
        setPreviewOpen(true);
      } else {
        await previewProposal(created.version);
      }
    } catch (e: any) {
      const msg = e?.error || e?.message || "Erro ao gerar proposta";
      toast({ title: "Erro na geração", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function previewProposal(version: number) {
    if (!leadId || !token) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/proposals/${version}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setPreviewHtml(data.htmlContent);
      setActiveVersion(version);
      setPreviewOpen(true);
    } catch {
      /* ignore */
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
    const clientName = (lead?.empresa || lead?.nome || "cliente")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "_").toLowerCase();
    const filename = `proposta_${clientName}_v${version}.${format === "pdf" ? "pdf" : "html"}`;
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

  return (
    <div className="space-y-4">
      {/* Dados da Proposta */}
      <Card data-testid="card-proposta-config">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Dados da Proposta
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={saveLeadFields}
              disabled={savingLead}
            >
              {savingLead ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Salvar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>

      {/* Imagens da Proposta */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ImagePlus className="h-4 w-4" />
            Imagens da Proposta
            {proposalImages.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">{proposalImages.length} selecionada{proposalImages.length > 1 ? "s" : ""}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Imagens selecionadas — sempre visíveis no topo */}
          {proposalImages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">
                Selecionadas (1ª será destaque na capa):
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {proposalImages.map((url, idx) => (
                  <div key={idx} className="relative group rounded overflow-hidden border aspect-video bg-muted">
                    {idx === 0 && (
                      <span className="absolute top-0.5 left-0.5 z-10 bg-black/70 text-white text-[9px] font-medium px-1 py-0.5 rounded">
                        Capa
                      </span>
                    )}
                    <img
                      src={url}
                      alt={`Imagem ${idx + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <button
                      onClick={() => setProposalImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Abas de fonte de imagem */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button
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
            <button
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
          </div>

          {/* Aba: Importar */}
          {imageSourceTab === "upload" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Envie imagens do seu computador para compor a proposta.
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

          {/* Aba: Renderizações 3D */}
          {imageSourceTab === "renders" && (
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Gere renders no módulo Arch para usar aqui.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Clique para adicionar ou remover da seleção:
                  </p>
                  <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-0.5">
                    {renders.map((r) => {
                      const selected = proposalImages.includes(r.imageUrl);
                      return (
                        <button
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
        </CardContent>
      </Card>

      {/* Produtos do Cliente */}
      <Card data-testid="card-proposta-produtos">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Produtos do Cliente
              {products.length > 0 && (
                <Badge variant="outline" className="text-xs ml-1">{products.length}</Badge>
              )}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => setShowProducts((s) => !s)}
            >
              {showProducts ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showProducts ? "Ocultar" : "Gerenciar"}
            </Button>
          </CardTitle>
        </CardHeader>
        {showProducts && (
          <CardContent className="space-y-3">
            {loadingProducts ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {products.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-muted/50">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.imagemUrl ? (
                          <img
                            src={p.imagemUrl.startsWith("/objects/") ? `/api/storage${p.imagemUrl}` : p.imagemUrl}
                            alt=""
                            className="h-6 w-6 rounded object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <Image className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm truncate">{p.nome}</span>
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeProduct(p.id)}>
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  {products.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum produto cadastrado.</p>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Input
                      value={newProductNome}
                      onChange={(e) => setNewProductNome(e.target.value)}
                      placeholder="Nome do produto"
                      className="h-8 text-sm"
                    />
                  </div>
                  <Input
                    value={newProductImagem}
                    onChange={(e) => setNewProductImagem(e.target.value)}
                    placeholder="URL imagem (opcional)"
                    className="h-8 text-sm flex-1"
                  />
                  <Button size="sm" className="h-8 gap-1" onClick={addProduct} disabled={addingProduct || !newProductNome.trim()}>
                    {addingProduct ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Adicionar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Orçamentos vinculados */}
      <Card data-testid="card-orcamentos-lead">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Orçamentos
              {orcamentos.length > 0 && (
                <Badge variant="outline" className="text-xs">{orcamentos.length}</Badge>
              )}
            </span>
            <a href="/propostas" className="text-xs font-normal text-muted-foreground hover:text-foreground underline underline-offset-2">
              + Novo orçamento
            </a>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOrcamentos ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}
            </div>
          ) : orcamentos.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              Nenhum orçamento criado para este lead.{" "}
              <a href="/propostas" className="underline underline-offset-2 hover:text-foreground">
                Criar orçamento
              </a>
            </p>
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
                      <a href={`/propostas/${orc.id}/print`} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver orçamento">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
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

      {/* Propostas Geradas */}
      <Card data-testid="card-propostas-geradas">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Propostas Geradas
              {proposals.length > 0 && (
                <Badge variant="outline" className="text-xs ml-1">{proposals.length}</Badge>
              )}
            </span>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => openRefineDialog()}
              disabled={generating}
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {generating ? "Gerando..." : "Gerar Proposta"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Seletor de orçamento a incluir */}
          {orcamentos.length > 0 && (
            <div className="mb-4 space-y-1 pb-4 border-b">
              <label className="text-xs text-muted-foreground font-medium">
                Orçamento a incluir na proposta
              </label>
              <Select
                value={selectedOrcamentoId}
                onValueChange={setSelectedOrcamentoId}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Nenhum orçamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum orçamento</SelectItem>
                  {orcamentos.map((orc) => {
                    const total = orc.valorTotal
                      ? parseFloat(orc.valorTotal as string).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : null;
                    return (
                      <SelectItem key={orc.id} value={orc.id}>
                        {orc.titulo}{total ? ` — ${total}` : ""}
                        {orc.numero ? ` (Nº ${orc.numero})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedOrcamentoId !== "__none__" && (
                <p className="text-xs text-muted-foreground mt-1">
                  O orçamento selecionado será embutido como seção de precificação na proposta gerada.
                </p>
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
                        title="Copiar link público"
                        onClick={() => copyPublicLink((p as any).publicToken)}
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
                        ? `${prev.trim()}\n${chip}`
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
                srcDoc={editMode && editableHtml ? editableHtml : previewHtml}
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
