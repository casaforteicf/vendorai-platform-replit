import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RefreshCw, AlertTriangle, Building2, UserPlus, Users, Link, Check, Pencil, X, Wallet,
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
import { Badge } from "@/components/ui/badge";

const createPartnerSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  cnpj: z.string().min(14, "CNPJ inválido (mín. 14 dígitos)"),
  phone: z.string().min(10, "Telefone inválido (mín. 10 dígitos)"),
});

type CreatePartnerForm = z.infer<typeof createPartnerSchema>;

export default function AdminPartners() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [linkingTenantId, setLinkingTenantId] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const partnersQuery = useListPartners({
    query: { queryKey: getListPartnersQueryKey() },
  });

  const tenantsQuery = useListTenants({
    query: { queryKey: getListTenantsQueryKey() },
  });

  const createPartner = useCreatePartner({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey() });
        form.reset();
        const asaasOk = (data as any).asaasSubconta === true;
        toast({
          title: "Parceiro criado com sucesso.",
          description: asaasOk
            ? "Subconta Asaas criada e walletId salvo."
            : "Parceiro criado. Subconta Asaas não configurada — configure ASAAS_API_KEY para ativar splits.",
        });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Erro ao criar parceiro.";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const updatePartner = useUpdatePartner({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey() });
        setEditingPartnerId(null);
        toast({ title: "Parceiro atualizado." });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Erro ao atualizar parceiro.";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const linkTenant = useLinkTenantPartner({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        setLinkingTenantId(null);
        setSelectedPartnerId("");
        toast({ title: "Tenant vinculado ao parceiro." });
      },
      onError: () => toast({ title: "Erro ao vincular tenant.", variant: "destructive" }),
    },
  });

  const form = useForm<CreatePartnerForm>({
    resolver: zodResolver(createPartnerSchema),
    defaultValues: { name: "", email: "", password: "", cnpj: "", phone: "" },
  });

  function onSubmit(values: CreatePartnerForm) {
    createPartner.mutate({ data: values });
  }

  function startEdit(partner: { id: string; name: string; email: string }) {
    setEditingPartnerId(partner.id);
    setEditName(partner.name);
    setEditEmail(partner.email);
  }

  function cancelEdit() {
    setEditingPartnerId(null);
    setEditName("");
    setEditEmail("");
  }

  function saveEdit(id: string) {
    updatePartner.mutate({ id, data: { name: editName, email: editEmail } });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Parceiros / Revendedores</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie parceiros e vincule tenants às suas contas. Ao criar um parceiro, uma subconta Asaas é criada automaticamente para splits de pagamento.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Partner */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Novo Parceiro
          </h2>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do parceiro" {...field} />
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
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="parceiro@empresa.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl>
                      <Input placeholder="00.000.000/0000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone celular</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="(11) 99999-9999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <Button type="submit" className="w-full" disabled={createPartner.isPending}>
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

        {/* Partners List */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Parceiros Cadastrados
          </h2>

          {partnersQuery.isPending ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : partnersQuery.isError ? (
            <div className="flex items-center gap-2 text-destructive text-sm py-4">
              <AlertTriangle className="h-4 w-4" />
              Erro ao carregar parceiros.
            </div>
          ) : !partnersQuery.data || partnersQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum parceiro cadastrado.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border">
              {partnersQuery.data.map((partner) => {
                const isEditing = editingPartnerId === partner.id;

                return (
                  <div key={partner.id} className="px-4 py-3 space-y-2">
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
                            disabled={updatePartner.isPending || !editName.trim() || !editEmail.trim()}
                            onClick={() => saveEdit(partner.id)}
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
                            onClick={cancelEdit}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-sm font-medium">{partner.name}</p>
                          <p className="text-xs text-muted-foreground">{partner.email}</p>
                          <p className="text-xs text-muted-foreground/70">CNPJ: {partner.cnpj}</p>
                          <div className="flex items-center gap-1 mt-1">
                            {partner.asaasWalletId ? (
                              <Badge variant="secondary" className="text-[10px] gap-1 py-0">
                                <Wallet className="h-2.5 w-2.5" />
                                Asaas vinculado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                                Sem walletId Asaas
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={() => startEdit(partner)}
                          title="Editar parceiro"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Link Tenant to Partner */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Link className="h-4 w-4" />
          Vincular Tenant a Parceiro
        </h2>
        <p className="text-sm text-muted-foreground">
          Selecione um tenant e associe-o a um parceiro. Ao ganhar um deal, a cobrança será dividida 50/50 automaticamente via Asaas.
        </p>

        {tenantsQuery.isPending || partnersQuery.isPending ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border overflow-hidden">
            {(tenantsQuery.data ?? []).map((tenant) => {
              const currentPartner = partnersQuery.data?.find(p => (tenant as any).partnerId === p.id);
              const isLinking = linkingTenantId === tenant.id;

              return (
                <div key={tenant.id} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{tenant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentPartner ? (
                        <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          Parceiro: {currentPartner.name}
                          {currentPartner.asaasWalletId && (
                            <span title="Split Asaas ativo">
                              <Wallet className="h-3 w-3 text-green-500" />
                            </span>
                          )}
                        </span>
                      ) : (
                        "Sem parceiro"
                      )}
                    </p>
                  </div>

                  {isLinking ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                        <SelectTrigger className="w-40 h-8 text-xs">
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem parceiro</SelectItem>
                          {(partnersQuery.data ?? []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={linkTenant.isPending || !selectedPartnerId}
                        onClick={() => {
                          linkTenant.mutate({
                            id: tenant.id,
                            data: { partnerId: selectedPartnerId === "__none__" ? null : selectedPartnerId },
                          });
                        }}
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
                        onClick={() => { setLinkingTenantId(null); setSelectedPartnerId(""); }}
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
                        setSelectedPartnerId((tenant as any).partnerId ?? "__none__");
                      }}
                    >
                      Vincular
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
