import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Smartphone,
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
  Inbox,
  RefreshCcw,
  Library,
  Info,
  Building2,
  PhoneCall,
  AtSign,
  ExternalLink,
  ShieldCheck,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  MediaAssetPicker,
  mediaAssetUrl,
  type MediaPickerAsset,
} from "@/components/media/MediaAssetPicker";

type InboxFilter = "all" | "unread" | "human" | "ai";
type ActiveView = "inbox" | "instagram" | "email" | "app" | "praca";

function channelIcon(channel: string | null | undefined) {
  switch (channel) {
    case "whatsapp":
      return <Phone className="h-3.5 w-3.5 text-emerald-500" />;
    case "instagram":
      return <Instagram className="h-3.5 w-3.5 text-pink-500" />;
    case "email":
      return <Mail className="h-3.5 w-3.5 text-blue-400" />;
    case "chat":
      return <Smartphone className="h-3.5 w-3.5 text-violet-400" />;
    default:
      return <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function channelLabel(channel: string | null | undefined): string {
  const labels: Record<string, string> = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    email: "E-mail",
    chat: "Aplicativo",
  };
  return labels[channel ?? ""] ?? channel ?? "—";
}

function formatConvTime(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "";
  const d = new Date(dateValue);
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

function mediaPreviewIcon(type: MediaPickerAsset["type"]) {
  if (type === "video") return <VideoIcon className="h-5 w-5 text-muted-foreground" />;
  if (type === "audio") return <Mic className="h-5 w-5 text-muted-foreground" />;
  if (type === "document") return <FileText className="h-5 w-5 text-muted-foreground" />;
  return <Library className="h-5 w-5 text-muted-foreground" />;
}

function ConvItem({
  conv,
  lead,
  isHumanLocked,
  selected,
  onClick,
}: {
  conv: Conversation;
  lead: Lead | undefined;
  isHumanLocked: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const contactHint =
    lead?.empresa ||
    lead?.telefone ||
    lead?.email ||
    "Contato ainda não vinculado ao CRM";

  return (
    <button
      onClick={onClick}
      data-testid={`conv-item-${conv.id}`}
      className="w-full px-2 py-1.5 text-left"
    >
      <div
        className={`group flex min-h-[76px] items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
          selected
            ? "border-primary/40 bg-primary/10 shadow-sm"
            : "border-transparent bg-background hover:border-border hover:bg-muted/45"
        }`}
      >
        <div className="relative shrink-0">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold uppercase ${
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {(lead?.nome ?? "?")[0]}
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-background">
            {channelIcon(conv.channel)}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold">
              {lead?.nome ?? "Contato não vinculado"}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatConvTime(conv.ultimaMensagemEm)}
            </span>
          </div>

          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {contactHint}
          </p>

          <div className="mt-1.5 flex items-center gap-1.5">
            {isHumanLocked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                <UserCheck className="h-3 w-3" />
                Humano
              </span>
            ) : conv.agentName ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                <Bot className="h-3 w-3" />
                {conv.agentName}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {channelLabel(conv.channel)}
              </span>
            )}

            {lead?.proximaAcao && (
              <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                Próxima: {lead.proximaAcao}
              </span>
            )}

            {conv.naoLidas > 0 && (
              <Badge className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">
                {conv.naoLidas}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function MsgBubble({ msg }: { msg: Message }) {
  const isOutgoing = msg.direcao === "saida";
  const isAI = msg.enviadoPor === "agente_ia";
  const isHuman = msg.enviadoPor === "humano";

  return (
    <div
      data-testid={`msg-${msg.id}`}
      className={`flex max-w-[78%] flex-col gap-1 ${
        isOutgoing ? "self-end items-end" : "self-start items-start"
      }`}
    >
      {isOutgoing && (
        <div className="flex items-center gap-1 px-1">
          {isAI && (
            <>
              <Bot className="h-3 w-3 text-violet-500" />
              <span className="text-[10px] font-medium text-violet-500">
                {msg.agentName ?? "Agente IA"}
              </span>
            </>
          )}
          {isHuman && (
            <>
              <User className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-medium text-primary">Você</span>
            </>
          )}
        </div>
      )}
      <div
        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
          isOutgoing
            ? isAI
              ? "rounded-tr-sm bg-violet-600 text-white"
              : "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm border border-border/70 bg-background text-foreground"
        }`}
      >
        {msg.midiaUrl && (
          <div className="mb-1.5">
            {msg.tipoConteudo === "imagem" ? (
              <a href={msg.midiaUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={msg.midiaUrl}
                  alt="Anexo"
                  className="max-h-64 max-w-full rounded-lg object-cover"
                />
              </a>
            ) : msg.tipoConteudo === "video" ? (
              <video src={msg.midiaUrl} controls className="max-h-64 max-w-full rounded-lg" />
            ) : msg.tipoConteudo === "audio" ? (
              <audio src={msg.midiaUrl} controls className="max-w-full" />
            ) : (
              <a
                href={msg.midiaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs underline-offset-2 hover:underline ${
                  isOutgoing ? "bg-white/15" : "bg-muted"
                }`}
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">Ver documento</span>
              </a>
            )}
          </div>
        )}
        {msg.conteudo && (!msg.midiaUrl || msg.conteudo !== "Anexo") && msg.conteudo}
      </div>

      <span className="px-1 text-[10px] text-muted-foreground/60">
        {formatMsgTime(msg.createdAt)}
      </span>
    </div>
  );
}

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

