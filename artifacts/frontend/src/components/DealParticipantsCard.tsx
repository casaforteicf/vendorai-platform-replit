import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Link2, Loader2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type PersonParticipant = {
  relationId: string;
  personId: string;
  nome: string;
  documento?: string | null;
  dataNascimento?: string | null;
  telefones?: string[] | null;
  emails?: string[] | null;
  role: string;
  isPrimary: boolean;
  contextualCompanyId?: string | null;
  relationshipScope: "deal_only" | "persistent";
  metadata?: Record<string, unknown> | null;
};

type CompanyParticipant = {
  relationId: string;
  companyId: string;
  cnpj: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  role: string;
  isPrimary: boolean;
};

type PersonSearchItem = {
  id: string;
  nome: string;
  documento?: string | null;
  telefones?: string[] | null;
  emails?: string[] | null;
};

type CompanyItem = {
  companyId: string;
  cnpj: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
};

const PERSON_ROLES = [
  ["consumidor_final", "Consumidor final"],
  ["proprietario", "Proprietário"],
  ["contratante", "Contratante"],
  ["comprador", "Comprador"],
  ["contato_comercial", "Contato comercial"],
  ["decisor", "Decisor"],
  ["responsavel_financeiro", "Responsável financeiro"],
  ["indicador", "Indicador"],
  ["arquiteto", "Arquiteto"],
  ["engenheiro", "Engenheiro"],
  ["representante", "Representante"],
  ["instalador", "Instalador"],
  ["parceiro", "Parceiro"],
  ["outro", "Outro"],
] as const;

const COMPANY_ROLES = [
  ["contratante", "Contratante"],
  ["construtora", "Construtora"],
  ["incorporadora", "Incorporadora"],
  ["imobiliaria", "Imobiliária"],
  ["fornecedor", "Fornecedor"],
  ["parceira", "Parceira"],
  ["representante", "Representante"],
  ["outra", "Outra"],
] as const;

function roleLabel(value: string) {
  return [...PERSON_ROLES, ...COMPANY_ROLES].find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ");
}

