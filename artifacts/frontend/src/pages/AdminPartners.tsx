import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  BadgePercent,
  Check,
  Link,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  TicketPercent,
  UserPlus,
  Users,
} from "lucide-react";
import {
  getListPartnersQueryKey,
  getListTenantsQueryKey,
  useListPartners,
  useListTenants,
} from "@workspace/api-client-react";

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
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function adminPatch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

const PARTNER_TYPES = [
  ["revendedor", "Revendedor"],
  ["representante", "Representante"],
  ["influenciador", "Influenciador"],
  ["afiliado", "Afiliado"],
  ["indicador", "Indicador"],
  ["agencia", "Agência"],
  ["consultor", "Consultor"],
  ["integrador", "Integrador"],
  ["outro", "Outro"],
] as const;

const COUPON_APPLICATIONS = [
  ["geral", "Geral"],
  ["implantacao", "Implantação"],
  ["mensalidade", "Mensalidade"],
  ["produto", "Produto"],
  ["servico", "Serviço"],
  ["marketplace", "Marketplace"],
] as const;

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

function pct(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function partnerTypeLabel(value: string | null | undefined) {
  return PARTNER_TYPES.find(([id]) => id === value)?.[1] ?? "Parceiro";
}

function StatusBadge({ status }: { status?: string | null }) {
  const active = status === "ativo" || status === "active";
  return (
    <Badge variant={active ? "default" : "secondary"}>
      {active ? "Ativo" : status || "Inativo"}
    </Badge>
  );
}

type PartnerFormState = {
  name: string;
  email: string;
  password: string;
  cnpj: string;
  phone: string;
  tipoParceiro: string;
  comissaoPercentual: string;
  comissaoRecorrentePercentual: string;
  cupomCodigo: string;
  descontoCupomPercentual: string;
  cupomAtivo: boolean;
  cupomAplicacao: string;
  cupomValidoAte: string;
};

const EMPTY_FORM: PartnerFormState = {
  name: "",
  email: "",
  password: "",
  cnpj: "",
  phone: "",
  tipoParceiro: "revendedor",
  comissaoPercentual: "",
  comissaoRecorrentePercentual: "",
  cupomCodigo: "",
  descontoCupomPercentual: "",
  cupomAtivo: false,
  cupomAplicacao: "geral",
  cupomValidoAte: "",
};

function CommercialFields({
  form,
  setForm,
}: {
  form: PartnerFormState;
  setForm: React.Dispatch<React.SetStateAction<PartnerFormState>>;
}) {
  const set = (key: keyof PartnerFormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <BadgePercent className="h-4 w-4" />
        <div>
          <p className="font-medium text-sm">Regras comerciais</p>
          <p className="text-xs text-muted-foreground">
            Comissão e desconto são independentes e sempre configurados em percentual.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Tipo de parceiro</span>
          <Select value={form.tipoParceiro} onValueChange={(v) => set("tipoParceiro", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PARTNER_TYPES.map(([id, label]) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium">Aplicação do cupom</span>
          <Select value={form.cupomAplicacao} onValueChange={(v) => set("cupomAplicacao", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUPON_APPLICATIONS.map(([id, label]) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium">Comissão do parceiro (%)</span>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.comissaoPercentual}
            onChange={(e) => set("comissaoPercentual", e.target.value)}
            placeholder="Ex.: 8"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium">Comissão recorrente (%)</span>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.comissaoRecorrentePercentual}
            onChange={(e) => set("comissaoRecorrentePercentual", e.target.value)}
            placeholder="Ex.: 3"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium">Código do cupom</span>
          <Input
            value={form.cupomCodigo}
            onChange={(e) => set("cupomCodigo", e.target.value.toUpperCase().replace(/\s+/g, ""))}
            placeholder="Ex.: MARCOS10"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium">Desconto para o cliente (%)</span>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.descontoCupomPercentual}
            onChange={(e) => set("descontoCupomPercentual", e.target.value)}
            placeholder="Ex.: 5"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium">Validade do cupom</span>
          <Input
            type="date"
            value={form.cupomValidoAte}
            onChange={(e) => set("cupomValidoAte", e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 pt-7">
          <Checkbox
            checked={form.cupomAtivo}
            onCheckedChange={(v) => set("cupomAtivo", v === true)}
          />
          <span className="text-sm">Cupom ativo</span>
        </label>
      </div>
    </div>
  );
}

function PartnersTable() {
  const partnersQuery = useListPartners({ query: { queryKey: getListPartnersQueryKey() } });
  const partners = partnersQuery.data ?? [];

  if (partnersQuery.isPending) {
    return <div className="py-8 text-sm text-muted-foreground">Carregando parceiros...</div>;
  }

  if (partnersQuery.isError) {
    return (
      <div className="py-8 flex items-center gap-2 text-destructive text-sm">
        <AlertTriangle className="h-4 w-4" /> Erro ao carregar parceiros.
      </div>
    );
  }

  if (!partners.length) {
    return <p className="py-10 text-center text-muted-foreground">Nenhum parceiro cadastrado ainda.</p>;
  }

  return (
    <div className="rounded-xl border overflow-x-auto mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Parceiro</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Comissão</TableHead>
            <TableHead>Recorrência</TableHead>
            <TableHead>Cupom</TableHead>
            <TableHead>Desconto</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {partners.map((p) => {
            const row = p as any;
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <p className="font-medium">{row.nomeFantasia || row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.email}</p>
                </TableCell>
                <TableCell>{partnerTypeLabel(row.tipoParceiro)}</TableCell>
                <TableCell className="font-medium">{pct(row.comissaoPercentual)}</TableCell>
                <TableCell>{pct(row.comissaoRecorrentePercentual)}</TableCell>
                <TableCell>
                  {row.cupomCodigo ? (
                    <Badge variant="outline" className="gap-1">
                      <TicketPercent className="h-3 w-3" /> {row.cupomCodigo}
                    </Badge>
                  ) : "—"}
                </TableCell>
                <TableCell>{pct(row.descontoCupomPercentual)}</TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CreatePartnerSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<PartnerFormState>(EMPTY_FORM);

  const create = useMutation({
    mutationFn: () =>
      adminPost("/api/admin/partners", {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        cnpj: form.cnpj.trim() || undefined,
        phone: form.phone.trim() || undefined,
        tipoParceiro: form.tipoParceiro,
        comissaoPercentual: form.comissaoPercentual === "" ? undefined : Number(form.comissaoPercentual),
        comissaoRecorrentePercentual: form.comissaoRecorrentePercentual === "" ? undefined : Number(form.comissaoRecorrentePercentual),
        cupomCodigo: form.cupomCodigo.trim() || undefined,
        descontoCupomPercentual: form.descontoCupomPercentual === "" ? undefined : Number(form.descontoCupomPercentual),
        cupomAtivo: form.cupomAtivo,
        cupomAplicacao: form.cupomAplicacao,
        cupomValidoAte: form.cupomValidoAte ? `${form.cupomValidoAte}T23:59:59` : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListPartnersQueryKey() });
      setForm(EMPTY_FORM);
      toast({ title: "Parceiro cadastrado com regras comerciais." });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const set = (key: keyof PartnerFormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const valid = form.name.trim() && form.email.trim() && form.password.length >= 8;

  return (
    <div className="max-w-3xl space-y-4 pt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Nome</span>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome do parceiro" />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">E-mail</span>
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="parceiro@empresa.com" />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Senha inicial</span>
          <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Mínimo 8 caracteres" />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">CPF/CNPJ</span>
          <Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="Opcional no cadastro inicial" />
        </label>
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-sm font-medium">Telefone</span>
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Opcional no cadastro inicial" />
        </label>
      </div>

      <CommercialFields form={form} setForm={setForm} />

      <Button className="w-full md:w-auto" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
        {create.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
        Criar parceiro
      </Button>
    </div>
  );
}

function EditPartnersSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const partnersQuery = useListPartners({ query: { queryKey: getListPartnersQueryKey() } });
  const [partnerId, setPartnerId] = useState("");
  const selected = (partnersQuery.data ?? []).find((p) => p.id === partnerId) as any;
  const [form, setForm] = useState<PartnerFormState>(EMPTY_FORM);

  const loadPartner = (id: string) => {
    setPartnerId(id);
    const row = (partnersQuery.data ?? []).find((p) => p.id === id) as any;
    if (!row) return;
    setForm({
      ...EMPTY_FORM,
      name: row.nomeFantasia || row.name || "",
      email: row.email || "",
      cnpj: row.cnpj || "",
      phone: row.telefone || row.phone || "",
      tipoParceiro: row.tipoParceiro || "revendedor",
      comissaoPercentual: row.comissaoPercentual ?? "",
      comissaoRecorrentePercentual: row.comissaoRecorrentePercentual ?? "",
      cupomCodigo: row.cupomCodigo || "",
      descontoCupomPercentual: row.descontoCupomPercentual ?? "",
      cupomAtivo: Boolean(row.cupomAtivo),
      cupomAplicacao: row.cupomAplicacao || "geral",
      cupomValidoAte: row.cupomValidoAte ? String(row.cupomValidoAte).slice(0, 10) : "",
    });
  };

  const save = useMutation({
    mutationFn: () =>
      adminPatch(`/api/admin/partners/${partnerId}`, {
        name: form.name.trim(),
        email: form.email.trim(),
        cnpj: form.cnpj.trim() || undefined,
        phone: form.phone.trim() || undefined,
        tipoParceiro: form.tipoParceiro,
        comissaoPercentual: form.comissaoPercentual === "" ? undefined : Number(form.comissaoPercentual),
        comissaoRecorrentePercentual: form.comissaoRecorrentePercentual === "" ? undefined : Number(form.comissaoRecorrentePercentual),
        cupomCodigo: form.cupomCodigo.trim() || null,
        descontoCupomPercentual: form.descontoCupomPercentual === "" ? undefined : Number(form.descontoCupomPercentual),
        cupomAtivo: form.cupomAtivo,
        cupomAplicacao: form.cupomAplicacao,
        cupomValidoAte: form.cupomValidoAte ? `${form.cupomValidoAte}T23:59:59` : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListPartnersQueryKey() });
      toast({ title: "Parceiro atualizado." });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="max-w-3xl pt-4 space-y-4">
      <Select value={partnerId} onValueChange={loadPartner}>
        <SelectTrigger><SelectValue placeholder="Selecione um parceiro para editar" /></SelectTrigger>
        <SelectContent>
          {(partnersQuery.data ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id}>{(p as any).nomeFantasia || p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nome" />
            <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="E-mail" />
            <Input value={form.cnpj} onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))} placeholder="CPF/CNPJ" />
            <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Telefone" />
          </div>
          <CommercialFields form={form} setForm={setForm} />
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Salvar alterações
          </Button>
        </>
      )}
    </div>
  );
}

function LinkTenantSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const partnersQuery = useListPartners({ query: { queryKey: getListPartnersQueryKey() } });
  const tenantsQuery = useListTenants({ query: { queryKey: getListTenantsQueryKey() } });
  const [selection, setSelection] = useState<Record<string, string>>({});

  const linkMutation = useMutation({
    mutationFn: ({ tenantId, partnerId }: { tenantId: string; partnerId: string | null }) =>
      adminPatch(`/api/admin/tenants/${tenantId}/partner`, { partnerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      qc.invalidateQueries({ queryKey: getListPartnersQueryKey() });
      toast({ title: "Vínculo atualizado." });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="pt-4 rounded-xl border divide-y">
      {(tenantsQuery.data ?? []).map((tenant) => {
        const current = (tenant as any).partnerId ?? "__none__";
        const value = selection[tenant.id] ?? current;
        return (
          <div key={tenant.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div>
              <p className="font-medium text-sm">{tenant.name}</p>
              <p className="text-xs text-muted-foreground">Vincule ao responsável comercial quando necessário.</p>
            </div>
            <div className="flex gap-2">
              <Select value={value} onValueChange={(v) => setSelection((s) => ({ ...s, [tenant.id]: v }))}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem parceiro</SelectItem>
                  {(partnersQuery.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{(p as any).nomeFantasia || p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={linkMutation.isPending}
                onClick={() => linkMutation.mutate({ tenantId: tenant.id, partnerId: value === "__none__" ? null : value })}
              >
                <Link className="h-4 w-4 mr-1" /> Vincular
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Commission = {
  id: string;
  partnerName: string | null;
  tenantName: string | null;
  percentual?: string | null;
  status: string;
  tipo: string | null;
};

function CommissionsPanel() {
  const { data, isLoading } = useQuery<Commission[]>({
    queryKey: ["admin-commissions", "pendente"],
    queryFn: () => adminFetch("/api/admin/commissions?status=pendente"),
  });

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <BadgePercent className="h-4 w-4" />
        <h2 className="font-semibold">Comissões pendentes</h2>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !(data?.length) ? (
        <p className="text-sm text-muted-foreground">Nenhuma comissão pendente. ✓</p>
      ) : (
        <div className="space-y-2">
          {data.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{c.partnerName || "Parceiro"}</p>
                <p className="text-xs text-muted-foreground">{c.tenantName || "Tenant"} · {c.tipo || "comissão"}</p>
              </div>
              <Badge variant="outline">{pct(c.percentual)}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ProspectorJob = {
  id: string;
  cidade: string;
  uf: string;
  nichos: string[];
  status: string;
  totalEncontrados: number | null;
  totalQualificados: number | null;
  totalInseridos: number | null;
};

function PartnerProspectorTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [nichos, setNichos] = useState<string[]>([]);

  const jobsQuery = useQuery<ProspectorJob[]>({
    queryKey: ["partner-prospector-jobs"],
    queryFn: () => adminFetch("/api/admin/partner-prospector/jobs"),
  });

  const createJob = useMutation({
    mutationFn: () => adminPost("/api/admin/partner-prospector/jobs", { cidade, uf: uf.toUpperCase(), nichos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-prospector-jobs"] });
      setCidade(""); setUf(""); setNichos([]);
      toast({ title: "Job de prospecção criado." });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const runJob = useMutation({
    mutationFn: (id: string) => adminPost(`/api/admin/partner-prospector/jobs/${id}/run`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partner-prospector-jobs"] }),
  });

  return (
    <div className="pt-4 space-y-5">
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2"><Search className="h-4 w-4" /><p className="font-medium text-sm">Nova prospecção automática</p></div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_90px] gap-2">
          <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade" />
          <Input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} placeholder="UF" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {PARTNER_NICHOS.map((n) => (
            <label key={n} className="flex items-center gap-2 text-sm rounded-lg border p-2.5">
              <Checkbox checked={nichos.includes(n)} onCheckedChange={() => setNichos((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n])} />
              <span className="capitalize">{n}</span>
            </label>
          ))}
        </div>
        <Button disabled={!cidade.trim() || uf.length !== 2 || !nichos.length || createJob.isPending} onClick={() => createJob.mutate()}>
          <Plus className="h-4 w-4 mr-2" /> Criar job
        </Button>
      </div>

      <div className="space-y-2">
        {(jobsQuery.data ?? []).map((job) => (
          <div key={job.id} className="rounded-lg border p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <p className="font-medium text-sm">{job.cidade}/{job.uf}</p>
              <p className="text-xs text-muted-foreground">Encontrados {job.totalEncontrados ?? 0} · Qualificados {job.totalQualificados ?? 0} · Inseridos {job.totalInseridos ?? 0}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{job.status}</Badge>
              <Button size="sm" variant="outline" disabled={runJob.isPending || !(job.status === "pendente" || job.status === "erro")} onClick={() => runJob.mutate(job.id)}>
                <Play className="h-3.5 w-3.5 mr-1" /> Executar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCards() {
  const partnersQuery = useListPartners({ query: { queryKey: getListPartnersQueryKey() } });
  const partners = partnersQuery.data ?? [];
  const stats = useMemo(() => {
    const rows = partners as any[];
    const active = rows.filter((p) => p.status === "ativo" || p.status === "active");
    const coupons = active.filter((p) => p.cupomAtivo && p.cupomCodigo);
    const avgCommission = active.length
      ? active.reduce((acc, p) => acc + Number(p.comissaoPercentual || 0), 0) / active.length
      : 0;
    const avgDiscount = coupons.length
      ? coupons.reduce((acc, p) => acc + Number(p.descontoCupomPercentual || 0), 0) / coupons.length
      : 0;
    return { active: active.length, coupons: coupons.length, avgCommission, avgDiscount };
  }, [partners]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Parceiros ativos</p><p className="text-2xl font-semibold mt-1">{stats.active}</p></div>
      <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Cupons ativos</p><p className="text-2xl font-semibold mt-1">{stats.coupons}</p></div>
      <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Comissão média</p><p className="text-2xl font-semibold mt-1">{pct(stats.avgCommission)}</p></div>
      <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Desconto médio</p><p className="text-2xl font-semibold mt-1">{pct(stats.avgDiscount)}</p></div>
    </div>
  );
}

export default function AdminPartners() {
  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Parceiros & Afiliados</h1>
        <p className="text-muted-foreground text-sm mt-1 max-w-3xl">
          Gerencie revendedores, representantes, influenciadores, afiliados, indicações, cupons, comissões e vínculos. Comissão e desconto são tratados separadamente e configurados em percentual.
        </p>
      </div>

      <SummaryCards />

      <Tabs defaultValue="parceiros" className="min-w-0">
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <TabsList className="w-max min-w-full justify-start">
            <TabsTrigger value="parceiros" className="gap-1.5"><Users className="h-4 w-4" />Parceiros</TabsTrigger>
            <TabsTrigger value="cadastrar" className="gap-1.5"><UserPlus className="h-4 w-4" />Cadastrar</TabsTrigger>
            <TabsTrigger value="editar" className="gap-1.5"><Pencil className="h-4 w-4" />Editar</TabsTrigger>
            <TabsTrigger value="vincular" className="gap-1.5"><Link className="h-4 w-4" />Vincular</TabsTrigger>
            <TabsTrigger value="prospeccao" className="gap-1.5"><Search className="h-4 w-4" />Prospecção</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="parceiros"><PartnersTable /></TabsContent>
        <TabsContent value="cadastrar"><CreatePartnerSection /></TabsContent>
        <TabsContent value="editar"><EditPartnersSection /></TabsContent>
        <TabsContent value="vincular"><LinkTenantSection /></TabsContent>
        <TabsContent value="prospeccao"><PartnerProspectorTab /></TabsContent>
      </Tabs>

      <CommissionsPanel />
    </div>
  );
}
