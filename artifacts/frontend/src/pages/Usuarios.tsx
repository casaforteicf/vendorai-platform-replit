import { useMemo, useState } from "react";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { USER_MODULES, modulesForFunction, type UserModuleKey } from "@/lib/moduleAccess";
import { ProspectorLocationMap, type ProspectorGeoArea } from "@/components/ProspectorLocationMap";
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
  MapPin,
  MoreHorizontal,
  UserCheck,
  UserX,
  KeyRound,
  BriefcaseBusiness,
} from "lucide-react";

const ROLE_LABELS_PT: Record<string, string> = {
  vendedor: "Vendedor",
  representante_comercial: "Representante Comercial",
  financeiro: "Financeiro",
  suporte: "Suporte",
  entrega: "Entrega",
  administrador: "Administrador",
  outro: "Outro",
};

const ROLE_LABELS_ES: Record<string, string> = {
  vendedor: "Vendedor",
  representante_comercial: "Representante Comercial",
  financeiro: "Finanzas",
  suporte: "Soporte",
  entrega: "Entregas",
  administrador: "Administrador",
  outro: "Otro",
};

const FUNCAO_BADGES: Record<string, string> = {
  vendedor: "bg-blue-100 text-blue-800 border-blue-200",
  representante_comercial: "bg-cyan-100 text-cyan-800 border-cyan-200",
  financeiro: "bg-emerald-100 text-emerald-800 border-emerald-200",
  suporte: "bg-amber-100 text-amber-800 border-amber-200",
  entrega: "bg-purple-100 text-purple-800 border-purple-200",
  administrador: "bg-red-100 text-red-800 border-red-200",
  outro: "bg-gray-100 text-gray-800 border-gray-200",
};

const STANDARD_FUNCTIONS: UserFunction[] = [
  "vendedor",
  "representante_comercial",
  "financeiro",
  "suporte",
  "entrega",
  "administrador",
  "outro",
];

const CUSTOM_FUNCTION_PREFIX = "custom:";
const STANDARD_FUNCTION_PREFIX = "standard:";

type StatusFilter = "all" | "active" | "inactive";
type LeadFilter = "all" | "yes" | "no";

const PT_COPY = {
  functionNameRequired: "Nome da função obrigatório",
  functionNameRequiredDescription: "Informe um nome com pelo menos 2 caracteres.",
  selectAccess: "Selecione os acessos",
  selectAccessDescription: "A nova função precisa ter pelo menos um módulo liberado.",
  functionCreated: "Função criada",
  functionUpdated: "Função atualizada",
  functionUpdatedDescription: "Nome e acessos padrão foram atualizados.",
  functionDeleted: "Função excluída",
  functionDeletedDescription: "A função personalizada foi removida.",
  nativeFunctionRestored: "Função nativa restaurada",
  nativeFunctionRestoredDescription: "A função continua disponível com o nome e acessos padrão do sistema.",
  functionSelected: (name: string) => `${name} já foi selecionada para este usuário.`,
  functionCreateError: "Erro ao criar função",
  functionUpdateError: "Erro ao atualizar função",
  functionDeleteError: "Erro ao excluir função",
  manageFunctions: "Gerenciar",
  manageFunctionsTitle: "Gerenciar funções",
  manageFunctionsDescription: "Gerencie funções nativas e personalizadas da empresa. Funções nativas podem ser editadas e restauradas ao padrão.",
  noCustomFunctions: "Nenhuma função personalizada criada.",
  editFunction: "Editar função",
  deleteFunction: "Excluir função",
  deleteFunctionTitle: "Excluir função?",
  deleteFunctionDescription: (name: string) => `A função ${name} será excluída. Usuários vinculados precisam ser alterados antes.`,
  saveFunction: "Salvar função",
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
  userDeleted: "Usuário excluído",
  userDeletedDescription: "O usuário foi removido da equipe.",
  deleteError: "Erro ao excluir",
  title: "Equipe",
  subtitle: "Gerencie usuários, acessos, funções e distribuição de atendimento.",
  newUser: "Novo usuário",
  searchPlaceholder: "Buscar nome, e-mail, telefone ou função...",
  usersCount: (count: number) => `${count} usuário(s)`,
  loading: "Carregando...",
  empty: "Nenhum usuário encontrado com estes filtros.",
  active: "Ativo",
  inactive: "Inativo",
  name: "Nome",
  role: "Função",
  status: "Status",
  actions: "Ações",
  editUser: "Editar usuário",
  fullName: "Nome completo",
  email: "E-mail",
  phone: "Telefone",
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
  newPassword: "Nova senha (opcional)",
  newPasswordHelp: "Preencha somente quando quiser redefinir a senha deste usuário.",
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
  representativeCompany: "Empresa representante",
  representativeCompanyHelp: "Ative quando esta função for ocupada por outra empresa que representa esta empresa, como se fosse um vendedor externo.",
  linkedTenantCode: "Empresa representante",
  linkedTenantCodePlaceholder: "Buscar empresa pelo nome ou código Vendor.ai...",
  linkedTenantCodeHelp: "Selecione um tenant já cadastrado no Vendor.ai. Nenhuma nova empresa será criada.",
  linkedTenantSearchEmpty: "Digite pelo menos 2 caracteres para buscar uma empresa.",
  linkedTenantNoResults: "Nenhum tenant ativo encontrado.",
  linkedTenantSelected: "Empresa vinculada",
  representativeUsers: "Usuários autorizados da representante",
  representativeUsersHelp: "Selecione quais usuários ativos dessa empresa poderão atuar nesta representação.",
  representativeUsersEmpty: "Nenhum usuário ativo encontrado neste tenant.",
  representativeLeadScope: "Escopo dos leads desta empresa",
  representativeLeadAssigned: "Somente leads atribuídos à representação",
  representativeLeadTerritory: "Leads do território autorizado",
  representativeLeadAll: "Todos os leads autorizados",
  leadAssignmentTitle: "Distribuição de atendimento",
  leadAssignmentHelp: "Controle quem pode aparecer como responsável e participar da distribuição automática de leads.",
  leadAssignmentEnabled: "Pode receber leads e aparecer como responsável",
  leadAssignmentEnabledHelp: "Desative para financeiro, suporte, entrega ou qualquer usuário que não faça atendimento comercial.",
  cities: "Cidades atendidas",
  citiesPlaceholder: "Ex.: Chapecó, Xanxerê, Concórdia",
  regions: "Regiões / UFs atendidas",
  regionsPlaceholder: "Ex.: Oeste de SC, SC, PR",
  territoryHelp: "Separe por vírgula. Cidade tem prioridade sobre região. Se ambos ficarem vazios, o usuário participa do rodízio geral.",
  segments: "Linhas / segmentos atendidos",
  segmentsPlaceholder: "Ex.: Óleos & Lubrificantes, Peças de Motor",
  segmentsHelp: "Opcional. Se preenchido, o usuário só recebe automaticamente leads dessas linhas.",
  baseAddress: "Endereço-base (opcional)",
  baseAddressPlaceholder: "Ex.: Rua Marechal Deodoro, 1200, Chapecó",
  raioKm: "Raio de atendimento (km)",
  raioKmPlaceholder: "Ex.: 15",
  raioHelp: "Use o raio quando cidade ou região não forem suficientes para separar responsáveis na mesma área.",
  currentPoint: "Ponto atual salvo",
  receivesLeads: "Atende leads",
  distribution: "Distribuição",
  generalRotation: "Rodízio geral",
  noDistribution: "Não participa",
  accountStatus: "Status da conta",
  accountStatusHelp: "Usuários inativos preservam histórico e atribuições, mas não devem operar o sistema.",
  tabData: "Dados",
  tabAccess: "Acessos",
  tabDistribution: "Distribuição",
  tabSecurity: "Segurança",
  metricUsers: "Usuários",
  metricActive: "Ativos",
  metricAdmins: "Administradores",
  metricLeads: "Recebem leads",
  allFunctions: "Todas as funções",
  allStatuses: "Todos os status",
  allLeadModes: "Todos os atendimentos",
  onlyLead: "Recebem leads",
  withoutLead: "Não recebem leads",
  editAction: "Editar usuário",
  passwordAction: "Alterar senha",
  activateAction: "Ativar usuário",
  deactivateAction: "Desativar usuário",
  deleteAction: "Excluir usuário",
  deleteTitle: "Excluir usuário?",
  deleteDescription: (name: string) => `Você está prestes a excluir ${name}. O histórico existente deve ser preservado nas entidades relacionadas, mas o acesso será removido.`,
  statusUpdated: "Status atualizado",
  statusUpdatedDescription: (active: boolean) => active ? "O usuário foi ativado." : "O usuário foi desativado.",
  selfDeactivateBlocked: "Você não pode desativar o próprio usuário por esta tela.",
} as const;

