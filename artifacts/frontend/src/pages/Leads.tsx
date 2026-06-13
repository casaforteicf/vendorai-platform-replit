import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  useCreateLead,
  useListCustomerIntelligence,
  getListCustomerIntelligenceQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Search, ChevronRight, AlertTriangle } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const LEAD_STATUSES = [
  { value: "novo", label: "Novo" },
  { value: "qualificado", label: "Qualificado" },
  { value: "nao_qualificado", label: "Não qualificado" },
  { value: "convertido", label: "Convertido" },
  { value: "perdido", label: "Perdido" },
];

const STATUS_STYLES: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700 border-blue-200",
  qualificado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  nao_qualificado: "bg-zinc-100 text-zinc-600 border-zinc-200",
  convertido: "bg-violet-100 text-violet-700 border-violet-200",
  perdido: "bg-red-100 text-red-600 border-red-200",
};

function getFirstChurnReason(reasons: unknown[] | null | undefined): string | null {
  if (!reasons || reasons.length === 0) return null;
  const first = reasons[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && "reason" in first && typeof (first as Record<string, unknown>).reason === "string") {
    return (first as Record<string, unknown>).reason as string;
  }
  return null;
}

function churnBadge(risk: number | null | undefined, reasons?: unknown[] | null) {
  if (risk === null || risk === undefined) return null;

  const firstReason = getFirstChurnReason(reasons);

  let badge: React.ReactNode;
  if (risk > 70)
    badge = (
      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 font-mono text-xs">
        {risk}%
      </Badge>
    );
  else if (risk >= 30)
    badge = (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 font-mono text-xs">
        {risk}%
      </Badge>
    );
  else
    badge = (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-mono text-xs">
        {risk}%
      </Badge>
    );

  if (!firstReason) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-center">{firstReason}</TooltipContent>
    </Tooltip>
  );
}

const formSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  telefone: z.string().optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  empresa: z.string().optional().or(z.literal("")),
  objetivo: z.string().optional().or(z.literal("")),
});

export default function Leads() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: leads, isLoading: leadsLoading } = useListTenantLeads(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListTenantLeadsQueryKey(tenantId),
    },
  });

  const { data: ciList } = useListCustomerIntelligence(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListCustomerIntelligenceQueryKey(tenantId),
    },
  });

  const ciMap = new Map(ciList?.map((ci) => [ci.leadId, ci]) ?? []);

  const createLead = useCreateLead();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { nome: "", telefone: "", email: "", empresa: "", objetivo: "" },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createLead.mutate(
      {
        data: {
          tenantId,
          nome: values.nome,
          telefone: values.telefone || null,
          email: values.email || null,
          empresa: values.empresa || null,
          objetivo: values.objetivo || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Lead criado com sucesso." });
          queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
          setIsDialogOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Erro ao criar lead", variant: "destructive" });
        },
      }
    );
  }

  const filteredLeads = (leads ?? []).filter((lead) => {
    const matchesSearch =
      lead.nome.toLowerCase().includes(search.toLowerCase()) ||
      lead.email?.toLowerCase().includes(search.toLowerCase()) ||
      lead.empresa?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads?.length ?? 0} contatos cadastrados
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-novo-lead">
              <Plus className="h-4 w-4 mr-2" />
              Novo Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Lead</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-nome" placeholder="Nome completo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="telefone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone</FormLabel>
                        <FormControl>
                          <Input data-testid="input-telefone" placeholder="(11) 99999-9999" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input data-testid="input-email" placeholder="email@empresa.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="empresa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empresa</FormLabel>
                      <FormControl>
                        <Input data-testid="input-empresa" placeholder="Nome da empresa" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="objetivo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Objetivo</FormLabel>
                      <FormControl>
                        <Input data-testid="input-objetivo" placeholder="O que o lead quer alcançar?" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createLead.isPending}
                  data-testid="button-submit-lead"
                >
                  {createLead.isPending ? "Salvando..." : "Salvar Lead"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-search-leads"
              placeholder="Buscar por nome, email ou empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48" data-testid="select-status-filter">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <CardContent className="p-0">
          <TooltipProvider delayDuration={300}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Churn Risk</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leadsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-muted animate-pulse rounded w-full max-w-[120px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-muted-foreground"
                  >
                    {leads?.length === 0
                      ? "Nenhum lead cadastrado ainda."
                      : "Nenhum resultado para os filtros aplicados."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => {
                  const ci = ciMap.get(lead.id);
                  const isHighRisk = typeof ci?.churnRisk === "number" && ci.churnRisk > 70;
                  return (
                    <TableRow
                      key={lead.id}
                      className={`cursor-pointer hover:bg-muted/50 ${isHighRisk ? "border-l-4 border-l-red-500" : ""}`}
                      onClick={() => setLocation(`/leads/${lead.id}`)}
                      data-testid={`row-lead-${lead.id}`}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {isHighRisk && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          {lead.nome}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.empresa || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {lead.telefone || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={STATUS_STYLES[lead.status] ?? ""}
                        >
                          {LEAD_STATUSES.find((s) => s.value === lead.status)?.label ??
                            lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{churnBadge(ci?.churnRisk, ci?.churnReasons)}</TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}
