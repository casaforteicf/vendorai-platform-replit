import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupportReportPanel } from "@/components/SupportReportPanel";
import { PipelineNav, PIPELINE_CARD_CLASS, PIPELINE_COLUMN_CLASS, PIPELINE_COLUMN_HEADER_CLASS } from "@/components/PipelineNav";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  Package,
  Paperclip,
  Plus,
  Truck,
  Upload,
  UserRound,
  Wrench,
} from "lucide-react";

type PipelineKind = "execucao" | "suporte";

type WorkCard = {
  id: string;
  tenantId: string;
  codigo: string;
  pipeline: PipelineKind;
  tipo: string;
  etapa: string;
  titulo: string;
  descricao?: string | null;
  prioridade: string;
  leadId?: string | null;
  dealId?: string | null;
  propostaId?: string | null;
  entregaId?: string | null;
  parentCardId?: string | null;
  responsavelId?: string | null;
  dataInicioPrevista?: string | null;
  dataInicioEfetiva?: string | null;
  dataFimPrevista?: string | null;
  dataFimEfetiva?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
  leadLabel?: string | null;
  responsavelLabel?: string | null;
  dealTitle?: string | null;
};

type Attachment = {
  id: string;
  nome: string;
  url: string;
  mimeType?: string | null;
  tamanho?: number | null;
  descricao?: string | null;
  transcricao?: string | null;
  origem: string;
  createdAt?: string;
};

type Lead = { id: string; nome?: string | null; empresa?: string | null; telefone?: string | null };
type User = { id: string; name?: string | null; email?: string | null; userFunction?: string | null };
type Deal = { id: string; titulo: string; leadId?: string | null; etapa: string; valor?: string | null };
type Proposal = { id: string; dealId?: string | null; leadId: string; titulo: string; status: string; itens?: Array<Record<string, unknown>> };
type BalanceItem = {
  index: number;
  nome: string;
  sku?: string | null;
  produtoId?: string | null;
  quantidadePedido: number;
  quantidadeAlocada: number;
  quantidadeLiberada: number;
  quantidadeEntregue: number;
  saldoProgramar: number;
  saldoEntregar: number;
};

type BalanceResponse = { propostaId: string; propostaTitulo: string; itens: BalanceItem[] };

const EXECUTION_STAGES = [
  ["contrato", "Contrato"],
  ["pedido_confirmado", "Pedido confirmado"],
  ["liberacao_financeira", "Liberação financeira"],
  ["liberacao_medidas", "Liberação de medidas"],
  ["projeto", "Projeto"],
  ["producao_a_iniciar", "Produção — a iniciar"],
  ["producao_em_andamento", "Produção — em andamento"],
  ["producao_finalizada", "Produção — finalizada"],
  ["aguardando_liberacao", "Aguardando liberação"],
  ["liberado", "Liberado"],
  ["agenda_entrega", "Agenda de entrega"],
  ["em_transporte", "Em transporte"],
  ["instalacao_a_iniciar", "Instalação — a iniciar"],
  ["instalacao_em_andamento", "Instalação — em andamento"],
  ["instalacao_finalizada", "Instalação — finalizada"],
  ["entrega_obra", "Entrega da obra"],
  ["pos_venda", "Pós-venda"],
  ["concluido", "Concluído"],
] as const;

const SUPPORT_STAGES = [
  ["chamado_cliente", "Chamado cliente"],
  ["agendamento_assistencia", "Agendamento assistência"],
  ["execucao_assistencia", "Execução da assistência"],
  ["relatorio_assistencia", "Relatório da assistência"],
  ["feedback_cliente", "Feedback cliente"],
  ["fechamento_assistencia", "Fechamento assistência"],
] as const;

const SUPPORT_CATEGORIES = [
  ["defeito", "Defeito"],
  ["instalacao", "Instalação"],
  ["funcionamento", "Funcionamento"],
  ["avaria", "Avaria"],
  ["falta_material", "Falta de material"],
  ["erro_medida", "Erro de medida"],
  ["duvida_tecnica", "Dúvida técnica"],
  ["garantia", "Garantia"],
  ["manutencao", "Manutenção"],
  ["outro", "Outro"],
] as const;

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function safeItems(card: WorkCard): Array<{ nome?: string; quantidade?: number }> {
  const raw = card.metadata?.itens;
  return Array.isArray(raw) ? raw as Array<{ nome?: string; quantidade?: number }> : [];
}