const ES_COPY = {
  functionNameRequired: "El nombre de la función es obligatorio",
  functionNameRequiredDescription: "Ingresa un nombre de al menos 2 caracteres.",
  selectAccess: "Selecciona los accesos",
  selectAccessDescription: "La nueva función debe tener al menos un módulo habilitado.",
  functionCreated: "Función creada",
  functionUpdated: "Función actualizada",
  functionUpdatedDescription: "El nombre y los accesos predeterminados fueron actualizados.",
  functionDeleted: "Función eliminada",
  functionDeletedDescription: "La función personalizada fue eliminada.",
  nativeFunctionRestored: "Función nativa restaurada",
  nativeFunctionRestoredDescription: "La función sigue disponible con el nombre y los accesos predeterminados del sistema.",
  functionSelected: (name: string) => `${name} ya fue seleccionada para este usuario.`,
  functionCreateError: "Error al crear la función",
  functionUpdateError: "Error al actualizar la función",
  functionDeleteError: "Error al eliminar la función",
  manageFunctions: "Gestionar",
  manageFunctionsTitle: "Gestionar funciones",
  manageFunctionsDescription: "Gestiona funciones nativas y personalizadas de la empresa. Las funciones nativas se pueden editar y restaurar al valor predeterminado.",
  noCustomFunctions: "No hay funciones personalizadas creadas.",
  editFunction: "Editar función",
  deleteFunction: "Eliminar función",
  deleteFunctionTitle: "¿Eliminar función?",
  deleteFunctionDescription: (name: string) => `La función ${name} será eliminada. Los usuarios vinculados deben cambiarse antes.`,
  saveFunction: "Guardar función",
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
  userDeleted: "Usuario eliminado",
  userDeletedDescription: "El usuario fue eliminado del equipo.",
  deleteError: "Error al eliminar",
  title: "Equipo",
  subtitle: "Gestiona usuarios, accesos, funciones y distribución de atención.",
  newUser: "Nuevo usuario",
  searchPlaceholder: "Buscar nombre, correo, teléfono o función...",
  usersCount: (count: number) => `${count} usuario(s)`,
  loading: "Cargando...",
  empty: "No se encontraron usuarios con estos filtros.",
  active: "Activo",
  inactive: "Inactivo",
  name: "Nombre",
  role: "Función",
  status: "Estado",
  actions: "Acciones",
  editUser: "Editar usuario",
  fullName: "Nombre completo",
  email: "Correo electrónico",
  phone: "Teléfono",
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
  newPassword: "Nueva contraseña (opcional)",
  newPasswordHelp: "Completa solo cuando quieras restablecer la contraseña de este usuario.",
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
  representativeCompany: "Empresa representante",
  representativeCompanyHelp: "Activa cuando esta función sea ocupada por otra empresa que representa a esta empresa, como un vendedor externo.",
  linkedTenantCode: "Empresa representante",
  linkedTenantCodePlaceholder: "Buscar empresa por nombre o código Vendor.ai...",
  linkedTenantCodeHelp: "Selecciona un tenant ya registrado en Vendor.ai. No se creará una empresa nueva.",
  linkedTenantSearchEmpty: "Escribe al menos 2 caracteres para buscar una empresa.",
  linkedTenantNoResults: "No se encontró ningún tenant activo.",
  linkedTenantSelected: "Empresa vinculada",
  representativeUsers: "Usuarios autorizados de la representante",
  representativeUsersHelp: "Selecciona qué usuarios activos de esa empresa podrán actuar en esta representación.",
  representativeUsersEmpty: "No se encontraron usuarios activos en este tenant.",
  representativeLeadScope: "Alcance de leads de esta empresa",
  representativeLeadAssigned: "Solo leads asignados a la representación",
  representativeLeadTerritory: "Leads del territorio autorizado",
  representativeLeadAll: "Todos los leads autorizados",
  leadAssignmentTitle: "Distribución de atención",
  leadAssignmentHelp: "Controla quién puede aparecer como responsable y participar de la distribución automática de leads.",
  leadAssignmentEnabled: "Puede recibir leads y aparecer como responsable",
  leadAssignmentEnabledHelp: "Desactiva esta opción para usuarios que no realizan atención comercial.",
  cities: "Ciudades atendidas",
  citiesPlaceholder: "Ej.: Asunción, Luque, San Lorenzo",
  regions: "Regiones / departamentos",
  regionsPlaceholder: "Ej.: Central, Alto Paraná",
  territoryHelp: "Separa con comas. La ciudad tiene prioridad sobre la región. Si ambos quedan vacíos, el usuario participa en la rotación general.",
  segments: "Líneas / segmentos atendidos",
  segmentsPlaceholder: "Ej.: Aceites y lubricantes, Piezas de motor",
  segmentsHelp: "Opcional. Si se completa, el usuario solo recibe automáticamente leads de esas líneas.",
  baseAddress: "Dirección base (opcional)",
  baseAddressPlaceholder: "Ej.: Av. Mariscal López 1200, Asunción",
  raioKm: "Radio de atención (km)",
  raioKmPlaceholder: "Ej.: 15",
  raioHelp: "Usa el radio cuando ciudad o región no sean suficientes para separar responsables en la misma zona.",
  currentPoint: "Punto actual guardado",
  receivesLeads: "Atiende leads",
  distribution: "Distribución",
  generalRotation: "Rotación general",
  noDistribution: "No participa",
  accountStatus: "Estado de la cuenta",
  accountStatusHelp: "Los usuarios inactivos conservan historial y asignaciones, pero no deben operar el sistema.",
  tabData: "Datos",
  tabAccess: "Accesos",
  tabDistribution: "Distribución",
  tabSecurity: "Seguridad",
  metricUsers: "Usuarios",
  metricActive: "Activos",
  metricAdmins: "Administradores",
  metricLeads: "Reciben leads",
  allFunctions: "Todas las funciones",
  allStatuses: "Todos los estados",
  allLeadModes: "Todas las atenciones",
  onlyLead: "Reciben leads",
  withoutLead: "No reciben leads",
  editAction: "Editar usuario",
  passwordAction: "Cambiar contraseña",
  activateAction: "Activar usuario",
  deactivateAction: "Desactivar usuario",
  deleteAction: "Eliminar usuario",
  deleteTitle: "¿Eliminar usuario?",
  deleteDescription: (name: string) => `Estás por eliminar a ${name}. El historial existente debe conservarse en las entidades relacionadas, pero el acceso será removido.`,
  statusUpdated: "Estado actualizado",
  statusUpdatedDescription: (active: boolean) => active ? "El usuario fue activado." : "El usuario fue desactivado.",
  selfDeactivateBlocked: "No puedes desactivar tu propio usuario desde esta pantalla.",
} as const;

interface RepresentativeTenantOption {
  id: string;
  name: string;
  tenantCode: string;
}

