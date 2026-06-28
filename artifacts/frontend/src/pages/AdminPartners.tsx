import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  AlertTriangle,
  Building2,
  UserPlus,
  Users,
  Link,
  Check,
  Pencil,
  X,
  Wallet,
  Banknote,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import {
  useListPartners,
  getListPartnersQueryKey,
  useCreatePartner,
  useUpdatePartner,
  useListTenants,
  useLinkTenantPartner,
  getListTenantsQueryKey,
} from "@workspace/api-client-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function adminFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function adminPatch(path: string, body: object) {
  const res = await fetch(path, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Badges ─────────────────────────────────────────────────────────────────

const NIVEL: Record<number, { label: string; cls: string }> = {
  1: { label: "Bronze", cls: "bg-amber-700 text-white border-0" },
  2: { label: "Prata",  cls: "bg-slate-400 text-white border-0" },
  3: { label: "Ouro",   cls: "bg-yellow-400 text-black border-0" },
};

function NivelBadge({ nivel }: { nivel: number }) {
  const n = NIVEL[nivel] ?? NIVEL[1];
  return <Badge className={n.cls}>{n.label}</Badge>;
}

function StatusPartnerBadge({ status }: { status: string }) {
  const cls =
    status === "ativo"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0"
      : status === "suspenso"
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0"
      : "bg-muted text-muted-foreground border-0";
  const labels: Record<string, string> = {
    ativo: "Ativo",
    suspenso: "Suspenso",
    cancelado: "Cancelado",
  };
  return <Badge className={cls}>{labels[status] ?? status}</Badge>;
}

function formatBRL(v: string | null | undefined) {
  if (!v) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Partners Overview Table ────────────────────────────────────────────────

function PartnersTable() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const partnersQuery = useListPartners({
    query: { queryKey: getListPartnersQueryKey() },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminPatch(`/api/admin/partners/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListPartnersQueryKey() });
      toast({ title: "Status do parceiro atualizado." });
    },
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  if (partnersQuery.isPending) {
    return (
      <div className="space-y-2 mt-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (partnersQuery.isError) {
    return (
      <div className="flex items-center gap-2 text-destructive text-sm mt-4">
        <AlertTriangle className="h-4 w-4" />
        Erro ao carregar parceiros.
      </div>
    );
  }

  const partners = partnersQuery.data ?? [];

  if (partners.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Nenhum parceiro cadastrado ainda.
      </p>
    );
  }

  return (
    <div className="rounded-md border mt-4 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead>Cidade/UF</TableHead>
            <TableHead>Nível</TableHead>
            <TableHead className="text-right">Clientes Ativos</TableHead>
            <TableHead className="text-right">Comissão Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {partners.map((p) => {
            const row = p as any;
            const isAtivo = row.status === "ativo";
            const isBusy =
              toggleStatus.isPending &&
              (toggleStatus.variables as any)?.id === row.id;

            return (
              <TableRow key={row.id}>
                <TableCell>
                  <div>
                    <p className="font-medium leading-tight">
                      {row.nomeFantasia || row.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {row.cnpj ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {row.cidade && row.uf
                    ? `${row.cidade}/${row.uf}`
                    : row.cidade ?? row.uf ?? "—"}
                </TableCell>
                <TableCell>
                  <NivelBadge nivel={row.nivel ?? 1} />
                </TableCell>
                <TableCell className="text-right font-medium">
                  {row.clientesAtivos ?? 0}
                </TableCell>
                <TableCell className="text-right font-medium text-emerald-600">
                  {formatBRL(row.comissaoTotal)}
                </TableCell>
                <TableCell>
                  <StatusPartnerBadge status={row.status ?? "ativo"} />
                </TableCell>
                <TableCell className="text-right">
                  {isAtivo ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                      disabled={isBusy}
                      onClick={() =>
                        toggleStatus.mutate({ id: row.id, status: "suspenso" })
                      }
                    >
                      {isBusy ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldOff className="h-3.5 w-3.5" />
                      )}
                      Suspender
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950"
                      disabled={isBusy || row.status === "cancelado"}
                      onClick={() =>
                        toggleStatus.mutate({ id: row.id, status: "ativo" })
                      }
                    >
                      {isBusy ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      Ativar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Pending Commissions Panel ──────────────────────────────────────────────

interface AdminCommission {
  id: string;
  partnerId: string;
  partnerName: string | null;
  tenantId: string;
  tenantName: string | null;
  tipo: string | null;
  valor: string | null;
  dataReferencia: string | null;
  status: string;
}

function PendingCommissionsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: commissions, isLoading, isError } = useQuery<AdminCommission[]>({
    queryKey: ["admin-commissions", "pendente"],
    queryFn: () => adminFetch("/api/admin/commissions?status=pendente"),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) =>
      adminPatch(`/api/admin/commissions/${id}/status`, { status: "paga" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-commissions"] });
      qc.invalidateQueries({ queryKey: getListPartnersQueryKey() });
      toast({ title: "Comissão marcada como paga." });
    },
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  const count = commissions?.length ?? 0;

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Banknote className="h-4 w-4" />
          Comissões Pendentes
          {count > 0 && (
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-0 font-medium ml-1">
              {count}
            </Badge>
          )}
        </h2>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4" />
          Erro ao carregar comissões.
        </div>
      ) : count === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nenhuma comissão pendente. ✓
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parceiro</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Mês Ref.</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(commissions ?? []).map((c) => {
                const isBusy =
                  markPaid.isPending && markPaid.variables === c.id;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.partnerName ?? c.partnerId.slice(0, 8) + "…"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.tenantName ?? c.tenantId.slice(0, 8) + "…"}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {c.tipo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      {formatBRL(c.valor)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.dataReferencia ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950"
                        disabled={isBusy}
                        onClick={() => markPaid.mutate(c.id)}
                      >
                        {isBusy ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Marcar como Pago
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Create Partner Form ────────────────────────────────────────────────────

const createPartnerSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  cnpj: z.string().min(14, "CNPJ inválido (mín. 14 dígitos)"),
  phone: z.string().min(10, "Telefone inválido (mín. 10 dígitos)"),
});

type CreatePartnerForm = z.infer<typeof createPartnerSchema>;

const FIELD_META = {
  name:  { label: "Nome",            type: "text",     ph: "Nome do parceiro" },
  email: { label: "E-mail",          type: "email",    ph: "parceiro@empresa.com" },
  cnpj:  { label: "CNPJ",            type: "text",     ph: "00.000.000/0000-00" },
  phone: { label: "Telefone celular", type: "tel",      ph: "(11) 99999-9999" },
} as const;

function CreatePartnerSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const createPartner = useCreatePartner({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListPartnersQueryKey() });
        form.reset();
        const asaasOk = (data as any).asaasSubconta === true;
        toast({
          title: "Parceiro criado com sucesso.",
          description: asaasOk
            ? "Subconta Asaas criada e walletId salvo."
            : "Configure ASAAS_API_KEY para ativar splits automáticos.",
        });
      },
      onError: (err: any) =>
        toast({
          title: err?.response?.data?.error ?? "Erro ao criar parceiro.",
          variant: "destructive",
        }),
    },
  });

  const form = useForm<CreatePartnerForm>({
    resolver: zodResolver(createPartnerSchema),
    defaultValues: { name: "", email: "", password: "", cnpj: "", phone: "" },
  });

  return (
    <div className="max-w-md">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v) => createPartner.mutate({ data: v }))}
          className="space-y-3"
        >
          {(Object.keys(FIELD_META) as (keyof typeof FIELD_META)[]).map((f) => (
            <FormField
              key={f}
              control={form.control}
              name={f}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{FIELD_META[f].label}</FormLabel>
                  <FormControl>
                    <Input
                      type={FIELD_META[f].type}
                      placeholder={FIELD_META[f].ph}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Senha inicial</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Mínimo 8 caracteres" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={createPartner.isPending}
          >
            {createPartner.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Criar Parceiro
          </Button>
        </form>
      </Form>
    </div>
  );
}

// ── Edit Partners Section ──────────────────────────────────────────────────

function EditPartnersSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const partnersQuery = useListPartners({
    query: { queryKey: getListPartnersQueryKey() },
  });

  const updatePartner = useUpdatePartner({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPartnersQueryKey() });
        setEditingId(null);
        toast({ title: "Parceiro atualizado." });
      },
      onError: (err: any) =>
        toast({
          title: err?.response?.data?.error ?? "Erro ao atualizar.",
          variant: "destructive",
        }),
    },
  });

  if (partnersQuery.isPending) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden divide-y divide-border max-w-xl">
      {(partnersQuery.data ?? []).map((p) => {
        const row = p as any;
        const isEditing = editingId === row.id;
        return (
          <div key={row.id} className="px-4 py-3 space-y-2">
            {isEditing ? (
              <div className="space-y-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome"
                  className="h-8 text-sm"
                />
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="E-mail"
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={
                      updatePartner.isPending || !editName || !editEmail
                    }
                    onClick={() =>
                      updatePartner.mutate({
                        id: row.id,
                        data: { name: editName, email: editEmail },
                      })
                    }
                  >
                    {updatePartner.isPending ? (
                      <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    Salvar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-medium">{row.nomeFantasia || row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.email}</p>
                  <p className="text-xs text-muted-foreground/70">
                    CNPJ: {row.cnpj ?? "—"}
                  </p>
                  {row.asaasWalletId ? (
                    <Badge variant="secondary" className="text-[10px] gap-1 py-0">
                      <Wallet className="h-2.5 w-2.5" />
                      Asaas vinculado
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 text-muted-foreground"
                    >
                      Sem walletId Asaas
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={() => {
                    setEditingId(row.id);
                    setEditName(row.nomeFantasia || row.name);
                    setEditEmail(row.email);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Link Tenant Section ────────────────────────────────────────────────────

function LinkTenantSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [linkingTenantId, setLinkingTenantId] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");

  const partnersQuery = useListPartners({
    query: { queryKey: getListPartnersQueryKey() },
  });
  const tenantsQuery = useListTenants({
    query: { queryKey: getListTenantsQueryKey() },
  });

  const linkTenant = useLinkTenantPartner({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        qc.invalidateQueries({ queryKey: getListPartnersQueryKey() });
        setLinkingTenantId(null);
        setSelectedPartnerId("");
        toast({ title: "Tenant vinculado ao parceiro." });
      },
      onError: () =>
        toast({ title: "Erro ao vincular tenant.", variant: "destructive" }),
    },
  });

  if (tenantsQuery.isPending || partnersQuery.isPending) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden divide-y divide-border max-w-2xl">
      {(tenantsQuery.data ?? []).map((tenant) => {
        const currentPartner = partnersQuery.data?.find(
          (p) => (tenant as any).partnerId === p.id
        );
        const isLinking = linkingTenantId === tenant.id;

        return (
          <div
            key={tenant.id}
            className="flex items-center justify-between px-4 py-3 gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{tenant.name}</p>
              <p className="text-xs text-muted-foreground">
                {currentPartner ? (
                  <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {(currentPartner as any).nomeFantasia || currentPartner.name}
                    {(currentPartner as any).asaasWalletId && (
                      <Wallet className="h-3 w-3 text-green-500" />
                    )}
                  </span>
                ) : (
                  "Sem parceiro"
                )}
              </p>
            </div>

            {isLinking ? (
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={selectedPartnerId}
                  onValueChange={setSelectedPartnerId}
                >
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem parceiro</SelectItem>
                    {(partnersQuery.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {(p as any).nomeFantasia || p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-8"
                  disabled={linkTenant.isPending || !selectedPartnerId}
                  onClick={() =>
                    linkTenant.mutate({
                      id: tenant.id,
                      data: {
                        partnerId:
                          selectedPartnerId === "__none__"
                            ? null
                            : selectedPartnerId,
                      },
                    })
                  }
                >
                  {linkTenant.isPending ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setLinkingTenantId(null);
                    setSelectedPartnerId("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-8 text-xs"
                onClick={() => {
                  setLinkingTenantId(tenant.id);
                  setSelectedPartnerId(
                    (tenant as any).partnerId ?? "__none__"
                  );
                }}
              >
                Vincular
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminPartners() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Parceiros / Revendedores
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie parceiros, status, comissões e vínculos com tenants. Ao criar
          um parceiro, uma subconta Asaas é criada automaticamente para splits de
          pagamento.
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="parceiros">
        <TabsList>
          <TabsTrigger value="parceiros" className="gap-1.5">
            <Users className="h-4 w-4" />
            Parceiros
          </TabsTrigger>
          <TabsTrigger value="cadastrar" className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Cadastrar
          </TabsTrigger>
          <TabsTrigger value="editar" className="gap-1.5">
            <Pencil className="h-4 w-4" />
            Editar
          </TabsTrigger>
          <TabsTrigger value="vincular" className="gap-1.5">
            <Link className="h-4 w-4" />
            Vincular
          </TabsTrigger>
        </TabsList>

        <TabsContent value="parceiros">
          <PartnersTable />
        </TabsContent>

        <TabsContent value="cadastrar" className="pt-4">
          <CreatePartnerSection />
        </TabsContent>

        <TabsContent value="editar" className="pt-4">
          <EditPartnersSection />
        </TabsContent>

        <TabsContent value="vincular" className="pt-4">
          <LinkTenantSection />
        </TabsContent>
      </Tabs>

      {/* Pending Commissions — always visible */}
      <PendingCommissionsPanel />
    </div>
  );
}