export default function PipelineOperacional() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const pathTab = window.location.pathname.split("/").filter(Boolean).at(-1);
  const pipeline: PipelineKind = pathTab === "suporte" || params.get("tab") === "suporte" ? "suporte" : "execucao";
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<WorkCard | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const detailFileRef = useRef<HTMLInputElement>(null);

  const authHeaders = useMemo(() => token ? { Authorization: `Bearer ${token}` } : {}, [token]);
  const jsonHeaders = useMemo(() => ({ "Content-Type": "application/json", ...authHeaders }), [authHeaders]);

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...options, headers: { ...authHeaders, ...(options?.headers ?? {}) } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  const cardsQuery = useQuery<WorkCard[]>({
    queryKey: ["work-cards", tenantId, pipeline],
    enabled: !!tenantId,
    queryFn: () => api(`/api/tenants/${tenantId}/work-cards?pipeline=${pipeline}`),
    staleTime: 15_000, refetchOnWindowFocus: false,
  });
  const needsContext = supportOpen || deliveryOpen || Boolean(selectedCard);
  const leadsQuery = useQuery<Lead[]>({
    queryKey: ["work-card-leads", tenantId], enabled: !!tenantId && needsContext,
    queryFn: () => api(`/api/tenants/${tenantId}/leads`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const usersQuery = useQuery<User[]>({
    queryKey: ["work-card-users", tenantId], enabled: !!tenantId && needsContext,
    queryFn: () => api(`/api/tenants/${tenantId}/users`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const dealsQuery = useQuery<Deal[]>({
    queryKey: ["work-card-deals", tenantId], enabled: !!tenantId && needsContext,
    queryFn: () => api(`/api/tenants/${tenantId}/deals`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const proposalsQuery = useQuery<Proposal[]>({
    queryKey: ["work-card-proposals", tenantId], enabled: !!tenantId && (supportOpen || deliveryOpen),
    queryFn: () => api(`/api/tenants/${tenantId}/propostas`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const attachmentsQuery = useQuery<Attachment[]>({
    queryKey: ["work-card-attachments", selectedCard?.id],
    enabled: !!selectedCard?.id,
    queryFn: () => api(`/api/work-cards/${selectedCard!.id}/attachments`),
  });

  const leadMap = useMemo(() => new Map((leadsQuery.data ?? []).map((l) => [l.id, l])), [leadsQuery.data]);
  const userMap = useMemo(() => new Map((usersQuery.data ?? []).map((u) => [u.id, u])), [usersQuery.data]);
  const dealMap = useMemo(() => new Map((dealsQuery.data ?? []).map((d) => [d.id, d])), [dealsQuery.data]);

  const patchCard = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api<WorkCard>(`/api/work-cards/${id}`, {
      method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data),
    }),
    onSuccess: (card) => {
      queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, pipeline] });
      if (selectedCard?.id === card.id) setSelectedCard(card);
    },
    onError: (error) => toast({ title: "Não foi possível atualizar o card", description: String(error), variant: "destructive" }),
  });

  const stages = pipeline === "suporte" ? SUPPORT_STAGES : EXECUTION_STAGES;
  const cards = cardsQuery.data ?? [];
  const stageIndex = (stage: string) => stages.findIndex(([key]) => key === stage);
  const canMoveForward = (card: WorkCard, target: string) => target === card.etapa || stageIndex(target) >= stageIndex(card.etapa);

  function setPipeline(next: PipelineKind | "comercial" | "aquecimento" | "parceiros") {
    if (next === "comercial") navigate("/deals");
    else if (next === "aquecimento" || next === "parceiros") navigate(`/pipeline-relacionamento/${next}`);
    else navigate(`/pipeline-operacional/${next}`);
  }

  async function uploadFilesToCard(cardId: string, files: File[], origem = "app") {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const meta = await api<{ uploadURL: string; objectPath: string }>("/api/storage/uploads/request-url", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        const put = await fetch(meta.uploadURL, {
          method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
        await api(`/api/work-cards/${cardId}/attachments`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            nome: file.name,
            url: `/api/storage${meta.objectPath}`,
            mimeType: file.type || "application/octet-stream",
            tamanho: file.size,
            origem,
          }),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["work-card-attachments", cardId] });
      toast({ title: files.length === 1 ? "Anexo registrado" : `${files.length} anexos registrados` });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Comercial, execução, suporte, aquecimento e parceiros ligados à mesma base de clientes.</p>
        </div>
        <div className="flex gap-2">
          {pipeline === "execucao" ? (
            <Button onClick={() => setDeliveryOpen(true)} className="gap-2"><Truck className="h-4 w-4" /> Liberar itens para entrega</Button>
          ) : (
            <Button onClick={() => setSupportOpen(true)} className="gap-2"><Wrench className="h-4 w-4" /> Novo chamado</Button>
          )}
        </div>
      </div>

      <PipelineNav active={pipeline} />

      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden pb-3">
        {stages.map(([key, label]) => {
          const stageCards = cards.filter((card) => card.etapa === key);
          return (
            <section
              key={key}
              className={PIPELINE_COLUMN_CLASS}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                const dragged = cards.find((card) => card.id === draggedId);
                if (dragged && !canMoveForward(dragged, key)) {
                  toast({ title: "Movimento não permitido", description: "O card só pode avançar. Etapas já concluídas ficam no histórico.", variant: "destructive" });
                } else if (draggedId) {
                  patchCard.mutate({ id: draggedId, data: { etapa: key } });
                }
                setDraggedId(null);
              }}
            >
              <div className={PIPELINE_COLUMN_HEADER_CLASS}>
                <h2 className="text-sm font-semibold">{label}</h2>
                <Badge variant="secondary">{stageCards.length}</Badge>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {cardsQuery.isLoading && <div className="h-24 animate-pulse rounded-lg bg-muted" />}
                {!cardsQuery.isLoading && stageCards.length === 0 && (
                  <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Arraste um card para esta etapa</div>
                )}
                {stageCards.map((card) => {
                  const lead = card.leadLabel || (card.leadId ? (leadMap.get(card.leadId)?.nome || leadMap.get(card.leadId)?.empresa) : undefined);
                  const responsible = card.responsavelLabel || (card.responsavelId ? (userMap.get(card.responsavelId)?.name || userMap.get(card.responsavelId)?.email) : undefined);
                  const items = safeItems(card);
                  return (
                    <article
                      key={card.id}
                      draggable
                      onDragStart={() => setDraggedId(card.id)}
                      onDragEnd={() => setDraggedId(null)}
                      onClick={() => setSelectedCard(card)}
                      className={PIPELINE_CARD_CLASS}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-primary">{card.codigo}</p>
                          <p className="mt-0.5 text-sm font-semibold leading-tight">{card.titulo}</p>
                        </div>
                        {card.prioridade === "urgente" || card.prioridade === "alta" ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> : null}
                      </div>
                      {lead && <p className="mt-2 truncate text-xs text-muted-foreground">{lead}</p>}
                      {responsible ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" /> {responsible}</p>
                      ) : (
                        <p className="mt-1 text-xs font-medium text-amber-600">Sem responsável</p>
                      )}
                      {card.tipo === "entrega" && items.length > 0 && (
                        <div className="mt-2 rounded-md bg-muted/50 p-2 text-[11px]">
                          {items.slice(0, 3).map((item, index) => <div key={index}>{item.quantidade} × {item.nome}</div>)}
                          {items.length > 3 && <div className="text-muted-foreground">+{items.length - 3} item(ns)</div>}
                        </div>
                      )}
                      {card.dataFimPrevista && <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarDays className="h-3 w-3" /> Previsto: {formatDate(card.dataFimPrevista)}</p>}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet open={!!selectedCard} onOpenChange={(open) => !open && setSelectedCard(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selectedCard && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{selectedCard.codigo} — {selectedCard.titulo}</SheetTitle>
              </SheetHeader>
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Cliente</p><p>{selectedCard.leadLabel || (selectedCard.leadId ? (leadMap.get(selectedCard.leadId)?.nome || leadMap.get(selectedCard.leadId)?.empresa || "—") : "—")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Pedido</p><p>{selectedCard.dealTitle || (selectedCard.dealId ? (dealMap.get(selectedCard.dealId)?.titulo || "—") : "—")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Liberação prevista</p><p>{formatDate(selectedCard.dataInicioPrevista)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Liberação efetiva</p><p>{formatDate(selectedCard.dataInicioEfetiva)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Conclusão/entrega prevista</p><p>{formatDate(selectedCard.dataFimPrevista)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Conclusão/entrega efetiva</p><p>{formatDate(selectedCard.dataFimEfetiva)}</p></div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Etapa</label>
                  <Select value={selectedCard.etapa} onValueChange={(etapa) => patchCard.mutate({ id: selectedCard.id, data: { etapa } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{stages.filter(([key]) => stageIndex(key) >= stageIndex(selectedCard.etapa)).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Responsável</label>
                  <Select value={selectedCard.responsavelId || "__none__"} onValueChange={(responsavelId) => patchCard.mutate({ id: selectedCard.id, data: { responsavelId: responsavelId === "__none__" ? null : responsavelId } })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                    <SelectContent>
                      {pipeline !== "suporte" && <SelectItem value="__none__">Sem responsável</SelectItem>}
                      {(usersQuery.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCard.descricao && <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">Relato / observações</p><p className="mt-1 whitespace-pre-wrap text-sm">{selectedCard.descricao}</p></div>}

                {selectedCard.pipeline === "suporte" && (
                  <SupportReportPanel
                    card={selectedCard}
                    token={token ?? ""}
                    onChanged={async () => {
                      const fresh = await api<WorkCard>(`/api/work-cards/${selectedCard.id}`);
                      setSelectedCard(fresh);
                      await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, "suporte"] });
                    }}
                  />
                )}

                {safeItems(selectedCard).length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Itens deste lote</h3>
                    <div className="divide-y rounded-lg border">
                      {safeItems(selectedCard).map((item, index) => <div key={index} className="flex justify-between px-3 py-2 text-sm"><span>{item.nome}</span><strong>{item.quantidade}</strong></div>)}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Fotos, vídeos, áudios e documentos</h3>
                    <Button size="sm" variant="outline" className="gap-1" disabled={uploading} onClick={() => detailFileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Anexar</Button>
                  </div>
                  <input
                    ref={detailFileRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = "";
                      if (files.length) void uploadFilesToCard(selectedCard.id, files);
                    }}
                  />
                  {attachmentsQuery.isLoading && <div className="h-16 animate-pulse rounded bg-muted" />}
                  {(attachmentsQuery.data ?? []).map((attachment) => (
                    <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/50">
                      <Paperclip className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{attachment.nome}</span>
                      <span className="text-[10px] text-muted-foreground">{attachment.origem}</span>
                    </a>
                  ))}
                  {!attachmentsQuery.isLoading && (attachmentsQuery.data?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Nenhum anexo ainda.</p>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <SupportDialog
        open={supportOpen}
        onOpenChange={setSupportOpen}
        tenantId={tenantId}
        token={token ?? ""}
        leads={leadsQuery.data ?? []}
        deals={dealsQuery.data ?? []}
        proposals={proposalsQuery.data ?? []}
        users={usersQuery.data ?? []}
        onCreated={async () => {
          setSupportOpen(false);
          await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, "suporte"] });
          if (pipeline !== "suporte") setPipeline("suporte");
        }}
      />

      <DeliveryDialog
        open={deliveryOpen}
        onOpenChange={setDeliveryOpen}
        tenantId={tenantId}
        token={token ?? ""}
        deals={dealsQuery.data ?? []}
        leads={leadsQuery.data ?? []}
        users={usersQuery.data ?? []}
        onCreated={async () => {
          setDeliveryOpen(false);
          await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, "execucao"] });
          toast({ title: "Lote de entrega criado e enviado para a Pipeline de Execução." });
        }}
      />
    </div>
  );
}

function SupportDialog({ open, onOpenChange, tenantId, token, leads, deals, proposals, users, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  token: string;
  leads: Lead[];
  deals: Deal[];
  proposals: Proposal[];
  users: User[];
  onCreated: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [leadId, setLeadId] = useState("");
  const [dealId, setDealId] = useState("");
  const [categoria, setCategoria] = useState("defeito");
  const [titulo, setTitulo] = useState("");
  const [relato, setRelato] = useState("");
  const [produtos, setProdutos] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [prioridade, setPrioridade] = useState("normal");
  const [data, setData] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const leadDeals = deals.filter((d) => d.leadId === leadId);
  const proposal = proposals.find((p) => p.dealId === dealId) ?? null;

  async function submit() {
    if (!leadId || !responsavelId || !titulo.trim() || relato.trim().length < 10) {
      toast({ title: "Preencha cliente, responsável, título e um relato claro do problema.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/support-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          leadId,
          dealId: dealId || null,
          propostaId: proposal?.id ?? null,
          titulo: titulo.trim(),
          relato: relato.trim(),
          categoria,
          produtos: produtos.split(/[\n,;]/).map((v) => v.trim()).filter(Boolean),
          responsavelId,
          prioridade,
          dataVencimento: data || undefined,
          origem: "humano",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao abrir assistência");
      const cardId = body.card.id as string;
      for (const file of files) {
        const metaRes = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        if (!metaRes.ok) throw new Error("Falha ao preparar upload");
        const meta = await metaRes.json();
        const put = await fetch(meta.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
        await fetch(`/api/work-cards/${cardId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ nome: file.name, url: `/api/storage${meta.objectPath}`, mimeType: file.type, tamanho: file.size, origem: "abertura_chamado" }),
        });
      }
      toast({ title: `Assistência ${body.card.codigo} aberta`, description: "O responsável recebeu o card para acompanhamento." });
      setLeadId(""); setDealId(""); setTitulo(""); setRelato(""); setProdutos(""); setResponsavelId(""); setFiles([]); setData("");
      await onCreated();
    } catch (error) {
      toast({ title: "Erro ao abrir assistência", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Abrir chamado de assistência</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-1 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Cliente *</label><Select value={leadId} onValueChange={(v) => { setLeadId(v); setDealId(""); }}><SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger><SelectContent>{leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.nome || l.empresa || l.id}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Pedido relacionado</label><Select value={dealId || "__none__"} onValueChange={(v) => setDealId(v === "__none__" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Sem pedido específico</SelectItem>{leadDeals.map((d) => <SelectItem key={d.id} value={d.id}>{d.titulo}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Categoria *</label><Select value={categoria} onValueChange={setCategoria}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUPPORT_CATEGORIES.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Título *</label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Porta da suíte não fecha corretamente" /></div>
          <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Relato claro do problema *</label><Textarea rows={5} value={relato} onChange={(e) => setRelato(e.target.value)} placeholder="Descreva o sintoma, quando começou, onde ocorre, o que já foi testado e qualquer detalhe útil para o técnico." /><p className="text-xs text-muted-foreground">A IA e o atendimento humano devem coletar informação suficiente antes de enviar ao suporte.</p></div>
          <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Itens/produtos afetados</label><Input value={produtos} onChange={(e) => setProdutos(e.target.value)} placeholder="Separe por vírgula: janela suíte, porta varanda..." /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Responsável *</label><Select value={responsavelId} onValueChange={setResponsavelId}><SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Prioridade</label><Select value={prioridade} onValueChange={setPrioridade}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Prazo/agendamento inicial</label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Fotos, vídeos, áudios e documentos</label><Input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /><p className="text-xs text-muted-foreground">{files.length ? `${files.length} arquivo(s) selecionado(s)` : "Opcional"}</p></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Abrir assistência</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDialog({ open, onOpenChange, tenantId, token, deals, leads, users, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  token: string;
  deals: Deal[];
  leads: Lead[];
  users: User[];
  onCreated: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [dealId, setDealId] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const balanceQuery = useQuery<BalanceResponse>({
    queryKey: ["delivery-balance", tenantId, dealId],
    enabled: open && !!tenantId && !!dealId,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/entregas/saldo?dealId=${encodeURIComponent(dealId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar os itens do pedido");
      return body;
    },
  });

  const selectedDeal = deals.find((d) => d.id === dealId);
  const selectedLead = selectedDeal?.leadId ? leads.find((l) => l.id === selectedDeal.leadId) : undefined;

  async function submit() {
    if (!dealId || !responsavelId || !balanceQuery.data) {
      toast({ title: "Selecione pedido e responsável.", variant: "destructive" });
      return;
    }
    const selected = balanceQuery.data.itens.flatMap((item) => {
      const quantity = Number(String(quantities[item.index] ?? "").replace(",", "."));
      if (!Number.isFinite(quantity) || quantity <= 0) return [];
      if (quantity > item.saldoProgramar) throw new Error(`${item.nome}: máximo disponível ${item.saldoProgramar}`);
      return [{
        nome: item.nome,
        quantidade: quantity,
        sku: item.sku ?? undefined,
        produtoId: item.produtoId ?? undefined,
        propostaItemIndex: item.index,
        quantidadePedido: item.quantidadePedido,
      }];
    });
    if (!selected.length) {
      toast({ title: "Informe a quantidade de pelo menos um item.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/entregas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          dealId,
          propostaId: balanceQuery.data.propostaId,
          leadId: selectedDeal?.leadId ?? null,
          assignedTo: responsavelId,
          modo: "assincrona",
          status: "aguardando",
          dataLiberacaoPrevista: releaseDate || undefined,
          dataPrevista: deliveryDate || undefined,
          enderecoEntrega: address || undefined,
          observacoes: notes || undefined,
          itens: selected,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao criar lote");
      const cardId = body.workCard?.id as string | undefined;
      if (cardId) {
        for (const file of files) {
          const metaRes = await fetch("/api/storage/uploads/request-url", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
          });
          if (!metaRes.ok) throw new Error("Falha ao preparar anexo");
          const meta = await metaRes.json();
          const put = await fetch(meta.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
          if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
          await fetch(`/api/work-cards/${cardId}/attachments`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ nome: file.name, url: `/api/storage${meta.objectPath}`, mimeType: file.type, tamanho: file.size, origem: "programacao_entrega" }),
          });
        }
      }
      setDealId(""); setResponsavelId(""); setReleaseDate(""); setDeliveryDate(""); setAddress(""); setNotes(""); setQuantities({}); setFiles([]);
      await onCreated();
    } catch (error) {
      toast({ title: "Erro ao criar lote de entrega", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Liberar itens para entrega parcial</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><label className="text-sm font-medium">Pedido *</label><Select value={dealId} onValueChange={(v) => { setDealId(v); setQuantities({}); }}><SelectTrigger><SelectValue placeholder="Selecionar pedido" /></SelectTrigger><SelectContent>{deals.filter((d) => !["perdido"].includes(d.etapa)).map((d) => <SelectItem key={d.id} value={d.id}>{d.titulo}</SelectItem>)}</SelectContent></Select>{selectedLead && <p className="text-xs text-muted-foreground">Cliente: {selectedLead.nome || selectedLead.empresa}</p>}</div>
            <div className="space-y-1.5"><label className="text-sm font-medium">Responsável pelo lote *</label><Select value={responsavelId} onValueChange={setResponsavelId}><SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}</SelectContent></Select></div>
          </div>

          {balanceQuery.isLoading && <div className="h-28 animate-pulse rounded-lg bg-muted" />}
          {balanceQuery.isError && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{String(balanceQuery.error)}</div>}
          {balanceQuery.data && (
            <div className="space-y-2">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Itens do pedido — {balanceQuery.data.propostaTitulo}</h3><Badge variant="outline">Saldo a programar</Badge></div>
              <div className="overflow-hidden rounded-lg border">
                <div className="grid grid-cols-[1fr_90px_100px_110px] gap-2 bg-muted/50 px-3 py-2 text-xs font-medium"><span>Item</span><span>Pedido</span><span>Já alocado</span><span>Neste lote</span></div>
                {balanceQuery.data.itens.map((item) => (
                  <div key={item.index} className="grid grid-cols-[1fr_90px_100px_110px] items-center gap-2 border-t px-3 py-2 text-sm">
                    <div><p className="font-medium">{item.nome}</p><p className="text-[11px] text-muted-foreground">Saldo: {item.saldoProgramar}</p></div>
                    <span>{item.quantidadePedido}</span>
                    <span>{item.quantidadeAlocada}</span>
                    <Input type="number" min={0} max={item.saldoProgramar} step="any" disabled={item.saldoProgramar <= 0} value={quantities[item.index] ?? ""} onChange={(e) => setQuantities((current) => ({ ...current, [item.index]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">O restante permanece como saldo não programado. Você pode criar novos lotes quando quiser, sem definir todas as datas agora.</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><label className="text-sm font-medium">Liberação prevista <span className="text-muted-foreground">(opcional)</span></label><Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">Entrega prevista <span className="text-muted-foreground">(opcional)</span></label><Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Endereço / local de entrega</label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Observações / instruções</label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Fotos, documentos, romaneios ou outras informações</label><Input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving || balanceQuery.isLoading} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar lote e card</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
