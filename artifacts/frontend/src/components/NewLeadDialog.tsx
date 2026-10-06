import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Plus, Ticket, Trash2, UserRound, XCircle } from "lucide-react";
import {
  Lead,
  getListDealsQueryKey,
  getListTenantLeadsQueryKey,
  getListTenantUsersQueryKey,
  useCreateDeal,
  useCreateLead,
  useListTenantUsers,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const newLeadSchema = z.object({
  cadastroTipo: z.enum(["pessoa", "empresa", "negocio"]).default("pessoa"),
  nome: z.string().trim().min(2, "Nome é obrigatório"),
  telefone: z.string().optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  empresa: z.string().optional().or(z.literal("")),
  empresaCnpj: z.string().optional().or(z.literal("")),
  objetivo: z.string().optional().or(z.literal("")),
  source: z.string().default("manual"),
  assignedTo: z.string().default("__auto__"),
  instagramHandle: z.string().optional().or(z.literal("")),
  profissao: z.string().optional().or(z.literal("")),
  endereco: z.string().optional().or(z.literal("")),
  documento: z.string().optional().or(z.literal("")),
  tipoPessoa: z.enum(["fisica", "juridica"]).default("fisica"),
  mercadoSegmento: z.string().optional().or(z.literal("")),
  cupomCodigo: z.string().optional().or(z.literal("")),
  createInitialDeal: z.boolean().default(true),
  dealTitle: z.string().optional().or(z.literal("")),
  dealValue: z.string().optional().or(z.literal("")),
  dealStage: z.enum(["em_aquecimento", "novo", "qualificado"]).default("em_aquecimento"),
});

type NewLeadValues = z.infer<typeof newLeadSchema>;

type Props = {
  tenantId: string;
  token?: string | null;
  isAdmin: boolean;
  leads: Lead[];
  companyPlaceholder?: string;
  objectivePlaceholder?: string;
  onNavigate: (path: string) => void;
};

type AssignmentUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  active?: boolean | null;
  platformRole?: string | null;
  userFunction?: string | null;
  leadAssignmentEnabled?: boolean | null;
  leadAssignmentCities?: string[] | null;
  leadAssignmentRegions?: string[] | null;
  leadAssignmentSegments?: string[] | null;
};

type RepresentativeFunction = {
  id: string;
  name: string;
  kind?: "internal" | "external_company";
  linkedTenantCode?: string | null;
  permissions: string[];
};

const REPRESENTATIVE_PREFIX = "__representative__:";

function representativeFunctionId(value?: string | null) {
  return value?.startsWith(REPRESENTATIVE_PREFIX) ? value.slice(REPRESENTATIVE_PREFIX.length) : null;
}

type ExtraCompanyContact = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  cargo: string;
  role: "comercial" | "decisor" | "compras" | "financeiro" | "tecnico" | "administrativo" | "suporte" | "outro";
};

type CommercialPartnerDraft = {
  id: string;
  mode: "existing" | "new";
  personId: string;
  nome: string;
  telefone: string;
  email: string;
  documento: string;
  role: "indicador" | "parceiro" | "arquiteto" | "engenheiro" | "representante" | "instalador" | "outro";
  hasCommission: boolean;
  commissionKind: "percent" | "fixed";
  commissionValue: string;
};

type CrmPersonOption = {
  id: string;
  nome: string;
  documento?: string | null;
  telefones?: string[] | null;
  emails?: string[] | null;
};

const COMMERCIAL_PARTNER_ROLES = [
  ["indicador", "Indicador"],
  ["parceiro", "Parceiro"],
  ["arquiteto", "Arquiteto"],
  ["engenheiro", "Engenheiro"],
  ["representante", "Representante"],
  ["instalador", "Instalador"],
  ["outro", "Outro"],
] as const;

type CouponValidation = {
  valid: true;
  code: string;
  partnerId: string;
  partnerName: string | null;
  partnerType: string;
  discountPercent: number;
  application: string;
};

const DEFAULT_VALUES: NewLeadValues = {
  cadastroTipo: "pessoa",
  nome: "",
  telefone: "",
  email: "",
  empresa: "",
  empresaCnpj: "",
  objetivo: "",
  source: "manual",
  assignedTo: "__auto__",
  instagramHandle: "",
  profissao: "",
  endereco: "",
  documento: "",
  tipoPessoa: "fisica",
  mercadoSegmento: "",
  cupomCodigo: "",
  createInitialDeal: true,
  dealTitle: "",
  dealValue: "",
  dealStage: "em_aquecimento",
};