function HandoffSeparator({
  fromAgent,
  toAgent,
  timestamp,
}: {
  fromAgent: string;
  toAgent: string;
  timestamp: string;
}) {
  return (
    <div className="my-1 flex items-center gap-2 py-2">
      <div className="flex-1 border-t border-dashed border-violet-200 dark:border-violet-800" />
      <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400">
        <ArrowRight className="h-2.5 w-2.5 shrink-0" />
        {agentLabel(fromAgent)} → {agentLabel(toAgent)}
        <span className="ml-0.5 font-normal text-violet-400 dark:text-violet-600">
          · {formatDistanceToNow(new Date(timestamp), { locale: ptBR, addSuffix: true })}
        </span>
      </span>
      <div className="flex-1 border-t border-dashed border-violet-200 dark:border-violet-800" />
    </div>
  );
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 border-t border-border" />
      <span className="px-2 text-[11px] font-medium text-muted-foreground">
        {formatMsgDate(date)}
      </span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

function ChatPanel({
  conv,
  lead,
  leadName,
  tenantId,
  onBack,
  onLockChanged,
}: {
  conv: Conversation;
  lead: Lead | undefined;
  leadName: string | undefined;
  tenantId: string;
  onBack?: () => void;
  onLockChanged?: () => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [releasingLock, setReleasingLock] = useState(false);
  const [takingLock, setTakingLock] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [handoffEvents, setHandoffEvents] = useState<HandoffEvent[]>([]);
  const [pendingAttachment, setPendingAttachment] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [libraryAsset, setLibraryAsset] = useState<MediaPickerAsset | null>(null);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [sendingLibraryAsset, setSendingLibraryAsset] = useState(false);
  const [togglingAgentDisabled, setTogglingAgentDisabled] = useState(false);
  const [instagramConnectionId, setInstagramConnectionId] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const requestUploadUrl = useRequestUploadUrl();
  const updateLead = useUpdateLead();
  const createMessage = useCreateMessage();
  const { data: instagramConnectionStatus } = useQuery<{
    id?: string;
    connections?: Array<{ id: string; username?: string | null }>;
  }>({
    queryKey: ["conversation-instagram-accounts", tenantId],
    queryFn: async () => {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch(`/api/tenants/${tenantId}/instagram-connection`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Falha ao carregar contas do Instagram.");
      return response.json();
    },
    enabled: Boolean(tenantId && conv.channel === "instagram"),
    staleTime: 30_000,
  });
  const instagramAccounts = instagramConnectionStatus?.connections ?? [];
  const selectedInstagramConnectionId =
    instagramConnectionId || instagramConnectionStatus?.id || instagramAccounts[0]?.id || "";

  const isHumanLocked = lead?.activeAgentLock === "human";
  const isAgentDisabled = !!lead?.agenteDesativado;
  const isBusy =
    createMessage.isPending || uploadingAttachment || sendingLibraryAsset;

  function invalidateConversationState() {
    queryClient.invalidateQueries({
      queryKey: getListTenantLeadsQueryKey(tenantId),
    });
    queryClient.invalidateQueries({
      queryKey: getListTenantConversationsQueryKey(tenantId),
    });
  }

  function handleToggleAgentDisabled() {
    if (!lead?.id) return;

    if (
      !isAgentDisabled &&
      !window.confirm(
        "Marcar este contato como não-lead? A IA deixará de responder automaticamente a novas mensagens deste contato."
      )
    ) {
      return;
    }

    setTogglingAgentDisabled(true);
    updateLead.mutate(
      { id: lead.id, data: { agenteDesativado: !isAgentDisabled } },
      {
        onSuccess: () => {
          toast({
            title: isAgentDisabled
              ? "Contato reativado para a IA"
              : "Contato marcado como não-lead",
            description: isAgentDisabled
              ? "O agente poderá voltar a atender este contato."
              : "A IA não responderá automaticamente enquanto esta classificação permanecer ativa.",
          });
          invalidateConversationState();
        },
        onError: () =>
          toast({ title: "Erro ao atualizar contato", variant: "destructive" }),
        onSettled: () => setTogglingAgentDisabled(false),
      }
    );
  }

  function handleTakeLock() {
    if (!lead?.id || isHumanLocked || isAgentDisabled) return;
    setTakingLock(true);
    updateLead.mutate(
      { id: lead.id, data: { activeAgentLock: "human" } },
      {
        onSuccess: () => {
          toast({
            title: "Atendimento assumido",
            description: "A IA foi pausada para este contato enquanto você atende.",
          });
          invalidateConversationState();
          onLockChanged?.();
        },
        onError: () =>
          toast({ title: "Erro ao assumir atendimento", variant: "destructive" }),
        onSettled: () => setTakingLock(false),
      }
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
          if (
            act.tipo !== "handoff_agente" ||
            typeof act.resultadoExecucao !== "string"
          ) {
            continue;
          }

          const match = act.resultadoExecucao.match(/^de:(.+)\|para:(.+)$/);
          if (!match) continue;

          const ts =
            typeof act.concluidaEm === "string"
              ? act.concluidaEm
              : typeof act.createdAt === "string"
                ? act.createdAt
                : null;

          if (!ts) continue;

          events.push({
            id:
              typeof act.id === "string"
                ? act.id
                : String(act.id ?? Math.random()),
            timestamp: ts,
            fromAgent: match[1],
            toAgent: match[2],
          });
        }

        setHandoffEvents(events);
      })
      .catch(() => undefined);
  }, [conv.leadId, tenantId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (pendingAttachment) {
        URL.revokeObjectURL(pendingAttachment.previewUrl);
      }
    };
  }, [pendingAttachment]);

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

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      toast({
        title: "IA reativada",
        description: "O agente voltará a responder automaticamente.",
      });

      invalidateConversationState();
      onLockChanged?.();
    } catch (err) {
      toast({
        title: "Erro ao liberar IA",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setReleasingLock(false);
    }
  }

  function handleFilePicked(file: File) {
    if (pendingAttachment) {
      URL.revokeObjectURL(pendingAttachment.previewUrl);
    }
    setLibraryAsset(null);
    setPendingAttachment({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  function clearAttachment() {
    if (pendingAttachment) {
      URL.revokeObjectURL(pendingAttachment.previewUrl);
    }
    setPendingAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleLibrarySelection(selected: MediaPickerAsset[]) {
    const next = selected[0] ?? null;
    clearAttachment();
    setLibraryAsset(next);
  }

  async function sendLibraryMessage(text: string) {
    if (!libraryAsset || !conv.leadId) return;

    setSendingLibraryAsset(true);

    try {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tenantId,
          conversationId: conv.id,
          leadId: conv.leadId,
          direcao: MessageDirecao.saida,
          canal: (conv.channel as MessageCanal) ?? MessageCanal.chat,
          conteudo: text || libraryAsset.originalFilename || "Mídia",
          enviadoPor: MessageEnviadoPor.humano,
          midia: { mediaAssetId: libraryAsset.id },
          ...(conv.channel === "instagram" && selectedInstagramConnectionId ? { instagramConnectionId: selectedInstagramConnectionId } : {}),
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Não foi possível enviar a mídia da Biblioteca."
        );
      }

      setInputValue("");
      setLibraryAsset(null);
      queryClient.invalidateQueries({
        queryKey: getListConversationMessagesQueryKey(tenantId, conv.id),
      });
      queryClient.invalidateQueries({
        queryKey: getListTenantConversationsQueryKey(tenantId),
      });
    } catch (err) {
      toast({
        title: "Erro ao enviar mídia",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSendingLibraryAsset(false);
    }
  }

  async function handleSend() {
    const text = inputValue.trim();

    if ((!text && !pendingAttachment && !libraryAsset) || !conv.leadId) return;

    if (libraryAsset && !pendingAttachment) {
      await sendLibraryMessage(text);
      return;
    }

    let midia:
      | {
          url: string;
          objectPath: string;
          mimeType: string;
          fileName: string;
        }
      | undefined;

    if (pendingAttachment) {
      setUploadingAttachment(true);

      try {
        const file = pendingAttachment.file;
        const result = await new Promise<{
          uploadURL: string;
          objectPath: string;
        }>((resolve, reject) => {
          requestUploadUrl.mutate(
            {
              data: {
                name: file.name,
                size: file.size,
                contentType: file.type || "application/octet-stream",
              },
            },
            { onSuccess: resolve, onError: reject }
          );
        });

        const uploadRes = await fetch(result.uploadURL, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });

        if (!uploadRes.ok) throw new Error("Upload falhou");

        midia = {
          url: `${window.location.origin}/api/storage${result.objectPath}`,
          objectPath: result.objectPath,
          mimeType: file.type || "application/octet-stream",
          fileName: file.name,
        };
      } catch (err) {
        toast({
          title: "Erro ao enviar anexo",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
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
          ...(conv.channel === "instagram" && selectedInstagramConnectionId ? { instagramConnectionId: selectedInstagramConnectionId } : {}),
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
      void handleSend();
    }
  }

  type TimelineItem =
    | { kind: "msg"; msg: Message; date: string }
    | { kind: "handoff"; event: HandoffEvent };

  const timelineItems: TimelineItem[] = [];

  for (const msg of messages) {
    timelineItems.push({
      kind: "msg",
      msg,
      date: msg.createdAt.slice(0, 10),
    });
  }

  for (const event of handoffEvents) {
    timelineItems.push({ kind: "handoff", event });
  }

  timelineItems.sort((a, b) => {
    const ta =
      a.kind === "msg"
        ? new Date(a.msg.createdAt).getTime()
        : new Date(a.event.timestamp).getTime();

    const tb =
      b.kind === "msg"
        ? new Date(b.msg.createdAt).getTime()
        : new Date(b.event.timestamp).getTime();

    return ta - tb;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-5">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 md:hidden"
              onClick={onBack}
              aria-label="Voltar para conversas"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
            {(leadName ?? "?")[0]}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold">
                {leadName ?? "Contato não vinculado"}
              </p>

              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {channelIcon(conv.channel)}
                {channelLabel(conv.channel)}
              </span>

              {isAgentDisabled ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                  <UserX className="h-3 w-3" />
                  Não-lead
                </span>
              ) : isHumanLocked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  <UserCheck className="h-3 w-3" />
                  Atendimento humano
                </span>
              ) : conv.agentName ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                  <Bot className="h-3 w-3" />
                  {conv.agentName}
                </span>
              ) : null}
            </div>

            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {lead?.empresa && (
                <>
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{lead.empresa}</span>
                </>
              )}
              {!lead?.empresa && lead?.telefone && (
                <>
                  <PhoneCall className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{lead.telefone}</span>
                </>
              )}
              <span className="inline-flex shrink-0 items-center gap-1">
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                {conv.status === "open" ? "Aberta" : conv.status === "closed" ? "Encerrada" : conv.status}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {lead?.id && (
              <Button
                variant={showDetails ? "secondary" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setShowDetails((value) => !value)}
              >
                <Info className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">
                  {showDetails ? "Ocultar" : "Detalhes"}
                </span>
              </Button>
            )}

            {isHumanLocked ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-amber-300 text-xs text-amber-700 hover:bg-amber-50"
                onClick={handleReleaseLock}
                disabled={releasingLock}
              >
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">
                  {releasingLock ? "Liberando..." : "Devolver para IA"}
                </span>
              </Button>
            ) : lead?.id && !isAgentDisabled ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={handleTakeLock}
                disabled={takingLock}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">
                  {takingLock ? "Assumindo..." : "Assumir atendimento"}
                </span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {showDetails && lead && (
        <div className="shrink-0 border-b border-border bg-muted/25 px-4 py-3 md:px-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 rounded-xl border bg-background px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Contato
              </p>
              <p className="mt-1 truncate text-xs font-medium">
                {lead.telefone || "Telefone não informado"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {lead.email || "E-mail não informado"}
              </p>
            </div>

            <div className="min-w-0 rounded-xl border bg-background px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Comercial
              </p>
              <p className="mt-1 truncate text-xs font-medium">
                {lead.status || "Sem status"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {lead.urgencia ? `Urgência: ${lead.urgencia}` : "Urgência não informada"}
              </p>
            </div>

            <div className="min-w-0 rounded-xl border bg-background px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Dor principal
              </p>
              <p className="mt-1 line-clamp-2 text-xs font-medium">
                {lead.dorPrincipal || "Ainda não identificada"}
              </p>
            </div>

            <div className="min-w-0 rounded-xl border bg-background px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Próxima ação
              </p>
              <p className="mt-1 line-clamp-2 text-xs font-medium">
                {lead.proximaAcao || "Nenhuma próxima ação definida"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {lead.empresa && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {lead.empresa}
                </span>
              )}
              {lead.email && (
                <span className="inline-flex items-center gap-1">
                  <AtSign className="h-3.5 w-3.5" />
                  {lead.email}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/leads/${lead.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir no CRM
              </Link>

              <Button
                variant="ghost"
                size="sm"
                className={`h-8 gap-1.5 text-xs ${
                  isAgentDisabled
                    ? "text-emerald-700 hover:bg-emerald-50"
                    : "text-muted-foreground hover:text-destructive"
                }`}
                onClick={handleToggleAgentDisabled}
                disabled={togglingAgentDisabled}
              >
                {isAgentDisabled ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <UserX className="h-3.5 w-3.5" />
                )}
                {togglingAgentDisabled
                  ? "Atualizando..."
                  : isAgentDisabled
                    ? "Reativar contato"
                    : "Marcar como não-lead"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isHumanLocked && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 md:px-5">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>
            A IA está pausada. Este atendimento está sob controle humano até você devolver para a IA.
          </span>
        </div>
      )}

      <ScrollArea className="flex-1 bg-gradient-to-b from-muted/10 to-muted/30 px-4 py-4 md:px-8">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`h-10 animate-pulse rounded-2xl bg-muted ${
                  i % 2 === 0 ? "w-2/3 self-start" : "ml-auto w-1/2 self-end"
                }`}
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background shadow-sm">
              <MessageSquare className="h-6 w-6 opacity-40" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Conversa iniciada</p>
              <p className="mt-1 text-xs">
                Envie a primeira mensagem ou aguarde uma resposta do contato.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-1">
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

                const showDate = item.date !== lastDate;
                lastDate = item.date;

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

      <div className="shrink-0 border-t border-border bg-background/95 px-3 py-3 backdrop-blur md:px-4">
        {!conv.leadId ? (
          <p className="py-1 text-center text-xs text-muted-foreground">
            Conversa sem lead associado — envio desativado
          </p>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-2">
            {pendingAttachment && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
                {pendingAttachment.file.type.startsWith("image/") ? (
                  <img
                    src={pendingAttachment.previewUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-lg object-cover"
                  />
                ) : pendingAttachment.file.type.startsWith("video/") ? (
                  <VideoIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                ) : pendingAttachment.file.type.startsWith("audio/") ? (
                  <Mic className="h-5 w-5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {pendingAttachment.file.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Arquivo local
                  </p>
                </div>

                <button
                  type="button"
                  onClick={clearAttachment}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Remover anexo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {libraryAsset && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
                  {libraryAsset.type === "image" ? (
                    <img
                      src={mediaAssetUrl(libraryAsset.storageUrl)}
                      alt={libraryAsset.originalFilename || "Mídia"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    mediaPreviewIcon(libraryAsset.type)
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {libraryAsset.originalFilename || `Mídia ${libraryAsset.type}`}
                  </p>
                  <p className="inline-flex items-center gap-1 text-[10px] text-primary">
                    <Library className="h-3 w-3" />
                    Biblioteca de Mídias
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setLibraryAsset(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Remover mídia da Biblioteca"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {conv.channel === "instagram" && instagramAccounts.length > 1 && (
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Responder por</span>
                <Select value={selectedInstagramConnectionId} onValueChange={setInstagramConnectionId}>
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue placeholder="Conta do Instagram" />
                  </SelectTrigger>
                  <SelectContent>
                    {instagramAccounts.map((account, index) => (
                      <SelectItem key={account.id} value={account.id}>
                        @{account.username || "instagram"}{index === 0 ? " · principal" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-2 py-1.5 shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFilePicked(file);
                  e.target.value = "";
                }}
              />

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                title="Anexar arquivo do computador"
                className="h-8 gap-1.5 rounded-xl px-2 text-xs text-muted-foreground"
              >
                <Paperclip className="h-4 w-4" />
                <span className="hidden xl:inline">Arquivo</span>
              </Button>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLibraryPickerOpen(true)}
                disabled={isBusy}
                title="Escolher da Biblioteca de Mídias"
                className="h-8 gap-1.5 rounded-xl px-2 text-xs text-muted-foreground"
              >
                <Library className="h-4 w-4" />
                <span className="hidden xl:inline">Biblioteca</span>
              </Button>

              <Input
                data-testid="input-message"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isHumanLocked
                    ? "Atendimento humano — escreva sua mensagem..."
                    : pendingAttachment || libraryAsset
                      ? "Adicionar legenda (opcional)..."
                      : "Digite uma mensagem..."
                }
                className="h-9 flex-1 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                disabled={isBusy}
              />

              <Button
                size="icon"
                onClick={() => void handleSend()}
                disabled={
                  (!inputValue.trim() && !pendingAttachment && !libraryAsset) ||
                  isBusy
                }
                data-testid="button-send-message"
                className="h-9 w-9 shrink-0 rounded-xl"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      <MediaAssetPicker
        tenantId={tenantId}
        open={libraryPickerOpen}
        onOpenChange={setLibraryPickerOpen}
        allowedTypes={["image", "video", "audio", "document"]}
        maxSelection={1}
        title="Escolher mídia para a conversa"
        confirmLabel="Usar na conversa"
        onConfirm={handleLibrarySelection}
      />
    </div>
  );
}
export default function Conversations() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();

  const { data: pracaPending = { count: 0 } } = useQuery<{ count: number }>({
    queryKey: ["praca-perguntas-count", tenantId],
    queryFn: async () => {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch(
        `/api/tenants/${tenantId}/praca-perguntas-pendentes/count`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      if (!response.ok) {
        throw new Error("Falha ao contar perguntas pendentes");
      }

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
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("inbox");
  const [refreshing, setRefreshing] = useState(false);

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

  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const markRead = useMarkConversationRead();

  const totalUnread = conversations.reduce(
    (acc, conversation) => acc + conversation.naoLidas,
    0
  );

  const unreadConversationCount = conversations.filter(
    (conversation) => conversation.naoLidas > 0
  ).length;

  const humanCount = conversations.filter((conversation) => {
    const lead = conversation.leadId
      ? leadMap.get(conversation.leadId)
      : undefined;
    return lead?.activeAgentLock === "human";
  }).length;

  const aiCount = conversations.filter((conversation) => {
    const lead = conversation.leadId
      ? leadMap.get(conversation.leadId)
      : undefined;
    return !!conversation.agentName && lead?.activeAgentLock !== "human";
  }).length;

  const channelCounts = conversations.reduce<Record<string, number>>(
    (acc, conversation) => {
      const channel = conversation.channel ?? "other";
      acc[channel] = (acc[channel] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const instagramUnread = conversations
    .filter((conversation) => conversation.channel === "instagram")
    .reduce((acc, conversation) => acc + conversation.naoLidas, 0);

  const emailUnread = conversations
    .filter((conversation) => conversation.channel === "email")
    .reduce((acc, conversation) => acc + conversation.naoLidas, 0);

  const appUnread = conversations
    .filter((conversation) => conversation.channel === "chat")
    .reduce((acc, conversation) => acc + conversation.naoLidas, 0);

  const effectiveChannelFilter =
    activeView === "instagram"
      ? "instagram"
      : activeView === "email"
        ? "email"
        : activeView === "app"
          ? "chat"
          : channelFilter;

  const filteredConversations = [...conversations]
    .sort((a, b) => {
      const ta = a.ultimaMensagemEm
        ? new Date(a.ultimaMensagemEm).getTime()
        : 0;
      const tb = b.ultimaMensagemEm
        ? new Date(b.ultimaMensagemEm).getTime()
        : 0;
      return tb - ta;
    })
    .filter(
      (conversation) =>
        effectiveChannelFilter === "all" ||
        conversation.channel === effectiveChannelFilter
    )
    .filter((conversation) => {
      const lead = conversation.leadId
        ? leadMap.get(conversation.leadId)
        : undefined;

      if (inboxFilter === "unread") return conversation.naoLidas > 0;
      if (inboxFilter === "human") return lead?.activeAgentLock === "human";
      if (inboxFilter === "ai") {
        return (
          !!conversation.agentName &&
          lead?.activeAgentLock !== "human" &&
          !lead?.agenteDesativado
        );
      }

      return true;
    })
    .filter((conversation) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;

      const lead = conversation.leadId
        ? leadMap.get(conversation.leadId)
        : undefined;

      return [
        lead?.nome,
        lead?.telefone,
        lead?.email,
        lead?.empresa,
        lead?.proximaAcao,
        channelLabel(conversation.channel),
        conversation.agentName,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        );
    });

  const filterChips: { key: string; label: string }[] = [
    { key: "all", label: "Todos os canais" },
    ...(channelCounts.whatsapp
      ? [{ key: "whatsapp", label: "WhatsApp" }]
      : []),
    ...(channelCounts.instagram
      ? [{ key: "instagram", label: "Instagram" }]
      : []),
    ...(channelCounts.email ? [{ key: "email", label: "E-mail" }] : []),
    ...(channelCounts.chat ? [{ key: "chat", label: "Aplicativo" }] : []),
  ];

  const quickFilters: {
    key: InboxFilter;
    label: string;
    count: number;
    icon: React.ReactNode;
  }[] = [
    {
      key: "all",
      label: "Todas as conversas",
      count: conversations.length,
      icon: <Inbox className="h-3.5 w-3.5" />,
    },
    {
      key: "unread",
      label: "Não lidas",
      count: unreadConversationCount,
      icon: <Eye className="h-3.5 w-3.5" />,
    },
    {
      key: "human",
      label: "Humano",
      count: humanCount,
      icon: <UserCheck className="h-3.5 w-3.5" />,
    },
    {
      key: "ai",
      label: "IA",
      count: aiCount,
      icon: <Bot className="h-3.5 w-3.5" />,
    },
  ];

  const selectedConv =
    filteredConversations.find(
      (conversation) => conversation.id === selectedId
    ) ?? null;

  useEffect(() => {
    if (!initialLeadId || selectedId || conversations.length === 0) return;

    const leadConversation = conversations.find(
      (conversation) => conversation.leadId === initialLeadId
    );

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

  useEffect(() => {
    const stillVisible = filteredConversations.some(
      (conversation) => conversation.id === selectedId
    );

    if (!stillVisible) {
      const first = filteredConversations[0]?.id ?? null;
      setSelectedId(first);
      if (!first) setShowMobileChat(false);
    }
  }, [
    filteredConversations.length,
    inboxFilter,
    channelFilter,
    activeView,
    searchQuery,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);

    try {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getListTenantConversationsQueryKey(tenantId),
        }),
        queryClient.invalidateQueries({
          queryKey: getListTenantLeadsQueryKey(tenantId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["praca-perguntas-count", tenantId],
        }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  function clearFilters() {
    setSearchQuery("");
    setInboxFilter("all");
    setChannelFilter("all");
  }

  return (
    <div className="vendor-page-canvas vendor-conversations-page flex h-full flex-col overflow-hidden bg-muted/10">
      <div className="vendor-conversations-header shrink-0 border-b border-border/70 bg-background/95 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Inbox className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">Caixa de entrada</h1>
                <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  sincronização ativa
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                WhatsApp, Instagram, e-mail e aplicativo com contexto de CRM e IA.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden text-right lg:block">
              <p className="text-xs font-medium">{conversations.length} conversas</p>
              <p className="text-[11px] text-muted-foreground">{unreadConversationCount} não lidas · {totalUnread} mensagens pendentes</p>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              title="Atualizar caixa de entrada"
            >
              <RefreshCcw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1">
          <button
            type="button"
            onClick={() => {
              setActiveView("inbox");
              setChannelFilter("all");
            }}
            className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors ${
              activeView === "inbox"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            Caixa de entrada
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
              {conversations.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView("instagram");
              setInboxFilter("all");
            }}
            className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors ${
              activeView === "instagram"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Instagram className="h-3.5 w-3.5 text-pink-500" />
            Instagram
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
              {channelCounts.instagram ?? 0}
            </span>
            {instagramUnread > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {instagramUnread}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView("email");
              setInboxFilter("all");
            }}
            className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors ${
              activeView === "email"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mail className="h-3.5 w-3.5 text-blue-500" />
            E-mail
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
              {channelCounts.email ?? 0}
            </span>
            {emailUnread > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {emailUnread}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView("app");
              setInboxFilter("all");
            }}
            className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors ${
              activeView === "app"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Canal preparado para mensagens do aplicativo"
          >
            <Smartphone className="h-3.5 w-3.5 text-violet-500" />
            Aplicativo
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
              {channelCounts.chat ?? 0}
            </span>
            {appUnread > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {appUnread}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveView("praca")}
            className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors ${
              activeView === "praca"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Perguntas Praça.ai
            {pracaPending.count > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {pracaPending.count}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeView === "praca" ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <PracaPerguntas />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div
            className={`${
              showMobileChat ? "hidden md:flex" : "flex"
            } w-full flex-col border-r border-border bg-background md:w-[372px] md:shrink-0`}
          >
            <div className="shrink-0 border-b border-border px-3 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar contato, empresa, telefone ou e-mail..."
                  className="h-9 rounded-xl border-border bg-muted/40 pl-9 pr-3 text-sm"
                />
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1">
                {quickFilters.map((filter) => (
                  <button
                    type="button"
                    key={filter.key}
                    onClick={() => setInboxFilter(filter.key)}
                    className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-medium transition-colors ${
                      inboxFilter === filter.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {filter.icon}
                      <strong className="text-[11px]">{filter.count}</strong>
                    </span>
                    <span className="truncate">{filter.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {activeView === "inbox" && filterChips.length > 1 && (
              <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-3 py-2 scrollbar-none">
                {filterChips.map((chip) => (
                  <button
                    type="button"
                    key={chip.key}
                    onClick={() => setChannelFilter(chip.key)}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      channelFilter === chip.key
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {chip.key !== "all" && channelIcon(chip.key)}
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex shrink-0 items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
              <span>
                {filteredConversations.length} conversa
                {filteredConversations.length === 1 ? "" : "s"}
              </span>
              {(searchQuery ||
                inboxFilter !== "all" ||
                channelFilter !== "all") && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="font-medium text-primary hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            <ScrollArea className="flex-1">
              {convsLoading ? (
                <div className="space-y-2 p-3">
                  {[...Array(6)].map((_, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 rounded-xl border p-3"
                    >
                      <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                        <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <MessageSquare className="h-6 w-6 text-muted-foreground" />
                  </div>

                  <div>
                    <p className="text-sm font-semibold">
                      {conversations.length === 0
                        ? "Nenhuma conversa ainda"
                        : "Nenhuma conversa neste filtro"}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {conversations.length === 0
                        ? "As conversas dos canais conectados aparecerão aqui automaticamente."
                        : "Tente remover filtros ou buscar outro contato."}
                    </p>
                  </div>

                  {conversations.length === 0 ? (
                    <Link
                      href="/configuracoes"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-muted"
                    >
                      Configurar canais
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={clearFilters}
                    >
                      Limpar filtros
                    </Button>
                  )}
                </div>
              ) : (
                <div className="pb-2">
                  {filteredConversations.map((conversation) => {
                    const lead = conversation.leadId
                      ? leadMap.get(conversation.leadId)
                      : undefined;

                    return (
                      <ConvItem
                        key={conversation.id}
                        conv={conversation}
                        lead={lead}
                        isHumanLocked={lead?.activeAgentLock === "human"}
                        selected={selectedId === conversation.id}
                        onClick={() => handleSelectConv(conversation)}
                      />
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          <div
            className={`${
              showMobileChat ? "flex" : "hidden md:flex"
            } flex-1 flex-col overflow-hidden`}
          >
            {selectedConv ? (
              <ChatPanel
                key={selectedConv.id}
                conv={selectedConv}
                lead={
                  selectedConv.leadId
                    ? leadMap.get(selectedConv.leadId)
                    : undefined
                }
                leadName={
                  selectedConv.leadId
                    ? leadMap.get(selectedConv.leadId)?.nome
                    : undefined
                }
                tenantId={tenantId}
                onBack={() => setShowMobileChat(false)}
                onLockChanged={() => {
                  queryClient.invalidateQueries({
                    queryKey: getListTenantLeadsQueryKey(tenantId),
                  });
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl border bg-background shadow-sm">
                  {conversations.length === 0 ? (
                    <Inbox className="h-7 w-7 text-muted-foreground" />
                  ) : (
                    <MessageSquare className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>

                <div className="max-w-sm">
                  <p className="text-sm font-semibold">
                    {conversations.length === 0
                      ? "Sua caixa de entrada está pronta"
                      : "Selecione uma conversa"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {conversations.length === 0
                      ? "Conecte seus canais em Configurações. Quando chegar uma nova mensagem, ela aparecerá aqui com o contexto do CRM."
                      : "Escolha um contato na lista para ver o histórico, assumir o atendimento ou responder com apoio da Biblioteca de Mídias."}
                  </p>
                </div>

                {conversations.length === 0 && (
                  <Link
                    href="/configuracoes"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Configurar canais
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}