import { useState, useEffect, useRef, useCallback } from "react";
import PracaPerguntas from "./PracaPerguntas";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListTenantConversations,
  getListTenantConversationsQueryKey,
  useListConversationMessages,
  getListConversationMessagesQueryKey,
  useMarkConversationRead,
  useCreateMessage,
  useUpdateLead,
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  useRequestUploadUrl,
  Conversation,
  Lead,
  Message,
  MessageDirecao,
  MessageEnviadoPor,
  MessageCanal,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  Phone,
  Mail,
  Instagram,
  Send,
  Bot,
  User,
  Wifi,
  MessageCircle,
  ChevronLeft,
  UserCheck,
  ArrowRight,
  Paperclip,
  VideoIcon,
  Mic,
  FileText,
  Loader2,
  X,
  UserX,
  Search,
} from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function channelIcon(channel: string | null | undefined) {
  switch (channel) {
    case "whatsapp":
      return <Phone className="h-3.5 w-3.5 text-emerald-500" />;
    case "instagram":
      return <Instagram className="h-3.5 w-3.5 text-pink-500" />;
    case "email":
      return <Mail className="h-3.5 w-3.5 text-blue-400" />;
    case "chat":
      return <MessageCircle className="h-3.5 w-3.5 text-violet-400" />;
    default:
      return <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function channelLabel(channel: string | null | undefined): string {
  const labels: Record<string, string> = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    email: "E-mail",
    chat: "Chat",
  };
  return labels[channel ?? ""] ?? channel ?? "—";
}

function formatConvTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM/yy");
}

function formatMsgTime(dateStr: string): string {
  return format(new Date(dateStr), "HH:mm");
}

function formatMsgDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd 'de' MMMM", { locale: ptBR });
}

// ─── Conversation List Item ───────────────────────────────────────────────────

