import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListTenantUsers,
  getListTenantUsersQueryKey,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  customFetch,
  UserFunction,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { USER_MODULES, modulesForFunction, type UserModuleKey } from "@/lib/moduleAccess";
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
  Users,
  UserPlus,
  Pencil,
  Trash2,
  Search,
  Phone,
  Shield,
  CheckCircle2,
  XCircle,
  Settings2,
  Plus,
  Copy,
} from "lucide-react";

const FUNCAO_LABELS: Record<string, string> = {
  vendedor: "Vendedor",
  financeiro: "Financeiro",
  suporte: "Suporte",
  entrega: "Entrega",
  administrador: "Administrador",
  outro: "Outro",
};

const FUNCAO_BADGES: Record<string, string> = {
  vendedor: "bg-blue-100 text-blue-800 border-blue-200",
  financeiro: "bg-emerald-100 text-emerald-800 border-emerald-200",
  suporte: "bg-amber-100 text-amber-800 border-amber-200",
  entrega: "bg-purple-100 text-purple-800 border-purple-200",
  administrador: "bg-red-100 text-red-800 border-red-200",
  outro: "bg-gray-100 text-gray-800 border-gray-200",
};

const BUILTIN_FUNCTIONS: UserFunction[] = [
  "vendedor",
  "financeiro",
  "suporte",
  "entrega",
  "administrador",
  "outro",
];

