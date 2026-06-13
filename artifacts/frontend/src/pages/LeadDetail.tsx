import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetLead,
  getGetLeadQueryKey,
  useGetOrCreateLeadIntelligence,
  getGetOrCreateLeadIntelligenceQueryKey,
  useUpdateCustomerIntelligence,
  useListActivities,
  getListActivitiesQueryKey,
  useListTenantConversations,
  getListTenantConversationsQueryKey,
  useListConversationMessages,
  getListConversationMessagesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Phone,
  Mail,
  Building2,
  Target,
  Brain,
  MapPin,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  Check,
  TrendingUp,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700 border-blue-200",
  qualificado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  nao_qualificado: "bg-zinc-100 text-zinc-600 border-zinc-200",
  convertido: "bg-violet-100 text-violet-700 border-violet-200",
  perdido: "bg-red-100 text-red-600 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  nao_qualificado: "Não qualificado",
  convertido: "Convertido",
  perdido: "Perdido",
};

const ACTIVITY_TIPO_LABELS: Record<string, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  email: "Email",
  visita: "Visita",
  tarefa: "Tarefa",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  email: "Email",
  sms: "SMS",
  web_chat: "Web Chat",
};

function churnColor(risk: number | null | undefined): string {
  if (risk === null || risk === undefined) return "text-muted-foreground";
  if (risk > 70) return "text-red-600";
  if (risk >= 30) return "text-amber-600";
  return "text-emerald-600";
}

