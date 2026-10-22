import { getListTenantUsersQueryKey } from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListTenantUsers } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, ShieldCheck, Users } from "lucide-react";

function canManageSettings(user: any): boolean {
  if (!user) return false;
  if (user.platformRole === "super_admin" || user.platformRole === "tenant_admin" || user.userFunction === "administrador") return true;
  return Array.isArray(user.permissions) && user.permissions.includes("settings");
}

function roleLabel(user: any): string {
  if (user.platformRole === "super_admin") return "Super admin";
  if (user.platformRole === "tenant_admin") return "Admin do tenant";
  if (user.userFunction === "administrador") return "Administrador";
  const fn = typeof user.userFunction === "string" ? user.userFunction : "membro";
  return fn.charAt(0).toUpperCase() + fn.slice(1);
}

export function ConfigurationAccessPanel() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const isAdmin = user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin" || user?.userFunction === "administrador";
  const [expanded, setExpanded] = useState(false);
  const { data: users = [], isLoading } = useListTenantUsers(tenantId, {
    query: { queryKey: getListTenantUsersQueryKey(tenantId), enabled: Boolean(tenantId && isAdmin && expanded), staleTime: 60_000, refetchOnWindowFocus: false },
  });

  const allowedUsers = useMemo(() => (Array.isArray(users) ? users.filter(canManageSettings) : []), [users]);
  const restrictedUsers = useMemo(() => (Array.isArray(users) ? users.filter((item) => !canManageSettings(item)) : []), [users]);

  if (!isAdmin || !tenantId) return null;

  return (
    <section className="mb-4 rounded-xl border bg-background p-3 sm:p-4" aria-label="Governança de acesso às configurações">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">Governança de acesso</strong>
              <Badge variant="secondary" className="text-[10px]">Configurações</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Controle quais usuários podem acessar e alterar as configurações do tenant usando a permissão “Configurações”.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" />}
          {expanded ? "Ocultar" : "Ver acessos"}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t pt-4">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando usuários e permissões...</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">Podem alterar</span>
                    <Badge variant="secondary" className="text-[10px]">{allowedUsers.length}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Admins e usuários com a permissão Configurações.</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">Sem acesso</span>
                    <Badge variant="outline" className="text-[10px]">{restrictedUsers.length}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Usuários sem permissão explícita para Configurações.</p>
                </div>
              </div>

              <div className="space-y-2">
                {allowedUsers.map((member: any) => (
                  <div key={member.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{member.name || member.email || "Usuário"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{member.email || "Sem e-mail informado"}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{roleLabel(member)}</Badge>
                      <Badge className="text-[10px]">Pode alterar Configurações</Badge>
                    </div>
                  </div>
                ))}
                {allowedUsers.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Nenhum usuário adicional com permissão de Configurações.
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-xs font-semibold">Gerenciar permissões</div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Altere a permissão “Configurações” na gestão de usuários.</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => { window.location.href = "/usuarios"; }}>
                  Abrir usuários
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