type TenantUserFunction = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: UserModuleKey[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type FunctionDraft = {
  name: string;
  description: string;
  permissions: UserModuleKey[];
  active: boolean;
};

function newFunctionDraft(): FunctionDraft {
  return {
    name: "",
    description: "",
    permissions: modulesForFunction("outro"),
    active: true,
  };
}

export default function Usuarios() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId ?? "";

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [editingFunction, setEditingFunction] = useState<TenantUserFunction | null>(null);
  const [showFunctionEditor, setShowFunctionEditor] = useState(false);
  const [applyCreatedFunction, setApplyCreatedFunction] = useState(false);
  const [functionDraft, setFunctionDraft] = useState<FunctionDraft>(newFunctionDraft());
  const [savingFunction, setSavingFunction] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    telefone: "",
    userFunction: "outro" as UserFunction,
    customFunctionId: null as string | null,
    permissions: modulesForFunction("outro") as UserModuleKey[],
    password: "",
  });

  const { data: users, isLoading } = useListTenantUsers(tenantId);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const functionQueryKey = ["tenant-user-functions", tenantId] as const;
  const { data: customFunctions = [], isLoading: functionsLoading } = useQuery({
    queryKey: functionQueryKey,
    queryFn: () =>
      customFetch<TenantUserFunction[]>(`/api/tenants/${tenantId}/user-functions`, {
        responseType: "json",
      }),
    enabled: Boolean(tenantId),
  });

  const filteredUsers = users?.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()),
  );

  function resetForm() {
    setFormData({
      name: "",
      email: "",
      telefone: "",
      userFunction: "outro",
      customFunctionId: null,
      permissions: modulesForFunction("outro"),
      password: "",
    });
    setEditingUser(null);
  }

  function openEdit(userToEdit: any) {
    setEditingUser(userToEdit);
    setFormData({
      name: userToEdit.name ?? "",
      email: userToEdit.email ?? "",
      telefone: userToEdit.telefone ?? "",
      userFunction: userToEdit.userFunction ?? "outro",
      customFunctionId: userToEdit.customFunctionId ?? null,
      permissions: Array.isArray(userToEdit.permissions)
        ? userToEdit.permissions
        : modulesForFunction(userToEdit.userFunction ?? "outro"),
      password: "",
    });
    setDialogOpen(true);
  }

  function roleLabel(userRow: any) {
    if (userRow.customFunctionId) {
      return (
        customFunctions.find((definition) => definition.id === userRow.customFunctionId)?.name ??
        "Função personalizada"
      );
    }
    return FUNCAO_LABELS[userRow.userFunction ?? "outro"] ?? "Outro";
  }

  function roleBadgeClass(userRow: any) {
    if (userRow.customFunctionId) {
      return "bg-violet-100 text-violet-800 border-violet-200";
    }
    return FUNCAO_BADGES[userRow.userFunction ?? "outro"] ?? FUNCAO_BADGES.outro;
  }

  function openFunctionsManager() {
    setApplyCreatedFunction(false);
    setEditingFunction(null);
    setShowFunctionEditor(false);
    setFunctionDraft(newFunctionDraft());
    setFunctionsOpen(true);
  }

  function openNewFunction(shouldApplyToUser = false) {
    setApplyCreatedFunction(shouldApplyToUser);
    setEditingFunction(null);
    setFunctionDraft(newFunctionDraft());
    setShowFunctionEditor(true);
    setFunctionsOpen(true);
  }

  function openEditFunction(definition: TenantUserFunction) {
    setApplyCreatedFunction(false);
    setEditingFunction(definition);
    setFunctionDraft({
      name: definition.name,
      description: definition.description ?? "",
      permissions: Array.isArray(definition.permissions) ? definition.permissions : [],
      active: definition.active,
    });
    setShowFunctionEditor(true);
  }

  async function saveFunction() {
    const name = functionDraft.name.trim();
    if (name.length < 2) {
      toast({
        title: "Nome da função obrigatório",
        description: "Informe um nome com pelo menos 2 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setSavingFunction(true);
    try {
      const payload = {
        name,
        description: functionDraft.description.trim() || null,
        permissions: functionDraft.permissions,
        active: functionDraft.active,
      };

      let saved: TenantUserFunction;
      if (editingFunction) {
        saved = await customFetch<TenantUserFunction>(`/api/user-functions/${editingFunction.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          responseType: "json",
        });
      } else {
        saved = await customFetch<TenantUserFunction>(`/api/tenants/${tenantId}/user-functions`, {
          method: "POST",
          body: JSON.stringify(payload),
          responseType: "json",
        });
      }

      await queryClient.invalidateQueries({ queryKey: functionQueryKey });

      if (!editingFunction && applyCreatedFunction) {
        setFormData((current) => ({
          ...current,
          userFunction: "outro",
          customFunctionId: saved.id,
          permissions: saved.permissions,
        }));
        setFunctionsOpen(false);
      } else {
        setShowFunctionEditor(false);
      }

      toast({
        title: editingFunction ? "Função atualizada" : "Função criada",
        description: editingFunction
          ? "As permissões padrão da função foram atualizadas."
          : "A nova função já está disponível para a equipe.",
      });
    } catch (err: any) {
      toast({
        title: "Erro ao salvar função",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSavingFunction(false);
    }
  }

  async function duplicateFunction(definition: TenantUserFunction) {
    try {
      await customFetch<TenantUserFunction>(`/api/tenants/${tenantId}/user-functions`, {
        method: "POST",
        body: JSON.stringify({
          name: `${definition.name} (cópia)`,
          description: definition.description,
          permissions: definition.permissions,
          active: true,
        }),
        responseType: "json",
      });
      await queryClient.invalidateQueries({ queryKey: functionQueryKey });
      toast({ title: "Função duplicada", description: "A cópia pode ser editada agora." });
    } catch (err: any) {
      toast({
        title: "Não foi possível duplicar",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function toggleFunction(definition: TenantUserFunction) {
    try {
      await customFetch(`/api/user-functions/${definition.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !definition.active }),
        responseType: "json",
      });
      await queryClient.invalidateQueries({ queryKey: functionQueryKey });
      toast({
        title: definition.active ? "Função desativada" : "Função ativada",
        description: definition.active
          ? "Ela não aparecerá para novos usuários, mas os usuários atuais são preservados."
          : "A função voltou a ficar disponível no cadastro de usuários.",
      });
    } catch (err: any) {
      toast({
        title: "Erro ao alterar função",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function deleteFunction(definition: TenantUserFunction) {
    const usageCount = users?.filter((u: any) => u.customFunctionId === definition.id).length ?? 0;
    const message = usageCount
      ? `Esta função está ligada a ${usageCount} usuário(s). Ao excluir, os usuários serão preservados com os acessos atuais. Continuar?`
      : "Tem certeza que deseja excluir esta função?";
    if (!confirm(message)) return;

    try {
      await customFetch(`/api/user-functions/${definition.id}`, {
        method: "DELETE",
        responseType: "auto",
      });
      await queryClient.invalidateQueries({ queryKey: functionQueryKey });
      queryClient.invalidateQueries({ queryKey: getListTenantUsersQueryKey(tenantId) });
      if (formData.customFunctionId === definition.id) {
        setFormData((current) => ({
          ...current,
          customFunctionId: null,
          userFunction: "outro",
        }));
      }
      toast({ title: "Função excluída", description: "Os usuários existentes foram preservados." });
    } catch (err: any) {
      toast({
        title: "Erro ao excluir função",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  function handleFunctionSelection(value: string) {
    if (value === "__create__") {
      openNewFunction(true);
      return;
    }
    if (value === "__manage__") {
      openFunctionsManager();
      return;
    }
    if (value.startsWith("custom:")) {
      const id = value.slice("custom:".length);
      const definition = customFunctions.find((item) => item.id === id);
      if (!definition) return;
      setFormData((current) => ({
        ...current,
        userFunction: "outro",
        customFunctionId: definition.id,
        permissions: definition.permissions,
      }));
      return;
    }

    const builtIn = value as UserFunction;
    setFormData((current) => ({
      ...current,
      userFunction: builtIn,
      customFunctionId: null,
      permissions: modulesForFunction(builtIn),
    }));
  }

  async function handleSubmit() {
    if (!formData.name || !formData.email) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha nome e e-mail do usuário.",
        variant: "destructive",
      });
      return;
    }

    if (!editingUser && !formData.password) {
      toast({
        title: "Senha obrigatória",
        description: "Defina uma senha para o novo usuário.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingUser) {
        const payload: any = {
          name: formData.name,
          email: formData.email,
          telefone: formData.telefone || undefined,
          userFunction: formData.userFunction,
          customFunctionId: formData.customFunctionId,
          permissions: formData.permissions,
        };
        if (formData.password) payload.password = formData.password;
        await updateUser.mutateAsync({ id: editingUser.id, data: payload });
        toast({ title: "Usuário atualizado", description: "As alterações foram salvas com sucesso." });
      } else {
        await createUser.mutateAsync({
          data: {
            tenantId,
            name: formData.name,
            email: formData.email,
            password: formData.password,
            telefone: formData.telefone || undefined,
            userFunction: formData.userFunction,
            permissions: formData.permissions,
            customFunctionId: formData.customFunctionId,
          } as any,
        });
        toast({ title: "Usuário criado", description: "Novo membro da equipe adicionado com sucesso." });
      }
      queryClient.invalidateQueries({ queryKey: getListTenantUsersQueryKey(tenantId) });
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast({
        title: "Erro ao salvar",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return;
    try {
      await deleteUser.mutateAsync({ id: userId });
      toast({ title: "Usuário excluído", description: "O usuário foi removido da equipe." });
      queryClient.invalidateQueries({ queryKey: getListTenantUsersQueryKey(tenantId) });
    } catch (err: any) {
      toast({
        title: "Erro ao excluir",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  const selectedFunctionValue = formData.customFunctionId
    ? `custom:${formData.customFunctionId}`
    : formData.userFunction;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Equipe
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie os usuários, funções e acessos da empresa</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openFunctionsManager}>
            <Settings2 className="h-4 w-4 mr-2" />
            Funções e permissões
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Novo usuário
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="text-sm text-muted-foreground">{filteredUsers?.length ?? 0} usuário(s)</div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : filteredUsers?.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">Nenhum usuário encontrado</p>
          ) : (
            <>
              <div className="divide-y -mx-6 sm:hidden">
                {filteredUsers?.map((u: any) => (
                  <div
                    key={u.id}
                    className="px-6 py-4 space-y-2 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => openEdit(u)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(u); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={(e) => { e.stopPropagation(); handleDelete(u.id); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={roleBadgeClass(u)}>
                        <Shield className="h-3 w-3 mr-1" />
                        {roleLabel(u)}
                      </Badge>
                      {u.active ? (
                        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
                          <XCircle className="h-3 w-3 mr-1" /> Inativo
                        </Badge>
                      )}
                      {u.telefone && (
                        <span className="flex items-center gap-1 text-muted-foreground text-xs">
                          <Phone className="h-3 w-3" /> {u.telefone}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers?.map((u: any) => (
                      <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(u)}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={roleBadgeClass(u)}>
                            <Shield className="h-3 w-3 mr-1" />
                            {roleLabel(u)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.active ? (
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
                              <XCircle className="h-3 w-3 mr-1" /> Inativo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.telefone ? (
                            <span className="flex items-center gap-1 text-muted-foreground text-sm">
                              <Phone className="h-3 w-3" /> {u.telefone}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(u); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={(e) => { e.stopPropagation(); handleDelete(u.id); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Nome completo</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((s) => ({ ...s, name: e.target.value }))}
                placeholder="Nome do usuário"
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((s) => ({ ...s, email: e.target.value }))}
                placeholder="email@empresa.com"
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={formData.telefone}
                onChange={(e) => setFormData((s) => ({ ...s, telefone: e.target.value }))}
                placeholder="(11) 98765-4321"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <Label>Função</Label>
                <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={openFunctionsManager}>
                  Gerenciar funções
                </Button>
              </div>
              <Select value={selectedFunctionValue} onValueChange={handleFunctionSelection}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma função" />
                </SelectTrigger>
                <SelectContent>
                  {BUILTIN_FUNCTIONS.map((functionKey) => (
                    <SelectItem key={functionKey} value={functionKey}>
                      {FUNCAO_LABELS[functionKey]}
                    </SelectItem>
                  ))}
                  {customFunctions
                    .filter((definition) => definition.active || definition.id === formData.customFunctionId)
                    .map((definition) => (
                      <SelectItem
                        key={definition.id}
                        value={`custom:${definition.id}`}
                        disabled={!definition.active}
                      >
                        {definition.name}{!definition.active ? " (inativa)" : ""}
                      </SelectItem>
                    ))}
                  <SelectItem value="__create__">＋ Criar nova função</SelectItem>
                  <SelectItem value="__manage__">Gerenciar funções e permissões</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-base">Acessos do usuário</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    A função preenche os acessos padrão. Você pode fazer exceções para este usuário.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData((s) => ({ ...s, permissions: USER_MODULES.map((m) => m.key) }))}
                  >
                    Marcar todos
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData((s) => ({ ...s, permissions: [] }))}
                  >
                    Limpar
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {USER_MODULES.map((module) => {
                  const checked = formData.permissions.includes(module.key);
                  return (
                    <label
                      key={module.key}
                      className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setFormData((s) => ({
                            ...s,
                            permissions: value
                              ? Array.from(new Set([...s.permissions, module.key]))
                              : s.permissions.filter((key) => key !== module.key),
                          }))
                        }
                      />
                      <span className="text-sm font-medium">{module.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {!editingUser && (
              <div>
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData((s) => ({ ...s, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit}>{editingUser ? "Salvar alterações" : "Criar usuário"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={functionsOpen} onOpenChange={(open) => { setFunctionsOpen(open); if (!open) setShowFunctionEditor(false); }}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4 pr-8">
              <div>
                <DialogTitle>Funções e permissões</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Crie cargos da sua empresa e defina os acessos padrão de cada um.
                </p>
              </div>
              {!showFunctionEditor && (
                <Button onClick={() => openNewFunction(false)}>
                  <Plus className="h-4 w-4 mr-2" /> Nova função
                </Button>
              )}
            </div>
          </DialogHeader>

          {showFunctionEditor ? (
            <div className="space-y-5 py-2">
              <div className="rounded-lg border p-4 space-y-4">
                <div>
                  <h3 className="font-semibold">{editingFunction ? "Editar função" : "Nova função"}</h3>
                  <p className="text-sm text-muted-foreground">
                    Essas permissões serão aplicadas automaticamente ao escolher esta função em um usuário.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Nome da função</Label>
                    <Input
                      value={functionDraft.name}
                      onChange={(e) => setFunctionDraft((current) => ({ ...current, name: e.target.value }))}
                      placeholder="Ex.: Coordenador Comercial"
                    />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input
                      value={functionDraft.description}
                      onChange={(e) => setFunctionDraft((current) => ({ ...current, description: e.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={functionDraft.active}
                    onCheckedChange={(value) => setFunctionDraft((current) => ({ ...current, active: Boolean(value) }))}
                  />
                  Função ativa e disponível para novos usuários
                </label>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Permissões padrão</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFunctionDraft((current) => ({ ...current, permissions: USER_MODULES.map((m) => m.key) }))}
                      >
                        Marcar todos
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFunctionDraft((current) => ({ ...current, permissions: [] }))}
                      >
                        Limpar
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {USER_MODULES.map((module) => {
                      const checked = functionDraft.permissions.includes(module.key);
                      return (
                        <label key={module.key} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              setFunctionDraft((current) => ({
                                ...current,
                                permissions: value
                                  ? Array.from(new Set([...current.permissions, module.key]))
                                  : current.permissions.filter((key) => key !== module.key),
                              }))
                            }
                          />
                          <span className="text-sm font-medium">{module.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowFunctionEditor(false)}>Cancelar</Button>
                <Button onClick={saveFunction} disabled={savingFunction}>
                  {savingFunction ? "Salvando..." : editingFunction ? "Salvar alterações" : "Criar função"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 py-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Funções padrão do VendorAI</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {BUILTIN_FUNCTIONS.map((functionKey) => (
                    <div key={functionKey} className="rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{FUNCAO_LABELS[functionKey]}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {modulesForFunction(functionKey).length} acesso(s) padrão
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Funções personalizadas da empresa</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">Cada tenant mantém suas próprias funções.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openNewFunction(false)}>
                      <Plus className="h-4 w-4 mr-2" /> Criar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {functionsLoading ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Carregando funções...</p>
                  ) : customFunctions.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center">
                      <Shield className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="font-medium">Nenhuma função personalizada ainda</p>
                      <p className="text-sm text-muted-foreground mt-1">Crie uma função para refletir os cargos reais da empresa.</p>
                      <Button className="mt-4" onClick={() => openNewFunction(false)}>
                        <Plus className="h-4 w-4 mr-2" /> Criar primeira função
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customFunctions.map((definition) => {
                        const usageCount = users?.filter((u: any) => u.customFunctionId === definition.id).length ?? 0;
                        return (
                          <div key={definition.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{definition.name}</span>
                                <Badge variant="outline" className={definition.active ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-600"}>
                                  {definition.active ? "Ativa" : "Inativa"}
                                </Badge>
                                <Badge variant="secondary">{usageCount} usuário(s)</Badge>
                              </div>
                              {definition.description && (
                                <p className="text-sm text-muted-foreground mt-1">{definition.description}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">{definition.permissions.length} módulo(s) liberado(s)</p>
                            </div>
                            <div className="flex flex-wrap gap-1 shrink-0">
                              <Button variant="ghost" size="sm" onClick={() => openEditFunction(definition)} title="Editar função">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => duplicateFunction(definition)} title="Duplicar função">
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => toggleFunction(definition)}>
                                {definition.active ? "Desativar" : "Ativar"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => deleteFunction(definition)}
                                title="Excluir função"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
