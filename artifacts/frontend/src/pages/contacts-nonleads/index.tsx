import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Handshake, Heart, Loader2, Mail, Phone, Plus, Search, UserCog, Users } from "lucide-react";

type ContactStage = "prospeccao" | "ativo" | "inativo";
type ContactType = "fornecedor" | "parceiro" | "familia" | "colaborador";

type ContactRecord = {
  id: string;
  tenantId: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  empresa?: string | null;
  tipo?: string | null;
  status: string;
  pipelineExempt?: boolean | null;
  agenteDesativado?: boolean | null;
  excluidoEm?: string | null;
};

const stages: Array<{ value: ContactStage; label: string }> = [
  { value: "prospeccao", label: "Prospecção" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

const typeConfig: Record<ContactType, { label: string; icon: typeof Building2 }> = {
  fornecedor: { label: "Fornecedor", icon: Building2 },
  parceiro: { label: "Parceiro", icon: Handshake },
  familia: { label: "Família", icon: Heart },
  colaborador: { label: "Colaborador", icon: UserCog },
};

function normalizeStage(value: string): ContactStage {
  if (value === "ativo" || value === "inativo" || value === "prospeccao") return value;
  return "prospeccao";
}

function normalizeType(value: string | null | undefined): ContactType | null {
  const normalized = (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized === "fornecedor" || normalized === "supplier") return "fornecedor";
  if (normalized === "parceiro" || normalized === "partner") return "parceiro";
  if (normalized === "familia" || normalized === "family") return "familia";
  if (normalized === "colaborador" || normalized === "collaborator") return "colaborador";
  return null;
}

export default function NonLeadsKanban() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", telefone: "", email: "", empresa: "", tipo: "fornecedor" as ContactType });

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  const { data: allContacts = [], isLoading, isError } = useQuery<ContactRecord[]>({
    queryKey: ["contacts-nonleads", tenantId],
    enabled: Boolean(token && tenantId),
    queryFn: async () => {
      const response = await fetch("/api/leads", { headers });
      if (!response.ok) throw new Error("Não foi possível carregar os contatos.");
      return response.json();
    },
  });

  const contacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allContacts
      .filter((contact) => contact.tenantId === tenantId && !contact.excluidoEm && normalizeType(contact.tipo))
      .filter((contact) => {
        if (!term) return true;
        return [contact.nome, contact.empresa, contact.email, contact.telefone]
          .some((value) => (value ?? "").toLowerCase().includes(term));
      });
  }, [allContacts, tenantId, search]);

  const createContact = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Informe o nome do contato.");
      const response = await fetch("/api/leads", {
        method: "POST",
        headers,
        body: JSON.stringify({
          tenantId,
          nome: form.nome.trim(),
          telefone: form.telefone.trim() || null,
          email: form.email.trim() || null,
          empresa: form.empresa.trim() || null,
          tipo: form.tipo,
          status: "prospeccao",
          pipelineExempt: true,
          agenteDesativado: true,
          iaAtiva: false,
          source: "manual",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) throw new Error("Já existe um contato/lead semelhante. Abra o cadastro existente antes de duplicar.");
        throw new Error(data?.error ?? "Não foi possível cadastrar o contato.");
      }
      return data as ContactRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts-nonleads", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["leads", tenantId] });
      setCreateOpen(false);
      setForm({ nome: "", telefone: "", email: "", empresa: "", tipo: "fornecedor" });
      toast({ title: "Contato cadastrado", description: "O contato foi salvo sem entrar no pipeline comercial." });
    },
    onError: (error: Error) => toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }),
  });

  const moveContact = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContactStage }) => {
      const response = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível atualizar o contato.");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts-nonleads", tenantId] });
    },
    onError: (error: Error) => toast({ title: "Falha ao atualizar", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" />Contatos não-leads</h1>
          <p className="text-sm text-muted-foreground mt-1">Fornecedores, parceiros, família e colaboradores fora do pipeline comercial e da automação de vendas.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Novo contato</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, empresa, e-mail ou telefone" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="min-h-64 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : isError ? (
        <Card><CardContent className="p-6 text-sm text-destructive">Não foi possível carregar os contatos.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {stages.map((stage) => {
            const stageContacts = contacts.filter((contact) => normalizeStage(contact.status) === stage.value);
            return (
              <Card key={stage.value} className="min-h-[360px]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{stage.label}</span>
                    <Badge variant="secondary">{stageContacts.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stageContacts.map((contact) => {
                    const type = normalizeType(contact.tipo)!;
                    const TypeIcon = typeConfig[type].icon;
                    return (
                      <div key={contact.id} className="rounded-xl border bg-background p-4 shadow-sm space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{contact.nome}</p>
                            {contact.empresa && <p className="text-xs text-muted-foreground truncate">{contact.empresa}</p>}
                          </div>
                          <Badge variant="outline" className="gap-1 shrink-0"><TypeIcon className="h-3 w-3" />{typeConfig[type].label}</Badge>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {contact.telefone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{contact.telefone}</div>}
                          {contact.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{contact.email}</div>}
                        </div>
                        <Select value={stage.value} onValueChange={(value) => moveContact.mutate({ id: contact.id, status: value as ContactStage })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{stages.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                  {!stageContacts.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum contato nesta etapa.</div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Novo contato não-lead</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Tipo</Label><Select value={form.tipo} onValueChange={(value) => setForm((current) => ({ ...current, tipo: value as ContactType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeConfig).map(([value, config]) => <SelectItem key={value} value={value}>{config.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Nome *</Label><Input value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} /></div>
            <div className="grid sm:grid-cols-2 gap-3"><div className="grid gap-2"><Label>Telefone</Label><Input value={form.telefone} onChange={(event) => setForm((current) => ({ ...current, telefone: event.target.value }))} /></div><div className="grid gap-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></div></div>
            <div className="grid gap-2"><Label>Empresa / vínculo</Label><Input value={form.empresa} onChange={(event) => setForm((current) => ({ ...current, empresa: event.target.value }))} /></div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">Este cadastro será marcado como fora do pipeline e sem agente automático. Ele continuará disponível como contato do tenant.</div>
            <Button onClick={() => createContact.mutate()} disabled={createContact.isPending}>{createContact.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar contato</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
