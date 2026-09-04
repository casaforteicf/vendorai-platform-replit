import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
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

const ROLE_LABELS_PT: Record<string, string> = {
  vendedor: "Vendedor",
  financeiro: "Financeiro",
  suporte: "Suporte",
  entrega: "Entrega",
  administrador: "Administrador",
  outro: "Outro",
};

const ROLE_LABELS_ES: Record<string, string> = {
  vendedor: "Vendedor",
  financeiro: "Finanzas",
  suporte: "Soporte",
  entrega: "Entregas",
  administrador: "Administrador",
  outro: "Otro",
};

const FUNCAO_BADGES: Record<string, string> = {
  vendedor: "bg-blue-100 text-blue-800 border-blue-200",
  financeiro: "bg-emerald-100 text-emerald-800 border-emerald-200",
  suporte: "bg-amber-100 text-amber-800 border-amber-200",
  entrega: "bg-purple-100 text-purple-800 border-purple-200",
  administrador: "bg-red-100 text-red-800 border-red-200",
  outro: "bg-gray-100 text-gray-800 border-gray-200",
};

const STANDARD_FUNCTIONS: UserFunction[] = [
  "vendedor",
  "financeiro",
  "suporte",
  "entrega",
  "administrador",
  "outro",
];

const CUSTOM_FUNCTION_PREFIX = "custom:";

const PT_COPY = {
  functionNameRequired: "Nome da função obrigatório",
  functionNameRequiredDescription: "Informe um nome com pelo menos 2 caracteres.",
  selectAccess: "Selecione os acessos",
  selectAccessDescription: "A nova função precisa ter pelo menos um módulo liberado.",
  functionCreated: "Função criada",
  functionSelected: (name: string) => `${name} já foi selecionada para este usuário.`,
  functionCreateError: "Erro ao criar função",
  requiredFields: "Campos obrigatórios",
  requiredFieldsDescription: "Preencha nome e e-mail do usuário.",
  passwordRequired: "Senha obrigatória",
  passwordRequiredDescription: "Defina uma senha para o novo usuário.",
  userUpdated: "Usuário atualizado",
  userUpdatedDescription: "As alterações foram salvas com sucesso.",
  userCreated: "Usuário criado",
  userCreatedDescription: "Novo membro da equipe adicionado com sucesso.",
  saveError: "Erro ao salvar",
  tryAgain: "Tente novamente.",
  deleteConfirm: "Tem certeza que deseja excluir este usuário?",
  userDeleted: "Usuário excluído",
  userDeletedDescription: "O usuário foi removido da equipe.",
  deleteError: "Erro ao excluir",
  title: "Equipe",
  subtitle: "Gerencie os usuários da sua empresa e suas funções",
  newUser: "Novo usuário",
  searchPlaceholder: "Buscar por nome ou e-mail...",
  usersCount: (count: number) => `${count} usuário(s)`,
  loading: "Carregando...",
  empty: "Nenhum usuário encontrado",
  active: "Ativo",
  inactive: "Inativo",
  name: "Nome",
  email: "E-mail",
  role: "Função",
  status: "Status",
  phone: "Telefone",
  actions: "Ações",
  editUser: "Editar usuário",
  fullName: "Nome completo",
  userNamePlaceholder: "Nome do usuário",
  phonePlaceholder: "(11) 98765-4321",
  newFunction: "Nova função",
  selectFunction: "Selecione uma função",
  functionHelp: "Use uma função padrão ou crie um perfil de acesso reutilizável para sua empresa.",
  userAccess: "Acessos do usuário",
  userAccessHelp: "Selecione os módulos que este usuário poderá abrir e utilizar.",
  selectAll: "Marcar todos",
  clear: "Limpar",
  accessRecommendation: "A função aplica um conjunto recomendado. Você pode personalizar os acessos deste usuário depois.",
  password: "Senha",
  passwordPlaceholder: "Mínimo 8 caracteres",
  cancel: "Cancelar",
  saveChanges: "Salvar alterações",
  createUser: "Criar usuário",
  newFunctionDescription: "Crie um perfil de acesso reutilizável. Ele ficará disponível nos próximos cadastros de usuários desta empresa.",
  functionName: "Nome da função",
  functionNamePlaceholder: "Ex.: Gerente comercial",
  defaultAccess: "Acessos padrão",
  defaultAccessHelp: "Defina quais módulos serão aplicados quando esta função for selecionada.",
  createFunction: "Criar função",
} as const;

