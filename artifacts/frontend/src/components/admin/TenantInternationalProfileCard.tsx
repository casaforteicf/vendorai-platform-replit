import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTenantQueryKey, getListTenantsQueryKey } from "@workspace/api-client-react";
import { CalendarClock, CreditCard, Globe2, IdCard, Loader2, ReceiptText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const COUNTRY_PROFILES = {
  BR: {
    label: "Brasil",
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
    currency: "BRL",
    taxType: "CNPJ",
  },
  PY: {
    label: "Paraguai",
    locale: "es-PY",
    timezone: "America/Asuncion",
    currency: "PYG",
    taxType: "RUC",
  },
  AR: {
    label: "Argentina",
    locale: "es-AR",
    timezone: "America/Argentina/Buenos_Aires",
    currency: "ARS",
    taxType: "CUIT",
  },
  UY: {
    label: "Uruguai",
    locale: "es-UY",
    timezone: "America/Montevideo",
    currency: "UYU",
    taxType: "RUT",
  },
  CL: {
    label: "Chile",
    locale: "es-CL",
    timezone: "America/Santiago",
    currency: "CLP",
    taxType: "RUT",
  },
} as const;

type CountryCode = keyof typeof COUNTRY_PROFILES;
type SupportedLocale = "pt-BR" | "es-PY" | "es-AR" | "es-UY" | "es-CL";
type SupportedCurrency = "BRL" | "USD" | "PYG" | "ARS" | "UYU" | "CLP";
type PaymentMethod = "" | "pix" | "boleto" | "cartao" | "transferencia" | "outro";
type PaymentStatus = "" | "pago" | "pendente" | "atrasado" | "isento";

const LOCALES: Array<{ value: SupportedLocale; label: string }> = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "es-PY", label: "Español (Paraguay)" },
  { value: "es-AR", label: "Español (Argentina)" },
  { value: "es-UY", label: "Español (Uruguay)" },
  { value: "es-CL", label: "Español (Chile)" },
];

const CURRENCIES: SupportedCurrency[] = ["BRL", "USD", "PYG", "ARS", "UYU", "CLP"];

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Asuncion",
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Santiago",
] as const;

export type TenantInternationalProfile = {
  tenantCode?: string | null;
  countryCode?: string | null;
  defaultLocale?: string | null;
  timezone?: string | null;
  defaultCurrency?: string | null;
  supportedCurrencies?: string[] | null;
  taxIdentifierType?: string | null;
  taxIdentifier?: string | null;
  isDemo?: boolean | null;
  demoStartedAt?: string | null;
  demoExpiresAt?: string | null;
  demoConvertedAt?: string | null;
  mensalidadeValor?: string | number | null;
  mensalidadeTabelaValor?: string | number | null;
  taxaImplantacaoValor?: string | number | null;
  descontoPercentual?: string | number | null;
  formaPagamento?: PaymentMethod | null;
  statusPagamento?: PaymentStatus | null;
  diaVencimento?: number | null;
  ultimoPagamentoEm?: string | null;
  proximoPagamentoEm?: string | null;
  contratoInicioEm?: string | null;
  contratoFimEm?: string | null;
  renovacaoAutomatica?: boolean | null;
  origemCliente?: string | null;
  responsavelComercial?: string | null;
  observacoesComerciais?: string | null;
  motivoDesconto?: string | null;
};

type FormState = {
  countryCode: CountryCode;
  defaultLocale: SupportedLocale;
  timezone: string;
  defaultCurrency: SupportedCurrency;
  supportedCurrencies: SupportedCurrency[];
  taxIdentifierType: string;
  taxIdentifier: string;
};

type CommercialFormState = {
  isDemo: boolean;
  demoExpiresAt: string;
  mensalidadeTabelaValor: string;
  mensalidadeValor: string;
  taxaImplantacaoValor: string;
  descontoPercentual: string;
  formaPagamento: PaymentMethod;
  statusPagamento: PaymentStatus;
  diaVencimento: string;
  ultimoPagamentoEm: string;
  proximoPagamentoEm: string;
  contratoInicioEm: string;
  contratoFimEm: string;
  renovacaoAutomatica: boolean;
  origemCliente: string;
  responsavelComercial: string;
  observacoesComerciais: string;
  motivoDesconto: string;
};

