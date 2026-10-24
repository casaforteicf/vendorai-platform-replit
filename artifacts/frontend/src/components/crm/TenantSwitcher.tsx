import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SwitchableTenantsResponse = {
  currentTenant: { id: string; name: string } | null;
  tenants: Array<{ id: string; name: string }>;
};

const TOKEN_KEY = "vendorai_token";

export function TenantSwitcher({ compact = false }: { compact?: boolean }) {
  const { user, token, tenantOverride, clearTenantOverride } = useAuth();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery<SwitchableTenantsResponse>({
    queryKey: ["auth", "switchable-tenants"],
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch("/api/auth/switchable-tenants", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { currentTenant: null, tenants: [] };
      return r.json() as Promise<SwitchableTenantsResponse>;
    },
  });

  const name = data?.currentTenant?.name ?? (user as { tenantName?: string } | null)?.tenantName ?? "Empresa";
  const others = data?.tenants ?? [];
  const canSwitch = others.length > 0 && !tenantOverride;

  async function handleSwitch(targetTenantId: string) {
    if (switchingTo || !token) return;
    setSwitchingTo(targetTenantId);
    setError(null);
    try {
      const r = await fetch("/api/auth/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetTenantId }),
      });
      if (!r.ok) throw new Error(`switch-tenant ${r.status}`);
      const { token: newToken } = (await r.json()) as { token: string };
      localStorage.setItem(TOKEN_KEY, newToken);
      clearTenantOverride();
      window.location.href = "/tad";
    } catch {
      setSwitchingTo(null);
      setError("Não foi possível trocar de empresa.");
    }
  }

  const shell = "flex min-h-10 w-full items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium text-foreground";
  const label = (
    <>
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {!compact && <span className="flex-1 truncate text-left">{name}</span>}
    </>
  );

  if (!canSwitch) return <div className={shell} title={`Empresa atual: ${name}`}>{label}</div>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`${shell} hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
          aria-label={`Empresa atual: ${name}. Trocar de empresa`} title={`Empresa atual: ${name}`}>
          {label}
          {!compact && (switchingTo ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Trocar de empresa</DropdownMenuLabel>
        <DropdownMenuItem disabled><Check className="mr-2 h-4 w-4 text-primary" /> <span className="truncate">{name}</span></DropdownMenuItem>
        <DropdownMenuSeparator />
        {others.map((tenant) => (
          <DropdownMenuItem key={tenant.id} disabled={!!switchingTo} onSelect={(event) => { event.preventDefault(); void handleSwitch(tenant.id); }}>
            {switchingTo === tenant.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}
            <span className="truncate">{tenant.name}</span>
          </DropdownMenuItem>
        ))}
        {error && <p role="alert" className="px-2 py-1.5 text-xs text-destructive">{error}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