const ES_COPY = {
  functionNameRequired: "El nombre de la función es obligatorio",
  functionNameRequiredDescription: "Ingresa un nombre de al menos 2 caracteres.",
  selectAccess: "Selecciona los accesos",
  selectAccessDescription: "La nueva función debe tener al menos un módulo habilitado.",
  functionCreated: "Función creada",
  functionSelected: (name: string) => `${name} ya fue seleccionada para este usuario.`,
  functionCreateError: "Error al crear la función",
  requiredFields: "Campos obligatorios",
  requiredFieldsDescription: "Completa el nombre y el correo electrónico del usuario.",
  passwordRequired: "Contraseña obligatoria",
  passwordRequiredDescription: "Define una contraseña para el nuevo usuario.",
  userUpdated: "Usuario actualizado",
  userUpdatedDescription: "Los cambios se guardaron correctamente.",
  userCreated: "Usuario creado",
  userCreatedDescription: "El nuevo miembro del equipo fue agregado correctamente.",
  saveError: "Error al guardar",
  tryAgain: "Inténtalo de nuevo.",
  deleteConfirm: "¿Seguro que deseas eliminar este usuario?",
  userDeleted: "Usuario eliminado",
  userDeletedDescription: "El usuario fue eliminado del equipo.",
  deleteError: "Error al eliminar",
  title: "Equipo",
  subtitle: "Gestiona los usuarios de tu empresa y sus funciones",
  newUser: "Nuevo usuario",
  searchPlaceholder: "Buscar por nombre o correo electrónico...",
  usersCount: (count: number) => `${count} usuario(s)`,
  loading: "Cargando...",
  empty: "No se encontraron usuarios",
  active: "Activo",
  inactive: "Inactivo",
  name: "Nombre",
  email: "Correo electrónico",
  role: "Función",
  status: "Estado",
  phone: "Teléfono",
  actions: "Acciones",
  editUser: "Editar usuario",
  fullName: "Nombre completo",
  userNamePlaceholder: "Nombre del usuario",
  phonePlaceholder: "+00 000 000 000",
  newFunction: "Nueva función",
  selectFunction: "Selecciona una función",
  functionHelp: "Usa una función estándar o crea un perfil de acceso reutilizable para tu empresa.",
  userAccess: "Accesos del usuario",
  userAccessHelp: "Selecciona los módulos que este usuario podrá abrir y utilizar.",
  selectAll: "Seleccionar todos",
  clear: "Limpiar",
  accessRecommendation: "La función aplica un conjunto recomendado. Puedes personalizar los accesos de este usuario después.",
  password: "Contraseña",
  passwordPlaceholder: "Mínimo 8 caracteres",
  cancel: "Cancelar",
  saveChanges: "Guardar cambios",
  createUser: "Crear usuario",
  newFunctionDescription: "Crea un perfil de acceso reutilizable. Estará disponible en los próximos registros de usuarios de esta empresa.",
  functionName: "Nombre de la función",
  functionNamePlaceholder: "Ej.: Gerente comercial",
  defaultAccess: "Accesos predeterminados",
  defaultAccessHelp: "Define qué módulos se aplicarán cuando se seleccione esta función.",
  createFunction: "Crear función",
} as const;

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
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId ?? "";
  const userFunctionsQueryKey = ["tenant-user-functions", tenantId] as const;
  const copy = locale === "pt-BR" ? PT_COPY : ES_COPY;
  const roleLabels = locale === "pt-BR" ? ROLE_LABELS_PT : ROLE_LABELS_ES;

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
    return roleLabels[targetUser.userFunction ?? "outro"] ?? roleLabels.outro;
  }

  function getFunctionBadge(targetUser: any) {
    if (targetUser.customFunctionId) {
      return "bg-slate-100 text-slate-800 border-slate-200";
    }
    return FUNCAO_BADGES[targetUser.userFunction ?? "outro"] ?? FUNCAO_BADGES.outro;
  }

  function moduleLabel(module: (typeof USER_MODULES)[number]) {
    return locale === "pt-BR" ? module.label : module.labelEs;
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
        title: copy.functionNameRequired,
        description: copy.functionNameRequiredDescription,
        variant: "destructive",
      });
      return;
    }

    if (newFunctionPermissions.length === 0) {
      toast({
        title: copy.selectAccess,
        description: copy.selectAccessDescription,
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
          a.name.localeCompare(b.name, locale),
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
        title: copy.functionCreated,
        description: copy.functionSelected(created.name),
      });
    } catch (err: any) {
      toast({
        title: copy.functionCreateError,
        description: err?.message || copy.tryAgain,
        variant: "destructive",
      });
    } finally {
      setCreatingFunction(false);
    }
  }

  async function handleSubmit() {
    if (!formData.name || !formData.email) {
      toast({
        title: copy.requiredFields,
        description: copy.requiredFieldsDescription,
        variant: "destructive",
      });
      return;
    }

    if (!editingUser && !formData.password) {
      toast({
        title: copy.passwordRequired,
        description: copy.passwordRequiredDescription,
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
          title: copy.userUpdated,
          description: copy.userUpdatedDescription,
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
          title: copy.userCreated,
          description: copy.userCreatedDescription,
        });
      }
      queryClient.invalidateQueries({
        queryKey: getListTenantUsersQueryKey(tenantId),
      });
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast({
        title: copy.saveError,
        description: err?.message || copy.tryAgain,
        variant: "destructive",
      });
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm(copy.deleteConfirm)) return;
    try {
      await deleteUser.mutateAsync({ id: userId });
      toast({
        title: copy.userDeleted,
        description: copy.userDeletedDescription,
      });
      queryClient.invalidateQueries({
        queryKey: getListTenantUsersQueryKey(tenantId),
      });
    } catch (err: any) {
      toast({
        title: copy.deleteError,
        description: err?.message || copy.tryAgain,
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
            {copy.title}
          </h1>
          <p className="text-muted-foreground mt-1">{copy.subtitle}</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
        >
          <UserPlus className="h-4 w-4 mr-2" />
          {copy.newUser}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={copy.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {copy.usersCount(filteredUsers?.length ?? 0)}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{copy.loading}</div>
          ) : filteredUsers?.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">{copy.empty}</p>
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
                          {copy.active}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-gray-100 text-gray-800 border-gray-200"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          {copy.inactive}
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
                      <TableHead>{copy.name}</TableHead>
                      <TableHead>{copy.email}</TableHead>
                      <TableHead>{copy.role}</TableHead>
                      <TableHead>{copy.status}</TableHead>
                      <TableHead>{copy.phone}</TableHead>
                      <TableHead className="text-right">{copy.actions}</TableHead>
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
                              {copy.active}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-gray-100 text-gray-800 border-gray-200"
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              {copy.inactive}
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
            <DialogTitle>{editingUser ? copy.editUser : copy.newUser}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>{copy.fullName}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((current) => ({ ...current, name: e.target.value }))}
                placeholder={copy.userNamePlaceholder}
              />
            </div>
            <div>
              <Label>{copy.email}</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((current) => ({ ...current, email: e.target.value }))}
                placeholder="email@empresa.com"
              />
            </div>
            <div>
              <Label>{copy.phone}</Label>
              <Input
                value={formData.telefone}
                onChange={(e) =>
                  setFormData((current) => ({ ...current, telefone: e.target.value }))
                }
                placeholder={copy.phonePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>{copy.role}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={openNewFunctionDialog}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {copy.newFunction}
                </Button>
              </div>
              <Select value={functionSelectValue} onValueChange={handleFunctionChange}>
                <SelectTrigger>
                  <SelectValue placeholder={copy.selectFunction} />
                </SelectTrigger>
                <SelectContent>
                  {STANDARD_FUNCTIONS.map((standardFunction) => (
                    <SelectItem key={standardFunction} value={standardFunction}>
                      {roleLabels[standardFunction]}
                    </SelectItem>
                  ))}
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
              <p className="text-xs text-muted-foreground">{copy.functionHelp}</p>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-base">{copy.userAccess}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{copy.userAccessHelp}</p>
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
                    {copy.selectAll}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setFormData((current) => ({ ...current, permissions: [] }))
                    }
                  >
                    {copy.clear}
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
                      <span className="text-sm font-medium">{moduleLabel(module)}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{copy.accessRecommendation}</p>
            </div>

            {!editingUser && (
              <div>
                <Label>{copy.password}</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((current) => ({ ...current, password: e.target.value }))
                  }
                  placeholder={copy.passwordPlaceholder}
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
              {copy.cancel}
            </Button>
            <Button onClick={handleSubmit} disabled={createUser.isPending || updateUser.isPending}>
              {(createUser.isPending || updateUser.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingUser ? copy.saveChanges : copy.createUser}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={functionDialogOpen} onOpenChange={setFunctionDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.newFunction}</DialogTitle>
            <DialogDescription>{copy.newFunctionDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{copy.functionName}</Label>
              <Input
                value={newFunctionName}
                onChange={(e) => setNewFunctionName(e.target.value)}
                placeholder={copy.functionNamePlaceholder}
                autoFocus
              />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-base">{copy.defaultAccess}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{copy.defaultAccessHelp}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewFunctionPermissions(USER_MODULES.map((module) => module.key))}
                  >
                    {copy.selectAll}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewFunctionPermissions([])}
                  >
                    {copy.clear}
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
                      <span className="text-sm font-medium">{moduleLabel(module)}</span>
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
              {copy.cancel}
            </Button>
            <Button type="button" onClick={handleCreateFunction} disabled={creatingFunction}>
              {creatingFunction && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {copy.createFunction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
