import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTenantQueryKey, getListTenantsQueryKey } from "@workspace/api-client-react";
import { Globe2, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  TENANT_COUNTRY_PROFILES,
  TENANT_CURRENCIES,
  TENANT_LOCALES,
  TENANT_TIMEZONES,
  type TenantCountryCode,
  type TenantSupportedCurrency,
  type TenantSupportedLocale,
} from "@/lib/tenantInternational";

export type TenantInternationalProfile = {
  countryCode?: string | null;
  defaultLocale?: string | null;
  timezone?: string | null;
  defaultCurrency?: string | null;
  supportedCurrencies?: string[] | null;
  taxIdentifierType?: string | null;
  taxIdentifier?: string | null;
};

type FormState = {
  countryCode: TenantCountryCode;
  defaultLocale: TenantSupportedLocale;
  timezone: string;
  defaultCurrency: TenantSupportedCurrency;
  supportedCurrencies: TenantSupportedCurrency[];
  taxIdentifierType: string;
  taxIdentifier: string;
};

function profileToForm(tenant: TenantInternationalProfile): FormState {
  const countryCode = (tenant.countryCode && tenant.countryCode in TENANT_COUNTRY_PROFILES
    ? tenant.countryCode
    : "BR") as TenantCountryCode;
  const preset = TENANT_COUNTRY_PROFILES[countryCode];
  const defaultLocale = TENANT_LOCALES.some((item) => item.value === tenant.defaultLocale)
    ? (tenant.defaultLocale as TenantSupportedLocale)
    : preset.locale;
  const defaultCurrency = TENANT_CURRENCIES.includes(tenant.defaultCurrency as TenantSupportedCurrency)
    ? (tenant.defaultCurrency as TenantSupportedCurrency)
    : preset.currency;
  const supportedCurrencies = (tenant.supportedCurrencies ?? [])
    .filter((value): value is TenantSupportedCurrency => TENANT_CURRENCIES.includes(value as TenantSupportedCurrency));

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
  const [saving, setSaving] = useState(false);

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

  const selectedCountry = TENANT_COUNTRY_PROFILES[form.countryCode];
  const isDirty = useMemo(() => {
    const original = profileToForm(tenant);
    return JSON.stringify(form) !== JSON.stringify(original);
  }, [form, tenant]);

  function applyCountry(countryCode: TenantCountryCode) {
    const preset = TENANT_COUNTRY_PROFILES[countryCode];
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

  function setDefaultCurrency(currency: TenantSupportedCurrency) {
    setForm((current) => ({
      ...current,
      defaultCurrency: currency,
      supportedCurrencies: Array.from(new Set([currency, ...current.supportedCurrencies])),
    }));
  }

  function toggleSupportedCurrency(currency: TenantSupportedCurrency) {
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

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-tenant-detail", tenantId] }),
        qc.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) }),
        qc.invalidateQueries({ queryKey: getListTenantsQueryKey() }),
      ]);
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

  return (
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
              onChange={(event) => applyCountry(event.target.value as TenantCountryCode)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(TENANT_COUNTRY_PROFILES).map(([code, profile]) => (
                <option key={code} value={code}>{profile.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tenant-locale" className="text-xs font-medium">Idioma padrão</label>
            <select
              id="tenant-locale"
              value={form.defaultLocale}
              onChange={(event) => setForm((current) => ({ ...current, defaultLocale: event.target.value as TenantSupportedLocale }))}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TENANT_LOCALES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
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
              {TENANT_TIMEZONES.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tenant-currency" className="text-xs font-medium">Moeda principal</label>
            <select
              id="tenant-currency"
              value={form.defaultCurrency}
              onChange={(event) => setDefaultCurrency(event.target.value as TenantSupportedCurrency)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TENANT_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium">Moedas habilitadas</p>
          <div className="flex flex-wrap gap-2">
            {TENANT_CURRENCIES.map((currency) => {
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
              placeholder={selectedCountry.taxPlaceholder}
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
  );
}
