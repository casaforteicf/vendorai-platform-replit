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
import { Building2, Handshake, Heart, Loader2, Mail, Phone, Plus, Search, Smile, MoreHorizontal, UserCog, Users, Undo2, Settings2, Trash2 } from "lucide-react";

type ContactType = string;
type NonLeadClassification = { id: string; label: string; active?: boolean; description?: string };

type ContactRecord = {
  id: string;
  tenantId: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  empresa?: string | null;
  naoLeadTipo?: string | null;
  naoLeadNotas?: string | null;
  status: string;
  excluidoEm?: string | null;
};

const typeConfig: Record<string, { label: string; icon: typeof Building2 }> = {
  fornecedor: { label: "Fornecedor", icon: Building2 },
  parceiro: { label: "Parceiro", icon: Handshake },
  familiar: { label: "Familiar", icon: Heart },
  colaborador: { label: "Colaborador", icon: UserCog },
  amigo: { label: "Amigo", icon: Smile },
  outro: { label: "Outro", icon: MoreHorizontal },
};

export default function NonLeadsKanban() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [classificationsOpen, setClassificationsOpen] = useState(false);
  const [newClassificationLabel, setNewClassificationLabel] = useState("");
  const [form, setForm] = useState({ nome: "", telefone: "", email: "", empresa: "", tipo: "fornecedor" as ContactType, notas: "" });

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  // Achado real: essa tela filtrava só do lado do cliente (por `tipo`),
  // então o contato "não-lead" continuava aparecendo normal na pipeline,
  // no dashboard e na análise de churn -- nada de fato o tirava de lá.
  // Agora busca direto do endpoint com o filtro que já exclui de tudo
  // isso automaticamente (mesmo padrão da exclusão lógica).
  const { data: contacts = [], isLoading, isError } = useQuery<ContactRecord[]>({
    queryKey: ["contacts-nonleads", tenantId],
    enabled: Boolean(token && tenantId),
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/leads?incluirNaoLeads=apenas`, { headers });
      if (!response.ok) throw new Error("Não foi possível carregar os contatos.");
      return response.json();
    },
  });

  const { data: classifications = [] } = useQuery<NonLeadClassification[]>({
    queryKey: ["non-lead-classifications", tenantId],
    enabled: Boolean(token && tenantId),
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/non-lead-classifications`, { headers });
      if (!response.ok) throw new Error("Não foi possível carregar as classificações.");
      return response.json();
    },
  });

  const classificationMap = useMemo(
    () => new Map(classifications.map((item) => [item.id, item])),
    [classifications],
  );

  const saveClassifications = useMutation({
    mutationFn: async (next: NonLeadClassification[]) => {
      const response = await fetch(`/api/tenants/${tenantId}/non-lead-classifications`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ classifications: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível salvar as classificações.");
      return data as NonLeadClassification[];
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["non-lead-classifications", tenantId], data);
      toast({ title: "Classificações atualizadas" });
    },
    onError: (error: Error) => toast({ title: "Falha ao salvar classificações", description: error.message, variant: "destructive" }),
  });

  function slugifyClassification(value: string) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
  }

  function addClassification() {
    const label = newClassificationLabel.trim();
    const id = slugifyClassification(label);
    if (!label || !id) return;
    if (classifications.some((item) => item.id === id)) {
      toast({ title: "Essa classificação já existe", variant: "destructive" });
      return;
    }
    saveClassifications.mutate([...classifications, { id, label, active: true }]);
    setNewClassificationLabel("");
  }

    const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) =>
      [contact.nome, contact.empresa, contact.email, contact.telefone].some((value) => (value ?? "").toLowerCase().includes(term))
    );
  }, [contacts, search]);

  const createContact = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Informe o nome do contato.");
      // 2 passos: cria o lead normal, depois classifica como não-lead --
      // reaproveita a mesma rota de classificação usada na tela do lead
      // (D-003A), então o comportamento é idêntico nos 2 fluxos.
      const createRes = await fetch("/api/leads", {
        method: "POST",
        headers,
        body: JSON.stringify({
          tenantId,
          nome: form.nome.trim(),
          telefone: form.telefone.trim() || null,
          email: form.email.trim() || null,
          empresa: form.empresa.trim() || null,
          agenteDesativado: true,
          source: "manual",
        }),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        if (createRes.status === 409) throw new Error("Já existe um contato/lead semelhante. Abra o cadastro existente antes de duplicar.");
        throw new Error(created?.error ?? "Não foi possível cadastrar o contato.");
      }
      const classifyRes = await fetch(`/api/leads/${created.id}/classificar-nao-lead`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tipo: form.tipo, notas: form.notas.trim() || undefined }),
      });
      if (!classifyRes.ok) {
        const data = await classifyRes.json().catch(() => ({}));
        throw new Error(data?.error ?? "Contato criado, mas falhou ao classificar como não-lead.");
      }
      return classifyRes.json() as Promise<ContactRecord>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts-nonleads", tenantId] });
      setCreateOpen(false);
      setForm({ nome: "", telefone: "", email: "", empresa: "", tipo: "fornecedor", notas: "" });
      toast({ title: "Contato cadastrado", description: "Fora da pipeline comercial e da análise de churn." });
    },
    onError: (error: Error) => toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }),
  });

  const reclassifyAsLead = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/leads/${id}/reclassificar-como-lead`, { method: "POST", headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível reclassificar.");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts-nonleads", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["leads", tenantId] });
      toast({ title: "Voltou a ser lead", description: "Reaparece na pipeline normal agora." });
    },
    onError: (error: Error) => toast({ title: "Falha ao reclassificar", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" />Contatos não-leads</h1>
          <p className="text-sm text-muted-foreground mt-1">Fornecedores, parceiros, familiares e outros contatos fora do pipeline comercial e da análise de churn.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setClassificationsOpen(true)}><Settings2 className="h-4 w-4 mr-2" />Classificações</Button>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Novo contato</Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, empresa, e-mail ou telefone" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="min-h-64 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : isError ? (
        <Card><CardContent className="p-6 text-sm text-destructive">Não foi possível carregar os contatos.</CardContent></Card>
      ) : filteredContacts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum contato não-lead ainda.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContacts.map((contact) => {
            const type = (contact.naoLeadTipo as ContactType) ?? "outro";
            const configured = classificationMap.get(type);
            const config = { ...(typeConfig[type] ?? typeConfig.outro), label: configured?.label ?? typeConfig[type]?.label ?? type };
            const TypeIcon = config.icon;
            return (
              <div key={contact.id} className="rounded-xl border bg-background p-4 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{contact.nome}</p>
                    {contact.empresa && <p className="text-xs text-muted-foreground truncate">{contact.empresa}</p>}
                  </div>
                  <Badge variant="outline" className="gap-1 shrink-0"><TypeIcon className="h-3 w-3" />{config.label}</Badge>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {contact.telefone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{contact.telefone}</div>}
                  {contact.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{contact.email}</div>}
                </div>
                {contact.naoLeadNotas && <p className="text-xs text-muted-foreground italic">"{contact.naoLeadNotas}"</p>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs"
                  disabled={reclassifyAsLead.isPending}
                  onClick={() => reclassifyAsLead.mutate(contact.id)}
                >
                  <Undo2 className="h-3 w-3 mr-1.5" />
                  Voltar a ser lead
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={classificationsOpen} onOpenChange={setClassificationsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Classificações de Não Lead</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input value={newClassificationLabel} onChange={(e) => setNewClassificationLabel(e.target.value)} placeholder="Ex: Futuro cliente" onKeyDown={(e) => e.key === "Enter" && addClassification()} />
              <Button onClick={addClassification} disabled={saveClassifications.isPending || !newClassificationLabel.trim()}><Plus className="h-4 w-4 mr-1" />Criar</Button>
            </div>
            <div className="space-y-2 max-h-80 overflow-auto">
              {classifications.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant={item.active === false ? "outline" : "secondary"} onClick={() => saveClassifications.mutate(classifications.map((current) => current.id === item.id ? { ...current, active: current.active === false } : current))}>
                      {item.active === false ? "Ativar" : "Desativar"}
                    </Button>
                    <Button size="icon" variant="ghost" disabled={contacts.some((contact) => contact.naoLeadTipo === item.id)} onClick={() => saveClassifications.mutate(classifications.filter((current) => current.id !== item.id))} title={contacts.some((contact) => contact.naoLeadTipo === item.id) ? "Em uso por contatos" : "Excluir"}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Novo contato não-lead</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Tipo</Label><Select value={form.tipo} onValueChange={(value) => setForm((current) => ({ ...current, tipo: value as ContactType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{classifications.filter((item) => item.active !== false).map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Nome *</Label><Input value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} /></div>
            <div className="grid sm:grid-cols-2 gap-3"><div className="grid gap-2"><Label>Telefone</Label><Input value={form.telefone} onChange={(event) => setForm((current) => ({ ...current, telefone: event.target.value }))} /></div><div className="grid gap-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></div></div>
            <div className="grid gap-2"><Label>Empresa / vínculo</Label><Input value={form.empresa} onChange={(event) => setForm((current) => ({ ...current, empresa: event.target.value }))} /></div>
            <div className="grid gap-2"><Label>Observações</Label><Input value={form.notas} onChange={(event) => setForm((current) => ({ ...current, notas: event.target.value }))} /></div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">Este cadastro fica fora do pipeline, da análise de churn e do agente automático. Continua disponível como contato do tenant.</div>
            <Button onClick={() => createContact.mutate()} disabled={createContact.isPending}>{createContact.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar contato</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}