export function DealParticipantsCard({
  tenantId,
  dealId,
  token,
}: {
  tenantId: string;
  dealId: string;
  token?: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"person" | "company">("person");
  const [saving, setSaving] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonParticipant | null>(null);
  const [personMode, setPersonMode] = useState<"existing" | "new">("existing");
  const [personId, setPersonId] = useState("");
  const [personRole, setPersonRole] = useState("consumidor_final");
  const [personName, setPersonName] = useState("");
  const [personPhone, setPersonPhone] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [personDocument, setPersonDocument] = useState("");
  const [personBirthDate, setPersonBirthDate] = useState("");
  const [contextCompanyId, setContextCompanyId] = useState("__none__");
  const [relationshipScope, setRelationshipScope] = useState<"deal_only" | "persistent">("deal_only");
  const [hasCommission, setHasCommission] = useState(false);
  const [commissionKind, setCommissionKind] = useState<"percent" | "fixed">("percent");
  const [commissionValue, setCommissionValue] = useState("");
  const [companyMode, setCompanyMode] = useState<"existing" | "new">("existing");
  const [companyId, setCompanyId] = useState("");
  const [companyRole, setCompanyRole] = useState("contratante");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyCnpj, setNewCompanyCnpj] = useState("");

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  const participantsQuery = useQuery<{ people: PersonParticipant[]; companies: CompanyParticipant[] }>({
    queryKey: ["crm-deal-participants", tenantId, dealId],
    enabled: Boolean(tenantId && dealId),
    queryFn: async () => {
      const response = await fetch(`/api/crm/deals/${dealId}/participants?tenantId=${encodeURIComponent(tenantId)}`, { headers });
      if (!response.ok) throw new Error("Não foi possível carregar os envolvidos.");
      return response.json();
    },
  });

  const peopleQuery = useQuery<{ items: PersonSearchItem[] }>({
    queryKey: ["crm-people", tenantId, open],
    enabled: Boolean(open && tenantId),
    queryFn: async () => {
      const response = await fetch(`/api/crm/people?tenantId=${encodeURIComponent(tenantId)}`, { headers });
      if (!response.ok) throw new Error("Não foi possível carregar as pessoas.");
      return response.json();
    },
  });

  const companiesQuery = useQuery<{ items: CompanyItem[] }>({
    queryKey: ["crm-companies-for-deal", tenantId, open],
    enabled: Boolean(open && tenantId),
    queryFn: async () => {
      const response = await fetch(`/api/crm/companies?tenantId=${encodeURIComponent(tenantId)}`, { headers });
      if (!response.ok) throw new Error("Não foi possível carregar as empresas.");
      return response.json();
    },
  });

  const people = participantsQuery.data?.people ?? [];
  const companies = participantsQuery.data?.companies ?? [];
  const companyOptions = companiesQuery.data?.items ?? [];
  const peopleOptions = peopleQuery.data?.items ?? [];

  function resetForm() {
    setPersonMode("existing");
    setEditingPerson(null);
    setPersonId("");
    setPersonRole("consumidor_final");
    setPersonName("");
    setPersonPhone("");
    setPersonEmail("");
    setPersonDocument("");
    setPersonBirthDate("");
    setContextCompanyId("__none__");
    setRelationshipScope("deal_only");
    setHasCommission(false);
    setCommissionKind("percent");
    setCommissionValue("");
    setCompanyMode("existing");
    setCompanyId("");
    setCompanyRole("contratante");
    setNewCompanyName("");
    setNewCompanyCnpj("");
  }

  function editPerson(person: PersonParticipant) {
    resetForm();
    setKind("person");
    setEditingPerson(person);
    setPersonId(person.personId);
    setPersonName(person.nome);
    setPersonPhone(person.telefones?.[0] ?? "");
    setPersonEmail(person.emails?.[0] ?? "");
    setPersonDocument(person.documento ?? "");
    setPersonBirthDate(person.dataNascimento ?? "");
    setPersonRole(person.role);
    setContextCompanyId(person.contextualCompanyId ?? "__none__");
    setRelationshipScope(person.relationshipScope);
    const commission = person.metadata?.commission as { enabled?: boolean; kind?: string; value?: string | number | null } | undefined;
    setHasCommission(commission?.enabled === true);
    setCommissionKind(commission?.kind === "fixed" ? "fixed" : "percent");
    setCommissionValue(commission?.value == null ? "" : String(commission.value));
    setOpen(true);
  }

  async function savePerson() {
    if (personMode === "existing" && !personId) {
      toast({ title: "Selecione uma pessoa.", variant: "destructive" });
      return;
    }
    if (personMode === "new" && personName.trim().length < 2) {
      toast({ title: "Informe o nome da pessoa.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingPerson) {
        const responseProfile = await fetch(`/api/crm/deals/${dealId}/people/${editingPerson.personId}/profile`, {
          method: "PATCH", headers,
          body: JSON.stringify({ tenantId, nome: personName.trim(), telefone: personPhone.trim(),
            email: personEmail.trim(), documento: personDocument.trim(), dataNascimento: personBirthDate }),
        });
        const profileResult = await responseProfile.json().catch(() => ({}));
        if (!responseProfile.ok) throw new Error(profileResult.error ?? "Falha ao editar dados pessoais.");
      }
      const response = await fetch(`/api/crm/deals/${dealId}/people`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tenantId,
          personId: personMode === "existing" ? personId : undefined,
          person: personMode === "new" ? {
            nome: personName.trim(),
            telefone: personPhone.trim() || undefined,
            email: personEmail.trim() || undefined,
            documento: personDocument.trim() || undefined,
          } : undefined,
          role: personRole,
          isPrimary: editingPerson?.isPrimary ?? false,
          contextualCompanyId: contextCompanyId === "__none__" ? null : contextCompanyId,
          relationshipScope,
          metadata: {
            ...(editingPerson?.metadata ?? {}),
            commission: hasCommission
              ? { enabled: true, kind: commissionKind, value: commissionValue.trim() || null, status: "prevista" }
              : { enabled: false },
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível adicionar a pessoa.");
      await qc.invalidateQueries({ queryKey: ["crm-deal-participants", tenantId, dealId] });
      setOpen(false);
      resetForm();
      toast({ title: editingPerson ? "Vínculo atualizado." : "Pessoa vinculada ao negócio." });
    } catch (error) {
      toast({ title: "Erro ao adicionar envolvido", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function saveCompany() {
    let selectedCompanyId = companyId;
    setSaving(true);
    try {
      if (companyMode === "new") {
        if (newCompanyName.trim().length < 2) throw new Error("Informe o nome da empresa.");
        const createResponse = await fetch("/api/crm/companies/manual", {
          method: "POST",
          headers,
          body: JSON.stringify({
            tenantId,
            razaoSocial: newCompanyName.trim(),
            nomeFantasia: newCompanyName.trim(),
            cnpj: newCompanyCnpj.trim() || undefined,
          }),
        });
        const created = await createResponse.json().catch(() => ({}));
        if (!createResponse.ok) throw new Error(created.error ?? "Não foi possível cadastrar a empresa.");
        selectedCompanyId = created.company?.id ?? "";
      }
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");

      const response = await fetch(`/api/crm/deals/${dealId}/companies`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tenantId, companyId: selectedCompanyId, role: companyRole }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível adicionar a empresa.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["crm-deal-participants", tenantId, dealId] }),
        qc.invalidateQueries({ queryKey: ["crm-companies-for-deal", tenantId] }),
      ]);
      setOpen(false);
      resetForm();
      toast({ title: "Empresa vinculada ao negócio." });
    } catch (error) {
      toast({ title: "Erro ao adicionar empresa", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(kindToRemove: "people" | "companies", relationId: string) {
    const response = await fetch(`/api/crm/deals/${dealId}/${kindToRemove}/${relationId}`, { method: "DELETE", headers });
    if (!response.ok) {
      toast({ title: "Não foi possível remover o vínculo.", variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["crm-deal-participants", tenantId, dealId] });
  }

  const hasParticipants = people.length > 0 || companies.length > 0;

  return (
    <>
      {hasParticipants ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => setOpen(true)}>
            <UserRound className="mr-1.5 h-4 w-4" />
            Envolvidos ({people.length + companies.length})
          </Button>
        </div>
      ) : (
              <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4" />
                <p className="text-sm font-semibold">Envolvidos no negócio</p>
                <Badge variant="secondary">{people.length + companies.length}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Pessoas e empresas participam deste negócio sem criar vínculos permanentes indevidos.
              </p>
            </div>
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              <Link2 className="mr-1.5 h-4 w-4" />Vincular cliente/contato
            </Button>
          </div>

          {participantsQuery.isLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
          ) : people.length === 0 && companies.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhum envolvido adicional. Um consumidor final pode ser atendido diretamente, sem empresa.
            </p>
          ) : (
            <div className="mt-4 grid gap-2">
              {companies.map((company) => (
                <div key={company.relationId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{company.nomeFantasia || company.razaoSocial || "Empresa"}</p>
                      <p className="text-xs text-muted-foreground">{roleLabel(company.role)}{company.cnpj?.startsWith("SEM-CNPJ-") ? "" : company.cnpj ? ` · ${company.cnpj}` : ""}</p>
                    </div>
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => void remove("companies", company.relationId)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {people.map((person) => {
                const contextualCompany = companyOptions.find((item) => item.companyId === person.contextualCompanyId);
                return (
                  <div key={person.relationId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{person.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabel(person.role)}
                          {contextualCompany ? ` · ${contextualCompany.nomeFantasia || contextualCompany.razaoSocial}` : ""}
                          {person.relationshipScope === "deal_only" ? " · somente neste negócio" : " · vínculo permanente"}
                          {(() => {
                            const commission = person.metadata && typeof person.metadata === "object" ? (person.metadata as any).commission : null;
                            if (!commission?.enabled) return " · sem comissão";
                            const value = commission.value ? ` ${commission.value}` : "";
                            return commission.kind === "fixed" ? ` · comissão fixa${value}` : ` · comissão %${value}`;
                          })()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Editar vínculo" onClick={() => editPerson(person)}><Pencil className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => void remove("people", person.relationId)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingPerson ? "Editar vínculo da pessoa" : "Vincular cliente/contato ao negócio"}</DialogTitle>
          </DialogHeader>
          <Tabs value={kind} onValueChange={(value) => setKind(value as "person" | "company")}>
            <p className="text-sm text-muted-foreground">Selecione um cadastro existente para anexar este atendimento ao cliente correto ou cadastre um novo sem duplicar o lead.</p>
          <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="person">Pessoa</TabsTrigger>
              <TabsTrigger value="company">Empresa</TabsTrigger>
            </TabsList>

            <TabsContent value="person" className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={personMode === "existing" ? "default" : "outline"} onClick={() => setPersonMode("existing")}>Pessoa existente</Button>
                <Button type="button" disabled={Boolean(editingPerson)} variant={personMode === "new" ? "default" : "outline"} onClick={() => setPersonMode("new")}>Nova pessoa</Button>
              </div>
              {personMode === "existing" ? (
                <div className="space-y-1.5">
                  <Label>Pessoa</Label>
                  <Select value={personId} onValueChange={setPersonId} disabled={Boolean(editingPerson)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{peopleOptions.map((person) => <SelectItem key={person.id} value={person.id}>{person.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2"><Label>Nome *</Label><Input value={personName} onChange={(e) => setPersonName(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>WhatsApp / telefone</Label><Input value={personPhone} onChange={(e) => setPersonPhone(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label>CPF / documento</Label><Input value={personDocument} onChange={(e) => setPersonDocument(e.target.value)} /></div>
                </div>
              )}
              {editingPerson && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input value={personName} onChange={(e) => setPersonName(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Telefone</Label><Input value={personPhone} onChange={(e) => setPersonPhone(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>CPF / documento</Label><Input value={personDocument} onChange={(e) => setPersonDocument(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Nascimento</Label><Input type="date" value={personBirthDate} onChange={(e) => setPersonBirthDate(e.target.value)} /></div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">Esses dados pertencem à pessoa e também serão atualizados nos outros negócios vinculados.</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Papel neste negócio</Label>
                <Select value={personRole} onValueChange={setPersonRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PERSON_ROLES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Empresa relacionada neste contexto</Label>
                <Select value={contextCompanyId} onValueChange={setContextCompanyId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma empresa</SelectItem>
                    {companyOptions.map((company) => <SelectItem key={company.companyId} value={company.companyId}>{company.nomeFantasia || company.razaoSocial || company.cnpj}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Ex.: consumidor final de um empreendimento. Isso não o transforma em funcionário da empresa.</p>
              </div>
              <div className="space-y-2 rounded-lg border p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={hasCommission} onChange={(e) => setHasCommission(e.target.checked)} />
                  Este envolvido possui comissão / ganho
                </label>
                <p className="text-[11px] text-muted-foreground">Opcional. Deixe desmarcado quando não houver ganho.</p>
                {hasCommission && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={commissionKind} onValueChange={(v) => setCommissionKind(v as "percent" | "fixed")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percentual</SelectItem>
                        <SelectItem value="fixed">Valor fixo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)} placeholder={commissionKind === "percent" ? "Ex.: 15" : "Ex.: 1500,00"} />
                  </div>
                )}
              </div>
              {contextCompanyId !== "__none__" && (
                <div className="space-y-1.5">
                  <Label>Tipo de vínculo</Label>
                  <Select value={relationshipScope} onValueChange={(v) => setRelationshipScope(v as "deal_only" | "persistent")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deal_only">Somente neste negócio</SelectItem>
                      <SelectItem value="persistent">Contato permanente da empresa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button className="w-full" onClick={() => void savePerson()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingPerson ? "Salvar alterações" : "Adicionar pessoa"}</Button>
            </TabsContent>

            <TabsContent value="company" className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={companyMode === "existing" ? "default" : "outline"} onClick={() => setCompanyMode("existing")}>Empresa existente</Button>
                <Button type="button" variant={companyMode === "new" ? "default" : "outline"} onClick={() => setCompanyMode("new")}>Nova empresa</Button>
              </div>
              {companyMode === "existing" ? (
                <div className="space-y-1.5">
                  <Label>Empresa</Label>
                  <Select value={companyId} onValueChange={setCompanyId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{companyOptions.map((company) => <SelectItem key={company.companyId} value={company.companyId}>{company.nomeFantasia || company.razaoSocial || company.cnpj}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2"><Label>Empresa *</Label><Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label>CNPJ</Label><Input value={newCompanyCnpj} onChange={(e) => setNewCompanyCnpj(e.target.value)} placeholder="Opcional" /></div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Papel neste negócio</Label>
                <Select value={companyRole} onValueChange={setCompanyRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COMPANY_ROLES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => void saveCompany()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adicionar empresa</Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
