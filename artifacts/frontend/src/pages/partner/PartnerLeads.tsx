import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import { PartnerIndicationForm } from "@/components/partner/PartnerIndicationForm";
import { usePartnerLeads } from "@/lib/partnerApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  novo:            { label: "Novo",             className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  em_negociacao:   { label: "Em Negociação",    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" },
  cliente:         { label: "Cliente",           className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
  perdido:         { label: "Perdido",           className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge className={s.className + " border-0 font-medium"}>{s.label}</Badge>
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os status" },
  { value: "novo", label: "Novo" },
  { value: "em_negociacao", label: "Em Negociação" },
  { value: "cliente", label: "Cliente" },
  { value: "perdido", label: "Perdido" },
];

export default function PartnerLeads() {
  const [, setLocation] = useLocation();
  const { data: leads, isLoading, isError } = usePartnerLeads();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [segmento, setSegmento] = useState("all");

  const segmentos = useMemo(() => {
    const s = new Set<string>();
    (leads ?? []).forEach((l) => { if (l.empresa) s.add(l.empresa); });
    return Array.from(s).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    return (leads ?? []).filter((l) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        l.nome.toLowerCase().includes(q) ||
        (l.telefone ?? "").includes(q);
      const matchStatus =
        statusFilter === "all" || l.status === statusFilter;
      const matchSegmento =
        segmento === "all" || l.empresa === segmento;
      return matchSearch && matchStatus && matchSegmento;
    });
  }, [leads, search, statusFilter, segmento]);

  return (
    <PartnerLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Meus Leads</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Leads que você indicou
            </p>
          </div>
          <PartnerIndicationForm
            trigger={
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Indicar
              </Button>
            }
          />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={segmento} onValueChange={setSegmento}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos os segmentos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os segmentos</SelectItem>
              {segmentos.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data Indicação</TableHead>
                <TableHead>Último Contato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-destructive py-8">
                    Erro ao carregar leads.
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum lead encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setLocation(`/partner/leads/${lead.id}`)}
                  >
                    <TableCell className="font-medium">{lead.nome}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {lead.telefone ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {lead.empresa ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(lead.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(lead.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && !isError && (
          <p className="text-xs text-muted-foreground">
            {filtered.length} de {leads?.length ?? 0} lead(s)
          </p>
        )}
      </div>
    </PartnerLayout>
  );
}
