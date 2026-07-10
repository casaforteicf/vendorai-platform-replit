import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
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
  CardTitle,
} from "@/components/ui/card";
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

export default function Usuarios() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId ?? "";

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    telefone: "",
    userFunction: "outro" as UserFunction,
    password: "",
  });

  const { data: users, isLoading } = useListTenantUsers(tenantId);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const filteredUsers = users?.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  function resetForm() {
    setFormData({
      name: "",
      email: "",
      telefone: "",
      userFunction: "outro",
      password: "",
    });
    setEditingUser(null);
  }

  function openEdit(user: any) {
    setEditingUser(user);
    setFormData({
      name: user.name ?? "",
      email: user.email ?? "",
      telefone: user.telefone ?? "",
      userFunction: user.userFunction ?? "outro",
      password: "",
    });
    setDialogOpen(true);
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
          },
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
            <div className="text-center py-12 text-muted-foreground">
              Carregando...
            </div>
          ) : filteredUsers?.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">Nenhum usuário encontrado</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="divide-y -mx-6 sm:hidden">
                {filteredUsers?.map((u) => (
                  <div key={u.id} className="px-6 py-4 space-y-2 cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => openEdit(u)}>
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
                      <Badge
                        variant="outline"
                        className={FUNCAO_BADGES[u.userFunction ?? "outro"] ?? FUNCAO_BADGES.outro}
                      >
                        <Shield className="h-3 w-3 mr-1" />
                        {FUNCAO_LABELS[u.userFunction ?? "outro"]}
                      </Badge>
                      {u.active ? (
                        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
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

              {/* Desktop table */}
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
                      <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(u)}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              FUNCAO_BADGES[u.userFunction ?? "outro"] ??
                              FUNCAO_BADGES.outro
                            }
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            {FUNCAO_LABELS[u.userFunction ?? "outro"]}
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
                              onClick={(e) => { e.stopPropagation(); openEdit(u); }}
                            >
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Editar usuário" : "Novo usuário"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Nome completo</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData((s) => ({ ...s, name: e.target.value }))
                }
                placeholder="Nome do usuário"
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData((s) => ({ ...s, email: e.target.value }))
                }
                placeholder="email@empresa.com"
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={formData.telefone}
                onChange={(e) =>
                  setFormData((s) => ({ ...s, telefone: e.target.value }))
                }
                placeholder="(11) 98765-4321"
              />
            </div>
            <div>
              <Label>Função</Label>
              <Select
                value={formData.userFunction}
                onValueChange={(v) =>
                  setFormData((s) => ({
                    ...s,
                    userFunction: v as UserFunction,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="suporte">Suporte</SelectItem>
                  <SelectItem value="entrega">Entrega</SelectItem>
                  <SelectItem value="administrador">
                    Administrador
                  </SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!editingUser && (
              <div>
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((s) => ({ ...s, password: e.target.value }))
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
            <Button onClick={handleSubmit}>
              {editingUser ? "Salvar alterações" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
