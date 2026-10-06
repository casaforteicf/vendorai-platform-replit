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
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Eye,
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

type CampoPersonalizado = {
  id: string;
  nome: string;
  tipo: "text" | "textarea" | "number" | "date" | "checkbox";
  valor: string | number | boolean | null;
  obrigatorio: boolean;
};

function novoCampo(): CampoPersonalizado {
  return {
    id: crypto.randomUUID(),
    nome: "",
    tipo: "text",
    valor: "",
    obrigatorio: false,
  };
}

function campoTemValor(campo: CampoPersonalizado) {
  if (campo.tipo === "checkbox") return typeof campo.valor === "boolean";
  return String(campo.valor ?? "").trim().length > 0;
}

function camposComoModelo(campos: CampoPersonalizado[]) {
  return campos
    .filter((campo) => campo.nome.trim())
    .map((campo) => ({
      ...campo,
      valor: campo.tipo === "checkbox" ? false : "",
    }));
}

function CamposPersonalizadosEditor({
  campos,
  onChange,
}: {
  campos: CampoPersonalizado[];
  onChange: (campos: CampoPersonalizado[]) => void;
}) {
  function patch(index: number, values: Partial<CampoPersonalizado>) {
    onChange(campos.map((campo, i) => i === index ? { ...campo, ...values } : campo));
  }

  return (
    <div className="space-y-3">
      {campos.map((campo, index) => (
        <div key={campo.id} className="rounded-lg border p-3 space-y-3 bg-muted/20">
          <div className="grid gap-2 sm:grid-cols-[1fr_150px_130px_auto]">
            <Input
              value={campo.nome}
              onChange={(e) => patch(index, { nome: e.target.value })}
              placeholder="Nome do campo"
            />
            <Select
              value={campo.tipo}
              onValueChange={(tipo) => patch(index, {
                tipo: tipo as CampoPersonalizado["tipo"],
                valor: tipo === "checkbox" ? false : "",
              })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto curto</SelectItem>
                <SelectItem value="textarea">Texto longo</SelectItem>
                <SelectItem value="number">Número</SelectItem>
                <SelectItem value="date">Data</SelectItem>
                <SelectItem value="checkbox">Sim / Não</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={campo.obrigatorio ? "obrigatorio" : "opcional"}
              onValueChange={(v) => patch(index, { obrigatorio: v === "obrigatorio" })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="opcional">Opcional</SelectItem>
                <SelectItem value="obrigatorio">Obrigatório</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" onClick={() => onChange(campos.filter((_, i) => i !== index))}>
              Remover
            </Button>
          </div>

          {campo.tipo === "textarea" ? (
            <Textarea
              rows={2}
              value={String(campo.valor ?? "")}
              onChange={(e) => patch(index, { valor: e.target.value })}
              placeholder="Valor do campo"
            />
          ) : campo.tipo === "checkbox" ? (
            <Select
              value={campo.valor === true ? "sim" : "nao"}
              onValueChange={(v) => patch(index, { valor: v === "sim" })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={campo.tipo === "number" ? "number" : campo.tipo === "date" ? "date" : "text"}
              value={campo.valor == null ? "" : String(campo.valor)}
              onChange={(e) => patch(index, {
                valor: campo.tipo === "number"
                  ? (e.target.value === "" ? "" : Number(e.target.value))
                  : e.target.value,
              })}
              placeholder="Valor do campo"
            />
          )}
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...campos, novoCampo()])}>
        <Plus className="h-4 w-4 mr-2" /> Adicionar campo
      </Button>
    </div>
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
  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [negocioId, setNegocioId] = useState("");
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [enderecoAtendimento, setEnderecoAtendimento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [camposPersonalizados, setCamposPersonalizados] = useState<CampoPersonalizado[]>([]);
  const [modeloHydratado, setModeloHydratado] = useState("");

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ["leads-search", tenantId, clienteSearch],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/leads?limit=10&search=${encodeURIComponent(clienteSearch)}`, { headers: authHeaders() })
        .then((r) => r.json()).then((d) => Array.isArray(d) ? d : d.leads ?? []),
    enabled: !!tenantId && clienteSearch.length >= 2,
  });

  const { data: tipos = [] } = useQuery<any[]>({
    queryKey: ["servicos-tipos", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/servicos/tipos`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  const { data: modeloConfig } = useQuery<{ modeloExecucao: string; camposPersonalizados: CampoPersonalizado[] }>({
    queryKey: ["servicos-modelo-os", tenantId, modeloExecucao],
    queryFn: () =>
      apiJson(`/api/tenants/${tenantId}/servicos/modelos/${modeloExecucao}`, { headers: authHeaders() }),
    enabled: !!tenantId && open && !!modeloExecucao,
  });

  useEffect(() => {
    if (!open) {
      setModeloHydratado("");
      return;
    }
    if (modeloHydratado === modeloExecucao || !modeloConfig) return;
    const defaults = Array.isArray(modeloConfig.camposPersonalizados) ? modeloConfig.camposPersonalizados : [];
    setCamposPersonalizados(defaults.map((campo) => ({
      ...campo,
      id: crypto.randomUUID(),
      valor: campo.tipo === "checkbox" ? false : "",
    })));
    setModeloHydratado(modeloExecucao);
  }, [open, modeloExecucao, modeloConfig, modeloHydratado]);

  const saveModelo = useMutation({
    mutationFn: () =>
      apiJson(`/api/tenants/${tenantId}/servicos/modelos/${modeloExecucao}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ camposPersonalizados: camposComoModelo(camposPersonalizados) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["servicos-modelo-os", tenantId, modeloExecucao] });
      toast({ title: "Campos salvos como padrão deste modelo de OS." });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar modelo", description: e.message, variant: "destructive" }),
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
      !campo.nome.trim() || (campo.obrigatorio && !campoTemValor(campo))
    );
    if (camposInvalidos.length > 0) {
      toast({ title: "Revise os campos adicionais obrigatórios", variant: "destructive" });
      return;
    }
    create.mutate({
      clienteId: selectedLead.id,
      negocioId: negocioId || undefined,
      tipoServicoId,
      modeloExecucao,
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
            <Select value={modeloExecucao} onValueChange={setModeloExecucao}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELOS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O modelo define o passo a passo, as evidências obrigatórias e o avanço automático.
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

          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <Label>Campos adicionais</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Adicione dados específicos desta OS ou salve a estrutura como padrão do modelo selecionado.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const semNome = camposPersonalizados.some((campo) => !campo.nome.trim());
                  if (semNome) {
                    toast({ title: "Dê um nome a todos os campos antes de salvar o modelo", variant: "destructive" });
                    return;
                  }
                  saveModelo.mutate();
                }}
                disabled={saveModelo.isPending}
              >
                {saveModelo.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar como padrão do modelo
              </Button>
            </div>
            <CamposPersonalizadosEditor campos={camposPersonalizados} onChange={setCamposPersonalizados} />
            <p className="text-xs text-muted-foreground">
              Ao salvar o modelo, apenas nome, tipo e obrigatoriedade são reaproveitados. Valores preenchidos nesta OS não são copiados para as próximas.
            </p>
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
  const [camposDraft, setCamposDraft] = useState<CampoPersonalizado[]>(
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

  async function addPhoto(item: any, file: File | undefined) {
    if (!file) return;
    try {
      setUploadingId(item.id);
      const path = await uploadEvidence(file);
      await updateItem.mutateAsync({
        itemId: item.id,
        payload: {
          concluido: false,
          observacao: drafts[item.id] ?? item.observacao ?? "",
          fotos: [...(item.fotos ?? []), path],
          visibilidade: item.visibilidade ?? "interno",
        },
      });
      toast({ title: "Foto anexada à atividade." });
    } catch (e: any) {
      toast({ title: "Erro ao anexar foto", description: e.message, variant: "destructive" });
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
              <p className="text-xs text-muted-foreground mt-1">
                Ajuste os dados padrão ou crie campos específicos sem perder o histórico da OS.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Endereço de atendimento</Label>
              <Textarea rows={2} value={enderecoDraft} onChange={(e) => setEnderecoDraft(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Orientações / observações</Label>
              <Textarea rows={3} value={observacoesDraft} onChange={(e) => setObservacoesDraft(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Campos adicionais</Label>
              <CamposPersonalizadosEditor campos={camposDraft} onChange={setCamposDraft} />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  const invalidos = camposDraft.filter((campo) =>
                    !campo.nome.trim() || (campo.obrigatorio && !campoTemValor(campo))
                  );
                  if (!enderecoDraft.trim()) {
                    toast({ title: "O endereço de atendimento é obrigatório", variant: "destructive" });
                    return;
                  }
                  if (invalidos.length) {
                    toast({ title: "Revise os campos adicionais obrigatórios", variant: "destructive" });
                    return;
                  }
                  updateDados.mutate();
                }}
                disabled={updateDados.isPending}
              >
                {updateDados.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" /> Salvar dados da OS
              </Button>
            </div>
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
                              item.evidencia === "photo" ? "foto"
                              : item.evidencia === "text" ? "texto"
                              : item.evidencia === "text_and_photo" ? "texto + foto"
                              : item.evidencia === "confirmation" ? "confirmação"
                              : "texto ou foto"
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
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              disabled={item.concluido || uploadingId === item.id}
                              onChange={(e) => addPhoto(item, e.target.files?.[0])}
                            />
                            <span className="inline-flex h-9 cursor-pointer items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted">
                              {uploadingId === item.id
                                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                : <Camera className="h-4 w-4 mr-2" />}
                              Foto
                            </span>
                          </label>

                          {(item.fotos?.length ?? 0) > 0 && (
                            <Badge variant="secondary">{item.fotos.length} foto(s)</Badge>
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
                                    fotos: item.fotos ?? [],
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
                                    fotos: item.fotos ?? [],
                                    visibilidade: item.visibilidade ?? "interno",
                                  },
                                })
                              }
                            >
                              Reabrir
                            </Button>
                          )}
                        </div>

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
            Ao concluir todos os passos obrigatórios, a OS é concluída automaticamente e a pipeline avança. Cada ação registra responsável, data, hora e evidências. O tenant decide, por etapa e por ação, o que fica interno e o que o cliente/lead pode acompanhar.
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
