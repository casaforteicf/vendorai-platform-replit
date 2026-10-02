import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Building2, Loader2, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";

function getBase() { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }
function getToken() { return localStorage.getItem("vendorai_token") ?? ""; }

type CompanyDirectoryItem = {
  tenantCompanyId: string;
  leadId?: string | null;
  relationshipType: string;
  relationshipStatus: string;
  relationshipUpdatedAt?: string | null;
  companyId: string;
  cnpj: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  situacaoCadastral?: string | null;
  porte?: string | null;
  cnaePrincipal?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: Record<string, string | null> | null;
  source?: string | null;
  enrichedAt?: string | null;
  contacts: { total: number; confirmed: number; primary: number };
};

type DirectoryResponse = { items: CompanyDirectoryItem[]; total: number };

function formatCnpj(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length !== 14) return value;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export default function Companies() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<CompanyDirectoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [relationship, setRelationship] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ tenantId });
      if (search.trim()) params.set("q", search.trim());
      if (relationship !== "todos") params.set("relationshipType", relationship);
      if (status !== "todos") params.set("status", status);
      try {
        const response = await fetch(`${getBase()}/api/crm/companies?${params.toString()}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((payload as any)?.error ?? "Não foi possível carregar as empresas.");
        setItems((payload as DirectoryResponse).items ?? []);
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Falha ao carregar empresas.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [tenantId, search, relationship, status]);

  const relationshipOptions = useMemo(() => {
    const values = new Set(items.map((item) => item.relationshipType).filter(Boolean));
    return Array.from(values).sort();
  }, [items]);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <h1 className="text-2xl font-semibold">Empresas</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro empresarial mestre do tenant, independente da pipeline de leads.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">{items.length} empresas</Badge>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_220px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar razão social, fantasia ou CNPJ..."
              className="pl-9"
            />
          </div>
          <Select value={relationship} onValueChange={setRelationship}>
            <SelectTrigger><SelectValue placeholder="Relacionamento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os vínculos</SelectItem>
              {relationshipOptions.map((value) => (
                <SelectItem key={value} value={value}>{value.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex min-h-[35vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>
      ) : error ? (
        <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada com os filtros atuais.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => {
            const name = item.nomeFantasia || item.razaoSocial || item.cnpj;
            const address = item.endereco
              ? [item.endereco.municipio, item.endereco.uf].filter(Boolean).join(" / ")
              : "";
            return (
              <Card key={item.tenantCompanyId} className="transition-shadow hover:shadow-sm">
                <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setLocation(`/empresas/${item.companyId}`)}
                        className="truncate text-left font-semibold hover:underline"
                      >
                        {name}
                      </button>
                      <Badge variant="outline" className="capitalize">{item.relationshipType.replace(/_/g, " ")}</Badge>
                      {item.situacaoCadastral && <Badge variant="secondary">{item.situacaoCadastral}</Badge>}
                    </div>
                    <p className="mt-1 text-xs font-mono text-muted-foreground">CNPJ {formatCnpj(item.cnpj)}</p>
                    {item.razaoSocial && item.razaoSocial !== item.nomeFantasia && (
                      <p className="mt-1 text-sm text-muted-foreground">{item.razaoSocial}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {item.cnaePrincipal && <span>{item.cnaePrincipal}</span>}
                      {address && <span>{address}</span>}
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{item.contacts.total} pessoas · {item.contacts.confirmed} confirmadas</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.leadId && (
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/leads/${item.leadId}`)}>
                        Abrir lead
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setLocation(`/empresas/${item.companyId}`)}>
                      Abrir empresa
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}