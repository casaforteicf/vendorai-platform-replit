import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListTenantConversations,
  getListTenantConversationsQueryKey,
  useListConversationMessages,
  getListConversationMessagesQueryKey,
  useMarkConversationRead,
  useCreateMessage,
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  Conversation,
  Message,
  MessageDirecao,
  MessageEnviadoPor,
  MessageCanal,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  selected,
  onClick,
}: {
  conv: Conversation;
  leadName: string | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={`conv-item-${conv.id}`}
      className={`w-full text-left px-4 py-3 border-b border-border transition-colors flex gap-3 items-start ${
        selected
          ? "bg-primary/10 border-l-2 border-l-primary"
          : "hover:bg-muted/50"
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
          {conv.naoLidas > 0 && (
            <Badge className="h-4 min-w-[1rem] text-[10px] px-1 rounded-full bg-primary text-primary-foreground">
              {conv.naoLidas}
            </Badge>
          )}
        </div>
        {conv.agentName && (
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
        {msg.conteudo}
      </div>

      {/* Time */}
      <span className="text-[10px] text-muted-foreground/60 px-1">
        {formatMsgTime(msg.createdAt)}
      </span>
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
  leadName,
  tenantId,
  onBack,
}: {
  conv: Conversation;
  leadName: string | undefined;
  tenantId: string;
  onBack?: () => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend() {
    const text = inputValue.trim();
    if (!text || !conv.leadId) return;

    createMessage.mutate(
      {
        data: {
          tenantId,
          conversationId: conv.id,
          leadId: conv.leadId,
          direcao: MessageDirecao.saida,
          canal: (conv.channel as MessageCanal) ?? MessageCanal.chat,
          conteudo: text,
          enviadoPor: MessageEnviadoPor.humano,
        },
      },
      {
        onSuccess: () => {
          setInputValue("");
          queryClient.invalidateQueries({
            queryKey: getListConversationMessagesQueryKey(tenantId, conv.id),
          });
          queryClient.invalidateQueries({
            queryKey: getListTenantConversationsQueryKey(tenantId),
          });
        },
        onError: () => {
          toast({ title: "Erro ao enviar mensagem", variant: "destructive" });
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

  // Group messages by date for separators
  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const msg of messages) {
    const d = msg.createdAt.slice(0, 10);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== d) {
      grouped.push({ date: d, msgs: [msg] });
    } else {
      last.msgs.push(msg);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-border shrink-0">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 shrink-0"
            onClick={onBack}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground uppercase shrink-0">
          {(leadName ?? "?")[0]}
        </div>
        <div>
          <p className="font-semibold text-sm">
            {leadName ?? "Lead desconhecido"}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {channelIcon(conv.channel)}
            <span>{channelLabel(conv.channel)}</span>
            {conv.agentName && (
              <>
                <span>·</span>
                <Bot className="h-3 w-3 text-violet-500" />
                <span className="text-violet-500">{conv.agentName}</span>
              </>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Wifi className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs text-muted-foreground capitalize">{conv.status}</span>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 px-6 py-4">
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
          <div className="flex flex-col gap-1">
            {grouped.map(({ date, msgs }) => (
              <div key={date} className="flex flex-col gap-1">
                <DateSeparator date={msgs[0].createdAt} />
                {msgs.map((msg) => (
                  <MsgBubble key={msg.id} msg={msg} />
                ))}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border shrink-0 bg-background">
        {!conv.leadId ? (
          <p className="text-xs text-muted-foreground text-center py-1">
            Conversa sem lead associado — envio desativado
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              data-testid="input-message"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              className="flex-1 rounded-full bg-muted border-0 focus-visible:ring-1"
              disabled={createMessage.isPending}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!inputValue.trim() || createMessage.isPending}
              data-testid="button-send-message"
              className="rounded-full h-9 w-9 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);

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
    },
  });

  const leadMap = new Map(leads.map((l) => [l.id, l.nome]));

  const markRead = useMarkConversationRead();

  // Sort conversations by ultimaMensagemEm desc
  const sorted = [...conversations].sort((a, b) => {
    const ta = a.ultimaMensagemEm ? new Date(a.ultimaMensagemEm).getTime() : 0;
    const tb = b.ultimaMensagemEm ? new Date(b.ultimaMensagemEm).getTime() : 0;
    return tb - ta;
  });

  const selectedConv = sorted.find((c) => c.id === selectedId) ?? null;

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

  // Auto-select first conversation on load
  useEffect(() => {
    if (!selectedId && sorted.length > 0) {
      setSelectedId(sorted[0].id);
    }
  }, [sorted.length, selectedId]);

  const totalUnread = conversations.reduce((acc, c) => acc + c.naoLidas, 0);

  return (
    <div className="flex h-full -mx-4 -my-4 md:-mx-8 md:-my-8 overflow-hidden">
      {/* ── Left sidebar ── */}
      <div className={`${showMobileChat ? "hidden md:flex" : "flex"} flex-col border-r border-border bg-background w-full md:w-80 md:shrink-0`}>
        {/* Sidebar header */}
        <div className="px-4 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">Conversas</h1>
            {totalUnread > 0 && (
              <Badge variant="default" className="text-xs">
                {totalUnread} não lidas
              </Badge>
            )}
          </div>
        </div>

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
            sorted.map((conv) => (
              <ConvItem
                key={conv.id}
                conv={conv}
                leadName={conv.leadId ? leadMap.get(conv.leadId) : undefined}
                selected={selectedId === conv.id}
                onClick={() => handleSelectConv(conv)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      {/* ── Right chat panel ── */}
      <div className={`${showMobileChat ? "flex" : "hidden md:flex"} flex-1 flex-col overflow-hidden`}>
        {selectedConv ? (
          <ChatPanel
            key={selectedConv.id}
            conv={selectedConv}
            leadName={selectedConv.leadId ? leadMap.get(selectedConv.leadId) : undefined}
            tenantId={tenantId}
            onBack={() => setShowMobileChat(false)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <MessageSquare className="h-12 w-12 opacity-20" />
            <p className="text-sm">Selecione uma conversa para começar</p>
          </div>
        )}
      </div>
    </div>
  );
}