interface RepresentativeTenantUser {
  id: string;
  name: string;
  active: boolean;
  userFunction?: UserFunction | null;
}

interface CommercialPartnership {
  id: string;
  ownerTenantId: string;
  partnerTenantId: string;
  partnerName?: string | null;
  partnerTenantCode?: string | null;
  relationshipType: string;
  status: string;
  defaultCommissionPercent: string;
  defaultPermissions: string[];
  authorizedUserIds: string[];
  distributionMode: string;
}

interface TenantUserFunction {
  id: string;
  tenantId: string;
  name: string;
  systemKey?: UserFunction | null;
  permissions: string[];
  kind?: "internal" | "external_company";
  linkedTenantId?: string | null;
  linkedTenantCode?: string | null;
  leadAccessScope?: "assigned" | "territory" | "all_authorized";
  representativeUserIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

function parseTerritories(value: string): string[] {
  return [...new Set(value.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function legacyCanReceiveLeads(targetUser: any): boolean {
  if (targetUser?.leadAssignmentEnabled === false) return false;
  if (targetUser?.leadAssignmentEnabled === true) return true;
  return targetUser?.platformRole === "tenant_seller" || targetUser?.userFunction === "vendedor" || targetUser?.userFunction === "representante_comercial";
}

function isAdministrator(targetUser: any): boolean {
  return targetUser?.platformRole === "tenant_admin" || targetUser?.userFunction === "administrador";
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [functionFilter, setFunctionFilter] = useState("all");
  const [leadFilter, setLeadFilter] = useState<LeadFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState("dados");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [statusUpdatingUserId, setStatusUpdatingUserId] = useState<string | null>(null);
  const [functionDialogOpen, setFunctionDialogOpen] = useState(false);
  const [manageFunctionsOpen, setManageFunctionsOpen] = useState(false);
  const [editingFunction, setEditingFunction] = useState<TenantUserFunction | null>(null);
  const [editingStandardFunction, setEditingStandardFunction] = useState<UserFunction | null>(null);
  const [deleteFunctionTarget, setDeleteFunctionTarget] = useState<TenantUserFunction | null>(null);
  const [newFunctionName, setNewFunctionName] = useState("");
  const [newFunctionPermissions, setNewFunctionPermissions] = useState<UserModuleKey[]>([]);
  const [newFunctionKind, setNewFunctionKind] = useState<"internal" | "external_company">("internal");
  const [newFunctionLinkedTenantCode, setNewFunctionLinkedTenantCode] = useState("");
  const [newFunctionLinkedTenantId, setNewFunctionLinkedTenantId] = useState("");
  const [newFunctionTenantSearch, setNewFunctionTenantSearch] = useState("");
  const [newFunctionRepresentativeUserIds, setNewFunctionRepresentativeUserIds] = useState<string[]>([]);
  const [newFunctionLeadAccessScope, setNewFunctionLeadAccessScope] = useState<"assigned" | "territory" | "all_authorized">("assigned");
  const [creatingFunction, setCreatingFunction] = useState(false);
  const [partnershipDialogOpen, setPartnershipDialogOpen] = useState(false);
  const [partnershipSearch, setPartnershipSearch] = useState("");
  const [partnershipTenantId, setPartnershipTenantId] = useState("");
  const [partnershipTenantCode, setPartnershipTenantCode] = useState("");
  const [partnershipTenantName, setPartnershipTenantName] = useState("");
  const [partnershipAuthorizedUsers, setPartnershipAuthorizedUsers] = useState<string[]>([]);
  const [partnershipCommission, setPartnershipCommission] = useState("15");
  const [creatingPartnership, setCreatingPartnership] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    telefone: "",
    userFunction: "outro" as UserFunction,
    customFunctionId: null as string | null,
    permissions: modulesForFunction("outro") as UserModuleKey[],
    password: "",
    active: true,
    leadAssignmentEnabled: false,
    leadAssignmentCities: "",
    leadAssignmentRegions: "",
    leadAssignmentSegments: "",
    leadAssignmentBaseAddress: "",
    leadAssignmentLat: null as number | null,
    leadAssignmentLng: null as number | null,
    leadAssignmentRaioKm: "",
  });

  const { data: users, isLoading } = useListTenantUsers(tenantId);
  const { data: commercialPartnerships = [] } = useQuery<CommercialPartnership[]>({
    queryKey: ["commercial-partnerships", tenantId],
    enabled: Boolean(tenantId),
    queryFn: () => customFetch<CommercialPartnership[]>(`/api/tenants/${tenantId}/commercial-partnerships`, { responseType: "json" }),
  });
  const normalizedPartnershipSearch = partnershipSearch.trim();
  const { data: partnershipTenantOptions = [], isFetching: searchingPartnershipTenants } = useQuery({
    queryKey: ["commercial-partnership-tenant-search", tenantId, normalizedPartnershipSearch],
    enabled: Boolean(tenantId) && partnershipDialogOpen && normalizedPartnershipSearch.length >= 2,
    queryFn: () => customFetch<RepresentativeTenantOption[]>(
      `/api/tenants/${tenantId}/representative-tenants?search=${encodeURIComponent(normalizedPartnershipSearch)}`,
      { responseType: "json" },
    ),
  });
  const { data: partnershipTenantUsers = [], isFetching: loadingPartnershipUsers } = useQuery({
    queryKey: ["commercial-partnership-users-picker", tenantId, partnershipTenantId],
    enabled: Boolean(tenantId) && partnershipDialogOpen && Boolean(partnershipTenantId),
    queryFn: () => customFetch<RepresentativeTenantUser[]>(
      `/api/tenants/${tenantId}/representative-tenants/${partnershipTenantId}/users`,
      { responseType: "json" },
    ),
  });
  const { data: tenantFunctions = [] } = useQuery({
    queryKey: userFunctionsQueryKey,
    enabled: Boolean(tenantId),
    queryFn: () =>
      customFetch<TenantUserFunction[]>(`/api/tenants/${tenantId}/user-functions`, {
        responseType: "json",
      }),
  });
  const representativeTenantSearch = newFunctionTenantSearch.trim();
  const { data: representativeTenantOptions = [], isFetching: searchingRepresentativeTenants } = useQuery({
    queryKey: ["representative-tenants", tenantId, representativeTenantSearch],
    enabled: Boolean(tenantId) && newFunctionKind === "external_company" && representativeTenantSearch.length >= 2,
    queryFn: () =>
      customFetch<RepresentativeTenantOption[]>(
        `/api/tenants/${tenantId}/representative-tenants?search=${encodeURIComponent(representativeTenantSearch)}`,
        { responseType: "json" },
      ),
  });
  const { data: representativeTenantUsers = [], isFetching: loadingRepresentativeUsers } = useQuery({
    queryKey: ["representative-tenant-users", tenantId, newFunctionLinkedTenantId],
    enabled: Boolean(tenantId) && newFunctionKind === "external_company" && Boolean(newFunctionLinkedTenantId),
    queryFn: () =>
      customFetch<RepresentativeTenantUser[]>(
        `/api/tenants/${tenantId}/representative-tenants/${newFunctionLinkedTenantId}/users`,
        { responseType: "json" },
      ),
  });

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  function getCustomFunction(customFunctionId?: string | null) {
    if (!customFunctionId) return undefined;
    return tenantFunctions.find((item) => item.id === customFunctionId && !item.systemKey);
  }

  function getStandardFunctionOverride(userFunction: UserFunction) {
    return tenantFunctions.find((item) => item.systemKey === userFunction);
  }

  function getStandardFunctionLabel(userFunction: UserFunction) {
    return getStandardFunctionOverride(userFunction)?.name ?? roleLabels[userFunction] ?? roleLabels.outro;
  }

  function permissionsForStandardFunction(userFunction: UserFunction) {
    const override = getStandardFunctionOverride(userFunction);
    return override
      ? override.permissions.filter((permission): permission is UserModuleKey =>
          USER_MODULES.some((module) => module.key === permission),
        )
      : modulesForFunction(userFunction);
  }

  const customTenantFunctions = tenantFunctions.filter((item) => !item.systemKey);

  function getFunctionLabel(targetUser: any) {
    const customFunction = getCustomFunction(targetUser.customFunctionId);
    if (customFunction) return customFunction.name;
    return getStandardFunctionLabel((targetUser.userFunction ?? "outro") as UserFunction);
  }

  function getFunctionFilterValue(targetUser: any) {
    return targetUser.customFunctionId
      ? `${CUSTOM_FUNCTION_PREFIX}${targetUser.customFunctionId}`
      : `${STANDARD_FUNCTION_PREFIX}${targetUser.userFunction ?? "outro"}`;
  }

  function getFunctionBadge(targetUser: any) {
    if (targetUser.customFunctionId) return "bg-slate-100 text-slate-800 border-slate-200";
    return FUNCAO_BADGES[targetUser.userFunction ?? "outro"] ?? FUNCAO_BADGES.outro;
  }

  function moduleLabel(module: (typeof USER_MODULES)[number]) {
    return locale === "pt-BR" ? module.label : module.labelEs;
  }

  function getTerritorySummary(targetUser: any) {
    if (!legacyCanReceiveLeads(targetUser)) return copy.noDistribution;
    const cities = Array.isArray(targetUser.leadAssignmentCities) ? targetUser.leadAssignmentCities : [];
    const regions = Array.isArray(targetUser.leadAssignmentRegions) ? targetUser.leadAssignmentRegions : [];
    const segments = Array.isArray(targetUser.leadAssignmentSegments) ? targetUser.leadAssignmentSegments : [];
    const places = [...cities.slice(0, 2), ...regions.slice(0, Math.max(0, 2 - cities.length))];
    const placeText = places.length ? places.join(", ") : copy.generalRotation;
    return segments.length ? `${placeText} · ${segments.slice(0, 2).join(", ")}` : placeText;
  }

  const list = users ?? [];
  const metrics = useMemo(() => ({
    total: list.length,
    active: list.filter((item) => item.active).length,
    admins: list.filter((item) => item.active && isAdministrator(item)).length,
    leads: list.filter((item) => item.active && legacyCanReceiveLeads(item)).length,
  }), [list]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return list.filter((item) => {
      const searchable = [
        item.name,
        item.email,
        item.telefone,
        getFunctionLabel(item),
        ...(Array.isArray(item.leadAssignmentCities) ? item.leadAssignmentCities : []),
        ...(Array.isArray(item.leadAssignmentRegions) ? item.leadAssignmentRegions : []),
        ...(Array.isArray(item.leadAssignmentSegments) ? item.leadAssignmentSegments : []),
      ].filter(Boolean).join(" ").toLowerCase();
      if (term && !searchable.includes(term)) return false;
      if (statusFilter === "active" && !item.active) return false;
      if (statusFilter === "inactive" && item.active) return false;
      if (functionFilter !== "all" && getFunctionFilterValue(item) !== functionFilter) return false;
      const receives = legacyCanReceiveLeads(item);
      if (leadFilter === "yes" && !receives) return false;
      if (leadFilter === "no" && receives) return false;
      return true;
    });
  }, [list, search, statusFilter, functionFilter, leadFilter, tenantFunctions, locale]);

  function resetForm() {
    setFormData({
      name: "",
      email: "",
      telefone: "",
      userFunction: "outro",
      customFunctionId: null,
      permissions: permissionsForStandardFunction("outro"),
      password: "",
      active: true,
      leadAssignmentEnabled: false,
      leadAssignmentCities: "",
      leadAssignmentRegions: "",
      leadAssignmentSegments: "",
      leadAssignmentBaseAddress: "",
      leadAssignmentLat: null,
      leadAssignmentLng: null,
      leadAssignmentRaioKm: "",
    });
    setEditingUser(null);
    setDialogTab("dados");
  }

  function openEdit(targetUser: any, tab = "dados") {
    setEditingUser(targetUser);
    setDialogTab(tab);
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
      active: targetUser.active !== false,
      leadAssignmentEnabled: legacyCanReceiveLeads(targetUser),
      leadAssignmentCities: Array.isArray(targetUser.leadAssignmentCities)
        ? targetUser.leadAssignmentCities.join(", ")
        : "",
      leadAssignmentRegions: Array.isArray(targetUser.leadAssignmentRegions)
        ? targetUser.leadAssignmentRegions.join(", ")
        : "",
      leadAssignmentSegments: Array.isArray(targetUser.leadAssignmentSegments)
        ? targetUser.leadAssignmentSegments.join(", ")
        : "",
      leadAssignmentBaseAddress: "",
      leadAssignmentLat: targetUser.leadAssignmentLat != null ? Number(targetUser.leadAssignmentLat) : null,
      leadAssignmentLng: targetUser.leadAssignmentLng != null ? Number(targetUser.leadAssignmentLng) : null,
      leadAssignmentRaioKm:
        targetUser.leadAssignmentRaioKm != null ? String(targetUser.leadAssignmentRaioKm) : "",
    });
    setDialogOpen(true);
  }

  function openNewFunctionDialog() {
    setEditingFunction(null);
    setEditingStandardFunction(null);
    setNewFunctionName("");
    setNewFunctionPermissions([]);
    setNewFunctionKind("internal");
    setNewFunctionLinkedTenantCode("");
    setNewFunctionLinkedTenantId("");
    setNewFunctionTenantSearch("");
    setNewFunctionRepresentativeUserIds([]);
    setNewFunctionLeadAccessScope("assigned");
    setFunctionDialogOpen(true);
  }

  function openEditFunction(customFunction: TenantUserFunction) {
    setEditingStandardFunction(null);
    setEditingFunction(customFunction);
    setNewFunctionName(customFunction.name);
    setNewFunctionPermissions(
      customFunction.permissions.filter((permission): permission is UserModuleKey =>
        USER_MODULES.some((module) => module.key === permission),
      ),
    );
    setNewFunctionKind(customFunction.kind ?? "internal");
    setNewFunctionLinkedTenantCode(customFunction.linkedTenantCode ?? "");
    setNewFunctionLinkedTenantId(customFunction.linkedTenantId ?? "");
    setNewFunctionTenantSearch(customFunction.linkedTenantCode ?? "");
    setNewFunctionRepresentativeUserIds(customFunction.representativeUserIds ?? []);
    setNewFunctionLeadAccessScope(customFunction.leadAccessScope ?? "assigned");
    setFunctionDialogOpen(true);
  }

  function openEditStandardFunction(userFunction: UserFunction) {
    const override = getStandardFunctionOverride(userFunction);
    setEditingStandardFunction(userFunction);
    setEditingFunction(override ?? null);
    setNewFunctionName(override?.name ?? roleLabels[userFunction] ?? roleLabels.outro);
    setNewFunctionPermissions(permissionsForStandardFunction(userFunction));
    setNewFunctionKind("internal");
    setNewFunctionLinkedTenantCode("");
    setNewFunctionLinkedTenantId("");
    setNewFunctionTenantSearch("");
    setNewFunctionRepresentativeUserIds([]);
    setNewFunctionLeadAccessScope("assigned");
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
      permissions: permissionsForStandardFunction(userFunction),
      leadAssignmentEnabled: editingUser ? current.leadAssignmentEnabled : (userFunction === "vendedor" || userFunction === "representante_comercial"),
    }));
  }

  async function handleSaveFunction() {
    const name = newFunctionName.trim();
    if (name.length < 2) {
      toast({ title: copy.functionNameRequired, description: copy.functionNameRequiredDescription, variant: "destructive" });
      return;
    }
    if (newFunctionPermissions.length === 0) {
      toast({ title: copy.selectAccess, description: copy.selectAccessDescription, variant: "destructive" });
      return;
    }
    if (newFunctionKind === "external_company" && (!newFunctionLinkedTenantId || !newFunctionLinkedTenantCode.trim())) {
      toast({ title: copy.linkedTenantCode, description: copy.linkedTenantCodeHelp, variant: "destructive" });
      return;
    }

    setCreatingFunction(true);
    try {
      const saved = await customFetch<TenantUserFunction>(
        editingFunction
          ? `/api/tenants/${tenantId}/user-functions/${editingFunction.id}`
          : `/api/tenants/${tenantId}/user-functions`,
        {
          method: editingFunction ? "PATCH" : "POST",
          body: JSON.stringify({
            name,
            systemKey: editingStandardFunction ?? editingFunction?.systemKey ?? null,
            permissions: newFunctionPermissions,
            kind: editingStandardFunction ? "internal" : newFunctionKind,
            linkedTenantCode: newFunctionKind === "external_company" ? newFunctionLinkedTenantCode.trim().toUpperCase() : null,
            leadAccessScope: newFunctionLeadAccessScope,
            representativeUserIds: newFunctionKind === "external_company" ? newFunctionRepresentativeUserIds : [],
          }),
          responseType: "json",
        },
      );
      queryClient.setQueryData<TenantUserFunction[]>(userFunctionsQueryKey, (current = []) =>
        [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, locale)),
      );
      if (editingStandardFunction) {
        if (!formData.customFunctionId && formData.userFunction === editingStandardFunction) {
          setFormData((current) => ({
            ...current,
            permissions: saved.permissions.filter((permission): permission is UserModuleKey =>
              USER_MODULES.some((module) => module.key === permission),
            ),
          }));
        }
      } else if (!editingFunction) {
        setFormData((current) => ({
          ...current,
          userFunction: "outro",
          customFunctionId: saved.id,
          permissions: saved.permissions.filter((permission): permission is UserModuleKey =>
            USER_MODULES.some((module) => module.key === permission),
          ),
        }));
      } else if (formData.customFunctionId === saved.id) {
        setFormData((current) => ({
          ...current,
          permissions: saved.permissions.filter((permission): permission is UserModuleKey =>
            USER_MODULES.some((module) => module.key === permission),
          ),
        }));
      }
      setFunctionDialogOpen(false);
      setEditingFunction(null);
      setEditingStandardFunction(null);
      setNewFunctionName("");
      setNewFunctionPermissions([]);
      setNewFunctionKind("internal");
      setNewFunctionLinkedTenantCode("");
      setNewFunctionLinkedTenantId("");
      setNewFunctionTenantSearch("");
      setNewFunctionRepresentativeUserIds([]);
      setNewFunctionLeadAccessScope("assigned");
      toast({
        title: editingFunction ? copy.functionUpdated : copy.functionCreated,
        description: editingFunction ? copy.functionUpdatedDescription : copy.functionSelected(saved.name),
      });
    } catch (err: any) {
      toast({
        title: editingFunction ? copy.functionUpdateError : copy.functionCreateError,
        description: err?.message || copy.tryAgain,
        variant: "destructive",
      });
    } finally {
      setCreatingFunction(false);
    }
  }

  async function confirmDeleteFunction() {
    if (!deleteFunctionTarget) return;
    try {
      await customFetch(`/api/tenants/${tenantId}/user-functions/${deleteFunctionTarget.id}`, {
        method: "DELETE",
        responseType: "text",
      });
      queryClient.setQueryData<TenantUserFunction[]>(userFunctionsQueryKey, (current = []) =>
        current.filter((item) => item.id !== deleteFunctionTarget.id),
      );
      if (formData.customFunctionId === deleteFunctionTarget.id) {
        setFormData((current) => ({
          ...current,
          userFunction: "outro",
          customFunctionId: null,
          permissions: permissionsForStandardFunction("outro"),
        }));
      }
      if (deleteFunctionTarget.systemKey && !formData.customFunctionId && formData.userFunction === deleteFunctionTarget.systemKey) {
        setFormData((current) => ({
          ...current,
          permissions: modulesForFunction(deleteFunctionTarget.systemKey as UserFunction),
        }));
      }
      if (functionFilter === `${CUSTOM_FUNCTION_PREFIX}${deleteFunctionTarget.id}`) {
        setFunctionFilter("all");
      }
      setDeleteFunctionTarget(null);
      toast(deleteFunctionTarget.systemKey
        ? { title: copy.nativeFunctionRestored, description: copy.nativeFunctionRestoredDescription }
        : { title: copy.functionDeleted, description: copy.functionDeletedDescription });
    } catch (err: any) {
      toast({ title: copy.functionDeleteError, description: err?.message || copy.tryAgain, variant: "destructive" });
    }
  }

  async function handleSubmit() {
    if (!formData.name || !formData.email) {
      toast({ title: copy.requiredFields, description: copy.requiredFieldsDescription, variant: "destructive" });
      return;
    }
    if (!editingUser && !formData.password) {
      setDialogTab("dados");
      toast({ title: copy.passwordRequired, description: copy.passwordRequiredDescription, variant: "destructive" });
      return;
    }

    const leadAssignmentCities = parseTerritories(formData.leadAssignmentCities);
    const leadAssignmentRegions = parseTerritories(formData.leadAssignmentRegions);
    const leadAssignmentSegments = parseTerritories(formData.leadAssignmentSegments);
    const leadAssignmentRaioKm = formData.leadAssignmentRaioKm.trim()
      ? Number(formData.leadAssignmentRaioKm)
      : null;
    const baseAddress = formData.leadAssignmentBaseAddress.trim();

    try {
      if (editingUser) {
        const payload: any = {
          name: formData.name,
          email: formData.email,
          telefone: formData.telefone || undefined,
          active: formData.active,
          userFunction: formData.userFunction,
          customFunctionId: formData.customFunctionId,
          permissions: formData.permissions,
          leadAssignmentEnabled: formData.leadAssignmentEnabled,
          leadAssignmentCities,
          leadAssignmentRegions,
          leadAssignmentSegments,
          leadAssignmentLat: formData.leadAssignmentLat,
          leadAssignmentLng: formData.leadAssignmentLng,
          leadAssignmentRaioKm,
        };
        if (formData.password) payload.password = formData.password;
        if (baseAddress) payload.leadAssignmentBaseAddress = baseAddress;
        await updateUser.mutateAsync({ id: editingUser.id, data: payload });
        toast({ title: copy.userUpdated, description: copy.userUpdatedDescription });
      } else {
        const createdUser = await createUser.mutateAsync({
          data: {
            tenantId,
            name: formData.name,
            email: formData.email,
            password: formData.password,
            telefone: formData.telefone || undefined,
            active: formData.active,
            userFunction: formData.userFunction,
            customFunctionId: formData.customFunctionId,
            permissions: formData.permissions,
            leadAssignmentEnabled: formData.leadAssignmentEnabled,
            leadAssignmentCities,
            leadAssignmentRegions,
            leadAssignmentSegments,
            leadAssignmentLat: formData.leadAssignmentLat,
            leadAssignmentLng: formData.leadAssignmentLng,
            leadAssignmentRaioKm,
            ...(baseAddress ? { leadAssignmentBaseAddress: baseAddress } : {}),
          } as any,
        }) as any;
        toast({
          title: copy.userCreated,
          description: createdUser?.emailSent
            ? (locale === "pt-BR" ? "Usuário criado e e-mail de acesso enviado." : "Usuario creado y correo de acceso enviado.")
            : (locale === "pt-BR" ? "Usuário criado, mas o e-mail de acesso não pôde ser enviado." : "Usuario creado, pero no se pudo enviar el correo de acceso."),
          variant: createdUser?.emailSent === false ? "destructive" : "default",
        });
      }
      await queryClient.invalidateQueries({ queryKey: getListTenantUsersQueryKey(tenantId) });
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast({ title: copy.saveError, description: err?.message || copy.tryAgain, variant: "destructive" });
    }
  }

  async function toggleUserStatus(targetUser: any) {
    if (statusUpdatingUserId) return;
    const nextActive = !targetUser.active;
    if (!nextActive && targetUser.id === user?.id) {
      toast({ title: copy.saveError, description: copy.selfDeactivateBlocked, variant: "destructive" });
      return;
    }
    setStatusUpdatingUserId(targetUser.id);
    try {
      await updateUser.mutateAsync({ id: targetUser.id, data: { active: nextActive } as any });
      await queryClient.invalidateQueries({ queryKey: getListTenantUsersQueryKey(tenantId) });
      toast({ title: copy.statusUpdated, description: copy.statusUpdatedDescription(nextActive) });
    } catch (err: any) {
      toast({ title: copy.saveError, description: err?.message || copy.tryAgain, variant: "destructive" });
    } finally {
      setStatusUpdatingUserId(null);
    }
  }

  function resetPartnershipForm() {
    setPartnershipSearch("");
    setPartnershipTenantId("");
    setPartnershipTenantCode("");
    setPartnershipTenantName("");
    setPartnershipAuthorizedUsers([]);
    setPartnershipCommission("15");
  }

  async function createCommercialPartnership() {
    if (!partnershipTenantId) {
      toast({ title: "Selecione a empresa representante.", variant: "destructive" });
      return;
    }
    const commission = Number(partnershipCommission || 15);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      toast({ title: "Informe uma comissão válida entre 0% e 100%.", variant: "destructive" });
      return;
    }
    setCreatingPartnership(true);
    try {
      await customFetch(`/api/tenants/${tenantId}/commercial-partnerships`, {
        method: "POST",
        body: JSON.stringify({
          partnerTenantId: partnershipTenantId,
          relationshipType: "representante_comercial",
          defaultCommissionPercent: commission,
          authorizedUserIds: partnershipAuthorizedUsers,
          distributionMode: "partner_queue",
          defaultPermissions: ["view_lead", "view_contacts", "create_activities", "move_pipeline", "create_proposal", "send_proposal", "negotiate", "close_deal", "assign_partner_user"],
        }),
        responseType: "json",
      });
      await queryClient.invalidateQueries({ queryKey: ["commercial-partnerships", tenantId] });
      setPartnershipDialogOpen(false);
      resetPartnershipForm();
      toast({ title: "Empresa representante vinculada", description: "Agora ela pode ser escolhida como responsável nos negócios compartilhados." });
    } catch (err: any) {
      toast({ title: "Erro ao vincular representante", description: err?.message || copy.tryAgain, variant: "destructive" });
    } finally {
      setCreatingPartnership(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync({ id: deleteTarget.id });
      await queryClient.invalidateQueries({ queryKey: getListTenantUsersQueryKey(tenantId) });
      toast({ title: copy.userDeleted, description: copy.userDeletedDescription });
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ title: copy.deleteError, description: err?.message || copy.tryAgain, variant: "destructive" });
    }
  }

  const functionSelectValue = formData.customFunctionId
    ? `${CUSTOM_FUNCTION_PREFIX}${formData.customFunctionId}`
    : formData.userFunction;

  const metricCards = [
    { label: copy.metricUsers, value: metrics.total, icon: Users },
    { label: copy.metricActive, value: metrics.active, icon: UserCheck },
    { label: copy.metricAdmins, value: metrics.admins, icon: Shield },
    { label: copy.metricLeads, value: metrics.leads, icon: MapPin },
  ];

  function UserActions({ targetUser }: { targetUser: any }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={copy.actions}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuItem onClick={() => openEdit(targetUser, "dados")}>
            <Pencil className="h-4 w-4 mr-2" />
            {copy.editAction}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openEdit(targetUser, "seguranca")}>
            <KeyRound className="h-4 w-4 mr-2" />
            {copy.passwordAction}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => toggleUserStatus(targetUser)}
            disabled={statusUpdatingUserId !== null}
          >
            {statusUpdatingUserId === targetUser.id
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : targetUser.active
                ? <UserX className="h-4 w-4 mr-2" />
                : <UserCheck className="h-4 w-4 mr-2" />}
            {statusUpdatingUserId === targetUser.id
              ? copy.loading
              : targetUser.active
                ? copy.deactivateAction
                : copy.activateAction}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteTarget(targetUser)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {copy.deleteAction}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            {copy.title}
          </h1>
          <p className="text-muted-foreground mt-1">{copy.subtitle}</p>
        </div>
        <Button
          className="sm:self-start"
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
        >
          <UserPlus className="h-4 w-4 mr-2" />
          {copy.newUser}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metricCards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold mt-1">{value}</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={copy.searchPlaceholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 xl:w-auto">
              <Select value={functionFilter} onValueChange={setFunctionFilter}>
                <SelectTrigger className="sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.allFunctions}</SelectItem>
                  {STANDARD_FUNCTIONS.map((standardFunction) => (
                    <SelectItem key={standardFunction} value={`${STANDARD_FUNCTION_PREFIX}${standardFunction}`}>
                      {getStandardFunctionLabel(standardFunction)}
                    </SelectItem>
                  ))}
                  {customTenantFunctions.map((customFunction) => (
                    <SelectItem key={customFunction.id} value={`${CUSTOM_FUNCTION_PREFIX}${customFunction.id}`}>
                      {customFunction.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger className="sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.allStatuses}</SelectItem>
                  <SelectItem value="active">{copy.active}</SelectItem>
                  <SelectItem value="inactive">{copy.inactive}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={leadFilter} onValueChange={(value) => setLeadFilter(value as LeadFilter)}>
                <SelectTrigger className="sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.allLeadModes}</SelectItem>
                  <SelectItem value="yes">{copy.onlyLead}</SelectItem>
                  <SelectItem value="no">{copy.withoutLead}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{copy.usersCount(filteredUsers.length)}</div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{copy.loading}</div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">{copy.empty}</p>
          ) : (
            <>
              <div className="divide-y -mx-6 sm:hidden">
                {filteredUsers.map((targetUser) => (
                  <div
                    key={targetUser.id}
                    className="px-6 py-4 space-y-3 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => openEdit(targetUser)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{targetUser.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{targetUser.email}</p>
                        {targetUser.telefone && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {targetUser.telefone}
                          </p>
                        )}
                      </div>
                      <UserActions targetUser={targetUser} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={getFunctionBadge(targetUser)}>
                        <Shield className="h-3 w-3 mr-1" />
                        {getFunctionLabel(targetUser)}
                      </Badge>
                      {targetUser.active ? (
                        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> {copy.active}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
                          <XCircle className="h-3 w-3 mr-1" /> {copy.inactive}
                        </Badge>
                      )}
                    </div>
                    <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{getTerritorySummary(targetUser)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{copy.name}</TableHead>
                      <TableHead>{copy.role}</TableHead>
                      <TableHead>{copy.distribution}</TableHead>
                      <TableHead>{copy.status}</TableHead>
                      <TableHead className="w-[72px] text-right">{copy.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((targetUser) => (
                      <TableRow
                        key={targetUser.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openEdit(targetUser)}
                      >
                        <TableCell>
                          <div className="min-w-[190px]">
                            <p className="font-medium">{targetUser.name}</p>
                            <p className="text-xs text-muted-foreground">{targetUser.email}</p>
                            {targetUser.telefone && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {targetUser.telefone}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getFunctionBadge(targetUser)}>
                            <Shield className="h-3 w-3 mr-1" />
                            {getFunctionLabel(targetUser)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[300px]">
                            {legacyCanReceiveLeads(targetUser) ? (
                              <div>
                                <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 mb-1.5">
                                  <MapPin className="h-3 w-3 mr-1" /> {copy.receivesLeads}
                                </Badge>
                                <p className="text-xs text-muted-foreground truncate" title={getTerritorySummary(targetUser)}>
                                  {getTerritorySummary(targetUser)}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{copy.noDistribution}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {targetUser.active ? (
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> {copy.active}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
                              <XCircle className="h-3 w-3 mr-1" /> {copy.inactive}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <UserActions targetUser={targetUser} />
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

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? copy.editUser : copy.newUser}</DialogTitle>
            <DialogDescription>{copy.subtitle}</DialogDescription>
          </DialogHeader>

          <Tabs value={dialogTab} onValueChange={setDialogTab} className="mt-2">
            <TabsList className={`grid w-full ${editingUser ? "grid-cols-4" : "grid-cols-3"}`}>
              <TabsTrigger value="dados">{copy.tabData}</TabsTrigger>
              <TabsTrigger value="acessos">{copy.tabAccess}</TabsTrigger>
              <TabsTrigger value="distribuicao">{copy.tabDistribution}</TabsTrigger>
              {editingUser && <TabsTrigger value="seguranca">{copy.tabSecurity}</TabsTrigger>}
            </TabsList>

            <TabsContent value="dados" className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>{copy.fullName}</Label>
                  <Input
                    value={formData.name}
                    onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                    placeholder={copy.userNamePlaceholder}
                  />
                </div>
                <div>
                  <Label>{copy.email}</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
                    placeholder="email@empresa.com"
                  />
                </div>
                <div>
                  <Label>{copy.phone}</Label>
                  <Input
                    value={formData.telefone}
                    onChange={(event) => setFormData((current) => ({ ...current, telefone: event.target.value }))}
                    placeholder={copy.phonePlaceholder}
                  />
                </div>
                {!editingUser && (
                  <div>
                    <Label>{copy.password}</Label>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(event) => setFormData((current) => ({ ...current, password: event.target.value }))}
                      placeholder={copy.passwordPlaceholder}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{copy.passwordRequiredDescription}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>{copy.role}</Label>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setManageFunctionsOpen(true)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> {copy.manageFunctions}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={openNewFunctionDialog}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> {copy.newFunction}
                      </Button>
                    </div>
                  </div>
                  <Select value={functionSelectValue} onValueChange={handleFunctionChange}>
                    <SelectTrigger><SelectValue placeholder={copy.selectFunction} /></SelectTrigger>
                    <SelectContent>
                      {STANDARD_FUNCTIONS.map((standardFunction) => (
                        <SelectItem key={standardFunction} value={standardFunction}>{getStandardFunctionLabel(standardFunction)}</SelectItem>
                      ))}
                      {customTenantFunctions.map((customFunction) => (
                        <SelectItem key={customFunction.id} value={`${CUSTOM_FUNCTION_PREFIX}${customFunction.id}`}>
                          {customFunction.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{copy.functionHelp}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <Label className="text-base">{copy.accountStatus}</Label>
                  <p className="text-xs text-muted-foreground mt-1">{copy.accountStatusHelp}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-medium">{formData.active ? copy.active : copy.inactive}</span>
                  <Switch
                    checked={formData.active}
                    onCheckedChange={(active) => setFormData((current) => ({ ...current, active }))}
                    disabled={editingUser?.id === user?.id}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="acessos" className="pt-4">
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label className="text-base">{copy.userAccess}</Label>
                    <p className="text-sm text-muted-foreground mt-1">{copy.userAccessHelp}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button type="button" variant="outline" size="sm" onClick={() =>
                      setFormData((current) => ({ ...current, permissions: USER_MODULES.map((module) => module.key) }))
                    }>{copy.selectAll}</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() =>
                      setFormData((current) => ({ ...current, permissions: [] }))
                    }>{copy.clear}</Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {USER_MODULES.map((module) => {
                    const checked = formData.permissions.includes(module.key);
                    return (
                      <label key={module.key} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => setFormData((current) => ({
                            ...current,
                            permissions: value
                              ? [...current.permissions, module.key]
                              : current.permissions.filter((key) => key !== module.key),
                          }))}
                        />
                        <span className="text-sm font-medium">{moduleLabel(module)}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{copy.accessRecommendation}</p>
              </div>
            </TabsContent>

            <TabsContent value="distribuicao" className="pt-4">
              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <Label className="text-base">{copy.leadAssignmentTitle}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{copy.leadAssignmentHelp}</p>
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3">
                  <Checkbox
                    checked={formData.leadAssignmentEnabled}
                    onCheckedChange={(value) => setFormData((current) => ({ ...current, leadAssignmentEnabled: value === true }))}
                  />
                  <span>
                    <span className="block text-sm font-medium">{copy.leadAssignmentEnabled}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{copy.leadAssignmentEnabledHelp}</span>
                  </span>
                </label>

                {formData.leadAssignmentEnabled && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{copy.cities}</Label>
                        <Input
                          value={formData.leadAssignmentCities}
                          onChange={(event) => setFormData((current) => ({ ...current, leadAssignmentCities: event.target.value }))}
                          placeholder={copy.citiesPlaceholder}
                        />
                        <ProspectorLocationMap
                          values={parseTerritories(formData.leadAssignmentCities)}
                          onChange={(values) => setFormData((current) => ({
                            ...current,
                            leadAssignmentCities: values.join(", "),
                          }))}
                          onAreaAdd={(area: ProspectorGeoArea) => setFormData((current) => ({
                            ...current,
                            leadAssignmentBaseAddress: area.label,
                            leadAssignmentLat: area.lat,
                            leadAssignmentLng: area.lng,
                            leadAssignmentRaioKm: String(area.radiusKm),
                          }))}
                        />
                        {formData.leadAssignmentLat != null && formData.leadAssignmentLng != null && formData.leadAssignmentRaioKm && (
                          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {locale === "pt-BR" ? "Área definida no mapa" : "Área definida en el mapa"} · {formData.leadAssignmentRaioKm} km
                            </span>
                          </div>
                        )}
                      </div>
                      <div>
                        <Label>{copy.regions}</Label>
                        <Input
                          value={formData.leadAssignmentRegions}
                          onChange={(event) => setFormData((current) => ({ ...current, leadAssignmentRegions: event.target.value }))}
                          placeholder={copy.regionsPlaceholder}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{copy.territoryHelp}</p>
                    <div>
                      <Label>{copy.segments}</Label>
                      <Input
                        value={formData.leadAssignmentSegments}
                        onChange={(event) => setFormData((current) => ({ ...current, leadAssignmentSegments: event.target.value }))}
                        placeholder={copy.segmentsPlaceholder}
                      />
                      <p className="text-xs text-muted-foreground mt-1">{copy.segmentsHelp}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {locale === "pt-BR"
                        ? "O raio agora é definido diretamente no mapa para evitar dúvida sobre qual cidade ou área ele pertence."
                        : "El radio ahora se define directamente en el mapa para evitar dudas sobre a qué ciudad o zona pertenece."}
                    </p>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="seguranca" className="pt-4">
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="text-base">{editingUser ? copy.newPassword : copy.password}</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {editingUser ? copy.newPasswordHelp : copy.passwordRequiredDescription}
                    </p>
                  </div>
                </div>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(event) => setFormData((current) => ({ ...current, password: event.target.value }))}
                  placeholder={copy.passwordPlaceholder}
                  autoFocus={dialogTab === "seguranca"}
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{copy.cancel}</Button>
            <Button onClick={handleSubmit} disabled={createUser.isPending || updateUser.isPending}>
              {(createUser.isPending || updateUser.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingUser ? copy.saveChanges : copy.createUser}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={functionDialogOpen} onOpenChange={setFunctionDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFunction || editingStandardFunction ? copy.editFunction : copy.newFunction}</DialogTitle>
            <DialogDescription>{editingFunction || editingStandardFunction ? copy.manageFunctionsDescription : copy.newFunctionDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{copy.functionName}</Label>
              <Input
                value={newFunctionName}
                onChange={(event) => setNewFunctionName(event.target.value)}
                placeholder={copy.functionNamePlaceholder}
                autoFocus
              />
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <Switch
                  checked={newFunctionKind === "external_company"}
                  onCheckedChange={(checked) => setNewFunctionKind(checked ? "external_company" : "internal")}
                  disabled={Boolean(editingStandardFunction)}
                />
                <span>
                  <span className="block text-sm font-medium">{copy.representativeCompany}</span>
                  <span className="block text-xs text-muted-foreground mt-1">{copy.representativeCompanyHelp}</span>
                </span>
              </label>
              {newFunctionKind === "external_company" && (
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label>{copy.linkedTenantCode}</Label>
                    <Input
                      value={newFunctionTenantSearch}
                      onChange={(event) => {
                        setNewFunctionTenantSearch(event.target.value);
                        setNewFunctionLinkedTenantId("");
                        setNewFunctionLinkedTenantCode("");
                        setNewFunctionRepresentativeUserIds([]);
                      }}
                      placeholder={copy.linkedTenantCodePlaceholder}
                    />
                    <p className="text-xs text-muted-foreground">{copy.linkedTenantCodeHelp}</p>
                    {newFunctionLinkedTenantId && (
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        <span className="font-medium">{copy.linkedTenantSelected}:</span>{" "}
                        {newFunctionTenantSearch} {newFunctionLinkedTenantCode ? `(${newFunctionLinkedTenantCode})` : ""}
                      </div>
                    )}
                    {!newFunctionLinkedTenantId && representativeTenantSearch.length < 2 && (
                      <p className="text-xs text-muted-foreground">{copy.linkedTenantSearchEmpty}</p>
                    )}
                    {!newFunctionLinkedTenantId && representativeTenantSearch.length >= 2 && (
                      <div className="max-h-44 overflow-y-auto rounded-md border">
                        {searchingRepresentativeTenants ? (
                          <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> {copy.loading}
                          </div>
                        ) : representativeTenantOptions.length === 0 ? (
                          <p className="p-3 text-sm text-muted-foreground">{copy.linkedTenantNoResults}</p>
                        ) : representativeTenantOptions.map((tenant) => (
                          <button
                            key={tenant.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/50"
                            onClick={() => {
                              setNewFunctionLinkedTenantId(tenant.id);
                              setNewFunctionLinkedTenantCode(tenant.tenantCode);
                              setNewFunctionTenantSearch(tenant.name);
                              setNewFunctionRepresentativeUserIds([]);
                            }}
                          >
                            <span className="font-medium">{tenant.name}</span>
                            <span className="text-xs text-muted-foreground">{tenant.tenantCode}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {newFunctionLinkedTenantId && (
                    <div className="space-y-2">
                      <Label>{copy.representativeUsers}</Label>
                      <p className="text-xs text-muted-foreground">{copy.representativeUsersHelp}</p>
                      <div className="max-h-48 overflow-y-auto rounded-md border p-2">
                        {loadingRepresentativeUsers ? (
                          <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> {copy.loading}
                          </div>
                        ) : representativeTenantUsers.length === 0 ? (
                          <p className="p-2 text-sm text-muted-foreground">{copy.representativeUsersEmpty}</p>
                        ) : representativeTenantUsers.map((representativeUser) => {
                          const checked = newFunctionRepresentativeUserIds.includes(representativeUser.id);
                          return (
                            <label key={representativeUser.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) =>
                                  setNewFunctionRepresentativeUserIds((current) =>
                                    value
                                      ? [...new Set([...current, representativeUser.id])]
                                      : current.filter((id) => id !== representativeUser.id),
                                  )
                                }
                              />
                              <span className="text-sm font-medium">{representativeUser.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>{copy.representativeLeadScope}</Label>
                    <Select value={newFunctionLeadAccessScope} onValueChange={(value) => setNewFunctionLeadAccessScope(value as "assigned" | "territory" | "all_authorized")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="assigned">{copy.representativeLeadAssigned}</SelectItem>
                        <SelectItem value="territory">{copy.representativeLeadTerritory}</SelectItem>
                        <SelectItem value="all_authorized">{copy.representativeLeadAll}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-base">{copy.defaultAccess}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{copy.defaultAccessHelp}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button type="button" variant="outline" size="sm" onClick={() => setNewFunctionPermissions(USER_MODULES.map((module) => module.key))}>
                    {copy.selectAll}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setNewFunctionPermissions([])}>
                    {copy.clear}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {USER_MODULES.map((module) => {
                  const checked = newFunctionPermissions.includes(module.key);
                  return (
                    <label key={module.key} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => setNewFunctionPermissions((current) =>
                          value ? [...current, module.key] : current.filter((key) => key !== module.key),
                        )}
                      />
                      <span className="text-sm font-medium">{moduleLabel(module)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFunctionDialogOpen(false)} disabled={creatingFunction}>
              {copy.cancel}
            </Button>
            <Button type="button" onClick={handleSaveFunction} disabled={creatingFunction}>
              {creatingFunction && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingFunction || editingStandardFunction ? copy.saveFunction : copy.createFunction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageFunctionsOpen} onOpenChange={setManageFunctionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{copy.manageFunctionsTitle}</DialogTitle>
            <DialogDescription>{copy.manageFunctionsDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funções nativas</p>
              {STANDARD_FUNCTIONS.map((standardFunction) => {
                const override = getStandardFunctionOverride(standardFunction);
                const permissions = override?.permissions ?? modulesForFunction(standardFunction);
                return (
                  <div key={standardFunction} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{override?.name ?? roleLabels[standardFunction]}</p>
                      <p className="text-xs text-muted-foreground">
                        {permissions.length} {copy.defaultAccess.toLowerCase()}
                        {override ? " · personalizado" : " · padrão do sistema"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={copy.editFunction}
                        onClick={() => {
                          setManageFunctionsOpen(false);
                          openEditStandardFunction(standardFunction);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {override && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label={copy.deleteFunction}
                          onClick={() => setDeleteFunctionTarget(override)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funções personalizadas</p>
              {customTenantFunctions.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {copy.noCustomFunctions}
                </div>
              ) : customTenantFunctions.map((customFunction) => (
                <div key={customFunction.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{customFunction.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {customFunction.permissions.length} {copy.defaultAccess.toLowerCase()}
                      {customFunction.kind === "external_company" && customFunction.linkedTenantCode
                        ? ` · ${copy.representativeCompany}: ${customFunction.linkedTenantCode}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={copy.editFunction}
                      onClick={() => {
                        setManageFunctionsOpen(false);
                        openEditFunction(customFunction);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={copy.deleteFunction}
                      onClick={() => setDeleteFunctionTarget(customFunction)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManageFunctionsOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="button" onClick={() => {
              setManageFunctionsOpen(false);
              openNewFunctionDialog();
            }}>
              <Plus className="h-4 w-4 mr-2" />
              {copy.newFunction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteFunctionTarget)} onOpenChange={(open) => { if (!open) setDeleteFunctionTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.deleteFunctionTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFunctionTarget?.systemKey
                ? (locale === "pt-BR"
                    ? `Restaurar ${deleteFunctionTarget.name} ao padrão do sistema? A função nativa continuará disponível.`
                    : `¿Restaurar ${deleteFunctionTarget.name} al valor predeterminado del sistema? La función nativa seguirá disponible.`)
                : copy.deleteFunctionDescription(deleteFunctionTarget?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteFunction}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {copy.deleteFunction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.deleteDescription(deleteTarget?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {copy.deleteAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
