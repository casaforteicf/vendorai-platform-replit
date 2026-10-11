import { useMemo } from "react";
import { getUi20VisibleServices, type Ui20Module } from "@/lib/ui20ServiceVisibility";
import { Link, useLocation } from "wouter";
import { Bot, BriefcaseBusiness, Building2, CircleHelp, House, Megaphone, Ruler, Settings2, Store, Users } from "lucide-react";

/**
 * UI 2.0 opt-in: service-level navigation. It does not authorize any route.
 * The existing sidebar and server permissions remain the source of truth.
 */
const services = [
  { id: "home", label: "Início", href: "/dashboard", icon: House, paths: ["/", "/dashboard", "/trabalho"] },
  { id: "crm", label: "CRM", href: "/leads", icon: Users, paths: ["/leads", "/deals", "/pipeline-operacional", "/conversations", "/agenda", "/propostas", "/empresas"] },
  { id: "marketing", label: "Marketing", href: "/analytics", icon: Megaphone, paths: ["/marketing", "/analytics", "/ads", "/content", "/campanhas"] },
  { id: "erp", label: "ERP", href: "/erp", icon: Building2, paths: ["/erp", "/estoque", "/obras", "/insumos", "/composicoes"] },
  { id: "ia", label: "IA", href: "/agents/config", icon: Bot, paths: ["/agents", "/vendi", "/base-conhecimento", "/brain"] },
  { id: "marketplace", label: "Marketplace", href: "/marketplace", icon: Store, paths: ["/marketplace"] },
  { id: "arqdor", label: "Arqdor", href: "/arch", icon: Ruler, paths: ["/arch"] },
  { id: "support", label: "Suporte", href: "/faq", icon: CircleHelp, paths: ["/faq", "/suporte"] },
  { id: "settings", label: "Configurações", href: "/configuracoes", icon: Settings2, paths: ["/configuracoes", "/usuarios", "/organizacao"] },
] as const;

type Props = {
  arqdorVisible: boolean;
  erpVisible: boolean;
  modules?: Ui20Module[];
  isAdmin?: boolean;
  loading?: boolean;
};

export function ServiceTabsBar({ arqdorVisible, erpVisible, modules, isAdmin, loading }: Props) {
  const [location] = useLocation();
  const pathname = location.split("?")[0].replace(/\/$/, "") || "/";
  const visible = useMemo(() => {
    const allowed = getUi20VisibleServices({ modules, isAdmin, arqdorEligible: arqdorVisible, loading });
    return services.filter((item) => allowed.has(item.id) && (item.id !== "erp" || erpVisible));
  }, [modules, isAdmin, arqdorVisible, erpVisible, loading]);
  const current = visible.find((item) => item.paths.some((path) =>
    pathname === path || (path !== "/" && pathname.startsWith(path + "/"))
  ))?.id;

  return (
    <nav aria-label="Serviços do Vendor.ai" data-ui20-service-tabs="true"
      className="sticky top-0 z-30 w-full border-b border-slate-700 bg-[#10243d] px-2 py-2 text-white shadow-sm md:px-4">
      <div className="flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <span className="mr-3 hidden shrink-0 items-center gap-2 border-r border-white/20 pr-4 text-sm font-semibold lg:flex">
          <BriefcaseBusiness className="h-4 w-4 text-sky-300" /> Serviços
        </span>
        {visible.map((item) => {
          const Icon = item.icon;
          const selected = current === item.id;
          return (
            <Link key={item.id} href={item.href}
              aria-current={selected ? "page" : undefined}
              className={`flex min-w-[76px] shrink-0 flex-col items-center gap-1 rounded-lg px-3 py-2 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 md:min-w-[88px] ${selected ? "bg-blue-600 text-white" : "text-slate-200 hover:bg-white/10"}`}>
              <Icon aria-hidden="true" className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
