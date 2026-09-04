import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { KeyRound, Loader2, Mail, Pencil, Plus, RefreshCw, ShieldCheck, UserRoundCog } from "lucide-react";

type AppLike = {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  settings: Record<string, unknown>;
};

type AppUser = {
  id: string;
  tenantId: string;
  leadId?: string | null;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  status: "invited" | "active" | "blocked" | "archived";
  locale?: string | null;
  emailVerifiedAt?: string | null;
  lastLoginAt?: string | null;
};

type Membership = {
  id: string;
  tenantId: string;
  appInstanceId: string;
  appUserId: string;
  roleKey: string;
  status: "invited" | "active" | "suspended" | "archived";
  permissions: string[];
  userDisplayName: string;
  userEmail?: string | null;
  userPhone?: string | null;
  userStatus: AppUser["status"];
  leadId?: string | null;
};

type Mode = "list" | "add" | "edit";

type Props = {
  app: AppLike | null;
  open: boolean;
  token: string | null | undefined;
  onOpenChange: (open: boolean) => void;
  onAppChanged?: () => void | Promise<void>;
};

const EMPTY_USER_FORM = {
  displayName: "",
  email: "",
  phone: "",
  leadId: "",
  userStatus: "invited" as AppUser["status"],
  roleKey: "customer",
  membershipStatus: "invited" as Membership["status"],
  permissions: "",
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function authState(settings: Record<string, unknown> | undefined) {
  const runtimeAccess = asObject(settings?.runtimeAccess);
  const auth = asObject(runtimeAccess.auth);
  const methods = Array.isArray(auth.methods) ? auth.methods.filter((method): method is string => typeof method === "string") : [];
  return { enabled: auth.enabled === true && methods.includes("email_code"), methods };
}

function statusLabel(status: string) {
  return ({
    invited: "Convidado",
    active: "Ativo",
    blocked: "Bloqueado",
    archived: "Arquivado",
    suspended: "Suspenso",
  } as Record<string, string>)[status] ?? status;
}

function statusClass(status: string) {
  if (status === "active") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (status === "invited") return "border-amber-300 bg-amber-50 text-amber-700";
  if (status === "blocked" || status === "suspended") return "border-red-300 bg-red-50 text-red-700";
  return "text-muted-foreground";
}

function parsePermissions(value: string) {
  return Array.from(new Set(value.split(/[\n,]/g).map((item) => item.trim()).filter(Boolean)));
}

export default function AppUsersDialog({ app, open, token, onOpenChange, onAppChanged }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("list");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [tenantUsers, setTenantUsers] = useState<AppUser[]>([]);
  const [existingUserId, setExistingUserId] = useState("");
  const [createNewUser, setCreateNewUser] = useState(true);
  const [editingMembership, setEditingMembership] = useState<Membership | null>(null);
  const [form, setForm] = useState(EMPTY_USER_FORM);

  const requestJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!token) throw new Error("Sessão SuperAdmin não disponível.");
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && payload.error
        ? String(payload.error)
        : `Falha na operação (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!app || !open) return;
    setLoading(true);
    try {
      const [membershipRows, userRows] = await Promise.all([
        requestJson<Membership[]>(`/admin/app-builder/apps/${app.id}/memberships`),
        requestJson<AppUser[]>(`/admin/app-builder/app-users?tenantId=${encodeURIComponent(app.tenantId)}`),
      ]);
      setMemberships(membershipRows);
      setTenantUsers(userRows);
    } catch (error) {
      toast({ title: "Não foi possível carregar os usuários do app", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [app, open, requestJson, toast]);

  useEffect(() => {
    if (!open) return;
    setMode("list");
    setEditingMembership(null);
    setForm(EMPTY_USER_FORM);
    setCreateNewUser(true);
    setExistingUserId("");
    void loadUsers();
  }, [loadUsers, open]);

  const linkedUserIds = useMemo(() => new Set(memberships.map((membership) => membership.appUserId)), [memberships]);
  const availableUsers = useMemo(() => tenantUsers.filter((user) => !linkedUserIds.has(user.id) && user.status !== "archived"), [linkedUserIds, tenantUsers]);
  const loginEnabled = authState(app?.settings).enabled;

  function startAdd() {
    setMode("add");
    setEditingMembership(null);
    setCreateNewUser(true);
    setExistingUserId(availableUsers[0]?.id ?? "");
    setForm(EMPTY_USER_FORM);
  }

  function startEdit(membership: Membership) {
    const user = tenantUsers.find((item) => item.id === membership.appUserId);
    setEditingMembership(membership);
    setForm({
      displayName: user?.displayName ?? membership.userDisplayName,
      email: user?.email ?? membership.userEmail ?? "",
      phone: user?.phone ?? membership.userPhone ?? "",
      leadId: user?.leadId ?? membership.leadId ?? "",
      userStatus: user?.status ?? membership.userStatus,
      roleKey: membership.roleKey,
      membershipStatus: membership.status,
      permissions: (membership.permissions ?? []).join(", "),
    });
    setMode("edit");
  }

  async function saveAccess() {
    if (!app) return;
    if (!form.roleKey.trim()) return;
    setSaving(true);
    try {
      let appUserId = existingUserId;
      if (createNewUser) {
        if (!form.displayName.trim()) throw new Error("Informe o nome do usuário.");
        const created = await requestJson<AppUser>("/admin/app-builder/app-users", {
          method: "POST",
          body: JSON.stringify({
            tenantId: app.tenantId,
            leadId: form.leadId.trim() || null,
            displayName: form.displayName.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            status: form.userStatus,
            locale: null,
            metadata: {},
          }),
        });
        appUserId = created.id;
      }
      if (!appUserId) throw new Error("Selecione um usuário existente ou crie um novo.");
      await requestJson(`/admin/app-builder/apps/${app.id}/memberships`, {
        method: "POST",
        body: JSON.stringify({
          appUserId,
          roleKey: form.roleKey.trim(),
          status: form.membershipStatus,
          permissions: parsePermissions(form.permissions),
          metadata: {},
        }),
      });
      setMode("list");
      await loadUsers();
      toast({ title: "Acesso ao app configurado" });
    } catch (error) {
      toast({ title: "Erro ao adicionar usuário", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!app || !editingMembership) return;
    if (!form.displayName.trim() || !form.roleKey.trim()) return;
    setSaving(true);
    try {
      await requestJson(`/admin/app-builder/app-users/${editingMembership.appUserId}`, {
        method: "PATCH",
        body: JSON.stringify({
          leadId: form.leadId.trim() || null,
          displayName: form.displayName.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          status: form.userStatus,
        }),
      });
      await requestJson(`/admin/app-builder/apps/${app.id}/memberships/${editingMembership.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          roleKey: form.roleKey.trim(),
          status: form.membershipStatus,
          permissions: parsePermissions(form.permissions),
        }),
      });
      setMode("list");
      setEditingMembership(null);
      await loadUsers();
      toast({ title: "Usuário e permissões atualizados" });
    } catch (error) {
      toast({ title: "Erro ao salvar usuário", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function setEmailLogin(enabled: boolean) {
    if (!app) return;
    setSaving(true);
    try {
      const settings = asObject(app.settings);
      const runtimeAccess = asObject(settings.runtimeAccess);
      const auth = asObject(runtimeAccess.auth);
      const methods = Array.isArray(auth.methods) ? auth.methods.filter((method): method is string => typeof method === "string") : [];
      const nextMethods = enabled ? Array.from(new Set([...methods, "email_code"])) : methods;
      const nextSettings = {
        ...settings,
        runtimeAccess: {
          ...runtimeAccess,
          auth: {
            ...auth,
            enabled,
            methods: nextMethods,
          },
        },
      };
      await requestJson(`/admin/app-builder/apps/${app.id}`, {
        method: "PATCH",
        body: JSON.stringify({ settings: nextSettings }),
      });
      await onAppChanged?.();
      toast({
        title: enabled ? "Login por e-mail habilitado no working draft" : "Login por e-mail desabilitado no working draft",
        description: "Crie um novo snapshot e publique em Versões para aplicar ao runtime.",
      });
    } catch (error) {
      toast({ title: "Erro ao alterar autenticação", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserRoundCog className="h-5 w-5 text-primary" />Usuários · {app?.name ?? "App"}</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Autenticação do usuário final</p></div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">O login por código de e-mail é independente do login interno do VendorAI e só entra no runtime depois de publicar um novo snapshot.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-[10px]", loginEnabled ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "text-muted-foreground")}>{loginEnabled ? "Ativo no working draft" : "Desativado"}</Badge>
              <Button size="sm" variant={loginEnabled ? "outline" : "default"} disabled={saving} onClick={() => void setEmailLogin(!loginEnabled)}>{loginEnabled ? "Desativar login" : "Ativar login por e-mail"}</Button>
            </div>
          </div>
          {app?.status === "published" && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">Este app já possui uma versão publicada. Alterar o botão acima muda apenas o working draft; use <strong>Versões</strong> no card do app para criar snapshot e publicar.</p>}
        </div>

        {mode === "list" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-semibold">Acessos deste app</p><p className="mt-0.5 text-xs text-muted-foreground">Identidade externa + papel + permissões por App Instance.</p></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void loadUsers()} disabled={loading}><RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />Atualizar</Button><Button size="sm" onClick={startAdd}><Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar acesso</Button></div>
            </div>
            {loading ? <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div> : memberships.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center"><UserRoundCog className="mx-auto h-7 w-7 text-muted-foreground/60" /><p className="mt-2 text-sm font-medium">Nenhum usuário vinculado</p><p className="mt-1 text-xs text-muted-foreground">Crie uma identidade externa ou vincule uma pessoa já existente neste tenant.</p></div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {memberships.map((membership) => (
                  <div key={membership.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold">{membership.userDisplayName}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{membership.userEmail || membership.userPhone || "Sem e-mail/telefone"}</p></div>
                      <Badge variant="outline" className={cn("text-[10px]", statusClass(membership.status))}>{statusLabel(membership.status)}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2"><Badge variant="secondary" className="font-mono text-[10px]">{membership.roleKey}</Badge><Badge variant="outline" className={cn("text-[10px]", statusClass(membership.userStatus))}>Pessoa: {statusLabel(membership.userStatus)}</Badge></div>
                    <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{membership.permissions?.length ? `${membership.permissions.length} permissões: ${membership.permissions.slice(0, 4).join(", ")}${membership.permissions.length > 4 ? "…" : ""}` : "Sem permissões adicionais; o papel continua sendo a referência principal."}</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => startEdit(membership)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar acesso</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : mode === "add" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Adicionar acesso</p><p className="mt-0.5 text-xs text-muted-foreground">Use uma pessoa existente do tenant ou crie uma nova identidade externa.</p></div><Button size="sm" variant="ghost" onClick={() => setMode("list")}>Voltar</Button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button type="button" variant={createNewUser ? "default" : "outline"} onClick={() => setCreateNewUser(true)}>Criar novo App User</Button>
              <Button type="button" variant={!createNewUser ? "default" : "outline"} disabled={availableUsers.length === 0} onClick={() => setCreateNewUser(false)}>Usar pessoa existente ({availableUsers.length})</Button>
            </div>
            {createNewUser ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><p className="text-sm font-medium">Nome</p><Input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Nome do cliente/usuário" /></div>
                <div className="space-y-1.5"><p className="text-sm font-medium">E-mail</p><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="usuario@empresa.com" /></div>
                <div className="space-y-1.5"><p className="text-sm font-medium">Telefone</p><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
                <div className="space-y-1.5"><p className="text-sm font-medium">Lead/contato CRM (ID, opcional)</p><Input value={form.leadId} onChange={(event) => setForm({ ...form, leadId: event.target.value })} /></div>
                <div className="space-y-1.5"><p className="text-sm font-medium">Status da pessoa</p><Select value={form.userStatus} onValueChange={(userStatus) => setForm({ ...form, userStatus: userStatus as AppUser["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invited">Convidado</SelectItem><SelectItem value="active">Ativo</SelectItem><SelectItem value="blocked">Bloqueado</SelectItem></SelectContent></Select></div>
              </div>
            ) : (
              <div className="space-y-1.5"><p className="text-sm font-medium">Pessoa existente</p><Select value={existingUserId} onValueChange={setExistingUserId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{availableUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.displayName}{user.email ? ` · ${user.email}` : ""}</SelectItem>)}</SelectContent></Select></div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><p className="text-sm font-medium">Papel (role_key)</p><Input value={form.roleKey} onChange={(event) => setForm({ ...form, roleKey: event.target.value.toLowerCase() })} placeholder="customer" /><p className="text-[10px] text-muted-foreground">Ex.: customer, member, employee, partner, manager, admin ou papel específico do template.</p></div>
              <div className="space-y-1.5"><p className="text-sm font-medium">Status do acesso</p><Select value={form.membershipStatus} onValueChange={(membershipStatus) => setForm({ ...form, membershipStatus: membershipStatus as Membership["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invited">Convidado</SelectItem><SelectItem value="active">Ativo</SelectItem><SelectItem value="suspended">Suspenso</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><p className="text-sm font-medium">Permissões adicionais</p><Textarea rows={4} value={form.permissions} onChange={(event) => setForm({ ...form, permissions: event.target.value })} placeholder="orders.read, profile.edit, support.create" /><p className="text-[10px] text-muted-foreground">Separe por vírgula ou linha. O sistema continua aceitando permissões schema-driven por nicho/template.</p></div>
            <DialogFooter><Button variant="outline" onClick={() => setMode("list")}>Cancelar</Button><Button disabled={saving || (!createNewUser && !existingUserId)} onClick={() => void saveAccess()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adicionar acesso</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Editar usuário e acesso</p><p className="mt-0.5 text-xs text-muted-foreground">Altere a identidade externa e o membership sem transformar o cliente em usuário interno do VendorAI.</p></div><Button size="sm" variant="ghost" onClick={() => setMode("list")}>Voltar</Button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><p className="text-sm font-medium">Nome</p><Input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></div>
              <div className="space-y-1.5"><p className="text-sm font-medium">E-mail</p><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
              <div className="space-y-1.5"><p className="text-sm font-medium">Telefone</p><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
              <div className="space-y-1.5"><p className="text-sm font-medium">Lead/contato CRM (ID, opcional)</p><Input value={form.leadId} onChange={(event) => setForm({ ...form, leadId: event.target.value })} /></div>
              <div className="space-y-1.5"><p className="text-sm font-medium">Status da pessoa</p><Select value={form.userStatus} onValueChange={(userStatus) => setForm({ ...form, userStatus: userStatus as AppUser["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invited">Convidado</SelectItem><SelectItem value="active">Ativo</SelectItem><SelectItem value="blocked">Bloqueado</SelectItem><SelectItem value="archived">Arquivado</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><p className="text-sm font-medium">Papel (role_key)</p><Input value={form.roleKey} onChange={(event) => setForm({ ...form, roleKey: event.target.value.toLowerCase() })} /></div>
              <div className="space-y-1.5"><p className="text-sm font-medium">Status do acesso</p><Select value={form.membershipStatus} onValueChange={(membershipStatus) => setForm({ ...form, membershipStatus: membershipStatus as Membership["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invited">Convidado</SelectItem><SelectItem value="active">Ativo</SelectItem><SelectItem value="suspended">Suspenso</SelectItem><SelectItem value="archived">Arquivado</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><p className="text-sm font-medium">Permissões adicionais</p><Textarea rows={4} value={form.permissions} onChange={(event) => setForm({ ...form, permissions: event.target.value })} /></div>
            {form.email && <div className="rounded-xl border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground"><Mail className="mr-1 inline h-3.5 w-3.5" />O código de acesso será enviado para <strong className="text-foreground">{form.email}</strong> somente quando o login por e-mail estiver publicado e esta pessoa tiver acesso ativo/convidado.</div>}
            <DialogFooter><Button variant="outline" onClick={() => setMode("list")}>Cancelar</Button><Button onClick={() => void saveEdit()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar alterações</Button></DialogFooter>
          </div>
        )}

        <div className="rounded-xl border bg-muted/10 p-3 text-[11px] leading-5 text-muted-foreground"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-primary" />Isolamento obrigatório: todos os vínculos continuam restritos a <strong className="text-foreground">tenant + App Instance</strong>. Usuários finais não recebem acesso ao painel interno do VendorAI.</div>
      </DialogContent>
    </Dialog>
  );
}
