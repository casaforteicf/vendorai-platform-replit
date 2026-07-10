import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Store, ChevronDown, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface SwitchableTenant {
  id: string;
  name: string;
  slug: string;
  organizacaoId: string;
}

interface SwitchableTenantsResponse {
  currentTenant: { id: string; name: string } | null;
  tenants: SwitchableTenant[];
}

const TOKEN_KEY = "vendorai_token";

export function StoreSwitcher() {
  const { token } = useAuth();
  const [switching, setSwitching] = useState(false);

  const { data, isLoading } = useQuery<SwitchableTenantsResponse>({
    queryKey: ["auth", "switchable-tenants"],
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch("/api/auth/switchable-tenants", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return { currentTenant: null, tenants: [] };
      return r.json() as Promise<SwitchableTenantsResponse>;
    },
  });

  async function handleSwitch(targetTenantId: string) {
    if (switching || !token) return;
    setSwitching(true);

    try {
      const r = await fetch("/api/auth/switch-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetTenantId }),
      });

      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        console.error("[StoreSwitcher] troca negada:", body.error);
        setSwitching(false);
        return;
      }

      const { token: newToken } = (await r.json()) as { token: string };
      localStorage.setItem(TOKEN_KEY, newToken);
      window.location.href = "/";
    } catch {
      setSwitching(false);
    }
  }

  if (isLoading || !data || data.tenants.length === 0) return null;

  const currentName = data.currentTenant?.name ?? "Loja atual";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between gap-2 text-left font-normal h-9 px-2 text-sidebar-foreground hover:bg-sidebar-accent"
          disabled={switching}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Store className="h-4 w-4 shrink-0 opacity-70" />
            <span className="truncate text-sm">{currentName}</span>
          </span>
          {switching ? (
            <Loader2 className="h-3 w-3 animate-spin opacity-60" />
          ) : (
            <ChevronDown className="h-3 w-3 opacity-60" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Trocar de loja
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-sm opacity-60 cursor-default"
          disabled
        >
          <Store className="h-4 w-4 mr-2" />
          {currentName} (atual)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {data.tenants.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onSelect={() => handleSwitch(t.id)}
            disabled={switching}
            className="text-sm cursor-pointer"
          >
            <Store className="h-4 w-4 mr-2 opacity-60" />
            {t.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
