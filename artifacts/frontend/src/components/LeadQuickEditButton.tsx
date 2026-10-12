import { useState, type MouseEvent } from "react";
import {
  Lead,
  getListTenantLeadsQueryKey,
  getListTenantUsersQueryKey,
  useListTenantUsers,
  useUpdateLead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const EDITABLE_STATUSES = [
  { value: "novo", label: "Novo" },
  { value: "qualificado", label: "Qualificado" },
  { value: "nao_qualificado", label: "Não qualificado" },
  { value: "convertido", label: "Convertido" },
  { value: "perdido", label: "Perdido" },
];

type QuickEditDraft = {
  nome: string;
  empresa: string;
  segmento: string;
  telefone: string;
  email: string;
  status: string;
  assignedTo: string;
};

function leadToDraft(lead: Lead): QuickEditDraft {
  const anyLead = lead as any;
  const segmento =
    (typeof lead.mercadoSegmento === "string" && lead.mercadoSegmento.trim()) ||
    anyLead?.dadosPj?.segmento ||
    anyLead?.metadata?.segmento ||
    anyLead?.metadata?.Segmento ||
    anyLead?.metadata?.setor ||
    anyLead?.metadata?.nicho ||
    "";

  return {
    nome: lead.nome ?? "",
    empresa: lead.empresa ?? "",
    segmento,
    telefone: lead.telefone ?? "",
    email: lead.email ?? "",
    status: EDITABLE_STATUSES.some((status) => status.value === lead.status) ? lead.status : "novo",
    assignedTo: lead.assignedTo ?? "__none__",
  };
}

export function LeadQuickEditButton({
  lead,
  isAdmin,
  compact = false,
}: {
  lead: Lead;
  isAdmin: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<QuickEditDraft>(() => leadToDraft(lead));
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateLead = useUpdateLead();
  const hasRepresentative = Boolean((lead as Lead & { representativeFunctionId?: string | null }).representativeFunctionId);

  const { data: tenantUsers = [] } = useListTenantUsers(lead.tenantId, {
    query: {
      enabled: open && isAdmin,
      queryKey: getListTenantUsersQueryKey(lead.tenantId),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });

  function openEditor(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setDraft(leadToDraft(lead));
    setOpen(true);
  }

  function save() {
    const nome = draft.nome.trim();
    if (nome.length < 2) {
      toast({ title: "Informe o nome do lead", variant: "destructive" });
      return;
    }

    const email = draft.email.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "E-mail inválido", variant: "destructive" });
      return;
    }

    const nextSegment = draft.segmento.trim();
    const empresa = draft.empresa.trim();
    const currentDadosPj = (lead as any).dadosPj;
    const data: Record<string, unknown> = {
      nome,
      empresa: empresa || null,
      mercadoSegmento: nextSegment || null,
      telefone: draft.telefone.trim() || null,
      email: email || null,
      status: draft.status,
      ...(isAdmin && !hasRepresentative && draft.assignedTo !== "__none__" ? { assignedTo: draft.assignedTo } : {}),
    };

    if (currentDadosPj && typeof currentDadosPj === "object") {
      data.dadosPj = {
        ...currentDadosPj,
        segmento: nextSegment || null,
        razaoSocial: empresa || null,
      };
    }

    updateLead.mutate(
      { id: lead.id, data: data as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(lead.tenantId) });
          queryClient.invalidateQueries({ queryKey: ["leads-overview-context", lead.tenantId] });
          setOpen(false);
          toast({ title: "Lead atualizado", description: "As informações da lista foram salvas." });
        },
        onError: () => {
          toast({ title: "Não foi possível atualizar o lead", variant: "destructive" });
        },
      },
    );
  }

  return (
    <>
      <button
        type="button"
        title="Editar informações"
        aria-label={`Editar informações de ${lead.nome}`}
        data-testid={`quick-edit-lead-${lead.id}`}
        className={
          compact
            ? "p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            : "inline-flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        }
        onClick={openEditor}
      >
        <Pencil className="h-4 w-4" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setDraft(leadToDraft(lead));
        }}
      >
        <DialogContent className="max-w-xl" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Editar informações do lead</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nome *</label>
                <Input
                  autoFocus
                  value={draft.nome}
                  onChange={(event) => setDraft((current) => ({ ...current, nome: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Empresa</label>
                <Input
                  value={draft.empresa}
                  onChange={(event) => setDraft((current) => ({ ...current, empresa: event.target.value }))}
                  placeholder="Nome da empresa"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Segmento</label>
                <Input
                  value={draft.segmento}
                  onChange={(event) => setDraft((current) => ({ ...current, segmento: event.target.value }))}
                  placeholder="Ex.: Clínica odontológica"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Telefone / WhatsApp</label>
                <Input
                  value={draft.telefone}
                  onChange={(event) => setDraft((current) => ({ ...current, telefone: event.target.value }))}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">E-mail</label>
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                  placeholder="email@empresa.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status do contato</label>
                <Select
                  value={draft.status}
                  onValueChange={(value) => setDraft((current) => ({ ...current, status: value }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EDITABLE_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isAdmin && hasRepresentative && (
              <p className="text-sm text-muted-foreground">Responsável: empresa representante. A atribuição deve ser alterada no cadastro completo do lead.</p>
            )}
            {isAdmin && !hasRepresentative && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Responsável</label>
                <Select
                  value={draft.assignedTo || "__none__"}
                  onValueChange={(value) => setDraft((current) => ({ ...current, assignedTo: value }))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>Selecione um responsável</SelectItem>
                    {tenantUsers.map((tenantUser) => (
                      <SelectItem key={tenantUser.id} value={tenantUser.id}>
                        {tenantUser.name || tenantUser.email || tenantUser.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Negócios/processos ativos, maior orçamento e churn são indicadores vinculados a outros módulos e não são alterados manualmente aqui.
            </p>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={save} disabled={updateLead.isPending}>
                {updateLead.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar alterações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