function profileToForm(tenant: TenantInternationalProfile): FormState {
  const countryCode = (tenant.countryCode && tenant.countryCode in COUNTRY_PROFILES
    ? tenant.countryCode
    : "BR") as CountryCode;
  const preset = COUNTRY_PROFILES[countryCode];
  const defaultLocale = LOCALES.some((item) => item.value === tenant.defaultLocale)
    ? (tenant.defaultLocale as SupportedLocale)
    : preset.locale;
  const defaultCurrency = CURRENCIES.includes(tenant.defaultCurrency as SupportedCurrency)
    ? (tenant.defaultCurrency as SupportedCurrency)
    : preset.currency;
  const supportedCurrencies = (tenant.supportedCurrencies ?? [])
    .filter((value): value is SupportedCurrency => CURRENCIES.includes(value as SupportedCurrency));

  return {
    countryCode,
    defaultLocale,
    timezone: tenant.timezone || preset.timezone,
    defaultCurrency,
    supportedCurrencies: supportedCurrencies.length
      ? Array.from(new Set([defaultCurrency, ...supportedCurrencies]))
      : [defaultCurrency],
    taxIdentifierType: tenant.taxIdentifierType || preset.taxType,
    taxIdentifier: tenant.taxIdentifier || "",
  };
}

function toInputDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function toIsoDate(value: string): string | null {
  return value ? `${value}T12:00:00.000Z` : null;
}

function numberToInput(value?: string | number | null): string {
  if (value == null || value === "") return "";
  return String(value).replace(",", ".");
}

function commercialToForm(tenant: TenantInternationalProfile): CommercialFormState {
  return {
    isDemo: !!tenant.isDemo,
    demoExpiresAt: toInputDate(tenant.demoExpiresAt),
    mensalidadeTabelaValor: numberToInput(tenant.mensalidadeTabelaValor),
    mensalidadeValor: numberToInput(tenant.mensalidadeValor),
    taxaImplantacaoValor: numberToInput(tenant.taxaImplantacaoValor),
    descontoPercentual: numberToInput(tenant.descontoPercentual),
    formaPagamento: tenant.formaPagamento ?? "",
    statusPagamento: tenant.statusPagamento ?? "",
    diaVencimento: tenant.diaVencimento ? String(tenant.diaVencimento) : "",
    ultimoPagamentoEm: toInputDate(tenant.ultimoPagamentoEm),
    proximoPagamentoEm: toInputDate(tenant.proximoPagamentoEm),
    contratoInicioEm: toInputDate(tenant.contratoInicioEm),
    contratoFimEm: toInputDate(tenant.contratoFimEm),
    renovacaoAutomatica: !!tenant.renovacaoAutomatica,
    origemCliente: tenant.origemCliente ?? "",
    responsavelComercial: tenant.responsavelComercial ?? "",
    observacoesComerciais: tenant.observacoesComerciais ?? "",
    motivoDesconto: tenant.motivoDesconto ?? "",
  };
}

function optionalMoney(value: string): string | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : null;
}

