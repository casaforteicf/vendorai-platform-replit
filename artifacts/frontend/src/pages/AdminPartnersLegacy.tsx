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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
  Search,
  Plus,
  Play,
  MapPin,
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

async function adminPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as any).error ?? `HTTP ${res.status}`);
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
    <div className="mt-4">
      {/* Mobile cards */}
      <div className="divide-y border rounded-md sm:hidden">
        {partners.map((p) => {
          const row = p as any;
          const isAtivo = row.status === "ativo";
          const isBusy = toggleStatus.isPending && (toggleStatus.variables as any)?.id === row.id;
          return (
            <div key={row.id} className="px-4 py-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm leading-tight">{row.nomeFantasia || row.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <NivelBadge nivel={row.nivel ?? 1} />
                  <StatusPartnerBadge status={row.status ?? "ativo"} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div>
                  <p className="text-muted-foreground">CNPJ</p>
                  <p>{row.cnpj ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cidade/UF</p>
                  <p>{row.cidade && row.uf ? `${row.cidade}/${row.uf}` : row.cidade ?? row.uf ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Clientes ativos</p>
                  <p className="font-medium">{row.clientesAtivos ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Comissão total</p>
                  <p className="font-medium text-emerald-600">{formatBRL(row.comissaoTotal)}</p>
                </div>
              </div>
              {isAtivo ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                  disabled={isBusy}
                  onClick={() => toggleStatus.mutate({ id: row.id, status: "suspenso" })}
                >
                  {isBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                  Suspender
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950"
                  disabled={isBusy || row.status === "cancelado"}
                  onClick={() => toggleStatus.mutate({ id: row.id, status: "ativo" })}
                >
                  {isBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Ativar
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block rounded-md border overflow-x-auto">
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
              const isBusy = toggleStatus.isPending && (toggleStatus.variables as any)?.id === row.id;
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium leading-tight">{row.nomeFantasia || row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{row.cnpj ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.cidade && row.uf ? `${row.cidade}/${row.uf}` : row.cidade ?? row.uf ?? "—"}
                  </TableCell>
                  <TableCell><NivelBadge nivel={row.nivel ?? 1} /></TableCell>
                  <TableCell className="text-right font-medium">{row.clientesAtivos ?? 0}</TableCell>
                  <TableCell className="text-right font-medium text-emerald-600">{formatBRL(row.comissaoTotal)}</TableCell>
                  <TableCell><StatusPartnerBadge status={row.status ?? "ativo"} /></TableCell>
                  <TableCell className="text-right">
                    {isAtivo ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                        disabled={isBusy}
                        onClick={() => toggleStatus.mutate({ id: row.id, status: "suspenso" })}
                      >
                        {isBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                        Suspender
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950"
                        disabled={isBusy || row.status === "cancelado"}
                        onClick={() => toggleStatus.mutate({ id: row.id, status: "ativo" })}
                      >
                        {isBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
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
        <>
          {/* Mobile cards */}
          <div className="divide-y border rounded-md sm:hidden">
            {(commissions ?? []).map((c) => {
              const isBusy = markPaid.isPending && markPaid.variables === c.id;
              return (
                <div key={c.id} className="px-4 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{c.partnerName ?? c.partnerId.slice(0, 8) + "…"}</p>
                      <p className="text-xs text-muted-foreground">{c.tenantName ?? c.tenantId.slice(0, 8) + "…"}</p>
                    </div>
                    <p className="text-sm font-medium text-emerald-600 shrink-0">{formatBRL(c.valor)}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="capitalize">{c.tipo ?? "—"}</span>
                    {c.dataReferencia && <span>Ref: {c.dataReferencia}</span>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950"
                    disabled={isBusy}
                    onClick={() => markPaid.mutate(c.id)}
                  >
                    {isBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Marcar como Pago
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block rounded-md border overflow-x-auto">
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
                  const isBusy = markPaid.isPending && markPaid.variables === c.id;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.partnerName ?? c.partnerId.slice(0, 8) + "…"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.tenantName ?? c.tenantId.slice(0, 8) + "…"}
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">{c.tipo ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">{formatBRL(c.valor)}</TableCell>
                      <TableCell className="text-muted-foreground">{c.dataReferencia ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950"
                          disabled={isBusy}
                          onClick={() => markPaid.mutate(c.id)}
                        >
                          {isBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Marcar como Pago
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
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

// ── Partner Prospector Tab ─────────────────────────────────────────────────

const PARTNER_NICHOS = [
  "escritório de contabilidade",
  "contador",
  "contabilidade empresarial",
  "consultoria empresarial",
  "consultoria de gestão",
  "consultor de negócios",
  "agência de marketing digital",
  "agência de publicidade",
  "consultoria em tecnologia",
  "assessoria empresarial",
];

interface ProspectorJob {
  id: string;
  cidade: string;
  uf: string;
  nichos: string[];
  status: string;
  totalEncontrados: number | null;
  totalQualificados: number | null;
  totalInseridos: number | null;
  erroMsg: string | null;
  createdAt: string;
  finishedAt: string | null;
}

interface PartnerLead {
  id: string;
  nome: string;
  telefone: string | null;
  empresa: string | null;
  objetivo: string | null;
  status: string;
  score: number | null;
  googlePlaceId: string | null;
  createdAt: string;
}

interface ProspectorJobDetail extends ProspectorJob {
  leads: PartnerLead[];
}

function JobStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    pendente:  "bg-muted text-muted-foreground border-0",
    rodando:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0",
    concluido: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0",
    erro:      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0",
  };
  const labels: Record<string, string> = {
    pendente: "Pendente",
    rodando: "Rodando",
    concluido: "Concluído",
    erro: "Erro",
  };
  return (
    <Badge className={cfg[status] ?? "border-0 bg-muted text-muted-foreground"}>
      {labels[status] ?? status}
    </Badge>
  );
}

function NewJobDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [selectedNichos, setSelectedNichos] = useState<string[]>([]);

  const createJob = useMutation({
    mutationFn: () =>
      adminPost("/api/admin/partner-prospector/jobs", {
        cidade: cidade.trim(),
        uf: uf.trim().toUpperCase(),
        nichos: selectedNichos,
      }),
    onSuccess: () => {
      toast({ title: "Job de prospecção criado." });
      setCidade("");
      setUf("");
      setSelectedNichos([]);
      onOpenChange(false);
      onCreated();
    },
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  const toggleNicho = (nicho: string) => {
    setSelectedNichos((prev) =>
      prev.includes(nicho) ? prev.filter((n) => n !== nicho) : [...prev, nicho]
    );
  };

  const valid =
    cidade.trim().length >= 2 &&
    uf.trim().length === 2 &&
    selectedNichos.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Novo Job de Prospecção
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Cidade</label>
              <Input
                placeholder="São Paulo"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>
            <div className="w-20 space-y-1.5">
              <label className="text-sm font-medium">UF</label>
              <Input
                placeholder="SP"
                maxLength={2}
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Nichos{" "}
              <span className="text-muted-foreground font-normal">
                ({selectedNichos.length} selecionados)
              </span>
            </label>
            <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
              {PARTNER_NICHOS.map((nicho) => (
                <label
                  key={nicho}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedNichos.includes(nicho)}
                    onCheckedChange={() => toggleNicho(nicho)}
                  />
                  <span className="text-sm capitalize">{nicho}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!valid || createJob.isPending}
            onClick={() => createJob.mutate()}
          >
            {createJob.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Criar Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobDetailDialog({
  jobId,
  onClose,
}: {
  jobId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery<ProspectorJobDetail>({
    queryKey: ["partner-prospector-job", jobId],
    queryFn: () => adminFetch(`/api/admin/partner-prospector/jobs/${jobId}`),
    enabled: !!jobId,
  });

  return (
    <Dialog open={!!jobId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {data ? `${data.cidade}/${data.uf}` : "Detalhes do Job"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : isError || !data ? (
          <div className="flex items-center gap-2 text-destructive text-sm py-4">
            <AlertTriangle className="h-4 w-4" />
            Erro ao carregar detalhes.
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Job summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Encontrados", value: data.totalEncontrados ?? 0 },
                { label: "Qualificados", value: data.totalQualificados ?? 0 },
                { label: "Inseridos", value: data.totalInseridos ?? 0 },
                { label: "Status", value: <JobStatusBadge status={data.status} /> },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border bg-muted/30 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {/* Nichos */}
            <div>
              <p className="text-sm font-medium mb-2">Nichos buscados</p>
              <div className="flex flex-wrap gap-1.5">
                {data.nichos.map((n) => (
                  <Badge key={n} variant="secondary" className="text-xs capitalize">
                    {n}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Error message */}
            {data.erroMsg && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2.5 text-sm text-red-700 dark:text-red-400">
                <span className="font-medium">Erro: </span>{data.erroMsg}
              </div>
            )}

            {/* Leads generated */}
            <div>
              <p className="text-sm font-medium mb-2">
                Leads gerados{" "}
                <span className="text-muted-foreground font-normal">
                  ({data.leads.length})
                </span>
              </p>

              {data.leads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhum lead inserido neste job.
                </p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome / Empresa</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Objetivo / Perfil</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.leads.map((lead) => (
                        <TableRow key={lead.id}>
                          <TableCell>
                            <p className="font-medium text-sm leading-tight">
                              {lead.nome}
                            </p>
                            {lead.empresa && lead.empresa !== lead.nome && (
                              <p className="text-xs text-muted-foreground">
                                {lead.empresa}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {lead.telefone ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                            {lead.objetivo ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={cn(
                                "font-semibold text-sm",
                                (lead.score ?? 0) >= 80
                                  ? "text-emerald-600"
                                  : (lead.score ?? 0) >= 60
                                  ? "text-amber-600"
                                  : "text-muted-foreground",
                              )}
                            >
                              {lead.score ?? 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusPartnerBadge status={lead.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartnerProspectorTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const jobsQuery = useQuery<ProspectorJob[]>({
    queryKey: ["partner-prospector-jobs"],
    queryFn: () => adminFetch("/api/admin/partner-prospector/jobs"),
  });

  const runJob = useMutation({
    mutationFn: (id: string) =>
      adminPost(`/api/admin/partner-prospector/jobs/${id}/run`, {}),
    onSuccess: () => {
      toast({ title: "Execução iniciada em background." });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["partner-prospector-jobs"] }), 2000);
    },
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  const jobs = jobsQuery.data ?? [];

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Busca automática de candidatos a parceiros via Google Places + qualificação com IA.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setNewJobOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Novo Job
        </Button>
      </div>

      {jobsQuery.isPending ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : jobsQuery.isError ? (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4" />
          Erro ao carregar jobs.
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhum job de prospecção criado ainda.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-2"
            onClick={() => setNewJobOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Criar primeiro job
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="divide-y border rounded-md sm:hidden">
            {jobs.map((job) => {
              const isRunning = runJob.isPending && runJob.variables === job.id;
              const canRun = job.status === "pendente" || job.status === "erro";
              return (
                <div
                  key={job.id}
                  className="px-4 py-4 space-y-3 cursor-pointer"
                  onClick={() => setSelectedJobId(job.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{job.cidade}/{job.uf}</p>
                      <p className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-xs">{job.nichos?.length ?? 0} nichos</Badge>
                      <JobStatusBadge status={job.status} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Encontrados</p>
                      <p className="font-medium">{job.totalEncontrados ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Qualificados</p>
                      <p className="font-medium">{job.totalQualificados ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Inseridos</p>
                      <p className="font-medium text-emerald-600">{job.totalInseridos ?? "—"}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full gap-1.5 text-xs",
                      canRun
                        ? "text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950"
                        : "opacity-40 cursor-not-allowed",
                    )}
                    disabled={!canRun || isRunning}
                    onClick={(e) => {
                      e.stopPropagation();
                      runJob.mutate(job.id);
                    }}
                  >
                    {isRunning ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Executar
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Nichos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Encontrados</TableHead>
                  <TableHead className="text-right">Qualificados</TableHead>
                  <TableHead className="text-right">Inseridos</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const isRunning = runJob.isPending && runJob.variables === job.id;
                  const canRun = job.status === "pendente" || job.status === "erro";
                  return (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <TableCell className="font-medium">{job.cidade}/{job.uf}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{job.nichos?.length ?? 0} nichos</Badge>
                      </TableCell>
                      <TableCell><JobStatusBadge status={job.status} /></TableCell>
                      <TableCell className="text-right text-muted-foreground">{job.totalEncontrados ?? "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{job.totalQualificados ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">{job.totalInseridos ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {new Date(job.createdAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "gap-1.5 h-7 text-xs",
                            canRun
                              ? "text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950"
                              : "opacity-40 cursor-not-allowed",
                          )}
                          disabled={!canRun || isRunning}
                          onClick={(e) => {
                            e.stopPropagation();
                            runJob.mutate(job.id);
                          }}
                        >
                          {isRunning ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                          Executar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <NewJobDialog
        open={newJobOpen}
        onOpenChange={setNewJobOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["partner-prospector-jobs"] })}
      />

      <JobDetailDialog
        jobId={selectedJobId}
        onClose={() => setSelectedJobId(null)}
      />
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
          <TabsTrigger value="prospeccao" className="gap-1.5">
            <Search className="h-4 w-4" />
            Prospecção Automática
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

        <TabsContent value="prospeccao" className="pt-4">
          <PartnerProspectorTab />
        </TabsContent>
      </Tabs>

      {/* Pending Commissions — always visible */}
      <PendingCommissionsPanel />
    </div>
  );
}
