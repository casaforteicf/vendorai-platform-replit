import { VendorBackButton } from "@/components/ui/back-button";
import { useParams } from "wouter";
import { useLocation } from "wouter";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import { usePartnerLeadDetail, usePartnerCommissions } from "@/lib/partnerApi";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return iso; }
}
function fmtDateOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }); } catch { return iso; }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-3 pt-4">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}

// ── Aba Dados ──────────────────────────────────────────────────────────────

function DadosTab({ lead }: { lead: Record<string, unknown> }) {
  const STATUS_COLOR: Record<string, string> = {
    novo: "bg-slate-100 text-slate-700",
    em_negociacao: "bg-yellow-100 text-yellow-700",
    cliente: "bg-emerald-100 text-emerald-700",
    perdido: "bg-red-100 text-red-700",
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-4">
      <Field label="Nome" value={String(lead.nome ?? "")} />
      <Field label="Telefone" value={lead.telefone ? String(lead.telefone) : "—"} />
      <Field label="E-mail" value={lead.email ? String(lead.email) : "—"} />
      <Field label="Empresa / Segmento" value={lead.empresa ? String(lead.empresa) : "—"} />
      <Field
        label="Status"
        value={
          <Badge className={`${STATUS_COLOR[String(lead.status ?? "")] ?? "bg-muted text-muted-foreground"} border-0 font-medium`}>
            {String(lead.status ?? "—")}
          </Badge>
        }
      />
      <Field label="Origem" value={lead.source ? String(lead.source) : "—"} />
      <Field label="Objetivo" value={lead.objetivo ? String(lead.objetivo) : "—"} />
      <Field label="Data de Indicação" value={fmtDateOnly(lead.createdAt as string)} />
      <Field label="Última Atualização" value={fmtDate(lead.updatedAt as string)} />
    </div>
  );
}

// ── Aba Conversas ──────────────────────────────────────────────────────────

function ConversasTab({ conversations }: { conversations: Record<string, unknown>[] }) {
  if (conversations.length === 0) {
    return (
      <p className="pt-4 text-sm text-muted-foreground text-center py-8">
        Nenhuma conversa registrada.
      </p>
    );
  }
  return (
    <div className="rounded-md border mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Canal</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Iniciada em</TableHead>
            <TableHead>Última msg</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conversations.map((c, i) => (
            <TableRow key={String(c.id ?? i)}>
              <TableCell className="capitalize">{String(c.channel ?? "—")}</TableCell>
              <TableCell>{String(c.status ?? "—")}</TableCell>
              <TableCell>{fmtDate(c.startedAt as string)}</TableCell>
              <TableCell>{fmtDate(c.lastMessageAt as string)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Aba Deals ──────────────────────────────────────────────────────────────

function DealsTab({ deals }: { deals: Record<string, unknown>[] }) {
  if (deals.length === 0) {
    return (
      <p className="pt-4 text-sm text-muted-foreground text-center py-8">
        Nenhum deal registrado.
      </p>
    );
  }
  return (
    <div className="rounded-md border mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Criado em</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((d, i) => (
            <TableRow key={String(d.id ?? i)}>
              <TableCell className="font-medium">{String(d.title ?? "—")}</TableCell>
              <TableCell>
                {d.value
                  ? Number(d.value).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })
                  : "—"}
              </TableCell>
              <TableCell>{String(d.stage ?? "—")}</TableCell>
              <TableCell>{fmtDateOnly(d.createdAt as string)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Aba Atividades ─────────────────────────────────────────────────────────

function AtividadesTab({ activities }: { activities: Record<string, unknown>[] }) {
  if (activities.length === 0) {
    return (
      <p className="pt-4 text-sm text-muted-foreground text-center py-8">
        Nenhuma atividade registrada.
      </p>
    );
  }
  return (
    <div className="rounded-md border mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Agendado</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((a, i) => (
            <TableRow key={String(a.id ?? i)}>
              <TableCell className="capitalize">{String(a.type ?? "—")}</TableCell>
              <TableCell className="max-w-xs truncate">{String(a.description ?? "—")}</TableCell>
              <TableCell>{fmtDate(a.scheduledAt as string)}</TableCell>
              <TableCell>{String(a.status ?? "—")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Aba Comissões ──────────────────────────────────────────────────────────

function ComissoesTab({
  partnerId,
  tenantId,
}: {
  partnerId: string | undefined;
  tenantId: string;
}) {
  const { data: commissions, isLoading } = usePartnerCommissions(partnerId);

  const filtered = (commissions ?? []).filter(
    (c) => c.tenantId === tenantId
  );

  if (isLoading) return <TabSkeleton />;

  if (filtered.length === 0) {
    return (
      <p className="pt-4 text-sm text-muted-foreground text-center py-8">
        Nenhuma comissão para este cliente.
      </p>
    );
  }

  return (
    <div className="rounded-md border mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Valor Base</TableHead>
            <TableHead>%</TableHead>
            <TableHead>Comissão</TableHead>
            <TableHead>Mês Ref.</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="capitalize">{c.tipo ?? "—"}</TableCell>
              <TableCell>
                {c.valorBase
                  ? Number(c.valorBase).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })
                  : "—"}
              </TableCell>
              <TableCell>{c.percentual ? `${c.percentual}%` : "—"}</TableCell>
              <TableCell className="font-medium text-emerald-600">
                {c.valor
                  ? Number(c.valor).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })
                  : "—"}
              </TableCell>
              <TableCell>{c.dataReferencia ?? "—"}</TableCell>
              <TableCell>{c.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PartnerLeadDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const partnerId = (user as any)?.partnerId as string | undefined;

  const { data, isLoading, isError } = usePartnerLeadDetail(params.id);
  const lead = data?.lead;

  return (
    <PartnerLayout>
      <div className="space-y-4">
        <VendorBackButton to="/partner/leads" label="Voltar" />

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-8 text-center text-destructive text-sm">
              Erro ao carregar lead ou acesso negado.
            </CardContent>
          </Card>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold">{String(lead?.nome ?? "")}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Detalhes do lead (somente leitura)
              </p>
            </div>

            <Tabs defaultValue="dados">
              <TabsList>
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="conversas">
                  Conversas {data!.conversations.length > 0 && `(${data!.conversations.length})`}
                </TabsTrigger>
                <TabsTrigger value="deals">
                  Deals {data!.deals.length > 0 && `(${data!.deals.length})`}
                </TabsTrigger>
                <TabsTrigger value="atividades">
                  Atividades {data!.activities.length > 0 && `(${data!.activities.length})`}
                </TabsTrigger>
                <TabsTrigger value="comissoes">Comissões</TabsTrigger>
              </TabsList>

              <TabsContent value="dados">
                <DadosTab lead={data!.lead} />
              </TabsContent>

              <TabsContent value="conversas">
                <ConversasTab conversations={data!.conversations} />
              </TabsContent>

              <TabsContent value="deals">
                <DealsTab deals={data!.deals} />
              </TabsContent>

              <TabsContent value="atividades">
                <AtividadesTab activities={data!.activities} />
              </TabsContent>

              <TabsContent value="comissoes">
                <ComissoesTab
                  partnerId={partnerId}
                  tenantId={String(lead?.tenantId ?? "")}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </PartnerLayout>
  );
}