function digits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizedText(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function normalizeCoupon(value?: string | null) {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeTerritory(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function territoryMatches(location: string, territory: string) {
  const normalizedLocation = normalizeTerritory(location);
  const normalizedTerritory = normalizeTerritory(territory);
  if (!normalizedLocation || !normalizedTerritory) return false;
  if (normalizedTerritory.length <= 3) {
    return normalizedLocation.split(/[^a-z0-9]+/).filter(Boolean).includes(normalizedTerritory);
  }
  return normalizedLocation.includes(normalizedTerritory);
}

function canReceiveLeads(user: AssignmentUser) {
  if (user.active === false) return false;
  if (user.leadAssignmentEnabled === false) return false;
  if (user.leadAssignmentEnabled === true) return true;
  return user.platformRole === "tenant_seller" || user.userFunction === "vendedor" || user.userFunction === "representante_comercial";
}

function stableIndex(seed: string, length: number) {
  if (length <= 1) return 0;
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % length;
}

function normalizeDealValue(value?: string | null): string | undefined {
  const raw = (value ?? "").trim();
  if (!raw) return undefined;
  const compact = raw.replace(/[^\d,.-]/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : undefined;
}

function defaultDealTitle(values: NewLeadValues, lead?: Lead | null) {
  if (values.dealTitle.trim()) return values.dealTitle.trim();
  const empresa = values.empresa.trim() || lead?.empresa?.trim();
  const nome = values.nome.trim() || lead?.nome?.trim() || "Novo negócio";
  return empresa ? `${empresa} — ${nome}` : nome;
}

export function NewLeadDialog({
  tenantId,
  token,
  isAdmin,
  leads,
  companyPlaceholder,
  objectivePlaceholder,
  onNavigate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showCommercial, setShowCommercial] = useState(false);
  const [extraContacts, setExtraContacts] = useState<ExtraCompanyContact[]>([]);
  const [commercialPartners, setCommercialPartners] = useState<CommercialPartnerDraft[]>([]);
  const [serverDuplicate, setServerDuplicate] = useState<{ lead: Lead; matchBy: string } | null>(null);
  const [couponValidation, setCouponValidation] = useState<CouponValidation | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createLead = useCreateLead();
  const createDeal = useCreateDeal();

  const form = useForm<NewLeadValues>({
    resolver: zodResolver(newLeadSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const cadastroTipo = form.watch("cadastroTipo");
  const watchedPhone = form.watch("telefone");
  const watchedEmail = form.watch("email");
  const watchedDocument = form.watch("documento");
  const watchedName = form.watch("nome");
  const watchedCompany = form.watch("empresa");
  const watchedCoupon = form.watch("cupomCodigo");
  const createInitialDeal = form.watch("createInitialDeal");

  const duplicateCandidate = useMemo(() => {
    const phone = digits(watchedPhone);
    const document = digits(watchedDocument);
    const email = normalizedText(watchedEmail);
    const name = normalizedText(watchedName);
    const company = normalizedText(watchedCompany);

    for (const lead of leads) {
      if (document.length >= 8 && digits(lead.documento) === document) return { lead, matchBy: "documento" };
      if (phone.length >= 8 && digits(lead.telefone) === phone) return { lead, matchBy: "telefone" };
      if (email && normalizedText(lead.email) === email) return { lead, matchBy: "email" };
      if (name.length >= 3 && company && normalizedText(lead.nome) === name && normalizedText(lead.empresa) === company) {
        return { lead, matchBy: "nome e empresa" };
      }
    }
    return null;
  }, [leads, watchedPhone, watchedEmail, watchedDocument, watchedName, watchedCompany]);

  const duplicate = duplicateCandidate ?? serverDuplicate;

  const { data: tenantUsers = [] } = useListTenantUsers(tenantId, {
    query: {
      enabled: !!tenantId && open && isAdmin,
      queryKey: getListTenantUsersQueryKey(tenantId),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });

  const activeUsers = useMemo(
    () => (tenantUsers as unknown as AssignmentUser[]).filter((user) => user.active !== false),
    [tenantUsers],
  );

  const assignableUsers = useMemo(
    () => activeUsers.filter(canReceiveLeads),
    [activeUsers],
  );

  const { data: crmPeople = { items: [] } } = useQuery<{ items: CrmPersonOption[] }>({
    queryKey: ["crm-people", tenantId, "new-lead-partners", open],
    enabled: Boolean(open && tenantId && commercialPartners.length > 0),
    queryFn: async () => {
      const response = await fetch(`/api/crm/people?tenantId=${encodeURIComponent(tenantId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Não foi possível carregar parceiros já cadastrados.");
      return response.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: representativeFunctions = [] } = useQuery({
    queryKey: ["tenant-user-functions", tenantId, "lead-assignment"],
    enabled: !!tenantId && open && isAdmin,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/user-functions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Não foi possível carregar as empresas representantes.");
      const functions = await response.json() as RepresentativeFunction[];
      return functions.filter((item) =>
        item.kind === "external_company" && Array.isArray(item.permissions) && item.permissions.includes("leads"),
      );
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  function resolveAutomaticAssignee(values: NewLeadValues): string | undefined {
    if (representativeFunctionId(values.assignedTo)) return undefined;
    if (values.assignedTo !== "__auto__") return values.assignedTo;
    if (!assignableUsers.length || !values.endereco.trim()) return undefined;

    const segmentoValue = values.mercadoSegmento?.trim() ?? "";
    const segmentMatches = segmentoValue
      ? assignableUsers.filter((user) =>
          (user.leadAssignmentSegments ?? []).some((segmento) => territoryMatches(segmentoValue, segmento)),
        )
      : [];
    const baseUsers = segmentMatches.length ? segmentMatches : assignableUsers;

    const cityMatches = baseUsers.filter((user) =>
      (user.leadAssignmentCities ?? []).some((city) => territoryMatches(values.endereco, city)),
    );
    const regionMatches = baseUsers.filter((user) =>
      (user.leadAssignmentRegions ?? []).some((region) => territoryMatches(values.endereco, region)),
    );
    const pool = cityMatches.length ? cityMatches : regionMatches.length ? regionMatches : segmentMatches;
    if (!pool.length) return undefined;

    const seed = `${values.nome}|${values.telefone}|${values.email}|${values.empresa}|${values.endereco}`;
    return pool[stableIndex(seed, pool.length)]?.id;
  }

  function resetCoupon() {
    setCouponValidation(null);
    setCouponError(null);
    setCouponLoading(false);
  }

  function closeAndReset() {
    setOpen(false);
    setShowMore(false);
    setShowCommercial(false);
    setExtraContacts([]);
    setCommercialPartners([]);
    setServerDuplicate(null);
    resetCoupon();
    form.reset(DEFAULT_VALUES);
  }

  async function validateCoupon(codeValue?: string): Promise<CouponValidation | null> {
    const code = normalizeCoupon(codeValue ?? form.getValues("cupomCodigo"));
    if (!code) {
      resetCoupon();
      return null;
    }
    if (code.length < 3) {
      setCouponValidation(null);
      setCouponError("Digite ao menos 3 caracteres.");
      return null;
    }

    setCouponLoading(true);
    setCouponError(null);
    try {
      const response = await fetch(`/api/partners/coupons/${encodeURIComponent(code)}/validate`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.valid !== true) {
        setCouponValidation(null);
        setCouponError(data?.error ?? "Cupom inválido ou indisponível.");
        return null;
      }
      const validated = data as CouponValidation;
      setCouponValidation(validated);
      form.setValue("cupomCodigo", validated.code, { shouldDirty: true });
      return validated;
    } catch {
      setCouponValidation(null);
      setCouponError("Não foi possível validar o cupom agora.");
      return null;
    } finally {
      setCouponLoading(false);
    }
  }

  async function findAutoCreatedDeal(leadId: string) {
    const response = await fetch(`/api/tenants/${tenantId}/deals?leadId=${encodeURIComponent(leadId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error("Não foi possível localizar o negócio inicial.");
    const deals = await response.json() as Array<{ id: string; createdAt?: string | null }>;
    return [...deals].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0] ?? null;
  }

  async function syncInitialDeal(leadId: string, values: NewLeadValues) {
    const autoDeal = await findAutoCreatedDeal(leadId);
    if (!autoDeal) {
      if (!values.createInitialDeal) return null;
      // ui-integrity: error-propagates-to-caller — handleSubmit captura e exibe a falha.
      return createDeal.mutateAsync({
        data: {
          tenantId,
          leadId,
          titulo: defaultDealTitle(values),
          etapa: values.dealStage,
          valor: normalizeDealValue(values.dealValue),
          assignedTo: values.assignedTo === "__auto__" || representativeFunctionId(values.assignedTo) ? undefined : values.assignedTo,
        },
      });
    }

    if (!values.createInitialDeal) {
      const response = await fetch(`/api/deals/${autoDeal.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        toast({
          title: "Negócio não removido",
          description: "O contato foi salvo, mas o negócio automático não pôde ser removido.",
          variant: "destructive",
        });
        throw new Error("O contato foi salvo, mas o negócio automático não pôde ser removido.");
      }
      return null;
    }

    const response = await fetch(`/api/deals/${autoDeal.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        titulo: defaultDealTitle(values),
        etapa: values.dealStage,
        valor: normalizeDealValue(values.dealValue) ?? null,
      }),
    });
    if (!response.ok) throw new Error("O contato foi salvo, mas o negócio inicial não pôde ser configurado.");
    return response.json() as Promise<{ id: string }>;
  }

  async function createDealForExisting(values: NewLeadValues, lead: Lead) {
    if (!values.createInitialDeal) {
      onNavigate(`/leads/${lead.id}`);
      closeAndReset();
      return;
    }

    try {
      const resolvedAssignee = resolveAutomaticAssignee(values) ?? (lead as any).assignedTo ?? undefined;
      const deal = await createDeal.mutateAsync({
        data: {
          tenantId,
          leadId: lead.id,
          titulo: defaultDealTitle(values, lead),
          etapa: values.dealStage,
          valor: normalizeDealValue(values.dealValue),
          assignedTo: resolvedAssignee,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: ["leads-overview-context", tenantId] });
      toast({ title: "Novo negócio criado", description: `O contato ${lead.nome} foi reutilizado, sem duplicação.` });
      closeAndReset();
      const dealId = (deal as { id?: string } | undefined)?.id;
      onNavigate(dealId ? `/trabalho/${lead.id}?dealId=${encodeURIComponent(dealId)}` : `/leads/${lead.id}`);
    } catch (error) {
      toast({
        title: "Não foi possível criar o negócio",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }


  async function crmPostJson<T = any>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof (data as any)?.error === "string"
        ? (data as any).error
        : `Falha na operação CRM (HTTP ${response.status})`;
      throw new Error(message);
    }
    return data as T;
  }

  async function syncStructuredCrm(dealId: string | undefined, values: NewLeadValues) {
    let companyId: string | null = null;
    if (values.cadastroTipo !== "pessoa" && values.empresa.trim()) {
      const companyData = await crmPostJson("/api/crm/companies/manual", {
        tenantId,
        razaoSocial: values.empresa.trim(),
        nomeFantasia: values.empresa.trim(),
        cnpj: values.empresaCnpj.trim() || undefined,
      });
      companyId = companyData.company?.id ?? null;
    }

    let personId: string | undefined;

    if (companyId) {
      const primaryContactData = await crmPostJson(`/api/crm/companies/${companyId}/contacts`, {
        tenantId,
        nome: values.nome.trim(),
        telefone: values.telefone || undefined,
        email: values.email || undefined,
        documento: values.documento || undefined,
        cargo: values.profissao || undefined,
        roles: ["comercial"],
        isPrimary: true,
      });
      personId = primaryContactData?.contacts?.find((item: any) => item.isPrimary && item.nome === values.nome.trim())?.personId
        ?? primaryContactData?.contacts?.find((item: any) => item.isPrimary)?.personId;

      for (const contact of extraContacts.filter((item) => item.nome.trim().length >= 2)) {
        await crmPostJson(`/api/crm/companies/${companyId}/contacts`, {
          tenantId,
          nome: contact.nome.trim(),
          telefone: contact.telefone.trim() || undefined,
          email: contact.email.trim() || undefined,
          cargo: contact.cargo.trim() || undefined,
          roles: [contact.role],
          isPrimary: false,
        });
      }
    } else {
      const personData = await crmPostJson("/api/crm/people", {
        tenantId,
        nome: values.nome.trim(),
        telefone: values.telefone || undefined,
        email: values.email || undefined,
        documento: values.documento || undefined,
        source: values.source,
      });
      personId = personData.item?.id as string | undefined;
    }

    if (!dealId) return { personId, companyId };

    if (companyId) {
      await crmPostJson(`/api/crm/deals/${dealId}/companies`, {
        tenantId,
        companyId,
        role: "contratante",
        isPrimary: true,
      });
    }

    if (personId) {
      await crmPostJson(`/api/crm/deals/${dealId}/people`, {
        tenantId,
        personId,
        role: companyId ? "contato_comercial" : "consumidor_final",
        isPrimary: true,
        contextualCompanyId: companyId,
        relationshipScope: companyId ? "persistent" : "deal_only",
      });
    }

    return { personId, companyId };
  }

  async function syncCommercialPartners(leadId: string, dealId?: string) {
    const synced: Array<Record<string, unknown>> = [];

    for (const partner of commercialPartners) {
      let personId = partner.personId;
      let displayName = partner.nome.trim();

      if (partner.mode === "existing") {
        if (!personId) throw new Error("Selecione o parceiro existente ou remova a linha incompleta.");
        const selected = crmPeople.items.find((item) => item.id === personId);
        displayName = selected?.nome ?? displayName;
      } else {
        if (displayName.length < 2) throw new Error("Informe o nome do parceiro ou remova a linha incompleta.");
        const personData = await crmPostJson<{ item?: { id?: string; nome?: string } }>("/api/crm/people", {
          tenantId,
          nome: displayName,
          telefone: partner.telefone.trim() || undefined,
          email: partner.email.trim() || undefined,
          documento: partner.documento.trim() || undefined,
          source: "manual",
        });
        personId = personData.item?.id ?? "";
        displayName = personData.item?.nome ?? displayName;
      }

      if (!personId) throw new Error(`Não foi possível cadastrar ${displayName || "o parceiro"}.`);

      const commission = partner.hasCommission
        ? {
            enabled: true,
            kind: partner.commissionKind,
            value: partner.commissionValue.trim() || null,
            status: "prevista",
          }
        : { enabled: false };

      if (dealId) {
        await crmPostJson(`/api/crm/deals/${dealId}/people`, {
          tenantId,
          personId,
          role: partner.role,
          relationshipScope: "deal_only",
          metadata: { leadId, commission },
        });
      }

      synced.push({
        personId,
        nome: displayName,
        role: partner.role,
        commission,
        relationshipScope: "deal_only",
      });
    }

    return synced;
  }

  async function onSubmit(values: NewLeadValues) {
    if (values.cadastroTipo === "empresa" && values.empresa.trim().length < 2) {
      form.setError("empresa", { message: "Informe a empresa" });
      return;
    }
    if (duplicateCandidate) {
      toast({
        title: "Contato já cadastrado",
        description: "Abra o contato existente ou crie um novo negócio para ele.",
      });
      return;
    }

    setServerDuplicate(null);
    try {
      const couponCode = normalizeCoupon(values.cupomCodigo);
      let coupon = couponValidation;
      if (couponCode) {
        if (!coupon || coupon.code !== couponCode) coupon = await validateCoupon(couponCode);
        if (!coupon) {
          toast({
            title: "Revise o cupom",
            description: "O código de indicação precisa estar válido antes de salvar o lead.",
            variant: "destructive",
          });
          return;
        }
      }

      const selectedRepresentativeFunctionId = representativeFunctionId(values.assignedTo);
      const resolvedAssignee = resolveAutomaticAssignee(values);

      if (!selectedRepresentativeFunctionId && !resolvedAssignee) {
        form.setError("assignedTo", { message: "Defina um responsável antes de salvar o lead." });
        toast({
          title: "Responsável obrigatório",
          description: "Selecione uma pessoa da equipe ou uma empresa representante. A distribuição automática só pode ser usada quando encontrar um responsável válido.",
          variant: "destructive",
        });
        return;
      }

      const submissionValues: NewLeadValues = {
        ...values,
        assignedTo: selectedRepresentativeFunctionId ? values.assignedTo : resolvedAssignee!,
      };

      // ui-integrity: error-propagates-to-caller — o catch deste submit exibe toast ao usuário.
      const newLead = await createLead.mutateAsync({
        data: {
          tenantId,
          nome: submissionValues.nome.trim(),
          telefone: submissionValues.telefone || null,
          email: submissionValues.email || null,
          empresa: submissionValues.cadastroTipo !== "pessoa" ? (submissionValues.empresa || null) : null,
          objetivo: submissionValues.objetivo || null,
          source: coupon ? "indicacao" : submissionValues.source,
          indicadoPor: coupon?.partnerId,
          assignedTo: submissionValues.assignedTo === "__auto__" || selectedRepresentativeFunctionId ? undefined : submissionValues.assignedTo,
          representativeFunctionId: selectedRepresentativeFunctionId ?? undefined,
          instagramHandle: submissionValues.instagramHandle || null,
          profissao: submissionValues.profissao || null,
          endereco: submissionValues.endereco || null,
          documento: submissionValues.documento || null,
          tipoPessoa: "fisica",
          mercadoSegmento: submissionValues.mercadoSegmento || null,
          metadata: coupon
            ? {
                cupomCodigo: coupon.code,
                descontoCupomPercentual: coupon.discountPercent,
                cupomAplicacao: coupon.application,
                parceiroIndicador: coupon.partnerName,
                tipoParceiro: coupon.partnerType,
                atribuicao: "cupom_parceiro",
              }
            : undefined,
        },
      });

      const leadId = (newLead as { id?: string }).id;
      if (!leadId) throw new Error("O contato foi criado sem identificador válido.");

      const deal = await syncInitialDeal(leadId, submissionValues);
      const dealId = (deal as { id?: string } | null | undefined)?.id;
      await syncStructuredCrm(dealId, submissionValues);
      const syncedPartners = await syncCommercialPartners(leadId, dealId);

      if (syncedPartners.length > 0) {
        const metadata = {
          ...(coupon ? {
            cupomCodigo: coupon.code,
            descontoCupomPercentual: coupon.discountPercent,
            cupomAplicacao: coupon.application,
            parceiroIndicador: coupon.partnerName,
            tipoParceiro: coupon.partnerType,
            atribuicao: "cupom_parceiro",
          } : {}),
          envolvidosComerciais: syncedPartners,
        };
        const response = await fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ metadata }),
        });
        if (!response.ok) {
          toast({
            title: "Parceiros não vinculados",
            description: "O lead foi criado, mas os parceiros não puderam ser vinculados ao cadastro.",
            variant: "destructive",
          });
          throw new Error("O lead foi criado, mas os parceiros não puderam ser vinculados ao cadastro.");
        }
      }

      queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: ["leads-overview-context", tenantId] });

      toast({
        title: submissionValues.createInitialDeal ? "Lead e negócio criados" : "Contato salvo",
        description: coupon
          ? `Cupom ${coupon.code} vinculado ao lead com ${coupon.discountPercent}% de desconto.`
          : submissionValues.createInitialDeal
            ? "O contato foi cadastrado uma única vez e o negócio inicial ficou vinculado a ele."
            : "O contato foi salvo sem abrir um negócio agora.",
      });

      closeAndReset();
      if (dealId) onNavigate(`/trabalho/${leadId}?dealId=${encodeURIComponent(dealId)}`);
    } catch (error: any) {
      if (error?.status === 409 && error?.data?.isDuplicate && error?.data?.lead) {
        setServerDuplicate({ lead: error.data.lead as Lead, matchBy: error.data.matchBy ?? "dado" });
        return;
      }
      toast({
        title: "Não foi possível salvar",
        description: error instanceof Error ? error.message : error?.data?.error ?? "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setShowMore(false);
          setShowCommercial(false);
          setExtraContacts([]);
          setCommercialPartners([]);
          setServerDuplicate(null);
          resetCoupon();
          form.reset(DEFAULT_VALUES);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="button-novo-lead">
          <Plus className="mr-2 h-4 w-4" />
          Novo Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Escolha o cenário primeiro. Pessoa, empresa e negócio são cadastros diferentes e podem se relacionar sem duplicação.
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <section className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Quem é o cliente?</p>
                <p className="text-xs text-muted-foreground">A empresa não substitui a pessoa de contato. Um consumidor final pode ser cadastrado sem empresa.</p>
              </div>
              <FormField
                control={form.control}
                name="cadastroTipo"
                render={({ field }) => (
                  <FormItem>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Button
                        type="button"
                        variant={field.value === "pessoa" ? "default" : "outline"}
                        className="h-auto min-h-20 justify-start whitespace-normal py-3 text-left"
                        onClick={() => {
                          field.onChange("pessoa");
                          form.setValue("empresa", "");
                          form.setValue("empresaCnpj", "");
                          setExtraContacts([]);
                        }}
                      >
                        <span><span className="block font-semibold">Pessoa / consumidor final</span><span className="mt-1 block text-xs opacity-80">Cliente direto. Nenhuma empresa é obrigatória.</span></span>
                      </Button>
                      <Button
                        type="button"
                        variant={field.value === "empresa" ? "default" : "outline"}
                        className="h-auto min-h-20 justify-start whitespace-normal py-3 text-left"
                        onClick={() => field.onChange("empresa")}
                      >
                        <span><span className="block font-semibold">Empresa</span><span className="mt-1 block text-xs opacity-80">PJ com um ou vários contatos independentes.</span></span>
                      </Button>
                      <Button
                        type="button"
                        variant={field.value === "negocio" ? "default" : "outline"}
                        className="h-auto min-h-20 justify-start whitespace-normal py-3 text-left"
                        onClick={() => {
                          field.onChange("negocio");
                          form.setValue("createInitialDeal", true);
                        }}
                      >
                        <span><span className="block font-semibold">Negócio com envolvidos</span><span className="mt-1 block text-xs opacity-80">Empresa, consumidor final e outros participantes.</span></span>
                      </Button>
                    </div>
                  </FormItem>
                )}
              />
            </section>

            {cadastroTipo !== "pessoa" && (
              <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-semibold">{cadastroTipo === "negocio" ? "Empresa relacionada (opcional)" : "Empresa"}</p>
                  <p className="text-xs text-muted-foreground">{cadastroTipo === "negocio" ? "Informe somente se houver uma empresa participando deste negócio." : "Cadastre a organização uma única vez. Os contatos ficam vinculados separadamente."}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="empresa"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da empresa {cadastroTipo === "empresa" ? "*" : ""}</FormLabel>
                        <FormControl><Input placeholder={companyPlaceholder || "Razão social ou nome fantasia"} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="empresaCnpj"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CNPJ</FormLabel>
                        <FormControl><Input placeholder="00.000.000/0000-00" {...field} /></FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mercadoSegmento"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Segmento</FormLabel>
                        <FormControl><Input placeholder="Ex.: Construção, varejo, clínica" {...field} /></FormControl>
                        <p className="text-[11px] text-muted-foreground">Usado nos filtros, inteligência comercial e distribuição de leads.</p>
                      </FormItem>
                    )}
                  />
                </div>
              </section>
            )}

            <section className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{cadastroTipo === "pessoa" ? "Pessoa / consumidor final" : cadastroTipo === "empresa" ? "Contato principal da empresa" : "Pessoa principal deste negócio"}</p>
                <p className="text-xs text-muted-foreground">{cadastroTipo === "pessoa" ? "Dados essenciais do cliente direto." : cadastroTipo === "empresa" ? "A empresa pode ter vários contatos. Defina aqui quem é o contato principal." : "Pode ser consumidor final, contato comercial ou a pessoa que iniciou o atendimento."}</p>
              </div>
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl><Input autoFocus data-testid="input-nome" placeholder="Nome completo" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp / Telefone</FormLabel>
                      <FormControl><PhoneInput data-testid="input-telefone" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input data-testid="input-email" placeholder="email@empresa.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {cadastroTipo !== "pessoa" && form.watch("empresa").trim() && (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Outros contatos da empresa</p>
                      <p className="text-xs text-muted-foreground">Financeiro, compras, diretoria, obras e demais pessoas podem ser cadastradas agora.</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setExtraContacts((items) => [...items, {
                        id: crypto.randomUUID(),
                        nome: "",
                        telefone: "",
                        email: "",
                        cargo: "",
                        role: "outro",
                      }])}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar contato
                    </Button>
                  </div>

                  {extraContacts.map((contact, index) => (
                    <div key={contact.id} className="space-y-2 rounded-md bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground">Contato {index + 2}</p>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setExtraContacts((items) => items.filter((item) => item.id !== contact.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          placeholder="Nome completo"
                          value={contact.nome}
                          onChange={(event) => setExtraContacts((items) => items.map((item) => item.id === contact.id ? { ...item, nome: event.target.value } : item))}
                        />
                        <Input
                          placeholder="Cargo / função"
                          value={contact.cargo}
                          onChange={(event) => setExtraContacts((items) => items.map((item) => item.id === contact.id ? { ...item, cargo: event.target.value } : item))}
                        />
                        <PhoneInput
                          value={contact.telefone}
                          onChange={(value) => setExtraContacts((items) => items.map((item) => item.id === contact.id ? { ...item, telefone: value ?? "" } : item))}
                        />
                        <Input
                          type="email"
                          placeholder="email@empresa.com"
                          value={contact.email}
                          onChange={(event) => setExtraContacts((items) => items.map((item) => item.id === contact.id ? { ...item, email: event.target.value } : item))}
                        />
                        <div className="sm:col-span-2">
                          <Select
                            value={contact.role}
                            onValueChange={(value) => setExtraContacts((items) => items.map((item) => item.id === contact.id ? { ...item, role: value as ExtraCompanyContact["role"] } : item))}
                          >
                            <SelectTrigger><SelectValue placeholder="Papel na empresa" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="comercial">Comercial</SelectItem>
                              <SelectItem value="decisor">Decisor</SelectItem>
                              <SelectItem value="compras">Compras</SelectItem>
                              <SelectItem value="financeiro">Financeiro</SelectItem>
                              <SelectItem value="tecnico">Técnico / obra</SelectItem>
                              <SelectItem value="administrativo">Administrativo</SelectItem>
                              <SelectItem value="suporte">Suporte</SelectItem>
                              <SelectItem value="outro">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Button type="button" variant="ghost" className="h-auto w-full justify-between border-t px-0 pt-4" onClick={() => setShowCommercial((value) => !value)}>
              <span>
                <span className="block text-sm font-semibold text-left">Configurações comerciais</span>
                <span className="block text-xs font-normal text-muted-foreground text-left">Origem, indicação e responsável</span>
              </span>
              {showCommercial ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showCommercial && (
            <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold">Origem e atendimento</p>
                <p className="text-xs text-muted-foreground">Origem, indicação e responsável pelo atendimento.</p>
              </div>
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origem do lead</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="manual">Cadastro manual</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="site">Site / formulário</SelectItem>
                        <SelectItem value="anuncio">Anúncio</SelectItem>
                        <SelectItem value="indicacao">Indicação</SelectItem>
                        <SelectItem value="prospeccao">Prospecção</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cupomCodigo"
                render={({ field }) => (
                  <FormItem className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <Ticket className="h-4 w-4 text-muted-foreground" />
                      <FormLabel className="m-0">Cupom / código de indicação</FormLabel>
                      <span className="text-[11px] text-muted-foreground">opcional</span>
                    </div>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="Ex.: MARCOS10"
                          value={field.value}
                          onChange={(event) => {
                            field.onChange(event.target.value.toUpperCase());
                            if (couponValidation || couponError) resetCoupon();
                          }}
                          autoComplete="off"
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={couponLoading || normalizeCoupon(watchedCoupon).length < 3}
                        onClick={() => void validateCoupon()}
                      >
                        {couponLoading ? "Validando..." : "Validar"}
                      </Button>
                    </div>
                    {couponValidation && couponValidation.code === normalizeCoupon(watchedCoupon) && (
                      <div className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          Cupom válido{couponValidation.partnerName ? ` · ${couponValidation.partnerName}` : ""}.
                          {couponValidation.discountPercent > 0 ? ` ${couponValidation.discountPercent}% de desconto aplicado.` : " Indicação vinculada."}
                        </span>
                      </div>
                    )}
                    {couponError && (
                      <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{couponError}</span>
                      </div>
                    )}
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      O código vincula automaticamente o lead ao parceiro, influenciador ou afiliado. A comissão do parceiro nunca é exibida ao lead.
                    </p>
                  </FormItem>
                )}
              />

              {isAdmin && (
                <FormField
                  control={form.control}
                  name="assignedTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsável *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__auto__">Distribuir automaticamente</SelectItem>
                          {activeUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>{user.name || user.email || user.id}</SelectItem>
                          ))}
                          {representativeFunctions.map((representative) => (
                            <SelectItem key={representative.id} value={`${REPRESENTATIVE_PREFIX}${representative.id}`}>
                              {representative.name} · empresa representante
                            </SelectItem>
                          ))}
                          {activeUsers.length === 0 && representativeFunctions.length === 0 && (
                            <SelectItem value="__none_available__" disabled>Nenhum usuário ativo disponível</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Obrigatório. Atribuição manual: mostra todos os usuários ativos. Automático: usa apenas usuários habilitados para receber leads e prioriza cidade, região e segmento configurados; se não encontrar ninguém, o lead não será criado. Empresas representantes autorizadas aparecem junto da equipe.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </section>
            )}

            <Button type="button" variant="ghost" className="h-auto w-full justify-between px-0 py-1" onClick={() => setShowMore((value) => !value)}>
              <span className="text-sm">Mais informações do contato</span>
              {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showMore && (
              <section className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="documento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF / documento da pessoa</FormLabel>
                      <FormControl><Input placeholder="000.000.000-00" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="instagramHandle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instagram</FormLabel>
                      <FormControl><Input placeholder="@usuario" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="profissao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo / função</FormLabel>
                      <FormControl><Input placeholder="Ex.: Comprador, Diretor, Arquiteto" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endereco"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade / UF</FormLabel>
                      <FormControl><Input placeholder="Ex.: Chapecó / SC" {...field} /></FormControl>
                      <p className="text-[11px] text-muted-foreground">Quando a distribuição estiver automática, este dado também ajuda a escolher o responsável territorial.</p>
                    </FormItem>
                  )}
                />
              </section>
            )}

            <section className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Parceiros e envolvidos</p>
                  <p className="text-xs text-muted-foreground">
                    Indicador, arquiteto, parceiro ou outro profissional. Comissão é opcional e começa como sem comissão.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCommercialPartners((items) => [...items, {
                    id: crypto.randomUUID(),
                    mode: "new",
                    personId: "",
                    nome: "",
                    telefone: "",
                    email: "",
                    documento: "",
                    role: "parceiro",
                    hasCommission: false,
                    commissionKind: "percent",
                    commissionValue: "",
                  }])}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar parceiro
                </Button>
              </div>

              {commercialPartners.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  Nenhum parceiro vinculado. Isso não impede o cadastro do lead.
                </p>
              ) : (
                <div className="space-y-3">
                  {commercialPartners.map((partner, index) => (
                    <div key={partner.id} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-muted-foreground">Envolvido {index + 1}</p>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setCommercialPartners((items) => items.filter((item) => item.id !== partner.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select
                          value={partner.mode}
                          onValueChange={(value) => setCommercialPartners((items) => items.map((item) => item.id === partner.id ? {
                            ...item,
                            mode: value as CommercialPartnerDraft["mode"],
                            personId: "",
                          } : item))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="existing">Já cadastrado</SelectItem>
                            <SelectItem value="new">Cadastrar novo</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={partner.role}
                          onValueChange={(value) => setCommercialPartners((items) => items.map((item) => item.id === partner.id ? {
                            ...item,
                            role: value as CommercialPartnerDraft["role"],
                          } : item))}
                        >
                          <SelectTrigger><SelectValue placeholder="Papel" /></SelectTrigger>
                          <SelectContent>
                            {COMMERCIAL_PARTNER_ROLES.map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {partner.mode === "existing" ? (
                        <Select
                          value={partner.personId}
                          onValueChange={(value) => setCommercialPartners((items) => items.map((item) => item.id === partner.id ? { ...item, personId: value } : item))}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione a pessoa cadastrada" /></SelectTrigger>
                          <SelectContent>
                            {crmPeople.items.map((person) => (
                              <SelectItem key={person.id} value={person.id}>
                                {person.nome}{person.documento ? ` · ${person.documento}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            className="sm:col-span-2"
                            placeholder="Nome do parceiro / profissional"
                            value={partner.nome}
                            onChange={(event) => setCommercialPartners((items) => items.map((item) => item.id === partner.id ? { ...item, nome: event.target.value } : item))}
                          />
                          <PhoneInput
                            value={partner.telefone}
                            onChange={(value) => setCommercialPartners((items) => items.map((item) => item.id === partner.id ? { ...item, telefone: value ?? "" } : item))}
                          />
                          <Input
                            type="email"
                            placeholder="email@empresa.com"
                            value={partner.email}
                            onChange={(event) => setCommercialPartners((items) => items.map((item) => item.id === partner.id ? { ...item, email: event.target.value } : item))}
                          />
                          <Input
                            className="sm:col-span-2"
                            placeholder="CPF / documento (opcional)"
                            value={partner.documento}
                            onChange={(event) => setCommercialPartners((items) => items.map((item) => item.id === partner.id ? { ...item, documento: event.target.value } : item))}
                          />
                        </div>
                      )}

                      <div className="space-y-2 rounded-md border bg-background p-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={partner.hasCommission}
                            onChange={(event) => setCommercialPartners((items) => items.map((item) => item.id === partner.id ? { ...item, hasCommission: event.target.checked } : item))}
                          />
                          Possui comissão / ganho
                        </label>
                        <p className="text-[11px] text-muted-foreground">Opcional. Se não houver ganho, deixe desmarcado.</p>
                        {partner.hasCommission && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Select
                              value={partner.commissionKind}
                              onValueChange={(value) => setCommercialPartners((items) => items.map((item) => item.id === partner.id ? { ...item, commissionKind: value as CommercialPartnerDraft["commissionKind"] } : item))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percent">Percentual</SelectItem>
                                <SelectItem value="fixed">Valor fixo</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              inputMode="decimal"
                              placeholder={partner.commissionKind === "percent" ? "Ex.: 15" : "Ex.: 1500,00"}
                              value={partner.commissionValue}
                              onChange={(event) => setCommercialPartners((items) => items.map((item) => item.id === partner.id ? { ...item, commissionValue: event.target.value } : item))}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Sem negócio agora, os envolvidos ficam registrados no lead. Com negócio, também são vinculados como participantes do negócio.
              </p>
            </section>

            <section className="space-y-3 border-t pt-4">
              {cadastroTipo !== "negocio" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  checked={createInitialDeal}
                  onChange={(event) => form.setValue("createInitialDeal", event.target.checked, { shouldDirty: true })}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-semibold">Iniciar um negócio para este contato</span>
                  <span className="block text-xs text-muted-foreground">Desmarque se quiser apenas cadastrar o contato agora.</span>
                </span>
              </label>
              )}

              {cadastroTipo === "negocio" && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm font-semibold">Negócio com vários envolvidos</p>
                  <p className="text-xs text-muted-foreground">Ao salvar, o negócio será aberto na Central de Trabalho para adicionar consumidor final, construtora, arquiteto, financeiro e outros participantes.</p>
                </div>
              )}

              {createInitialDeal && (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="dealTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome do negócio</FormLabel>
                          <FormControl><Input placeholder="Ex.: Esquadrias obra Centro" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dealValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor estimado</FormLabel>
                          <FormControl><Input inputMode="decimal" placeholder="Ex.: 85000,00" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="dealStage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Etapa inicial</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="em_aquecimento">Aquecimento</SelectItem>
                              <SelectItem value="novo">Novo</SelectItem>
                              <SelectItem value="qualificado">Qualificado</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="objetivo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Interesse / necessidade</FormLabel>
                          <FormControl><Input placeholder={objectivePlaceholder || "O que este contato procura?"} {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </section>

            {duplicate && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Contato já cadastrado</p>
                    <p className="text-xs text-amber-800">
                      Encontramos {duplicate.lead.nome}{duplicate.lead.empresa ? ` · ${duplicate.lead.empresa}` : ""} pelo mesmo {duplicate.matchBy}.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => onNavigate(`/leads/${duplicate.lead.id}`)}>
                    Abrir contato
                  </Button>
                  {createInitialDeal && (
                    <Button type="button" size="sm" onClick={() => createDealForExisting(form.getValues(), duplicate.lead)} disabled={createDeal.isPending}>
                      <UserRound className="mr-1.5 h-3.5 w-3.5" />
                      Criar negócio neste contato
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 border-t pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={closeAndReset}>Cancelar</Button>
              <Button type="submit" className="flex-1" disabled={createLead.isPending || couponLoading || !!duplicateCandidate} data-testid="button-submit-lead">
                {createLead.isPending
                  ? "Salvando..."
                  : createInitialDeal
                    ? cadastroTipo === "negocio" ? "Criar negócio e adicionar envolvidos" : "Salvar e iniciar negócio"
                    : "Salvar lead"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
