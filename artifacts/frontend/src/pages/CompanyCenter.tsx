import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  Activity,
  ArrowLeft,
  BadgeDollarSign,
  Building2,
  FileText,
  Handshake,
  Landmark,
  Loader2,
  MessageSquare,
  Network,
  PackageCheck,
  Phone,
  Mail,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";

function getBase() { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }
function getToken() { return localStorage.getItem("vendorai_token") ?? ""; }

type Contact = {
  relationId: string;
  personId: string;
  nome: string;
  cargo?: string | null;
  qualificacao?: string | null;
  telefones?: string[] | null;
  emails?: string[] | null;
  roles?: string[] | null;
  isPrimary?: boolean;
  verifiedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CompanyWorkspace = {
  company: {
    id: string;
    cnpj: string;
    razaoSocial?: string | null;
    nomeFantasia?: string | null;
    situacaoCadastral?: string | null;
    porte?: string | null;
    cnaePrincipal?: string | null;
    telefone?: string | null;
    email?: string | null;
    website?: string | null;
    endereco?: Record<string, string | null> | null;
    enrichedAt?: string | null;
  };
  tenantCompany: {
    id: string;
    leadId?: string | null;
    relationshipType: string;
    status: string;
  };
  contacts: Contact[];
  relationships?: {
    parents?: Array<Record<string, any>>;
    children?: Array<Record<string, any>>;
  };
  lead?: Record<string, any> | null;
  opportunities: Array<Record<string, any>>;
  conversations: Array<Record<string, any>>;
  orders: Array<Record<string, any>>;
  finance: Array<Record<string, any>>;
  documents: Array<Record<string, any>>;
  activities: Array<Record<string, any>>;
  proposals: Array<Record<string, any>>;
  intelligence?: Record<string, any> | null;
  counts: Record<string, number>;
};

const fmtMoney = (value: unknown) => {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(number) ? number : 0);
};