function churnProgressColor(risk: number | null | undefined): string {
  if (risk === null || risk === undefined) return "bg-muted";
  if (risk > 70) return "bg-red-500";
  if (risk >= 30) return "bg-amber-500";
  return "bg-emerald-500";
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConversationMessages({
  tenantId,
  conversationId,
}: {
  tenantId: string;
  conversationId: string;
}) {
  const { data: messages, isLoading } = useListConversationMessages(
    tenantId,
    conversationId,
    {
      query: {
        enabled: !!(tenantId && conversationId),
        queryKey: getListConversationMessagesQueryKey(tenantId, conversationId),
      },
    }
  );

  if (isLoading)
    return (
      <div className="space-y-2 pt-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );

  if (!messages?.length)
    return (
      <p className="text-xs text-muted-foreground pt-3">Nenhuma mensagem ainda.</p>
    );

  return (
    <div className="space-y-2 pt-3 max-h-64 overflow-y-auto">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.direcao === "saida" ? "justify-end" : "justify-start"}`}
          data-testid={`msg-${msg.id}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              msg.direcao === "saida"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            <p className="leading-snug">{msg.conteudo}</p>
            <p
              className={`text-[10px] mt-1 ${
                msg.direcao === "saida" ? "text-primary-foreground/70" : "text-muted-foreground"
              }`}
            >
              {formatDateTime(msg.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, setLocation] = useLocation();
  const [openConvId, setOpenConvId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const [editingChurnRisk, setEditingChurnRisk] = useState(false);
  const [churnRiskDraft, setChurnRiskDraft] = useState<string>("");

  const [editingNextBestAction, setEditingNextBestAction] = useState(false);
  const [nextBestActionDraft, setNextBestActionDraft] = useState<string>("");

  const { data: lead, isLoading: leadLoading } = useGetLead(id, {
    query: {
      enabled: !!id,
      queryKey: getGetLeadQueryKey(id),
    },
  });

  const { data: intelligence, isLoading: ciLoading } = useGetOrCreateLeadIntelligence(
    tenantId,
    id,
    {
      query: {
        enabled: !!(tenantId && id),
        queryKey: getGetOrCreateLeadIntelligenceQueryKey(tenantId, id),
      },
    }
  );

  const { mutate: updateIntelligence, isPending: isUpdating } =
    useUpdateCustomerIntelligence({
      mutation: {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getGetOrCreateLeadIntelligenceQueryKey(tenantId, id),
          });
        },
      },
    });

  function saveChurnRisk() {
    if (!intelligence?.id) return;
    const value = parseInt(churnRiskDraft, 10);
    if (isNaN(value) || value < 0 || value > 100) return;
    updateIntelligence({ id: intelligence.id, data: { churnRisk: value } });
    setEditingChurnRisk(false);
  }

  function saveNextBestAction() {
    if (!intelligence?.id) return;
    updateIntelligence({
      id: intelligence.id,
      data: { nextBestAction: nextBestActionDraft },
    });
    setEditingNextBestAction(false);
  }

  const { data: activities, isLoading: activitiesLoading } = useListActivities(
    tenantId,
    { leadId: id },
    {
      query: {
        enabled: !!(tenantId && id),
        queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }),
      },
    }
  );

  const { data: conversations, isLoading: convsLoading } = useListTenantConversations(
    tenantId,
    {
      query: {
        enabled: !!tenantId,
        queryKey: getListTenantConversationsQueryKey(tenantId),
      },
    }
  );

  const leadConversations = (conversations ?? []).filter((c) => c.leadId === id);

  if (leadLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-6 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-24" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-muted-foreground">Lead não encontrado.</p>
        <Button variant="outline" onClick={() => setLocation("/leads")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Leads
        </Button>
      </div>
    );
  }

  const pendingActivities = activities?.filter((a) => a.status === "pendente") ?? [];
  const doneActivities = activities?.filter((a) => a.status !== "pendente") ?? [];
  const opportunities = Array.isArray(intelligence?.opportunities)
    ? (intelligence.opportunities as string[])
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/leads")}
          data-testid="button-back-leads"
          className="text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Leads
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{lead.nome}</h1>
          {lead.empresa && (
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {lead.empresa}
            </p>
          )}
        </div>
        <Badge
          variant="outline"
          className={STATUS_STYLES[lead.status] ?? ""}
          data-testid="badge-lead-status"
        >
          {STATUS_LABELS[lead.status] ?? lead.status}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — Lead data + CI */}
        <div className="lg:col-span-1 space-y-4">
          {/* Contact data */}
          <Card data-testid="card-lead-dados">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Dados do Lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {lead.telefone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono">{lead.telefone}</span>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{lead.email}</span>
                </div>
              )}
              {lead.objetivo && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <Target className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{lead.objetivo}</span>
                </div>
              )}
              {lead.urgencia && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Urgência: {lead.urgencia}</span>
                </div>
              )}
              <div className="pt-1 border-t">
                <p className="text-xs text-muted-foreground">
                  Criado em {formatDate(lead.createdAt)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Customer Intelligence */}
          <Card data-testid="card-customer-intelligence">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Inteligência do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {ciLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-3 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Churn Risk */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Risco de Churn
                      </span>
                      <div className="flex items-center gap-1">
                        {editingChurnRisk ? (
                          <>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={churnRiskDraft}
                              onChange={(e) => setChurnRiskDraft(e.target.value)}
                              className="h-6 w-16 text-xs px-1.5 py-0"
                              data-testid="input-churn-risk"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveChurnRisk();
                                if (e.key === "Escape") setEditingChurnRisk(false);
                              }}
                            />
                            <button
                              onClick={saveChurnRisk}
                              disabled={isUpdating}
                              className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                              data-testid="btn-save-churn-risk"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingChurnRisk(false)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span
                              className={`font-bold text-sm ${churnColor(intelligence?.churnRisk)}`}
                              data-testid="text-churn-risk"
                            >
                              {intelligence?.churnRisk !== null &&
                              intelligence?.churnRisk !== undefined
                                ? `${intelligence.churnRisk}%`
                                : "—"}
                            </span>
                            {intelligence?.id && (
                              <button
                                onClick={() => {
                                  setChurnRiskDraft(
                                    intelligence.churnRisk?.toString() ?? ""
                                  );
                                  setEditingChurnRisk(true);
                                }}
                                className="ml-1 text-muted-foreground hover:text-foreground"
                                data-testid="btn-edit-churn-risk"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${churnProgressColor(intelligence?.churnRisk)}`}
                        style={{
                          width: `${intelligence?.churnRisk ?? 0}%`,
                        }}
                        data-testid="progress-churn-risk"
                      />
                    </div>
                    {Array.isArray(intelligence?.churnReasons) &&
                      (intelligence.churnReasons as unknown[]).filter(
                        (r) => typeof r === "string" && r.trim() !== ""
                      ).length > 0 && (
                        <ul
                          className="mt-2 space-y-1"
                          data-testid="list-churn-reasons"
                        >
                          {(intelligence.churnReasons as unknown[])
                            .filter(
                              (r): r is string =>
                                typeof r === "string" && r.trim() !== ""
                            )
                            .map((reason, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-xs text-muted-foreground"
                                data-testid={`churn-reason-${i}`}
                              >
                                <span className="mt-1.5 h-1 w-1 rounded-full bg-red-400 shrink-0" />
                                <span className="leading-snug">{reason}</span>
                              </li>
                            ))}
                        </ul>
                      )}
                  </div>

                  {/* Journey Stage */}
                  {intelligence?.journeyStage && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wide">
                          Etapa da Jornada
                        </span>
                      </div>
                      <p className="text-foreground">{intelligence.journeyStage}</p>
                    </div>
                  )}

                  {/* Intent Analysis */}
                  {intelligence?.intentAnalysis && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Target className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wide">
                          Intenção de Compra
                        </span>
                      </div>
                      <p className="text-foreground leading-snug">
                        {intelligence.intentAnalysis}
                      </p>
                    </div>
                  )}

                  {/* Next Best Action */}
                  <div className="space-y-1.5 p-3 rounded-md bg-primary/5 border border-primary/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-primary">
                        <Zap className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          Próxima Melhor Ação
                        </span>
                      </div>
                      {intelligence?.id && !editingNextBestAction && (
                        <button
                          onClick={() => {
                            setNextBestActionDraft(
                              intelligence.nextBestAction ?? ""
                            );
                            setEditingNextBestAction(true);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          data-testid="btn-edit-next-best-action"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {editingNextBestAction ? (
                      <div className="space-y-2">
                        <Input
                          value={nextBestActionDraft}
                          onChange={(e) => setNextBestActionDraft(e.target.value)}
                          className="h-7 text-xs"
                          placeholder="Descreva a próxima ação..."
                          data-testid="input-next-best-action"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveNextBestAction();
                            if (e.key === "Escape") setEditingNextBestAction(false);
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={saveNextBestAction}
                            disabled={isUpdating}
                            data-testid="btn-save-next-best-action"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs px-2"
                            onClick={() => setEditingNextBestAction(false)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : intelligence?.nextBestAction ? (
                      <>
                        <p className="text-foreground leading-snug font-medium text-sm">
                          {intelligence.nextBestAction}
                        </p>
                        {intelligence.nextBestActionReason && (
                          <p className="text-xs text-muted-foreground leading-snug">
                            {intelligence.nextBestActionReason}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nenhuma ação definida. Clique para editar.
                      </p>
                    )}
                  </div>

                  {/* Opportunities */}
                  {opportunities.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wide">
                          Oportunidades
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {opportunities.map((opp, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm"
                            data-testid={`opportunity-${i}`}
                          >
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            <span className="text-foreground leading-snug">
                              {typeof opp === "string" ? opp : JSON.stringify(opp)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!intelligence?.journeyStage &&
                    !intelligence?.intentAnalysis &&
                    !intelligence?.nextBestAction &&
                    intelligence?.churnRisk === null &&
                    opportunities.length === 0 && (
                      <p className="text-muted-foreground text-xs py-2">
                        Análise ainda não disponível para este lead.
                      </p>
                    )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — Activities + Conversations */}
        <div className="lg:col-span-2 space-y-4">
          {/* Activities */}
          <Card data-testid="card-activities">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Atividades</span>
                <div className="flex items-center gap-2">
                  {pendingActivities.length > 0 && (
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                      {pendingActivities.length} pendente{pendingActivities.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activitiesLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : !activities?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma atividade registrada.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {[...pendingActivities, ...doneActivities].map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 py-3"
                      data-testid={`activity-${activity.id}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {activity.status === "pendente" ? (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{activity.titulo}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {ACTIVITY_TIPO_LABELS[activity.tipo] ?? activity.tipo}
                          </span>
                          {activity.dataVencimento && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground">
                                Vence {formatDate(activity.dataVencimento)}
                              </span>
                            </>
                          )}
                        </div>
                        {activity.descricao && (
                          <p className="text-xs text-muted-foreground mt-1 leading-snug">
                            {activity.descricao}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          activity.status === "pendente"
                            ? "bg-amber-100 text-amber-700 border-amber-200 text-xs shrink-0"
                            : activity.status === "concluida"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200 text-xs shrink-0"
                            : "bg-zinc-100 text-zinc-600 border-zinc-200 text-xs shrink-0"
                        }
                      >
                        {activity.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Conversations */}
          <Card data-testid="card-conversations">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {convsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-14 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : leadConversations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma conversa encontrada para este lead.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {leadConversations.map((conv) => {
                    const isOpen = openConvId === conv.id;
                    return (
                      <div key={conv.id} data-testid={`conv-${conv.id}`}>
                        <button
                          className="w-full flex items-center justify-between py-3 text-left hover:bg-muted/30 rounded transition-colors px-1"
                          onClick={() =>
                            setOpenConvId(isOpen ? null : conv.id)
                          }
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-1.5 rounded bg-primary/10">
                              <MessageSquare className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {CHANNEL_LABELS[conv.channel ?? ""] ?? conv.channel ?? "Canal desconhecido"}
                                </span>
                                {conv.naoLidas > 0 && (
                                  <Badge className="bg-primary text-primary-foreground text-xs h-4 px-1.5 rounded-full">
                                    {conv.naoLidas}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {conv.ultimaMensagemEm
                                  ? formatDateTime(conv.ultimaMensagemEm)
                                  : formatDate(conv.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant="outline"
                              className="text-xs"
                            >
                              {conv.status}
                            </Badge>
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </button>
                        {isOpen && (
                          <div className="pb-3 px-1">
                            <ConversationMessages
                              tenantId={tenantId}
                              conversationId={conv.id}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
