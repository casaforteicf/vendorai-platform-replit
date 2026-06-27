import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useListTenants, getListTenantsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HardHat, Shirt, ShoppingCart, Building2, Search, LogOut,
  ExternalLink, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const VERTICAL_META: Record<string, { label: string; icon: React.ElementType; color: string; href: string }> = {
  "Construção & Reforma": {
    label: "Construção Civil",
    icon: HardHat,
    color: "text-amber-600 bg-amber-50 border-amber-200",
    href: "/obras",
  },
  "Varejo de Roupas & Acessórios": {
    label: "Varejo de Moda",
    icon: Shirt,
    color: "text-pink-600 bg-pink-50 border-pink-200",
    href: "/varejo/produtos",
  },
  "Supermercado": {
    label: "Supermercado",
    icon: ShoppingCart,
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    href: "/supermercado",
  },
};

const ACTIVE_VERTICALS = Object.keys(VERTICAL_META);

export default function AdminVerticals() {
  const { setTenantOverride, tenantOverride, clearTenantOverride } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterVertical, setFilterVertical] = useState<string | "all">("all");

  const { data: tenants = [], isLoading } = useListTenants({
    query: { queryKey: getListTenantsQueryKey() },
  });

  const tenantsWithVertical = tenants.filter(
    (t) => t.vertical && ACTIVE_VERTICALS.includes(t.vertical)
  );

  const filtered = tenantsWithVertical.filter((t) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchV = filterVertical === "all" || t.vertical === filterVertical;
    return matchSearch && matchV;
  });

  const grouped = ACTIVE_VERTICALS.reduce<Record<string, typeof filtered>>((acc, v) => {
    acc[v] = filtered.filter((t) => t.vertical === v);
    return acc;
  }, {});

  function handleAccess(tenantId: string, tenantName: string, vertical: string) {
    const meta = VERTICAL_META[vertical];
    if (!meta) return;
    setTenantOverride({ id: tenantId, name: tenantName, vertical });
    setLocation(meta.href);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Verticais por Tenant
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Acesse os módulos verticais de qualquer tenant como super admin.
          </p>
        </div>
        {tenantOverride && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-amber-800">
              Visualizando <strong>{tenantOverride.name}</strong>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-amber-700 hover:text-amber-900 hover:bg-amber-100 ml-1"
              onClick={clearTenantOverride}
            >
              <LogOut className="h-3.5 w-3.5 mr-1" />
              Sair
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tenant..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {["all", ...ACTIVE_VERTICALS].map((v) => {
            const meta = v !== "all" ? VERTICAL_META[v] : null;
            const Icon = meta?.icon;
            return (
              <Button
                key={v}
                size="sm"
                variant={filterVertical === v ? "default" : "outline"}
                onClick={() => setFilterVertical(v)}
                className="gap-1.5"
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {v === "all" ? "Todos" : meta?.label}
              </Button>
            );
          })}
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground text-sm animate-pulse">
          Carregando tenants...
        </div>
      )}

      {!isLoading && tenantsWithVertical.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Nenhum tenant com vertical ativa cadastrado.
        </div>
      )}

      {!isLoading && ACTIVE_VERTICALS.map((vertical) => {
        const items = grouped[vertical] ?? [];
        if (filterVertical !== "all" && filterVertical !== vertical) return null;
        if (items.length === 0 && search) return null;

        const meta = VERTICAL_META[vertical]!;
        const VertIcon = meta.icon;

        return (
          <section key={vertical}>
            <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md border w-fit mb-3", meta.color)}>
              <VertIcon className="h-4 w-4" />
              <span className="text-sm font-semibold">{meta.label}</span>
              <Badge variant="secondary" className="ml-1 text-xs">{items.length}</Badge>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1">Nenhum tenant encontrado.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((tenant) => {
                  const isActive = tenantOverride?.id === tenant.id;
                  return (
                    <div
                      key={tenant.id}
                      className={cn(
                        "rounded-lg border bg-card p-4 flex flex-col gap-3 transition-shadow hover:shadow-sm",
                        isActive && "ring-2 ring-primary border-primary/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{tenant.id}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs shrink-0",
                            tenant.status === "active"
                              ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                              : "text-muted-foreground"
                          )}
                        >
                          {tenant.status}
                        </Badge>
                      </div>

                      <Button
                        size="sm"
                        className={cn("w-full gap-2", isActive && "bg-primary/90")}
                        onClick={() => handleAccess(tenant.id, tenant.name, vertical)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {isActive ? "Visualizando" : "Acessar módulo"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