function ConvItem({
  conv,
  leadName,
  isHumanLocked,
  selected,
  onClick,
}: {
  conv: Conversation;
  leadName: string | undefined;
  isHumanLocked: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={`conv-item-${conv.id}`}
      className={`w-full text-left px-4 py-3 min-h-[3rem] border-b border-border transition-colors flex gap-3 items-center ${
        selected
          ? "bg-primary/10 border-l-2 border-l-primary"
          : "hover:bg-muted/50 active:bg-muted"
      }`}
    >
      {/* Avatar */}
      <div className="h-9 w-9 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground uppercase">
        {(leadName ?? "?")[0]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium truncate">
            {leadName ?? "Lead desconhecido"}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatConvTime(conv.ultimaMensagemEm)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {channelIcon(conv.channel)}
          <span className="text-xs text-muted-foreground truncate flex-1">
            {channelLabel(conv.channel)}
          </span>
          {isHumanLocked && (
            <Badge className="h-4 text-[9px] px-1.5 rounded-full bg-amber-500/90 text-white shrink-0">
              Humano
            </Badge>
          )}
          {conv.naoLidas > 0 && (
            <Badge className="h-4 min-w-[1rem] text-[10px] px-1 rounded-full bg-primary text-primary-foreground">
              {conv.naoLidas}
            </Badge>
          )}
        </div>
        {conv.agentName && !isHumanLocked && (
          <p className="text-xs text-muted-foreground/60 truncate flex items-center gap-1">
            <Bot className="h-3 w-3 inline" />
            {conv.agentName}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MsgBubble({ msg }: { msg: Message }) {
  const isOutgoing = msg.direcao === "saida";
  const isAI = msg.enviadoPor === "agente_ia";
  const isHuman = msg.enviadoPor === "humano";

  return (
    <div
      data-testid={`msg-${msg.id}`}
      className={`flex flex-col gap-1 max-w-[72%] ${isOutgoing ? "self-end items-end" : "self-start items-start"}`}
    >
      {/* Sender badge (for outgoing) */}
      {isOutgoing && (
        <div className="flex items-center gap-1 px-1">
          {isAI && (
            <>
              <Bot className="h-3 w-3 text-violet-500" />
              <span className="text-[10px] text-violet-500 font-medium">
                {msg.agentName ?? "Agente IA"}
              </span>
            </>
          )}
          {isHuman && (
            <>
              <User className="h-3 w-3 text-primary" />
              <span className="text-[10px] text-primary font-medium">Você</span>
            </>
          )}
        </div>
      )}

      {/* Bubble */}
      <div
        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isOutgoing
            ? isAI
              ? "bg-violet-600 text-white rounded-tr-sm"
              : "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        }`}
      >
        {msg.midiaUrl && (
          <div className="mb-1.5">
            {msg.tipoConteudo === "imagem" ? (
              <a href={msg.midiaUrl} target="_blank" rel="noopener noreferrer">
                <img src={msg.midiaUrl} alt="Anexo" className="max-w-full max-h-64 rounded-lg object-cover" />
              </a>
            ) : msg.tipoConteudo === "video" ? (
              <video src={msg.midiaUrl} controls className="max-w-full max-h-64 rounded-lg" />
            ) : msg.tipoConteudo === "audio" ? (
              <audio src={msg.midiaUrl} controls className="max-w-full" />
            ) : (
              <a
                href={msg.midiaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs underline-offset-2 hover:underline ${isOutgoing ? "bg-white/15" : "bg-background"}`}
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">Ver documento</span>
              </a>
            )}
          </div>
        )}
        {msg.conteudo && (!msg.midiaUrl || msg.conteudo !== "Anexo") && msg.conteudo}
      </div>

      {/* Time */}
      <span className="text-[10px] text-muted-foreground/60 px-1">
        {formatMsgTime(msg.createdAt)}
      </span>
    </div>
  );
}

// ─── Handoff Separator ────────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  sdr: "SDR",
  closer: "Closer",
  service: "Service",
  scheduler: "Agendamento",
  reactivation: "Reativação",
  followup: "Follow-up",
  onboarding: "Onboarding",
  relacionamento: "Relacionamento",
  humano: "Humano",
};

function agentLabel(name: string): string {
  return AGENT_LABELS[name] ?? name;
}

interface HandoffEvent {
  id: string;
  timestamp: string;
  fromAgent: string;
  toAgent: string;
}

function HandoffSeparator({ fromAgent, toAgent, timestamp }: { fromAgent: string; toAgent: string; timestamp: string }) {
  return (
    <div className="flex items-center gap-2 py-2 my-1">
      <div className="flex-1 border-t border-dashed border-violet-200 dark:border-violet-800" />
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 text-[10px] text-violet-600 dark:text-violet-400 font-medium whitespace-nowrap">
        <ArrowRight className="h-2.5 w-2.5 shrink-0" />
        {agentLabel(fromAgent)} → {agentLabel(toAgent)}
        <span className="text-violet-400 dark:text-violet-600 font-normal ml-0.5">
          · {formatDistanceToNow(new Date(timestamp), { locale: ptBR, addSuffix: true })}
        </span>
      </span>
      <div className="flex-1 border-t border-dashed border-violet-200 dark:border-violet-800" />
    </div>
  );
}

// ─── Date Separator ───────────────────────────────────────────────────────────

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 border-t border-border" />
      <span className="text-[11px] text-muted-foreground font-medium px-2">
        {formatMsgDate(date)}
      </span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  conv,
  lead,
  leadName,
  tenantId,
  onBack,
  onLockReleased,
}: {
  conv: Conversation;
  lead: Lead | undefined;
  leadName: string | undefined;
  tenantId: string;
  onBack?: () => void;
  onLockReleased?: () => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [releasingLock, setReleasingLock] = useState(false);
  const [handoffEvents, setHandoffEvents] = useState<HandoffEvent[]>([]);
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; previewUrl: string } | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const requestUploadUrl = useRequestUploadUrl();

  const isHumanLocked = lead?.activeAgentLock === "human";
  const isAgentDisabled = !!lead?.agenteDesativado;
  const updateLead = useUpdateLead();
  const [togglingAgentDisabled, setTogglingAgentDisabled] = useState(false);

  function handleToggleAgentDisabled() {
    if (!lead?.id) return;
    setTogglingAgentDisabled(true);
    updateLead.mutate(
      { id: lead.id, data: { agenteDesativado: !isAgentDisabled } },
      {
        onSuccess: () => {
          toast({
            title: isAgentDisabled ? "Agente reativado pra esse contato" : "Agente nunca vai interagir com esse contato",
            description: isAgentDisabled ? undefined : "Marcado como não-lead (contato pessoal) — nenhuma mensagem futura será respondida automaticamente.",
          });
          queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
          queryClient.invalidateQueries({ queryKey: getListTenantConversationsQueryKey(tenantId) });
        },
        onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
        onSettled: () => setTogglingAgentDisabled(false),
      },
    );
  }

  const { data: messages = [], isLoading } = useListConversationMessages(
    tenantId,
    conv.id,
    {
      query: {
        enabled: !!(tenantId && conv.id),
        queryKey: getListConversationMessagesQueryKey(tenantId, conv.id),
        refetchInterval: 10000,
      },
    }
  );

  const createMessage = useCreateMessage();

  // Fetch handoff events for this lead's conversation
  useEffect(() => {
    if (!conv.leadId) return;
    const token = localStorage.getItem("vendorai_token");
    fetch(`/api/tenants/${tenantId}/activities?leadId=${conv.leadId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        const events: HandoffEvent[] = [];
        for (const a of data) {
          if (typeof a !== "object" || a === null) continue;
          const act = a as Record<string, unknown>;
          if (act.tipo !== "handoff_agente" || typeof act.resultadoExecucao !== "string") continue;
          const match = act.resultadoExecucao.match(/^de:(.+)\|para:(.+)$/);
          if (!match) continue;
          const ts =
            typeof act.concluidaEm === "string" ? act.concluidaEm :
            typeof act.createdAt === "string" ? act.createdAt : null;
          if (!ts) continue;
          events.push({
            id: typeof act.id === "string" ? act.id : String(act.id ?? Math.random()),
            timestamp: ts,
            fromAgent: match[1],
            toAgent: match[2],
          });
        }
        setHandoffEvents(events);
      })
      .catch(() => undefined);
  }, [conv.leadId, tenantId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleReleaseLock() {
    setReleasingLock(true);
    try {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/conversations/${conv.id}/release-lock`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      toast({ title: "IA reativada", description: "O agente voltará a responder automaticamente." });
      queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: getListTenantConversationsQueryKey(tenantId) });
      onLockReleased?.();
    } catch (err) {
      toast({ title: "Erro ao liberar IA", description: String(err), variant: "destructive" });
    } finally {
      setReleasingLock(false);
    }
  }

  function handleFilePicked(file: File) {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment({ file, previewUrl: URL.createObjectURL(file) });
  }

  function clearAttachment() {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSend() {
    const text = inputValue.trim();
    if ((!text && !pendingAttachment) || !conv.leadId) return;

    let midia: { url: string; objectPath: string; mimeType: string; fileName: string } | undefined;
    if (pendingAttachment) {
      setUploadingAttachment(true);
      try {
        const file = pendingAttachment.file;
        const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
          requestUploadUrl.mutate(
            { data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" } },
            { onSuccess: resolve, onError: reject },
          );
        });
        const uploadRes = await fetch(result.uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!uploadRes.ok) throw new Error("Upload falhou");
        midia = {
          url: `${window.location.origin}/api/storage${result.objectPath}`,
          objectPath: result.objectPath,
          mimeType: file.type || "application/octet-stream",
          fileName: file.name,
        };
      } catch (err) {
        toast({ title: "Erro ao enviar anexo", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
        setUploadingAttachment(false);
        return;
      }
      setUploadingAttachment(false);
    }

    createMessage.mutate(
      {
        data: {
          tenantId,
          conversationId: conv.id,
          leadId: conv.leadId,
          direcao: MessageDirecao.saida,
          canal: (conv.channel as MessageCanal) ?? MessageCanal.chat,
          conteudo: text || pendingAttachment?.file.name || "Anexo",
          enviadoPor: MessageEnviadoPor.humano,
          ...(midia ? { midia } : {}),
        },
      },
      {
        onSuccess: () => {
          setInputValue("");
          clearAttachment();
          queryClient.invalidateQueries({
            queryKey: getListConversationMessagesQueryKey(tenantId, conv.id),
          });
          queryClient.invalidateQueries({
            queryKey: getListTenantConversationsQueryKey(tenantId),
          });
        },
        onError: (err: unknown) => {
          const apiMsg =
            err != null &&
            typeof err === "object" &&
            "data" in err &&
            err.data != null &&
            typeof err.data === "object" &&
            "error" in err.data &&
            typeof (err.data as Record<string, unknown>).error === "string"
              ? (err.data as { error: string }).error
              : null;
          toast({
            title: "Erro ao enviar mensagem",
            description: apiMsg ?? undefined,
            variant: "destructive",
          });
        },
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Build unified timeline: merge messages and handoff events sorted by time
  type TimelineItem =
    | { kind: "msg"; msg: Message; date: string }
    | { kind: "handoff"; event: HandoffEvent };

  const timelineItems: TimelineItem[] = [];
  for (const msg of messages) {
    timelineItems.push({ kind: "msg", msg, date: msg.createdAt.slice(0, 10) });
  }
  for (const event of handoffEvents) {
    timelineItems.push({ kind: "handoff", event });
  }
  timelineItems.sort((a, b) => {
    const ta = a.kind === "msg" ? new Date(a.msg.createdAt).getTime() : new Date(a.event.timestamp).getTime();
    const tb = b.kind === "msg" ? new Date(b.msg.createdAt).getTime() : new Date(b.event.timestamp).getTime();
    return ta - tb;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-border shrink-0">
        {onBack && (
          <Button
            variant="outline"
            size="icon"
            className="md:hidden h-10 w-10 shrink-0 border-border shadow-sm"
            onClick={onBack}
            aria-label="Voltar para conversas"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground uppercase shrink-0">
          {(leadName ?? "?")[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">
            {leadName ?? "Lead desconhecido"}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            {channelIcon(conv.channel)}
            <span>{channelLabel(conv.channel)}</span>
            {isHumanLocked ? (
              <>
                <span>·</span>
                <UserCheck className="h-3 w-3 text-amber-500" />
                <span className="text-amber-600 font-medium">Atendimento humano</span>
              </>
            ) : conv.agentName ? (
              <>
                <span>·</span>
                <Bot className="h-3 w-3 text-violet-500" />
                <span className="text-violet-500">{conv.agentName}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isHumanLocked && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={handleReleaseLock}
              disabled={releasingLock}
            >
              <Bot className="h-3.5 w-3.5" />
              {releasingLock ? "Liberando..." : "Devolver para IA"}
            </Button>
          )}
          {lead?.id && (
            <Button
              variant="outline"
              size="sm"
              className={`h-8 text-xs gap-1.5 ${isAgentDisabled ? "border-red-300 text-red-700 hover:bg-red-50" : "text-muted-foreground"}`}
              onClick={handleToggleAgentDisabled}
              disabled={togglingAgentDisabled}
              title={isAgentDisabled ? "Clique pra deixar o agente responder de novo" : "Marca como não-lead — agente nunca interage com esse contato"}
            >
              <UserX className="h-3.5 w-3.5" />
              {togglingAgentDisabled ? "..." : isAgentDisabled ? "Não é lead" : "Marcar como não-lead"}
            </Button>
          )}
          <div className="flex items-center gap-1.5">
            <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-muted-foreground capitalize">{conv.status}</span>
          </div>
        </div>
      </div>

      {/* Human lock banner */}
      {isHumanLocked && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 shrink-0">
          <UserCheck className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700">
            A IA foi pausada para este lead. Um atendente humano deve responder. Clique em{" "}
            <strong>Devolver para IA</strong> para reativar o agente.
          </p>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1 px-4 md:px-8 py-4 bg-muted/25">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`h-10 bg-muted animate-pulse rounded-2xl ${i % 2 === 0 ? "w-2/3 self-start" : "w-1/2 self-end ml-auto"}`}
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-30" />
            <p className="text-sm">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-w-4xl mx-auto">
            {(() => {
              let lastDate: string | null = null;
              return timelineItems.map((item) => {
                if (item.kind === "handoff") {
                  return (
                    <HandoffSeparator
                      key={`hoff-${item.event.id}`}
                      fromAgent={item.event.fromAgent}
                      toAgent={item.event.toAgent}
                      timestamp={item.event.timestamp}
                    />
                  );
                }
                const d = item.date;
                const showDate = d !== lastDate;
                lastDate = d;
                return (
                  <div key={item.msg.id} className="flex flex-col gap-1">
                    {showDate && <DateSeparator date={item.msg.createdAt} />}
                    <MsgBubble msg={item.msg} />
                  </div>
                );
              });
            })()}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        {!conv.leadId ? (
          <p className="text-xs text-muted-foreground text-center py-1">
            Conversa sem lead associado — envio desativado
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pendingAttachment && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
                {pendingAttachment.file.type.startsWith("image/") ? (
                  <img src={pendingAttachment.previewUrl} alt="" className="h-10 w-10 object-cover rounded shrink-0" />
                ) : pendingAttachment.file.type.startsWith("video/") ? (
                  <VideoIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                ) : pendingAttachment.file.type.startsWith("audio/") ? (
                  <Mic className="h-5 w-5 text-muted-foreground shrink-0" />
                ) : (
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate flex-1 font-mono">{pendingAttachment.file.name}</span>
                <button type="button" onClick={clearAttachment} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); e.target.value = ""; }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={createMessage.isPending || uploadingAttachment}
                title="Anexar arquivo"
                className="rounded-full h-9 w-9 shrink-0 text-muted-foreground"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                data-testid="input-message"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isHumanLocked ? "IA pausada — escreva como atendente..." : pendingAttachment ? "Legenda (opcional)..." : "Digite uma mensagem..."}
                className="flex-1 rounded-full bg-muted border-0 focus-visible:ring-1"
                disabled={createMessage.isPending}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={(!inputValue.trim() && !pendingAttachment) || createMessage.isPending || uploadingAttachment}
                data-testid="button-send-message"
                className="rounded-full h-9 w-9 shrink-0"
              >
                {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Conversations() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();

  const { data: pracaPending = { count: 0 } } = useQuery<{ count: number }>({
    queryKey: ["praca-perguntas-count", tenantId],
    queryFn: async () => {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch(`/api/tenants/${tenantId}/praca-perguntas-pendentes/count`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Falha ao contar perguntas pendentes");
      return response.json();
    },
    enabled: !!tenantId,
    refetchInterval: 15000,
  });

  const initialConvId = new URLSearchParams(window.location.search).get("conv");
  const initialLeadId = new URLSearchParams(window.location.search).get("leadId");
  const [selectedId, setSelectedId] = useState<string | null>(initialConvId);
  const [showMobileChat, setShowMobileChat] = useState(!!initialConvId);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeView, setActiveView] = useState<"whatsapp" | "instagram" | "praca">("whatsapp");

  const { data: conversations = [], isLoading: convsLoading } =
    useListTenantConversations(tenantId, {
      query: {
        enabled: !!tenantId,
        queryKey: getListTenantConversationsQueryKey(tenantId),
        refetchInterval: 15000,
      },
    });

  const { data: leads = [] } = useListTenantLeads(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListTenantLeadsQueryKey(tenantId),
      refetchInterval: 20000,
    },
  });

  const leadMap = new Map(leads.map((l) => [l.id, l]));

  const markRead = useMarkConversationRead();

  // Sort conversations by ultimaMensagemEm desc
  const sorted = [...conversations]
    .sort((a, b) => {
      const ta = a.ultimaMensagemEm ? new Date(a.ultimaMensagemEm).getTime() : 0;
      const tb = b.ultimaMensagemEm ? new Date(b.ultimaMensagemEm).getTime() : 0;
      return tb - ta;
    })
    .filter((c) => channelFilter === "all" || c.channel === channelFilter)
    .filter((c) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      const lead = c.leadId ? leadMap.get(c.leadId) : undefined;
      return [lead?.nome, lead?.telefone, lead?.email, channelLabel(c.channel)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

  const channelCounts = conversations.reduce<Record<string, number>>(
    (acc, c) => {
      const ch = c.channel ?? "other";
      acc[ch] = (acc[ch] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const instagramUnread = conversations
    .filter((c) => c.channel === "instagram")
    .reduce((acc, c) => acc + c.naoLidas, 0);

  const filterChips: { key: string; label: string }[] = [
    { key: "all", label: "Todas" },
    ...(channelCounts["whatsapp"] ? [{ key: "whatsapp", label: "WhatsApp" }] : []),
    ...(channelCounts["instagram"] ? [{ key: "instagram", label: "Instagram" }] : []),
    ...(channelCounts["email"] ? [{ key: "email", label: "E-mail" }] : []),
    ...(channelCounts["chat"] ? [{ key: "chat", label: "Chat" }] : []),
  ];

  const selectedConv = sorted.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!initialLeadId || selectedId || conversations.length === 0) return;
    const leadConversation = conversations.find((conversation) => conversation.leadId === initialLeadId);
    if (leadConversation) {
      setSelectedId(leadConversation.id);
      setShowMobileChat(true);
    }
  }, [conversations, initialLeadId, selectedId]);

  const handleSelectConv = useCallback(
    (conv: Conversation) => {
      setSelectedId(conv.id);
      setShowMobileChat(true);
      if (conv.naoLidas > 0) {
        markRead.mutate(
          { tenantId, conversationId: conv.id },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({
                queryKey: getListTenantConversationsQueryKey(tenantId),
              });
            },
          }
        );
      }
    },
    [tenantId, markRead, queryClient]
  );

  // Auto-select first conversation on load (or when filter changes and current selection disappears)
  useEffect(() => {
    const stillVisible = sorted.some((c) => c.id === selectedId);
    if (!stillVisible) {
      const first = sorted[0]?.id ?? null;
      setSelectedId(first);
      if (!first) setShowMobileChat(false);
    }
  }, [sorted.length, channelFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalUnread = conversations.reduce((acc, c) => acc + c.naoLidas, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/20">
      {/* ── View tabs: WhatsApp x Instagram x Perguntas Praça.ai ── */}
      <div className="flex gap-1 px-4 pt-3 border-b border-border shrink-0 bg-background">
        <button
          onClick={() => { setActiveView("whatsapp"); setChannelFilter("all"); }}
          className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            activeView === "whatsapp"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Conversas
        </button>
        {channelCounts["instagram"] > 0 && (
          <button
            onClick={() => { setActiveView("instagram"); setChannelFilter("instagram"); }}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeView === "instagram"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <Instagram className="h-3.5 w-3.5 text-pink-500" />
              Instagram
              {instagramUnread > 0 && (
                <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]">
                  {instagramUnread}
                </Badge>
              )}
            </span>
          </button>
        )}
        <button
          onClick={() => setActiveView("praca")}
          className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            activeView === "praca"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-2">
            Perguntas Praça.ai
            {pracaPending.count > 0 && (
              <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]">
                {pracaPending.count}
              </Badge>
            )}
          </span>
        </button>
      </div>

      {activeView === "praca" ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <PracaPerguntas />
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden">
      {/* ── Left sidebar ── */}
      <div className={`${showMobileChat ? "hidden md:flex" : "flex"} flex-col border-r border-border bg-background w-full md:w-[360px] md:shrink-0`}>
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-border shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold">{activeView === "instagram" ? "Instagram" : "Conversas"}</h1>
              <p className="text-[11px] text-muted-foreground">
                {activeView === "instagram"
                  ? "DMs, comentários em posts, reels e anúncios"
                  : "WhatsApp, Instagram, e-mail e chat em uma caixa de entrada"}
              </p>
            </div>
            {totalUnread > 0 && (
              <Badge variant="default" className="text-xs">
                {totalUnread} não lidas
              </Badge>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar contato, telefone ou e-mail..."
              className="h-9 pl-9 rounded-full bg-muted/60 border-0 focus-visible:ring-1"
            />
          </div>
        </div>

        {/* Channel filter chips -- escondido na aba dedicada do Instagram,
            já vem pré-filtrado, mostrar de novo seria redundante */}
        {activeView !== "instagram" && filterChips.length > 1 && (
          <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-none border-b border-border shrink-0">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                onClick={() => setChannelFilter(chip.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  channelFilter === chip.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 active:bg-muted/60"
                }`}
              >
                {chip.key !== "all" && channelIcon(chip.key)}
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          {convsLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="h-9 w-9 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
                    <div className="h-2.5 bg-muted animate-pulse rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground p-4 text-center">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            sorted.map((conv) => {
              const convLead = conv.leadId ? leadMap.get(conv.leadId) : undefined;
              return (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  leadName={convLead?.nome}
                  isHumanLocked={convLead?.activeAgentLock === "human"}
                  selected={selectedId === conv.id}
                  onClick={() => handleSelectConv(conv)}
                />
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* ── Right chat panel ── */}
      <div className={`${showMobileChat ? "flex" : "hidden md:flex"} flex-1 flex-col overflow-hidden`}>
        {selectedConv ? (
          <ChatPanel
            key={selectedConv.id}
            conv={selectedConv}
            lead={selectedConv.leadId ? leadMap.get(selectedConv.leadId) : undefined}
            leadName={selectedConv.leadId ? leadMap.get(selectedConv.leadId)?.nome : undefined}
            tenantId={tenantId}
            onBack={() => setShowMobileChat(false)}
            onLockReleased={() => {
              queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <MessageSquare className="h-12 w-12 opacity-20" />
            <p className="text-sm">Selecione uma conversa para começar</p>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
}