const fmtDate = (value: unknown) => {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
};

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg border bg-muted/40 p-2"><Icon className="h-4 w-4" /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CompanyCenter() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, setLocation] = useLocation();
  const [data, setData] = useState<CompanyWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${getBase()}/api/crm/companies/${id}/workspace?tenantId=${encodeURIComponent(tenantId)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((payload as any)?.error ?? "Falha ao carregar empresa.");
        return payload as CompanyWorkspace;
      })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar empresa."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, tenantId]);

  const companyName = data?.company.nomeFantasia || data?.company.razaoSocial || "Empresa";
  const address = useMemo(() => {
    const e = data?.company.endereco;
    if (!e) return "";
    return [e.logradouro, e.numero, e.bairro, e.municipio, e.uf].filter(Boolean).join(", ");
  }, [data?.company.endereco]);

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Button variant="ghost" onClick={() => history.back()}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
        <Card className="mt-4"><CardContent className="p-6 text-sm text-destructive">{error ?? "Empresa não encontrada."}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-3">
          <Button variant="ghost" size="icon" onClick={() => history.back()} aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-muted/50">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold md:text-2xl">{companyName}</h1>
              {data.company.situacaoCadastral && <Badge variant="outline">{data.company.situacaoCadastral}</Badge>}
              {data.company.porte && <Badge variant="secondary">{data.company.porte}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{data.company.razaoSocial}</p>
            <p className="text-xs font-mono text-muted-foreground">CNPJ {data.company.cnpj}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.tenantCompany.leadId && (
            <Button variant="outline" onClick={() => setLocation(`/leads/${data.tenantCompany.leadId}`)}>Abrir lead</Button>
          )}
          <Button variant="outline" onClick={() => setLocation("/conversas")}><MessageSquare className="mr-2 h-4 w-4" />Conversas</Button>
          <Button onClick={() => setLocation("/negocios")}><Handshake className="mr-2 h-4 w-4" />Negócios</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard icon={Users} label="Pessoas" value={data.counts.people ?? 0} />
        <StatCard icon={Handshake} label="Oportunidades" value={data.counts.opportunities ?? 0} />
        <StatCard icon={MessageSquare} label="Conversas" value={data.counts.conversations ?? 0} />
        <StatCard icon={PackageCheck} label="Pedidos" value={data.counts.orders ?? 0} />
        <StatCard icon={BadgeDollarSign} label="Financeiro" value={data.counts.finance ?? 0} />
        <StatCard icon={FileText} label="Documentos" value={data.counts.documents ?? 0} />
        <StatCard icon={Activity} label="Atividades" value={data.counts.activities ?? 0} />
        <StatCard icon={Sparkles} label="Propostas" value={data.counts.proposals ?? 0} />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border bg-card p-1">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="people">Pessoas</TabsTrigger>
          <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
          <TabsTrigger value="conversations">Conversas</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="finance">Financeiro</TabsTrigger>
          <TabsTrigger value="documents">Documentos</TabsTrigger>
          <TabsTrigger value="activities">Atividades</TabsTrigger>
          <TabsTrigger value="intelligence">Inteligência</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Cadastro empresarial</CardTitle></CardHeader>
              <CardContent className="grid gap-4 text-sm md:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Atividade</p><p>{data.company.cnaePrincipal || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Relação com o tenant</p><p className="capitalize">{data.tenantCompany.relationshipType.replace(/_/g, " ")}</p></div>
                <div><p className="text-xs text-muted-foreground">Telefone</p><p>{data.company.telefone || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">E-mail</p><p>{data.company.email || "—"}</p></div>
                <div className="md:col-span-2"><p className="text-xs text-muted-foreground">Endereço</p><p>{address || "—"}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Network className="h-4 w-4" />Estrutura corporativa</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(data.relationships?.parents?.length ?? 0) === 0 && (data.relationships?.children?.length ?? 0) === 0 ? (
                  <p className="text-muted-foreground">Nenhuma relação corporativa cadastrada.</p>
                ) : (
                  <>
                    {data.relationships?.parents?.map((rel: any) => <div key={rel.id} className="rounded-lg border p-2">↑ {String(rel.relationshipType).replace(/_/g, " ")}</div>)}
                    {data.relationships?.children?.map((rel: any) => <div key={rel.id} className="rounded-lg border p-2">↓ {String(rel.relationshipType).replace(/_/g, " ")}</div>)}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="people">
          {data.contacts.length === 0 ? <Empty text="Nenhuma pessoa vinculada a esta empresa." /> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.contacts.map((contact) => {
                const confirmed = !!contact.verifiedAt || contact.metadata?.roleStatus === "confirmed";
                return (
                  <Card key={contact.relationId}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="font-medium">{contact.nome}</p><p className="text-xs text-muted-foreground">{contact.cargo || contact.qualificacao || "Vínculo identificado"}</p></div>
                        <Badge variant={confirmed ? "default" : "secondary"}>{confirmed ? "Confirmado" : "A confirmar"}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">{contact.roles?.map((role) => <Badge key={role} variant="outline" className="capitalize">{role}</Badge>)}</div>
                      {contact.telefones?.[0] && <p className="flex items-center gap-2 text-sm"><Phone className="h-3.5 w-3.5" />{contact.telefones[0]}</p>}
                      {contact.emails?.[0] && <p className="flex items-center gap-2 text-sm"><Mail className="h-3.5 w-3.5" />{contact.emails[0]}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="opportunities">
          {data.opportunities.length === 0 ? <Empty text="Nenhuma oportunidade vinculada." /> : (
            <div className="space-y-2">{data.opportunities.map((deal: any) => (
              <Card key={deal.id}><CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-medium">{deal.titulo}</p><p className="text-xs text-muted-foreground capitalize">{String(deal.etapa).replace(/_/g, " ")}</p></div><div className="font-semibold">{fmtMoney(deal.valor)}</div></CardContent></Card>
            ))}</div>
          )}
        </TabsContent>

        <TabsContent value="conversations">
          {data.conversations.length === 0 ? <Empty text="Nenhuma conversa vinculada." /> : (
            <div className="space-y-2">{data.conversations.map((conv: any) => (
              <Card key={conv.id}><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="font-medium capitalize">{conv.channel || "Conversa"}</p><p className="text-xs text-muted-foreground">Última interação {fmtDate(conv.ultimaMensagemEm)}</p></div><Badge variant="outline">{conv.status}</Badge></CardContent></Card>
            ))}</div>
          )}
        </TabsContent>

        <TabsContent value="orders">
          {data.orders.length === 0 ? <Empty text="Nenhum pedido ou execução vinculada." /> : (
            <div className="space-y-2">{data.orders.map((order: any) => (
              <Card key={order.id}><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="font-medium">{order.titulo}</p><p className="text-xs text-muted-foreground capitalize">{String(order.etapa).replace(/_/g, " ")}</p></div><p className="font-semibold">{fmtMoney(order.valor)}</p></CardContent></Card>
            ))}</div>
          )}
        </TabsContent>

        <TabsContent value="finance">
          {data.finance.length === 0 ? <Empty text="Nenhum lançamento financeiro associado às oportunidades desta empresa." /> : (
            <div className="space-y-2">{data.finance.map((item: any) => (
              <Card key={item.id}><CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-medium">{item.titulo}</p><p className="text-xs text-muted-foreground">Cobrança: {item.chargeStatus || item.cobrancaTipo || "sem cobrança registrada"}</p></div><p className="font-semibold">{fmtMoney(item.valor)}</p></CardContent></Card>
            ))}</div>
          )}
        </TabsContent>

        <TabsContent value="documents">
          {data.documents.length === 0 ? <Empty text="Nenhum documento vinculado." /> : (
            <div className="grid gap-3 md:grid-cols-2">{data.documents.map((doc: any) => (
              <Card key={doc.id}><CardContent className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-medium">{doc.name}</p><p className="text-xs text-muted-foreground">{doc.category || doc.source}</p></div>{doc.url && <Button size="sm" variant="outline" asChild><a href={doc.url} target="_blank" rel="noreferrer">Abrir</a></Button>}</CardContent></Card>
            ))}</div>
          )}
        </TabsContent>

        <TabsContent value="activities">
          {data.activities.length === 0 ? <Empty text="Nenhuma atividade registrada." /> : (
            <div className="space-y-2">{data.activities.map((activity: any) => (
              <Card key={activity.id}><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="font-medium">{activity.titulo}</p><p className="text-xs text-muted-foreground capitalize">{String(activity.tipo).replace(/_/g, " ")} · {fmtDate(activity.dataVencimento || activity.createdAt)}</p></div><Badge variant="outline">{activity.status}</Badge></CardContent></Card>
            ))}</div>
          )}
        </TabsContent>

        <TabsContent value="intelligence">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Inteligência do relacionamento</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Objetivo</p><p>{data.lead?.objetivo || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Dor principal</p><p>{data.lead?.dorPrincipal || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Próxima ação</p><p>{data.lead?.proximaAcao || "—"}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Customer Intelligence</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {data.intelligence ? (
                  <>
                    <div><p className="text-xs text-muted-foreground">Risco / churn</p><p>{String(data.intelligence.churnRisk ?? data.intelligence.riskLevel ?? "—")}</p></div>
                    <div><p className="text-xs text-muted-foreground">Next Best Action</p><p>{String(data.intelligence.nextBestAction ?? "—")}</p></div>
                  </>
                ) : <p className="text-muted-foreground">Ainda não há inteligência consolidada para este relacionamento.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}