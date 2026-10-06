import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AudioLines,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Film,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Plus,
  Save,
  Wrench,
} from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function apiJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as any)?.error ?? `Falha na requisição (HTTP ${response.status})`);
  }
  return body as T;
}

async function checkedRequest(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Falha na requisição (HTTP ${response.status})`);
  return response;
}

async function checkedUpload(url: string, file: File): Promise<void> {
  await checkedRequest(url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
}

const STATUS_FLOW = [
  "orcamento_pendente",
  "orcamento_enviado",
  "aprovado",
  "agendado",
  "em_andamento",
  "aguardando_validacao",
  "concluido",
] as const;

const STATUS_LABELS: Record<string, string> = {
  orcamento_pendente: "Orçamento pendente",
  orcamento_enviado: "Orçamento enviado",
  aprovado: "Aprovado",
  agendado: "Agendado",
  em_andamento: "Em andamento",
  aguardando_validacao: "Aguardando validação",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  orcamento_pendente: "bg-slate-50 text-slate-600 border-slate-200",
  orcamento_enviado: "bg-blue-50 text-blue-700 border-blue-200",
  aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  agendado: "bg-violet-50 text-violet-700 border-violet-200",
  em_andamento: "bg-amber-50 text-amber-700 border-amber-200",
  aguardando_validacao: "bg-orange-50 text-orange-700 border-orange-200",
  concluido: "bg-green-50 text-green-700 border-green-200",
  cancelado: "bg-red-50 text-red-700 border-red-200",
};

const MODELOS = [
  ["geral", "Geral"],
  ["producao", "Produção"],
  ["expedicao", "Expedição"],
  ["entrega", "Entrega"],
  ["instalacao", "Instalação"],
  ["assistencia", "Assistência técnica"],
  ["suporte", "Suporte"],
  ["vistoria", "Vistoria"],
  ["manutencao", "Manutenção"],
] as const;

function fmt(v: number | string | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function nextStatus(atual: string): string | null {
  const idx = STATUS_FLOW.indexOf(atual as any);
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}

async function uploadEvidence(file: File): Promise<string> {
  const token = localStorage.getItem("vendorai_token");
  const payload = await apiJson<{ uploadURL?: string; objectPath?: string; error?: string }>(
    "/api/storage/uploads/request-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
    },
  );
  if (!payload.uploadURL || !payload.objectPath) {
    throw new Error(payload.error || "Falha ao preparar upload.");
  }
  await checkedUpload(payload.uploadURL, file);
  return payload.objectPath;
}

type ServicoMidiaForm = {
  id: string;
  url: string;
  tipo: "image" | "video" | "audio";
  nome?: string | null;
  mimeType?: string | null;
  criadoEm?: string | null;
  criadoPorNome?: string | null;
};

function tipoMidia(file: File): ServicoMidiaForm["tipo"] | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

function mediaApiUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/api/storage/objects/")) return value;
  if (value.startsWith("/objects/")) return `/api/storage/objects/${value.slice("/objects/".length)}`;
  return value;
}

function MidiaPreview({ midia }: { midia: ServicoMidiaForm }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    const raw = mediaApiUrl(midia.url);
    if (/^https?:\/\//i.test(raw)) {
      setSrc(raw);
      return;
    }
    fetch(raw, { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao carregar mídia");
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(""));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [midia.url]);

  const frame = "w-full rounded-md border bg-muted";
  if (!src) return <div className={`${frame} aspect-video flex items-center justify-center text-xs text-muted-foreground`}>Carregando mídia…</div>;
  if (midia.tipo === "video") return <video src={src} controls preload="metadata" className={`${frame} aspect-video object-contain`} />;
  if (midia.tipo === "audio") return <audio src={src} controls preload="metadata" className="w-full" />;
  return <img src={src} alt={midia.nome ?? "Mídia da assistência"} loading="lazy" className={`${frame} aspect-video object-cover`} />;
}

type ServicoCampoForm = {
  id: string;
  label: string;
  tipo: "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "file";
  valor: string | number | boolean | string[] | null;
  obrigatorio: boolean;
  placeholder?: string | null;
  opcoes?: string[];
  visibilidade?: "interno" | "cliente" | "cliente_parceiro";
};

function campoVazio(def?: Partial<ServicoCampoForm>): ServicoCampoForm {
  const tipo = (def?.tipo ?? "text") as ServicoCampoForm["tipo"];
  return {
    id: def?.id ?? crypto.randomUUID(),
    label: def?.label ?? "",
    tipo,
    valor: tipo === "checkbox" ? false : tipo === "file" ? [] : "",
    obrigatorio: Boolean(def?.obrigatorio),
    placeholder: def?.placeholder ?? null,
    opcoes: Array.isArray(def?.opcoes) ? def!.opcoes : [],
    visibilidade: def?.visibilidade ?? "interno",
  };
}

function campoPreenchido(campo: ServicoCampoForm) {
  if (campo.tipo === "checkbox") return typeof campo.valor === "boolean";
  if (campo.tipo === "file") return Array.isArray(campo.valor) && campo.valor.length > 0;
  if (campo.tipo === "number") return campo.valor !== "" && campo.valor != null && Number.isFinite(Number(campo.valor));
  return String(campo.valor ?? "").trim().length > 0;
}

function CampoValorInput({
  campo,
  onChange,
}: {
  campo: ServicoCampoForm;
  onChange: (valor: ServicoCampoForm["valor"]) => void;
}) {
  if (campo.tipo === "textarea") {
    return <Textarea rows={2} value={String(campo.valor ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={campo.placeholder ?? ""} />;
  }
  if (campo.tipo === "select") {
    return (
      <Select value={String(campo.valor ?? "")} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={campo.placeholder ?? "Selecione..."} /></SelectTrigger>
        <SelectContent>
          {(campo.opcoes ?? []).map((opcao) => <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (campo.tipo === "checkbox") {
    return (
      <Select value={campo.valor === true ? "sim" : "nao"} onValueChange={(v) => onChange(v === "sim")}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="sim">Sim</SelectItem>
          <SelectItem value="nao">Não</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (campo.tipo === "file") {
    return (
      <Input
        value={Array.isArray(campo.valor) ? campo.valor.join(", ") : ""}
        onChange={(e) => onChange(e.target.value.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean))}
        placeholder="Links ou caminhos dos arquivos, separados por vírgula"
      />
    );
  }
  return (
    <Input
      type={campo.tipo === "number" ? "number" : campo.tipo === "date" ? "date" : "text"}
      value={campo.valor == null ? "" : String(campo.valor)}
      onChange={(e) => onChange(campo.tipo === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
      placeholder={campo.placeholder ?? ""}
    />
  );
}

function NovaOrdemDialog({
  tenantId,
  open,
  onOpenChange,
}: {
  tenantId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modeloExecucao, setModeloExecucao] = useState("geral");
  const [modeloOsId, setModeloOsId] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [negocioId, setNegocioId] = useState("");
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [enderecoAtendimento, setEnderecoAtendimento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [camposPersonalizados, setCamposPersonalizados] = useState<ServicoCampoForm[]>([]);

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ["leads-search", tenantId, clienteSearch],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/leads?limit=10&search=${encodeURIComponent(clienteSearch)}`, { headers: authHeaders() })
        .then((r) => r.json()).then((d) => Array.isArray(d) ? d : d.leads ?? []),
    enabled: !!tenantId && clienteSearch.length >= 2,
  });

  const { data: modelosOs = [] } = useQuery<any[]>({
    queryKey: ["servicos-modelos-os", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/servicos/modelos-os`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  const { data: tipos = [] } = useQuery<any[]>({
    queryKey: ["servicos-tipos", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/servicos/tipos`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  const { data: negociosRaw = [] } = useQuery<any>({
    queryKey: ["servicos-negocios", tenantId, selectedLead?.id],
    queryFn: () => fetch(`/api/tenants/${tenantId}/deals?leadId=${selectedLead.id}`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && !!selectedLead?.id && open,
  });

  const negocios = Array.isArray(negociosRaw)
    ? negociosRaw
    : Array.isArray(negociosRaw?.deals)
      ? negociosRaw.deals
      : Array.isArray(negociosRaw?.data)
        ? negociosRaw.data
        : [];

  const create = useMutation({
    mutationFn: (payload: any) =>
      apiJson(`/api/tenants/${tenantId}/servicos/ordens`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["servicos-ordens", tenantId] });
      toast({ title: "Ordem de serviço criada com checklist de execução." });
      onOpenChange(false);
      setModeloExecucao("geral");
      setModeloOsId("");
      setClienteSearch("");
      setSelectedLead(null);
      setNegocioId("");
      setTipoServicoId("");
      setEnderecoAtendimento("");
      setObservacoes("");
      setCamposPersonalizados([]);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLead || !tipoServicoId || !enderecoAtendimento) {
      toast({ title: "Cliente, tipo de serviço e endereço são obrigatórios", variant: "destructive" });
      return;
    }
    const camposInvalidos = camposPersonalizados.filter((campo) =>
      !campo.label.trim() || (campo.obrigatorio && !campoPreenchido(campo))
    );
    if (camposInvalidos.length) {
      toast({ title: "Revise os campos adicionais obrigatórios", variant: "destructive" });
      return;
    }
    create.mutate({
      clienteId: selectedLead.id,
      negocioId: negocioId || undefined,
      tipoServicoId,
      modeloExecucao,
      modeloOsId: modeloOsId || undefined,
      enderecoAtendimento,
      observacoes: observacoes || undefined,
      camposPersonalizados,
      clienteAcompanha: true,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Serviço</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Modelo da ordem <span className="text-destructive">*</span></Label>
            <Select
              value={modeloOsId ? `custom:${modeloOsId}` : `system:${modeloExecucao}`}
              onValueChange={(value) => {
                if (value.startsWith("custom:")) {
                  const id = value.slice("custom:".length);
                  const model = (Array.isArray(modelosOs) ? modelosOs : []).find((item: any) => item.id === id);
                  setModeloOsId(id);
                  if (model?.tipo) setModeloExecucao(model.tipo);
                  setCamposPersonalizados(
                    Array.isArray(model?.campos)
                      ? model.campos.map((campo: any) => campoVazio(campo))
                      : [],
                  );
                } else {
                  setModeloOsId("");
                  setModeloExecucao(value.slice("system:".length));
                  setCamposPersonalizados([]);
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.isArray(modelosOs) && modelosOs.length > 0 && (
                  <>
                    {modelosOs.map((model: any) => (
                      <SelectItem key={model.id} value={`custom:${model.id}`}>
                        {model.nome}{model.padrao ? " · Padrão" : ""}
                      </SelectItem>
                    ))}
                  </>
                )}
                {MODELOS.map(([value, label]) => (
                  <SelectItem key={value} value={`system:${value}`}>{label} · modelo do sistema</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Modelos personalizados do tenant definem o checklist, evidências e regras padrão da execução.
            </p>
          </div>

          <div className="space-y-1.5 relative">
            <Label>Cliente <span className="text-destructive">*</span></Label>
            <Input
              value={selectedLead ? selectedLead.nome : clienteSearch}
              onChange={(e) => {
                setSelectedLead(null);
                setNegocioId("");
                setClienteSearch(e.target.value);
              }}
              placeholder="Buscar por nome ou telefone..."
            />
            {!selectedLead && clienteSearch.length >= 2 && Array.isArray(leads) && leads.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 bg-popover border rounded-md shadow-md mt-1 max-h-40 overflow-y-auto">
                {leads.map((l: any) => (
                  <button
                    key={l.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => {
                      setSelectedLead(l);
                      setClienteSearch("");
                    }}
                  >
                    {l.nome} {l.telefone ? `· ${l.telefone}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedLead && negocios.length > 0 && (
            <div className="space-y-1.5">
              <Label>Negócio relacionado</Label>
              <Select value={negocioId || "none"} onValueChange={(v) => setNegocioId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o negócio..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem negócio vinculado</SelectItem>
                  {negocios.map((n: any) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.titulo} {n.valor != null ? `· ${fmt(n.valor)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tipo de serviço <span className="text-destructive">*</span></Label>
            <Select value={tipoServicoId} onValueChange={setTipoServicoId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {tipos.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Endereço de atendimento <span className="text-destructive">*</span></Label>
            <Textarea
              value={enderecoAtendimento}
              onChange={(e) => setEnderecoAtendimento(e.target.value)}
              rows={2}
              placeholder="Rua, número, bairro, cidade"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Orientações / observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              placeholder="Inclua aqui informações importantes para quem vai executar."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label>Campos da ordem</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  O modelo selecionado preenche esta estrutura automaticamente. Você também pode adicionar campos extras nesta OS.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setCamposPersonalizados((items) => [...items, campoVazio()])}>
                <Plus className="h-4 w-4 mr-2" /> Adicionar campo
              </Button>
            </div>
            {camposPersonalizados.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Nenhum campo adicional neste modelo.
              </div>
            ) : (
              <div className="space-y-3">
                {camposPersonalizados.map((campo, index) => (
                  <div key={campo.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={campo.label}
                        onChange={(e) => setCamposPersonalizados((items) => items.map((x, i) => i === index ? { ...x, label: e.target.value } : x))}
                        placeholder="Nome do campo"
                      />
                      <Badge variant="outline">{campo.obrigatorio ? "Obrigatório" : "Opcional"}</Badge>
                      <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setCamposPersonalizados((items) => items.filter((_, i) => i !== index))}>
                        Remover
                      </Button>
                    </div>
                    <CampoValorInput
                      campo={campo}
                      onChange={(valor) => setCamposPersonalizados((items) => items.map((x, i) => i === index ? { ...x, valor } : x))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
            <Eye className="h-4 w-4 mt-0.5 shrink-0" />
            O acompanhamento do cliente fica ativo por padrão. Evidências e avanços da execução alimentam a timeline da OS.
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Criar OS
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExecucaoDialog({
  tenantId,
  ordem,
  open,
  onOpenChange,
}: {
  tenantId: string;
  ordem: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [enderecoDraft, setEnderecoDraft] = useState(ordem?.enderecoAtendimento ?? "");
  const [observacoesDraft, setObservacoesDraft] = useState(ordem?.observacoes ?? "");
  const [camposDraft, setCamposDraft] = useState<ServicoCampoForm[]>(
    Array.isArray(ordem?.camposPersonalizados) ? ordem.camposPersonalizados : [],
  );

  useEffect(() => {
    setEnderecoDraft(ordem?.enderecoAtendimento ?? "");
    setObservacoesDraft(ordem?.observacoes ?? "");
    setCamposDraft(Array.isArray(ordem?.camposPersonalizados) ? ordem.camposPersonalizados : []);
  }, [ordem?.id, ordem?.enderecoAtendimento, ordem?.observacoes, ordem?.camposPersonalizados]);

  const checklist = Array.isArray(ordem?.checklistExecucao) ? ordem.checklistExecucao : [];
  const obrigatorios = checklist.filter((i: any) => i.obrigatorio);
  const concluidos = obrigatorios.filter((i: any) => i.concluido).length;
  const percentual = obrigatorios.length ? Math.round((concluidos / obrigatorios.length) * 100) : 0;
  const midiasAssistencia = checklist.flatMap((item: any) => {
    const midias: ServicoMidiaForm[] = Array.isArray(item.midias) && item.midias.length
      ? item.midias
      : (item.fotos ?? []).map((url: string) => ({ id: `legacy-${item.id}-${url}`, url, tipo: "image" as const }));
    return midias.map((midia) => ({ ...midia, checklistItemId: item.id, etapa: item.titulo, visibilidade: item.visibilidade ?? "interno" }));
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: string; payload: any }) =>
      apiJson(`/api/tenants/${tenantId}/servicos/ordens/${ordem.id}/checklist/${itemId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }),
    onSuccess: (updated) => {
      qc.setQueryData<any[]>(["servicos-ordens", tenantId], (rows = []) =>
        rows.map((row) => row.id === updated.id ? { ...row, ...updated } : row),
      );
      qc.invalidateQueries({ queryKey: ["servicos-ordens", tenantId] });
      toast({ title: updated.status === "concluido" ? "OS concluída e pipeline atualizada." : "Passo registrado." });
    },
    onError: (e: any) => toast({ title: "Falta comprovação", description: e.message, variant: "destructive" }),
  });

  const updateSharing = useMutation({
    mutationFn: (payload: { compartilharStatusCliente?: boolean; clienteAcompanha?: boolean }) =>
      apiJson(`/api/tenants/${tenantId}/servicos/ordens/${ordem.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }),
    onSuccess: (updated) => {
      qc.setQueryData<any[]>(["servicos-ordens", tenantId], (rows = []) =>
        rows.map((row) => row.id === updated.id ? { ...row, ...updated } : row),
      );
      qc.invalidateQueries({ queryKey: ["servicos-ordens", tenantId] });
      toast({ title: "Compartilhamento atualizado." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateDados = useMutation({
    mutationFn: () =>
      apiJson(`/api/tenants/${tenantId}/servicos/ordens/${ordem.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          enderecoAtendimento: enderecoDraft,
          observacoes: observacoesDraft || null,
          camposPersonalizados: camposDraft,
        }),
      }),
    onSuccess: (updated) => {
      qc.setQueryData<any[]>(["servicos-ordens", tenantId], (rows = []) =>
        rows.map((row) => row.id === updated.id ? { ...row, ...updated } : row),
      );
      qc.invalidateQueries({ queryKey: ["servicos-ordens", tenantId] });
      toast({ title: "Dados da OS atualizados." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar OS", description: e.message, variant: "destructive" }),
  });

  async function addMedia(item: any, file: File | undefined) {
    if (!file) return;
    const tipo = tipoMidia(file);
    if (!tipo) {
      toast({ title: "Formato não suportado", description: "Use imagem, vídeo ou áudio.", variant: "destructive" });
      return;
    }
    try {
      setUploadingId(item.id);
      const path = await uploadEvidence(file);
      const atuais: ServicoMidiaForm[] = Array.isArray(item.midias) && item.midias.length
        ? item.midias
        : (item.fotos ?? []).map((url: string) => ({ id: crypto.randomUUID(), url, tipo: "image" as const }));
      const midia: ServicoMidiaForm = {
        id: crypto.randomUUID(),
        url: path,
        tipo,
        nome: file.name,
        mimeType: file.type || null,
        criadoEm: new Date().toISOString(),
      };
      await updateItem.mutateAsync({
        itemId: item.id,
        payload: {
          concluido: false,
          observacao: drafts[item.id] ?? item.observacao ?? "",
          midias: [...atuais, midia],
          visibilidade: item.visibilidade ?? "interno",
        },
      });
      toast({ title: tipo === "video" ? "Vídeo salvo em Mídias." : tipo === "audio" ? "Áudio salvo em Mídias." : "Imagem salva em Mídias." });
    } catch (e: any) {
      toast({ title: "Erro ao salvar mídia", description: e.message, variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Execução da Ordem de Serviço</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="font-medium">{ordem?.cliente?.nome ?? "Cliente"}</p>
                <p className="text-sm text-muted-foreground">{ordem?.tipoServico?.nome ?? "Serviço"}</p>
                {ordem?.negocio && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Negócio: {ordem.negocio.titulo}
                    {ordem.negocio.valor != null ? ` · ${fmt(ordem.negocio.valor)}` : ""}
                    {ordem.negocio.etapa ? ` · ${ordem.negocio.etapa}` : ""}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {ordem?.enderecoAtendimento}
                </p>
                {ordem?.observacoes && (
                  <p className="text-sm mt-3 whitespace-pre-wrap">{ordem.observacoes}</p>
                )}
              </div>
              <Badge variant="outline">{percentual}% validado</Badge>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${percentual}%` }} />
            </div>

            {ordem?.clienteAcompanha && ordem?.portalToken && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`/acompanhar/servico/${ordem.portalToken}`, "_blank", "noopener,noreferrer")}
                >
                  <Eye className="h-4 w-4 mr-2" /> Ver como o cliente
                </Button>
                <span className="text-xs text-muted-foreground">
                  A visão pública mostra somente a etapa e as ações liberadas para o cliente.
                </span>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Compartilhar etapa atual com o cliente</Label>
                <Select
                  value={ordem?.compartilharStatusCliente === false ? "interno" : "cliente"}
                  onValueChange={(value) => updateSharing.mutate({ compartilharStatusCliente: value === "cliente" })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cliente">Mostrar etapa/status ao cliente</SelectItem>
                    <SelectItem value="interno">Manter etapa somente interna</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Acompanhamento da OS</Label>
                <Select
                  value={ordem?.clienteAcompanha === false ? "desativado" : "ativo"}
                  onValueChange={(value) => updateSharing.mutate({ clienteAcompanha: value === "ativo" })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Cliente pode acompanhar</SelectItem>
                    <SelectItem value="desativado">Não compartilhar esta OS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <h3 className="font-semibold text-sm">Dados editáveis da ordem</h3>
              <p className="text-xs text-muted-foreground mt-1">Atualize os dados da OS e os campos específicos do modelo.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Endereço de atendimento</Label>
              <Textarea rows={2} value={enderecoDraft} onChange={(e) => setEnderecoDraft(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Orientações / observações</Label>
              <Textarea rows={3} value={observacoesDraft} onChange={(e) => setObservacoesDraft(e.target.value)} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Campos personalizados</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setCamposDraft((items) => [...items, campoVazio()])}>
                  <Plus className="h-4 w-4 mr-2" /> Campo
                </Button>
              </div>
              {camposDraft.map((campo, index) => (
                <div key={campo.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={campo.label}
                      onChange={(e) => setCamposDraft((items) => items.map((x, i) => i === index ? { ...x, label: e.target.value } : x))}
                      placeholder="Nome do campo"
                    />
                    <Badge variant="outline">{campo.obrigatorio ? "Obrigatório" : "Opcional"}</Badge>
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setCamposDraft((items) => items.filter((_, i) => i !== index))}>
                      Remover
                    </Button>
                  </div>
                  <CampoValorInput
                    campo={campo}
                    onChange={(valor) => setCamposDraft((items) => items.map((x, i) => i === index ? { ...x, valor } : x))}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  const invalidos = camposDraft.filter((campo) => !campo.label.trim() || (campo.obrigatorio && !campoPreenchido(campo)));
                  if (!enderecoDraft.trim()) {
                    toast({ title: "O endereço de atendimento é obrigatório", variant: "destructive" });
                    return;
                  }
                  if (invalidos.length) {
                    toast({ title: "Revise os campos obrigatórios", variant: "destructive" });
                    return;
                  }
                  updateDados.mutate();
                }}
                disabled={updateDados.isPending}
              >
                {updateDados.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar dados da OS
              </Button>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-sm">Mídias da assistência</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Imagens, vídeos e áudios ficam aqui como evidências visuais da execução. Documentos continuam em Anexos.
                </p>
              </div>
              <Badge variant="secondary">{midiasAssistencia.length} mídia(s)</Badge>
            </div>
            {midiasAssistencia.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Nenhuma mídia registrada nesta assistência.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {midiasAssistencia.map((midia: any) => (
                  <div key={midia.id} className="rounded-lg border p-2 space-y-2">
                    <MidiaPreview midia={midia} />
                    <div className="flex items-center gap-2 min-w-0">
                      {midia.tipo === "video" ? <Film className="h-4 w-4 shrink-0" /> : midia.tipo === "audio" ? <AudioLines className="h-4 w-4 shrink-0" /> : <ImageIcon className="h-4 w-4 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{midia.nome ?? (midia.tipo === "video" ? "Vídeo" : midia.tipo === "audio" ? "Áudio" : "Imagem")}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{midia.etapa}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardCheck className="h-4 w-4" />
              <h3 className="font-semibold text-sm">Passo a passo de execução</h3>
            </div>

            <div className="space-y-3">
              {checklist.map((item: any, index: number) => {
                const text = drafts[item.id] ?? item.observacao ?? "";
                return (
                  <div key={item.id} className={`rounded-lg border p-4 ${item.concluido ? "bg-emerald-50/40" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${item.concluido ? "bg-emerald-600 text-white border-emerald-600" : "bg-background"}`}>
                        {item.concluido ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </div>
                      <div className="flex-1 min-w-0 space-y-3">
                        <div>
                          <p className="font-medium text-sm">{item.titulo}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.obrigatorio ? "Obrigatório" : "Opcional"} · Evidência: {
                              item.evidencia === "photo" ? "mídia visual"
                              : item.evidencia === "text" ? "texto"
                              : item.evidencia === "text_and_photo" ? "texto + mídia visual"
                              : item.evidencia === "confirmation" ? "confirmação"
                              : "texto ou mídia visual"
                            }
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Quem pode ver esta ação e suas evidências?</Label>
                          <Select
                            value={item.visibilidade ?? "interno"}
                            onValueChange={(visibilidade) =>
                              updateItem.mutate({
                                itemId: item.id,
                                payload: { visibilidade },
                              })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="interno">Somente equipe interna</SelectItem>
                              <SelectItem value="cliente">Compartilhar com o cliente/lead</SelectItem>
                              <SelectItem value="cliente_parceiro">Cliente + parceiro responsável</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Textarea
                          value={text}
                          onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                          rows={2}
                          placeholder="Descreva o que foi feito, situação encontrada, divergências ou observações..."
                          disabled={item.concluido}
                        />

                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="inline-flex">
                            <input
                              type="file"
                              accept="image/*,video/*,audio/*"
                              className="hidden"
                              disabled={item.concluido || uploadingId === item.id}
                              onChange={(e) => addMedia(item, e.target.files?.[0])}
                            />
                            <span className="inline-flex h-9 cursor-pointer items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted">
                              {uploadingId === item.id
                                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                : <Camera className="h-4 w-4 mr-2" />}
                              Adicionar mídia
                            </span>
                          </label>

                          {((item.midias?.length ?? 0) || (item.fotos?.length ?? 0)) > 0 && (
                            <Badge variant="secondary">{(item.midias?.length ?? item.fotos?.length ?? 0)} mídia(s)</Badge>
                          )}

                          {!item.concluido ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                updateItem.mutate({
                                  itemId: item.id,
                                  payload: {
                                    concluido: true,
                                    observacao: text,
                                    midias: item.midias ?? (item.fotos ?? []).map((url: string) => ({ id: crypto.randomUUID(), url, tipo: "image" })),
                                    visibilidade: item.visibilidade ?? "interno",
                                  },
                                })
                              }
                              disabled={updateItem.isPending || uploadingId === item.id}
                            >
                              <Save className="h-4 w-4 mr-2" /> Validar passo
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateItem.mutate({
                                  itemId: item.id,
                                  payload: {
                                    concluido: false,
                                    observacao: text,
                                    midias: item.midias ?? (item.fotos ?? []).map((url: string) => ({ id: crypto.randomUUID(), url, tipo: "image" })),
                                    visibilidade: item.visibilidade ?? "interno",
                                  },
                                })
                              }
                            >
                              Reabrir
                            </Button>
                          )}
                        </div>

                        {(((item.midias?.length ?? 0) || (item.fotos?.length ?? 0)) > 0) && (
                          <div className="grid gap-2 sm:grid-cols-3">
                            {(item.midias ?? (item.fotos ?? []).map((url: string) => ({ id: `legacy-${url}`, url, tipo: "image" }))).map((midia: ServicoMidiaForm) => (
                              <div key={midia.id} className="rounded-md border p-2">
                                <MidiaPreview midia={midia} />
                              </div>
                            ))}
                          </div>
                        )}

                        {item.concluido && (
                          <p className="text-xs text-muted-foreground">
                            Validado por {item.concluidoPorNome ?? "usuário"} · {
                              item.concluidoEm ? new Date(item.concluidoEm).toLocaleString("pt-BR") : ""
                            }
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Ao concluir todos os passos obrigatórios, a OS é concluída automaticamente e a pipeline avança. Cada ação registra responsável, data, hora e evidências. Imagens, vídeos e áudios são organizados em Mídias; documentos permanecem em Anexos. O tenant decide, por etapa e por ação, o que fica interno e o que o cliente/lead pode acompanhar.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModelosOsDialog({
  tenantId,
  open,
  onOpenChange,
}: {
  tenantId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState("assistencia");
  const [padrao, setPadrao] = useState(false);
  const [clienteAcompanhaDefault, setClienteAcompanhaDefault] = useState(true);
  const [compartilharStatusClienteDefault, setCompartilharStatusClienteDefault] = useState(true);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [campos, setCampos] = useState<any[]>([]);

  const QK = ["servicos-modelos-os", tenantId];
  const { data: modelos = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () => fetch(`/api/tenants/${tenantId}/servicos/modelos-os`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  function resetForm() {
    setEditingId(null);
    setNome("");
    setDescricao("");
    setTipo("assistencia");
    setPadrao(false);
    setClienteAcompanhaDefault(true);
    setCompartilharStatusClienteDefault(true);
    setChecklist([]);
    setCampos([]);
  }

  function edit(model: any) {
    setEditingId(model.id);
    setNome(model.nome ?? "");
    setDescricao(model.descricao ?? "");
    setTipo(model.tipo ?? "assistencia");
    setPadrao(Boolean(model.padrao));
    setClienteAcompanhaDefault(model.clienteAcompanhaDefault !== false);
    setCompartilharStatusClienteDefault(model.compartilharStatusClienteDefault !== false);
    setChecklist(Array.isArray(model.checklist) ? model.checklist.map((item: any) => ({ ...item })) : []);
    setCampos(Array.isArray(model.campos) ? model.campos.map((item: any) => ({ ...item })) : []);
  }

  function duplicate(model: any) {
    setEditingId(null);
    setNome(`${model.nome ?? "Modelo"} - cópia`);
    setDescricao(model.descricao ?? "");
    setTipo(model.tipo ?? "assistencia");
    setPadrao(false);
    setClienteAcompanhaDefault(model.clienteAcompanhaDefault !== false);
    setCompartilharStatusClienteDefault(model.compartilharStatusClienteDefault !== false);
    setChecklist(Array.isArray(model.checklist) ? model.checklist.map((item: any) => ({ ...item, id: crypto.randomUUID() })) : []);
    setCampos(Array.isArray(model.campos) ? model.campos.map((item: any) => ({ ...item, id: crypto.randomUUID() })) : []);
  }

  const save = useMutation({
    mutationFn: () => apiJson(
      editingId
        ? `/api/tenants/${tenantId}/servicos/modelos-os/${editingId}`
        : `/api/tenants/${tenantId}/servicos/modelos-os`,
      {
        method: editingId ? "PATCH" : "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          nome,
          descricao: descricao || undefined,
          tipo,
          padrao,
          clienteAcompanhaDefault,
          compartilharStatusClienteDefault,
          checklist: checklist.map((item) => ({
            id: item.id || crypto.randomUUID(),
            titulo: String(item.titulo ?? "").trim(),
            descricao: item.descricao || null,
            obrigatorio: item.obrigatorio !== false,
            evidencia: item.evidencia || "confirmation",
            visibilidade: item.visibilidade || "interno",
          })).filter((item) => item.titulo),
          campos: campos.map((item) => ({
            id: item.id || crypto.randomUUID(),
            label: String(item.label ?? "").trim(),
            tipo: item.tipo || "text",
            obrigatorio: Boolean(item.obrigatorio),
            placeholder: item.placeholder || null,
            opcoes: Array.isArray(item.opcoes) ? item.opcoes : [],
            visibilidade: item.visibilidade || "interno",
          })).filter((item) => item.label),
        }),
      },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: editingId ? "Modelo de OS atualizado." : "Modelo de OS criado." });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Não foi possível salvar o modelo", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`/api/tenants/${tenantId}/servicos/modelos-os/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: "Modelo desativado." });
      if (editingId) resetForm();
    },
    onError: (e: any) => toast({ title: "Não foi possível excluir o modelo", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) resetForm(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modelos de Ordem de Serviço</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Modelos cadastrados</p>
              <p className="text-xs text-muted-foreground">Cada tenant pode manter modelos diferentes para assistência, instalação, suporte e outras execuções.</p>
            </div>

            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !Array.isArray(modelos) || modelos.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum modelo personalizado ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {modelos.map((model: any) => (
                  <div key={model.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{model.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {MODELOS.find(([value]) => value === model.tipo)?.[1] ?? model.tipo}
                          {model.padrao ? " · Padrão" : ""}
                        </p>
                      </div>
                      <Badge variant="outline">{Array.isArray(model.checklist) ? model.checklist.length : 0} passos</Badge>
                    </div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <Button type="button" size="sm" variant="outline" onClick={() => edit(model)}>Editar</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => duplicate(model)}>Duplicar</Button>
                      <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(model.id)}>Excluir</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{editingId ? "Editar modelo" : "Novo modelo"}</p>
                <p className="text-xs text-muted-foreground">Monte o passo a passo que será copiado para cada nova OS.</p>
              </div>
              {editingId && <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Novo modelo</Button>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome do modelo</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Assistência em garantia" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODELOS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="Quando usar este modelo e qual é o objetivo da OS." />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} />
                Modelo padrão deste tipo
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <input type="checkbox" checked={clienteAcompanhaDefault} onChange={(e) => setClienteAcompanhaDefault(e.target.checked)} />
                Cliente acompanha
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <input type="checkbox" checked={compartilharStatusClienteDefault} onChange={(e) => setCompartilharStatusClienteDefault(e.target.checked)} />
                Compartilhar status
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Campos do formulário da OS</Label>
                  <p className="text-xs text-muted-foreground">Esses campos aparecem automaticamente ao cadastrar uma OS com este modelo.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCampos((items) => [...items, {
                    id: crypto.randomUUID(),
                    label: "",
                    tipo: "text",
                    obrigatorio: false,
                    placeholder: "",
                    opcoes: [],
                    visibilidade: "interno",
                  }])}
                >
                  <Plus className="h-4 w-4 mr-2" /> Adicionar campo
                </Button>
              </div>

              {campos.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Nenhum campo personalizado. O modelo usará apenas os dados padrão da OS.
                </div>
              ) : (
                <div className="space-y-3">
                  {campos.map((item, index) => (
                    <div key={item.id ?? index} className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={item.label ?? ""}
                          onChange={(e) => setCampos((items) => items.map((x, i) => i === index ? { ...x, label: e.target.value } : x))}
                          placeholder="Nome do campo"
                        />
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setCampos((items) => items.filter((_, i) => i !== index))}>
                          Remover
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Select
                          value={item.tipo ?? "text"}
                          onValueChange={(value) => setCampos((items) => items.map((x, i) => i === index ? { ...x, tipo: value } : x))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto curto</SelectItem>
                            <SelectItem value="textarea">Texto longo</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="date">Data</SelectItem>
                            <SelectItem value="select">Lista de opções</SelectItem>
                            <SelectItem value="checkbox">Sim / Não</SelectItem>
                            <SelectItem value="file">Arquivo / link</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={item.visibilidade ?? "interno"}
                          onValueChange={(value) => setCampos((items) => items.map((x, i) => i === index ? { ...x, visibilidade: value } : x))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="interno">Interno</SelectItem>
                            <SelectItem value="cliente">Cliente</SelectItem>
                            <SelectItem value="cliente_parceiro">Cliente + parceiro</SelectItem>
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-2 rounded-md border px-3 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(item.obrigatorio)}
                            onChange={(e) => setCampos((items) => items.map((x, i) => i === index ? { ...x, obrigatorio: e.target.checked } : x))}
                          />
                          Obrigatório
                        </label>
                      </div>
                      <Input
                        value={item.placeholder ?? ""}
                        onChange={(e) => setCampos((items) => items.map((x, i) => i === index ? { ...x, placeholder: e.target.value } : x))}
                        placeholder="Texto de ajuda / placeholder"
                      />
                      {item.tipo === "select" && (
                        <Input
                          value={Array.isArray(item.opcoes) ? item.opcoes.join(", ") : ""}
                          onChange={(e) => setCampos((items) => items.map((x, i) => i === index ? {
                            ...x,
                            opcoes: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                          } : x))}
                          placeholder="Opções separadas por vírgula"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Checklist de execução</Label>
                  <p className="text-xs text-muted-foreground">Defina o que deve ser comprovado em cada passo.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setChecklist((items) => [...items, {
                    id: crypto.randomUUID(),
                    titulo: "",
                    descricao: "",
                    obrigatorio: true,
                    evidencia: "confirmation",
                    visibilidade: "interno",
                  }])}
                >
                  <Plus className="h-4 w-4 mr-2" /> Adicionar passo
                </Button>
              </div>

              {checklist.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Adicione os passos que o responsável deverá validar durante a execução.
                </div>
              ) : (
                <div className="space-y-3">
                  {checklist.map((item, index) => (
                    <div key={item.id ?? index} className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{index + 1}</Badge>
                        <Input
                          value={item.titulo ?? ""}
                          onChange={(e) => setChecklist((items) => items.map((x, i) => i === index ? { ...x, titulo: e.target.value } : x))}
                          placeholder="Nome do passo"
                        />
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setChecklist((items) => items.filter((_, i) => i !== index))}>
                          Remover
                        </Button>
                      </div>
                      <Input
                        value={item.descricao ?? ""}
                        onChange={(e) => setChecklist((items) => items.map((x, i) => i === index ? { ...x, descricao: e.target.value } : x))}
                        placeholder="Instrução opcional para o executor"
                      />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Select
                          value={item.evidencia ?? "confirmation"}
                          onValueChange={(value) => setChecklist((items) => items.map((x, i) => i === index ? { ...x, evidencia: value } : x))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="confirmation">Confirmação</SelectItem>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="photo">Foto</SelectItem>
                            <SelectItem value="text_or_photo">Texto ou foto</SelectItem>
                            <SelectItem value="text_and_photo">Texto + foto</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={item.visibilidade ?? "interno"}
                          onValueChange={(value) => setChecklist((items) => items.map((x, i) => i === index ? { ...x, visibilidade: value } : x))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="interno">Interno</SelectItem>
                            <SelectItem value="cliente">Cliente</SelectItem>
                            <SelectItem value="cliente_parceiro">Cliente + parceiro</SelectItem>
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-2 rounded-md border px-3 text-sm">
                          <input
                            type="checkbox"
                            checked={item.obrigatorio !== false}
                            onChange={(e) => setChecklist((items) => items.map((x, i) => i === index ? { ...x, obrigatorio: e.target.checked } : x))}
                          />
                          Obrigatório
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetForm}>Limpar</Button>
              <Button type="button" onClick={() => save.mutate()} disabled={!nome.trim() || save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {editingId ? "Salvar alterações" : "Criar modelo"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ServicosOrdens() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modelosDialogOpen, setModelosDialogOpen] = useState(false);
  const [execucaoId, setExecucaoId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const QK = ["servicos-ordens", tenantId];

  const { data: ordens = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/servicos/ordens`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const execucao = useMemo(
    () => (Array.isArray(ordens) ? ordens.find((o: any) => o.id === execucaoId) : null),
    [ordens, execucaoId],
  );

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiJson(`/api/tenants/${tenantId}/servicos/ordens/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: "Pipeline atualizada." });
    },
    onError: (e: any) => toast({ title: "Não foi possível mover a OS", description: e.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      apiJson(`/api/tenants/${tenantId}/servicos/ordens/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: "cancelado" }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: (error: Error) => toast({ title: "Erro ao cancelar ordem", description: error.message, variant: "destructive" }),
  });

  const filtered = Array.isArray(ordens)
    ? statusFilter === "all" ? ordens : ordens.filter((o: any) => o.status === statusFilter)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Ordens de Serviço
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Execução rastreável, checklist com evidências e avanço automático da pipeline.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setModelosDialogOpen(true)}>
            Modelos de OS
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nova Ordem
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhuma ordem de serviço encontrada.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((o: any) => {
                const next = nextStatus(o.status);
                const checklist = Array.isArray(o.checklistExecucao) ? o.checklistExecucao : [];
                const obrigatorios = checklist.filter((i: any) => i.obrigatorio);
                const concluidos = obrigatorios.filter((i: any) => i.concluido).length;
                const progresso = obrigatorios.length ? Math.round((concluidos / obrigatorios.length) * 100) : 0;

                return (
                  <div key={o.id} className="px-4 py-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{o.cliente?.nome ?? "Cliente"}</span>
                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[o.status] ?? ""}`}>
                            {STATUS_LABELS[o.status] ?? o.status}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {MODELOS.find(([value]) => value === o.modeloExecucao)?.[1] ?? "Geral"}
                          </Badge>
                          {o.clienteAcompanha && (
                            <Badge variant="outline" className="text-xs">
                              <Eye className="h-3 w-3 mr-1" /> Portal do cliente
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground mt-1">{o.tipoServico?.nome ?? "—"}</p>
                        {o.negocio && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Negócio: {o.negocio.titulo}
                            {o.negocio.valor != null ? ` · ${fmt(o.negocio.valor)}` : ""}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {o.enderecoAtendimento}
                        </p>
                        {o.prestador && (
                          <p className="text-xs text-muted-foreground mt-1">Responsável: {o.prestador.nome}</p>
                        )}

                        {obrigatorios.length > 0 && (
                          <div className="mt-3 max-w-md">
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                              <span>{concluidos}/{obrigatorios.length} passos validados</span>
                              <span>{progresso}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${progresso}%` }} />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 shrink-0 min-w-[210px]">
                        <Button size="sm" onClick={() => setExecucaoId(o.id)}>
                          <ClipboardCheck className="h-4 w-4 mr-2" /> Abrir execução
                        </Button>

                        <Select
                          value={o.status}
                          onValueChange={(status) => {
                            if (status !== o.status) changeStatus.mutate({ id: o.id, status });
                          }}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_LABELS).map(([status, label]) => (
                              <SelectItem key={status} value={status}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {next && o.status !== "cancelado" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => changeStatus.mutate({ id: o.id, status: next })}
                            disabled={changeStatus.isPending}
                          >
                            Avançar → {STATUS_LABELS[next]}
                          </Button>
                        )}

                        {o.status !== "concluido" && o.status !== "cancelado" && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancel.mutate(o.id)}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ModelosOsDialog tenantId={tenantId} open={modelosDialogOpen} onOpenChange={setModelosDialogOpen} />
      <NovaOrdemDialog tenantId={tenantId} open={dialogOpen} onOpenChange={setDialogOpen} />
      {execucao && (
        <ExecucaoDialog
          tenantId={tenantId}
          ordem={execucao}
          open={!!execucao}
          onOpenChange={(v) => { if (!v) setExecucaoId(null); }}
        />
      )}
    </div>
  );
}