export function TenantInternationalProfileCard({
  tenantId,
  tenant,
}: {
  tenantId: string;
  tenant: TenantInternationalProfile;
}) {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => profileToForm(tenant));
  const [commercialForm, setCommercialForm] = useState<CommercialFormState>(() => commercialToForm(tenant));
  const [saving, setSaving] = useState(false);
  const [savingCommercial, setSavingCommercial] = useState(false);

  useEffect(() => {
    setForm(profileToForm(tenant));
  }, [
    tenant.countryCode,
    tenant.defaultLocale,
    tenant.timezone,
    tenant.defaultCurrency,
    tenant.supportedCurrencies,
    tenant.taxIdentifierType,
    tenant.taxIdentifier,
  ]);

  useEffect(() => {
    setCommercialForm(commercialToForm(tenant));
  }, [
    tenant.isDemo,
    tenant.demoExpiresAt,
    tenant.mensalidadeTabelaValor,
    tenant.mensalidadeValor,
    tenant.taxaImplantacaoValor,
    tenant.descontoPercentual,
    tenant.formaPagamento,
    tenant.statusPagamento,
    tenant.diaVencimento,
    tenant.ultimoPagamentoEm,
    tenant.proximoPagamentoEm,
    tenant.contratoInicioEm,
    tenant.contratoFimEm,
    tenant.renovacaoAutomatica,
    tenant.origemCliente,
    tenant.responsavelComercial,
    tenant.observacoesComerciais,
    tenant.motivoDesconto,
  ]);

  const selectedCountry = COUNTRY_PROFILES[form.countryCode];
  const isDirty = useMemo(() => {
    const original = profileToForm(tenant);
    return JSON.stringify(form) !== JSON.stringify(original);
  }, [form, tenant]);
  const commercialDirty = useMemo(
    () => JSON.stringify(commercialForm) !== JSON.stringify(commercialToForm(tenant)),
    [commercialForm, tenant],
  );
  const demoExpiryMissing = commercialForm.isDemo && !commercialForm.demoExpiresAt;

  function applyCountry(countryCode: CountryCode) {
    const preset = COUNTRY_PROFILES[countryCode];
    setForm((current) => ({
      ...current,
      countryCode,
      defaultLocale: preset.locale,
      timezone: preset.timezone,
      defaultCurrency: preset.currency,
      supportedCurrencies: [preset.currency],
      taxIdentifierType: preset.taxType,
      taxIdentifier: "",
    }));
  }

  function setDefaultCurrency(currency: SupportedCurrency) {
    setForm((current) => ({
      ...current,
      defaultCurrency: currency,
      supportedCurrencies: Array.from(new Set([currency, ...current.supportedCurrencies])),
    }));
  }

  function toggleSupportedCurrency(currency: SupportedCurrency) {
    setForm((current) => {
      if (currency === current.defaultCurrency) return current;
      const enabled = current.supportedCurrencies.includes(currency);
      return {
        ...current,
        supportedCurrencies: enabled
          ? current.supportedCurrencies.filter((item) => item !== currency)
          : [...current.supportedCurrencies, currency],
      };
    });
  }

  async function invalidateTenant() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-tenant-detail", tenantId] }),
      qc.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) }),
      qc.invalidateQueries({ queryKey: getListTenantsQueryKey() }),
    ]);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          countryCode: form.countryCode,
          defaultLocale: form.defaultLocale,
          timezone: form.timezone,
          defaultCurrency: form.defaultCurrency,
          supportedCurrencies: Array.from(new Set([form.defaultCurrency, ...form.supportedCurrencies])),
          taxIdentifierType: form.taxIdentifierType.trim() || null,
          taxIdentifier: form.taxIdentifier.trim() || null,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar o perfil internacional");

      await invalidateTenant();
      toast({ title: "Perfil internacional atualizado" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Erro ao atualizar perfil internacional",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveCommercial() {
    const dueDay = commercialForm.diaVencimento ? Number(commercialForm.diaVencimento) : null;
    const discount = commercialForm.descontoPercentual ? Number(commercialForm.descontoPercentual.replace(",", ".")) : null;
    if (demoExpiryMissing) {
      toast({ title: "Informe até quando o Demo será válido", variant: "destructive" });
      return;
    }
    if (dueDay != null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
      toast({ title: "Dia de vencimento deve estar entre 1 e 31", variant: "destructive" });
      return;
    }
    if (discount != null && (!Number.isFinite(discount) || discount < 0 || discount > 100)) {
      toast({ title: "Desconto deve estar entre 0% e 100%", variant: "destructive" });
      return;
    }

    setSavingCommercial(true);
    try {
      const wasDemo = !!tenant.isDemo;
      const willBeDemo = commercialForm.isDemo;
      const payload: Record<string, unknown> = {
        isDemo: willBeDemo,
        demoExpiresAt: willBeDemo ? toIsoDate(commercialForm.demoExpiresAt) : null,
        mensalidadeTabelaValor: optionalMoney(commercialForm.mensalidadeTabelaValor),
        mensalidadeValor: optionalMoney(commercialForm.mensalidadeValor),
        taxaImplantacaoValor: optionalMoney(commercialForm.taxaImplantacaoValor),
        descontoPercentual: discount == null ? null : discount.toFixed(2),
        formaPagamento: commercialForm.formaPagamento || null,
        statusPagamento: commercialForm.statusPagamento || null,
        diaVencimento: dueDay,
        ultimoPagamentoEm: toIsoDate(commercialForm.ultimoPagamentoEm),
        proximoPagamentoEm: toIsoDate(commercialForm.proximoPagamentoEm),
        contratoInicioEm: toIsoDate(commercialForm.contratoInicioEm),
        contratoFimEm: toIsoDate(commercialForm.contratoFimEm),
        renovacaoAutomatica: commercialForm.renovacaoAutomatica,
        origemCliente: commercialForm.origemCliente.trim() || null,
        responsavelComercial: commercialForm.responsavelComercial.trim() || null,
        observacoesComerciais: commercialForm.observacoesComerciais.trim() || null,
        motivoDesconto: commercialForm.motivoDesconto.trim() || null,
      };

      if (!wasDemo && willBeDemo) {
        payload.demoStartedAt = new Date().toISOString();
        payload.demoConvertedAt = null;
      }
      if (wasDemo && !willBeDemo) {
        payload.demoConvertedAt = new Date().toISOString();
      }

      const response = await fetch(`/api/tenants/${tenantId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar dados comerciais");

      await invalidateTenant();
      toast({
        title: wasDemo && !willBeDemo
          ? "Demo convertido em cliente sem alterar a identidade do tenant"
          : "Dados comerciais e financeiros atualizados",
      });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Erro ao atualizar dados comerciais",
        variant: "destructive",
      });
    } finally {
      setSavingCommercial(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Globe2 className="h-5 w-5" /> Perfil internacional
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Define país, idioma, fuso, moedas e identificação fiscal usados pelo tenant.
              </p>
            </div>
            <Badge variant="outline">{selectedCountry.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="tenant-country" className="text-xs font-medium">País</label>
              <select
                id="tenant-country"
                value={form.countryCode}
                onChange={(event) => applyCountry(event.target.value as CountryCode)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {Object.entries(COUNTRY_PROFILES).map(([code, profile]) => (
                  <option key={code} value={code}>{profile.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="tenant-locale" className="text-xs font-medium">Idioma padrão</label>
              <select
                id="tenant-locale"
                value={form.defaultLocale}
                onChange={(event) => setForm((current) => ({ ...current, defaultLocale: event.target.value as SupportedLocale }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {LOCALES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="tenant-timezone" className="text-xs font-medium">Fuso horário</label>
              <select
                id="tenant-timezone"
                value={form.timezone}
                onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {TIMEZONES.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="tenant-currency" className="text-xs font-medium">Moeda principal</label>
              <select
                id="tenant-currency"
                value={form.defaultCurrency}
                onChange={(event) => setDefaultCurrency(event.target.value as SupportedCurrency)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">Moedas habilitadas</p>
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map((currency) => {
                const checked = form.supportedCurrencies.includes(currency);
                const locked = currency === form.defaultCurrency;
                return (
                  <label
                    key={currency}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${checked ? "bg-muted" : "bg-background"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggleSupportedCurrency(currency)}
                    />
                    {currency}{locked ? " · principal" : ""}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="tenant-tax-type" className="text-xs font-medium">Tipo de documento fiscal</label>
              <Input
                id="tenant-tax-type"
                value={form.taxIdentifierType}
                onChange={(event) => setForm((current) => ({ ...current, taxIdentifierType: event.target.value }))}
                placeholder={selectedCountry.taxType}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="tenant-tax-id" className="text-xs font-medium">Número fiscal</label>
              <Input
                id="tenant-tax-id"
                value={form.taxIdentifier}
                onChange={(event) => setForm((current) => ({ ...current, taxIdentifier: event.target.value }))}
                placeholder={`${selectedCountry.taxType} da empresa`}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-4">
            <p className="text-xs text-muted-foreground max-w-2xl">
              Ao trocar o país, aplicamos o idioma, fuso, moeda e tipo fiscal recomendados. Você pode ajustar cada campo antes de salvar.
            </p>
            <div className="flex gap-2">
              {isDirty && (
                <Button type="button" variant="ghost" onClick={() => setForm(profileToForm(tenant))} disabled={saving}>
                  Descartar
                </Button>
              )}
              <Button type="button" onClick={() => void save()} disabled={saving || !isDirty}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar perfil internacional
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ReceiptText className="h-5 w-5" /> Comercial, contrato e pagamentos
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Cadastro comercial 360º do tenant. Demo e cliente pago usam a mesma identidade e o mesmo histórico.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {tenant.tenantCode && (
                <Badge variant="outline" className="font-mono gap-1">
                  <IdCard className="h-3.5 w-3.5" /> {tenant.tenantCode}
                </Badge>
              )}
              <Badge variant="outline" className={commercialForm.isDemo ? "text-violet-700 border-violet-200" : "text-emerald-700 border-emerald-200"}>
                {commercialForm.isDemo ? "DEMO" : "CLIENTE"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Tenant de demonstração</p>
                <p className="text-xs text-muted-foreground">
                  Pode ser convertido em cliente sem trocar o número {tenant.tenantCode ?? "único"}.
                </p>
              </div>
              <Switch
                checked={commercialForm.isDemo}
                onCheckedChange={(checked) => setCommercialForm((current) => ({ ...current, isDemo: checked }))}
              />
            </div>
            {commercialForm.isDemo && (
              <div className="max-w-xs space-y-1.5">
                <label htmlFor="demo-expiration" className="text-xs font-medium">Demo válido até *</label>
                <Input
                  id="demo-expiration"
                  type="date"
                  value={commercialForm.demoExpiresAt}
                  aria-invalid={demoExpiryMissing}
                  onChange={(event) => setCommercialForm((current) => ({ ...current, demoExpiresAt: event.target.value }))}
                />
                {demoExpiryMissing && (
                  <p className="text-xs text-red-600">A data de validade é obrigatória para tenants Demo.</p>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4" /> Valores e cobrança
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="list-price" className="text-xs font-medium">Mensalidade de tabela</label>
                <Input id="list-price" inputMode="decimal" value={commercialForm.mensalidadeTabelaValor} onChange={(event) => setCommercialForm((current) => ({ ...current, mensalidadeTabelaValor: event.target.value }))} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="negotiated-price" className="text-xs font-medium">Mensalidade negociada</label>
                <Input id="negotiated-price" inputMode="decimal" value={commercialForm.mensalidadeValor} onChange={(event) => setCommercialForm((current) => ({ ...current, mensalidadeValor: event.target.value }))} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="setup-price" className="text-xs font-medium">Implantação</label>
                <Input id="setup-price" inputMode="decimal" value={commercialForm.taxaImplantacaoValor} onChange={(event) => setCommercialForm((current) => ({ ...current, taxaImplantacaoValor: event.target.value }))} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="discount" className="text-xs font-medium">Desconto (%)</label>
                <Input id="discount" inputMode="decimal" value={commercialForm.descontoPercentual} onChange={(event) => setCommercialForm((current) => ({ ...current, descontoPercentual: event.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="payment-method" className="text-xs font-medium">Forma de pagamento</label>
                <select id="payment-method" value={commercialForm.formaPagamento} onChange={(event) => setCommercialForm((current) => ({ ...current, formaPagamento: event.target.value as PaymentMethod }))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Não definida</option>
                  <option value="pix">Pix</option>
                  <option value="boleto">Boleto</option>
                  <option value="cartao">Cartão</option>
                  <option value="transferencia">Transferência</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="payment-status" className="text-xs font-medium">Status do pagamento</label>
                <select id="payment-status" value={commercialForm.statusPagamento} onChange={(event) => setCommercialForm((current) => ({ ...current, statusPagamento: event.target.value as PaymentStatus }))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Não definido</option>
                  <option value="pago">Pago</option>
                  <option value="pendente">Pendente</option>
                  <option value="atrasado">Atrasado</option>
                  <option value="isento">Isento</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="due-day" className="text-xs font-medium">Dia de vencimento</label>
                <Input id="due-day" type="number" min={1} max={31} value={commercialForm.diaVencimento} onChange={(event) => setCommercialForm((current) => ({ ...current, diaVencimento: event.target.value }))} placeholder="10" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="last-payment" className="text-xs font-medium">Último pagamento</label>
                <Input id="last-payment" type="date" value={commercialForm.ultimoPagamentoEm} onChange={(event) => setCommercialForm((current) => ({ ...current, ultimoPagamentoEm: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="next-payment" className="text-xs font-medium">Próximo pagamento</label>
                <Input id="next-payment" type="date" value={commercialForm.proximoPagamentoEm} onChange={(event) => setCommercialForm((current) => ({ ...current, proximoPagamentoEm: event.target.value }))} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold flex items-center gap-2 mb-3">
              <CalendarClock className="h-4 w-4" /> Contrato e negociação
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="contract-start" className="text-xs font-medium">Início do contrato</label>
                <Input id="contract-start" type="date" value={commercialForm.contratoInicioEm} onChange={(event) => setCommercialForm((current) => ({ ...current, contratoInicioEm: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contract-end" className="text-xs font-medium">Fim do contrato</label>
                <Input id="contract-end" type="date" value={commercialForm.contratoFimEm} onChange={(event) => setCommercialForm((current) => ({ ...current, contratoFimEm: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="customer-source" className="text-xs font-medium">Origem do cliente</label>
                <Input id="customer-source" value={commercialForm.origemCliente} onChange={(event) => setCommercialForm((current) => ({ ...current, origemCliente: event.target.value }))} placeholder="Indicação, campanha, vendedor..." />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="commercial-owner" className="text-xs font-medium">Responsável comercial</label>
                <Input id="commercial-owner" value={commercialForm.responsavelComercial} onChange={(event) => setCommercialForm((current) => ({ ...current, responsavelComercial: event.target.value }))} placeholder="Nome do responsável" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-md border p-3 max-w-xl">
              <div>
                <p className="text-xs font-medium">Renovação automática</p>
                <p className="text-xs text-muted-foreground">Registra a condição negociada do contrato.</p>
              </div>
              <Switch checked={commercialForm.renovacaoAutomatica} onCheckedChange={(checked) => setCommercialForm((current) => ({ ...current, renovacaoAutomatica: checked }))} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <div className="space-y-1.5">
                <label htmlFor="discount-reason" className="text-xs font-medium">Motivo/condição do desconto</label>
                <Textarea id="discount-reason" rows={3} value={commercialForm.motivoDesconto} onChange={(event) => setCommercialForm((current) => ({ ...current, motivoDesconto: event.target.value }))} placeholder="Ex.: valor promocional por 6 meses, carência, parceiro..." />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="commercial-notes" className="text-xs font-medium">Observações comerciais internas</label>
                <Textarea id="commercial-notes" rows={3} value={commercialForm.observacoesComerciais} onChange={(event) => setCommercialForm((current) => ({ ...current, observacoesComerciais: event.target.value }))} placeholder="Condições especiais, compromissos e informações da negociação..." />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            {commercialDirty && (
              <Button type="button" variant="ghost" onClick={() => setCommercialForm(commercialToForm(tenant))} disabled={savingCommercial}>
                Descartar
              </Button>
            )}
            <Button type="button" onClick={() => void saveCommercial()} disabled={savingCommercial || !commercialDirty || demoExpiryMissing}>
              {savingCommercial && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar dados comerciais
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}