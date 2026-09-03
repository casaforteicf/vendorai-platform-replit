import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  useListTenantUsers,
  getListTenantUsersQueryKey,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  UserFunction,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  Plus,
  Loader2,
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

const CUSTOM_FUNCTION_PREFIX = "custom:";

interface TenantUserFunction {
  id: string;
  tenantId: string;
  name: string;
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
}

export default function Usuarios() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId ?? "";
  const userFunctionsQueryKey = ["tenant-user-functions", tenantId] as const;

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [functionDialogOpen, setFunctionDialogOpen] = useState(false);
  const [newFunctionName, setNewFunctionName] = useState("");
  const [newFunctionPermissions, setNewFunctionPermissions] = useState<UserModuleKey[]>([]);
  const [creatingFunction, setCreatingFunction] = useState(false);
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
  const { data: tenantFunctions = [] } = useQuery({
    queryKey: userFunctionsQueryKey,
    enabled: Boolean(tenantId),
    queryFn: () =>
      customFetch<TenantUserFunction[]>(`/api/tenants/${tenantId}/user-functions`, {
        responseType: "json",
      }),
  });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const filteredUsers = users?.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()),
  );

  function getCustomFunction(customFunctionId?: string | null) {
    if (!customFunctionId) return undefined;
    return tenantFunctions.find((item) => item.id === customFunctionId);
  }

  function getFunctionLabel(targetUser: any) {
    const customFunction = getCustomFunction(targetUser.customFunctionId);
    if (customFunction) return customFunction.name;
    return FUNCAO_LABELS[targetUser.userFunction ?? "outro"] ?? "Outro";
  }

  function getFunctionBadge(targetUser: any) {
    if (targetUser.customFunctionId) {
      return "bg-slate-100 text-slate-800 border-slate-200";
    }
    return FUNCAO_BADGES[targetUser.userFunction ?? "outro"] ?? FUNCAO_BADGES.outro;
  }

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

  function openEdit(targetUser: any) {
    setEditingUser(targetUser);
    setFormData({
      name: targetUser.name ?? "",
      email: targetUser.email ?? "",
      telefone: targetUser.telefone ?? "",
      userFunction: targetUser.userFunction ?? "outro",
      customFunctionId: targetUser.customFunctionId ?? null,
      permissions: Array.isArray(targetUser.permissions)
        ? targetUser.permissions
        : modulesForFunction(targetUser.userFunction ?? "outro"),
      password: "",
    });
    setDialogOpen(true);
  }

  function openNewFunctionDialog() {
    setNewFunctionName("");
    setNewFunctionPermissions([]);
    setFunctionDialogOpen(true);
  }

  function handleFunctionChange(value: string) {
    if (value.startsWith(CUSTOM_FUNCTION_PREFIX)) {
      const customFunctionId = value.slice(CUSTOM_FUNCTION_PREFIX.length);
      const customFunction = getCustomFunction(customFunctionId);
      if (!customFunction) return;
      setFormData((current) => ({
        ...current,
        userFunction: "outro",
        customFunctionId: customFunction.id,
        permissions: customFunction.permissions.filter((permission): permission is UserModuleKey =>
          USER_MODULES.some((module) => module.key === permission),
        ),
      }));
      return;
    }

    const userFunction = value as UserFunction;
    setFormData((current) => ({
      ...current,
      userFunction,
      customFunctionId: null,
      permissions: modulesForFunction(userFunction),
    }));
  }

  async function handleCreateFunction() {
    const name = newFunctionName.trim();
    if (name.length < 2) {
      toast({
        title: "Nome da função obrigatório",
        description: "Informe um nome com pelo menos 2 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (newFunctionPermissions.length === 0) {
      toast({
        title: "Selecione os acessos",
        description: "A nova função precisa ter pelo menos um módulo liberado.",
        variant: "destructive",
      });
      return;
    }

    setCreatingFunction(true);
    try {
      const created = await customFetch<TenantUserFunction>(
        `/api/tenants/${tenantId}/user-functions`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            permissions: newFunctionPermissions,
          }),
          responseType: "json",
        },
      );

      queryClient.setQueryData<TenantUserFunction[]>(userFunctionsQueryKey, (current = []) =>
        [...current.filter((item) => item.id !== created.id), created].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR"),
        ),
      );

      setFormData((current) => ({
        ...current,
        userFunction: "outro",
        customFunctionId: created.id,
        permissions: created.permissions.filter((permission): permission is UserModuleKey =>
          USER_MODULES.some((module) => module.key === permission),
        ),
      }));
      setFunctionDialogOpen(false);
      setNewFunctionName("");
      setNewFunctionPermissions([]);
      toast({
        title: "Função criada",
        description: `${created.name} já foi selecionada para este usuário.`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao criar função",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCreatingFunction(false);
    }
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
        await updateUser.mutateAsync({
          id: editingUser.id,
          data: payload,
        });
        toast({
          title: "Usuário atualizado",
          description: "As alterações foram salvas com sucesso.",
        });
      } else {
        await createUser.mutateAsync({
          data: {
            tenantId,
            name: formData.name,
            email: formData.email,
            password: formData.password,
            telefone: formData.telefone || undefined,
            userFunction: formData.userFunction,
            customFunctionId: formData.customFunctionId,
            permissions: formData.permissions,
          } as any,
        });
        toast({
          title: "Usuário criado",
          description: "Novo membro da equipe adicionado com sucesso.",
        });
      }
      queryClient.invalidateQueries({
        queryKey: getListTenantUsersQueryKey(tenantId),
      });
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
      toast({
        title: "Usuário excluído",
        description: "O usuário foi removido da equipe.",
      });
      queryClient.invalidateQueries({
        queryKey: getListTenantUsersQueryKey(tenantId),
      });
    } catch (err: any) {
      toast({
        title: "Erro ao excluir",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  const functionSelectValue = formData.customFunctionId
    ? `${CUSTOM_FUNCTION_PREFIX}${formData.customFunctionId}`
    : formData.userFunction;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Equipe
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os usuários do seu tenant e suas funções
          </p>
        </div>
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
            <div className="text-sm text-muted-foreground">
              {filteredUsers?.length ?? 0} usuário(s)
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : filteredUsers?.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">
              Nenhum usuário encontrado
            </p>
          ) : (
            <>
              <div className="divide-y -mx-6 sm:hidden">
                {filteredUsers?.map((u) => (
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(u);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(u.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={getFunctionBadge(u)}>
                        <Shield className="h-3 w-3 mr-1" />
                        {getFunctionLabel(u)}
                      </Badge>
                      {u.active ? (
                        <Badge
                          variant="outline"
                          className="bg-green-100 text-green-800 border-green-200"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Ativo
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-gray-100 text-gray-800 border-gray-200"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Inativo
                        </Badge>
                      )}
                      {u.telefone && (
                        <span className="flex items-center gap-1 text-muted-foreground text-xs">
                          <Phone className="h-3 w-3" />
                          {u.telefone}
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
                    {filteredUsers?.map((u) => (
                      <TableRow
                        key={u.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openEdit(u)}
                      >
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getFunctionBadge(u)}>
                            <Shield className="h-3 w-3 mr-1" />
                            {getFunctionLabel(u)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.active ? (
                            <Badge
                              variant="outline"
                              className="bg-green-100 text-green-800 border-green-200"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Ativo
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-gray-100 text-gray-800 border-gray-200"
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Inativo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.telefone ? (
                            <span className="flex items-center gap-1 text-muted-foreground text-sm">
                              <Phone className="h-3 w-3" />
                              {u.telefone}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(u);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(u.id);
                              }}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Nome completo</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((current) => ({ ...current, name: e.target.value }))}
                placeholder="Nome do usuário"
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((current) => ({ ...current, email: e.target.value }))}
                placeholder="email@empresa.com"
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={formData.telefone}
                onChange={(e) =>
                  setFormData((current) => ({ ...current, telefone: e.target.value }))
                }
                placeholder="(11) 98765-4321"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Função</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={openNewFunctionDialog}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Nova função
                </Button>
              </div>
              <Select value={functionSelectValue} onValueChange={handleFunctionChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="suporte">Suporte</SelectItem>
                  <SelectItem value="entrega">Entrega</SelectItem>
                  <SelectItem value="administrador">Administrador</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                  {tenantFunctions.map((customFunction) => (
                    <SelectItem
                      key={customFunction.id}
                      value={`${CUSTOM_FUNCTION_PREFIX}${customFunction.id}`}
                    >
                      {customFunction.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Use uma função padrão ou crie um perfil de acesso reutilizável para sua empresa.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-base">Acessos do usuário</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Selecione os módulos que este usuário poderá abrir e utilizar.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setFormData((current) => ({
                        ...current,
                        permissions: USER_MODULES.map((module) => module.key),
                      }))
                    }
                  >
                    Marcar todos
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setFormData((current) => ({ ...current, permissions: [] }))
                    }
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
                          setFormData((current) => ({
                            ...current,
                            permissions: value
                              ? [...current.permissions, module.key]
                              : current.permissions.filter((key) => key !== module.key),
                          }))
                        }
                      />
                      <span className="text-sm font-medium">{module.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                A função aplica um conjunto recomendado. Você pode personalizar os acessos deste usuário depois.
              </p>
            </div>

            {!editingUser && (
              <div>
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((current) => ({ ...current, password: e.target.value }))
                  }
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createUser.isPending || updateUser.isPending}>
              {(createUser.isPending || updateUser.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingUser ? "Salvar alterações" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={functionDialogOpen} onOpenChange={setFunctionDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova função</DialogTitle>
            <DialogDescription>
              Crie um perfil de acesso reutilizável. Ele ficará disponível nos próximos cadastros de usuários desta empresa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da função</Label>
              <Input
                value={newFunctionName}
                onChange={(e) => setNewFunctionName(e.target.value)}
                placeholder="Ex.: Gerente comercial"
                autoFocus
              />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-base">Acessos padrão</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Defina quais módulos serão aplicados quando esta função for selecionada.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewFunctionPermissions(USER_MODULES.map((module) => module.key))}
                  >
                    Marcar todos
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewFunctionPermissions([])}
                  >
                    Limpar
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {USER_MODULES.map((module) => {
                  const checked = newFunctionPermissions.includes(module.key);
                  return (
                    <label
                      key={module.key}
                      className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setNewFunctionPermissions((current) =>
                            value
                              ? [...current, module.key]
                              : current.filter((key) => key !== module.key),
                          )
                        }
                      />
                      <span className="text-sm font-medium">{module.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFunctionDialogOpen(false)}
              disabled={creatingFunction}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreateFunction} disabled={creatingFunction}>
              {creatingFunction && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar função
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
