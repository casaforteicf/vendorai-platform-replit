import { Link } from "wouter";
import { MyUpcomingAppointments } from "./MyUpcomingAppointments";
import { JarvisHomeSuggestions } from "./JarvisHomeSuggestions";
import { getUi20VisibleServices, type Ui20Module } from "@/lib/ui20ServiceVisibility";
import { Bot, Building2, CircleHelp, House, CalendarDays, ClipboardList, Sparkles, Megaphone, Ruler, Settings2, Store, Users, ArrowUpRight } from "lucide-react";

type Props = {
  name: string;
  tenantId: string;
  userId: string;
  token?: string | null;
  isAdmin: boolean;
  arqdorVisible?: boolean;
  erpVisible?: boolean;
  modules?: Ui20Module[];
  loading?: boolean;
  overdueTasks?: number;
  unassignedLeads?: number;
  overdueTaskItems?: Array<{ id: string; title: string; leadId?: string | null }>;
  recentActivity?: Array<{ tipo: string; descricao: string; createdAt: string }>;
};

const serviceCards = [
  { key: "crm", title: "CRM", subtitle: "Leads e negócios", href: "/leads", Icon: Users },
  { key: "marketing", title: "Marketing", subtitle: "Campanhas e resultados", href: "/analytics", Icon: Megaphone },
  { key: "erp", title: "ERP", subtitle: "Operação e financeiro", href: "/erp", Icon: Building2 },
  { key: "ia", title: "IA", subtitle: "Agentes e automações", href: "/agents/config", Icon: Bot },
  { key: "marketplace", title: "Marketplace", subtitle: "Produtos e serviços", href: "/marketplace", Icon: Store },
  { key: "arqdor", title: "Arqdor", subtitle: "Projetos e ambientes", href: "/arch", Icon: Ruler },
  { key: "support", title: "Suporte", subtitle: "Ajuda e atendimento", href: "/faq", Icon: CircleHelp },
  { key: "settings", title: "Configurações", subtitle: "Empresa e usuários", href: "/configuracoes", Icon: Settings2 },
] as const;

/** Presentation only; tenant/route authorization continues on the server. */
export function ServiceHome({ name, tenantId, userId, token, isAdmin, arqdorVisible = false, erpVisible = false, modules, loading, overdueTasks, unassignedLeads, overdueTaskItems, recentActivity }: Props) {
  const allowed = getUi20VisibleServices({ modules, isAdmin, arqdorEligible: arqdorVisible, loading });
  const visible = serviceCards.filter((module) =>
    allowed.has(module.key) && (module.key !== "erp" || erpVisible)
  );
  return (
    <section className="vendor-product-page space-y-5" aria-label="Início do Vendor.ai" data-ui20-home="true">
      <header className="rounded-2xl border bg-card px-5 py-6 shadow-sm">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <House className="h-4 w-4" aria-hidden="true" /> Meu espaço de trabalho
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Olá, {name || "bem-vindo"}!</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesse seus serviços e acompanhe os resultados da empresa abaixo.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Acessos rápidos e alertas">
        <Link href="/trabalho" className="rounded-xl border bg-card p-4 hover:border-primary/50">
          <div className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4 text-primary" /> Minhas atividades</div>
          <p className="mt-2 text-sm text-muted-foreground">{overdueTasks == null ? "Abrir atividades" : overdueTasks > 0 ? `${overdueTasks} tarefa(s) vencida(s)` : "Nenhuma tarefa vencida"}</p>
        </Link>
        {modules?.some((module) => module.moduleKey === "scheduler" && module.isEnabled && module.commerciallyEntitled !== false) && <Link href="/agenda" className="rounded-xl border bg-card p-4 hover:border-primary/50">
          <div className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" /> Agenda</div>
          <p className="mt-2 text-sm text-muted-foreground">Ver compromissos e prazos</p>
        </Link>}
        {allowed.has("crm") && <Link href="/leads" className="rounded-xl border bg-card p-4 hover:border-primary/50">
          <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Atenção comercial</div>
          <p className="mt-2 text-sm text-muted-foreground">{unassignedLeads == null ? "Conferir leads" : unassignedLeads > 0 ? `${unassignedLeads} lead(s) sem responsável` : "Nenhum lead sem responsável"}</p>
        </Link>}
      </div>
      {Boolean(overdueTaskItems?.length || recentActivity?.length) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {Boolean(overdueTaskItems?.length) && <section className="rounded-xl border bg-card p-4" aria-label="Pendências recentes">
            <h2 className="mb-3 text-sm font-semibold">Pendências que precisam de atenção</h2>
            <ul className="space-y-2">{overdueTaskItems!.slice(0, 4).map((task) => (
              <li key={task.id} className="text-sm">
                <Link href={task.leadId ? `/leads/${encodeURIComponent(task.leadId)}?activityId=${encodeURIComponent(task.id)}` : "/trabalho?attention=vencidos"} className="text-primary hover:underline">{task.title}</Link>
              </li>
            ))}</ul>
          </section>}
          {Boolean(recentActivity?.length) && <section className="rounded-xl border bg-card p-4" aria-label="Atividade recente">
            <h2 className="mb-3 text-sm font-semibold">Atividade recente</h2>
            <ul className="space-y-2">{recentActivity!.slice(0, 4).map((item, index) => (
              <li key={`${item.createdAt}-${index}`} className="text-sm text-muted-foreground">{item.descricao}</li>
            ))}</ul>
          </section>}
        </div>
      )}
      {tenantId && userId && modules?.some(module => module.moduleKey === "scheduler" && module.isEnabled && module.commerciallyEntitled !== false) ? <MyUpcomingAppointments tenantId={tenantId} userId={userId} /> : null}
      {allowed.has("ia") && tenantId && token ? <JarvisHomeSuggestions tenantId={tenantId} token={token} /> : null}
      <div>
        <h2 className="mb-3 text-base font-semibold">Meus serviços</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map(({ key, title, subtitle, href, Icon }) => (
            <Link key={key} href={href}
              className="group flex min-h-[112px] flex-col justify-between rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-primary">
              <div className="flex items-start justify-between">
                <span className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </div>
              <div><p className="mt-3 font-semibold">{title}</p><p className="text-xs text-muted-foreground">{subtitle}</p></div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
