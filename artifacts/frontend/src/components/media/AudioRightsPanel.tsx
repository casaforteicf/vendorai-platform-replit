import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AudioRightsStatus = "pending" | "cleared" | "restricted";
type AudioRightsOrigin = "tenant_owned" | "licensed" | "generated" | "public_domain" | "unknown";

type AudioRights = {
  status: AudioRightsStatus;
  origin: AudioRightsOrigin;
  commercialUse: boolean;
  paidAds: boolean;
  territories: string[];
  expiresAt: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  licenseReference: string | null;
  evidenceAssetId: string | null;
};

type AudioRightsAsset = {
  id: string;
  metadata?: Record<string, unknown> | null;
};

const ORIGIN_LABELS: Record<AudioRightsOrigin, string> = {
  tenant_owned: "Própria da empresa",
  licensed: "Licenciada",
  generated: "Gerada por IA",
  public_domain: "Domínio público",
  unknown: "Origem não informada",
};

const STATUS_LABELS: Record<AudioRightsStatus, string> = {
  pending: "Pendente de validação",
  cleared: "Liberada",
  restricted: "Restrita",
};

const DEFAULT_RIGHTS: AudioRights = {
  status: "pending",
  origin: "unknown",
  commercialUse: false,
  paidAds: false,
  territories: ["*"],
  expiresAt: null,
  attributionRequired: false,
  attributionText: null,
  licenseReference: null,
  evidenceAssetId: null,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeRights(value: unknown): AudioRights {
  const input = record(value);
  const status = typeof input.status === "string" && input.status in STATUS_LABELS
    ? input.status as AudioRightsStatus
    : "pending";
  const origin = typeof input.origin === "string" && input.origin in ORIGIN_LABELS
    ? input.origin as AudioRightsOrigin
    : "unknown";
  const territories = Array.isArray(input.territories)
    ? input.territories.map(String).filter(Boolean)
    : ["*"];
  return {
    status,
    origin,
    commercialUse: asBoolean(input.commercialUse),
    paidAds: asBoolean(input.paidAds),
    territories: territories.length ? territories : ["*"],
    expiresAt: typeof input.expiresAt === "string" && input.expiresAt ? input.expiresAt : null,
    attributionRequired: asBoolean(input.attributionRequired),
    attributionText: typeof input.attributionText === "string" ? input.attributionText : null,
    licenseReference: typeof input.licenseReference === "string" ? input.licenseReference : null,
    evidenceAssetId: typeof input.evidenceAssetId === "string" ? input.evidenceAssetId : null,
  };
}

function dateInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function AudioRightsPanel({
  tenantId,
  asset,
  onUpdated,
}: {
  tenantId: string;
  asset: AudioRightsAsset;
  onUpdated?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [rights, setRights] = useState<AudioRights>(() => normalizeRights(asset.metadata?.rights));
  const [territoriesText, setTerritoriesText] = useState(() => normalizeRights(asset.metadata?.rights).territories.join(", "));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = normalizeRights(asset.metadata?.rights);
    setRights(next);
    setTerritoriesText(next.territories.join(", "));
  }, [asset.id, asset.metadata]);

  const usage = useMemo(() => {
    const expired = Boolean(rights.expiresAt && new Date(rights.expiresAt).getTime() <= Date.now());
    const organicAllowed = rights.status === "cleared" && !expired && rights.commercialUse;
    const paidAdsAllowed = organicAllowed && rights.paidAds;
    return { expired, organicAllowed, paidAdsAllowed };
  }, [rights]);

  async function save() {
    if (!tenantId) return;
    const territories = territoriesText
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/tracks/${asset.id}/rights`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...rights,
          territories: territories.length ? territories : ["*"],
          attributionText: rights.attributionRequired ? rights.attributionText : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar os direitos da música");
      const next = normalizeRights(data.rights);
      setRights(next);
      setTerritoriesText(next.territories.join(", "));
      toast({ title: "Passaporte de direitos atualizado" });
      await onUpdated?.();
    } catch (error) {
      toast({
        title: "Falha ao atualizar os direitos",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Passaporte de direitos
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Registre a origem e em quais usos esta trilha está autorizada.</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${rights.status === "cleared" ? "bg-emerald-100 text-emerald-700" : rights.status === "restricted" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
          {STATUS_LABELS[rights.status]}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Situação</span>
          <select value={rights.status} onChange={(event) => setRights((current) => ({ ...current, status: event.target.value as AudioRightsStatus }))} className="h-9 w-full rounded-lg border bg-background px-2 text-xs">
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Origem</span>
          <select value={rights.origin} onChange={(event) => setRights((current) => ({ ...current, origin: event.target.value as AudioRightsOrigin }))} className="h-9 w-full rounded-lg border bg-background px-2 text-xs">
            {Object.entries(ORIGIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border p-2.5">
          <input type="checkbox" checked={rights.commercialUse} onChange={(event) => setRights((current) => ({ ...current, commercialUse: event.target.checked, paidAds: event.target.checked ? current.paidAds : false }))} />
          Uso comercial
        </label>
        <label className="flex items-center gap-2 rounded-lg border p-2.5">
          <input type="checkbox" checked={rights.paidAds} disabled={!rights.commercialUse} onChange={(event) => setRights((current) => ({ ...current, paidAds: event.target.checked }))} />
          Anúncios pagos
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Territórios</span>
          <input value={territoriesText} onChange={(event) => setTerritoriesText(event.target.value)} placeholder="* ou BR, PY, AR" className="h-9 w-full rounded-lg border bg-background px-2 text-xs" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Validade da licença</span>
          <input type="date" value={dateInputValue(rights.expiresAt)} onChange={(event) => setRights((current) => ({ ...current, expiresAt: event.target.value ? new Date(`${event.target.value}T23:59:59`).toISOString() : null }))} className="h-9 w-full rounded-lg border bg-background px-2 text-xs" />
        </label>
      </div>

      <label className="mt-3 block space-y-1 text-xs">
        <span className="text-muted-foreground">Referência da licença / contrato</span>
        <input value={rights.licenseReference ?? ""} onChange={(event) => setRights((current) => ({ ...current, licenseReference: event.target.value || null }))} placeholder="Ex.: contrato, pedido ou ID da licença" className="h-9 w-full rounded-lg border bg-background px-2 text-xs" />
      </label>

      <label className="mt-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={rights.attributionRequired} onChange={(event) => setRights((current) => ({ ...current, attributionRequired: event.target.checked }))} />
        Exige atribuição/crédito
      </label>
      {rights.attributionRequired && (
        <textarea value={rights.attributionText ?? ""} onChange={(event) => setRights((current) => ({ ...current, attributionText: event.target.value || null }))} placeholder="Texto de crédito obrigatório" className="mt-2 min-h-20 w-full rounded-lg border bg-background p-2 text-xs" />
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className={`rounded-lg border p-2.5 ${usage.organicAllowed ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
          <div className="flex items-center gap-1.5 font-medium">{usage.organicAllowed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <CircleAlert className="h-3.5 w-3.5 text-amber-600" />} Orgânico</div>
          <p className="mt-1 text-muted-foreground">{usage.organicAllowed ? "Permitido" : "Não liberado"}</p>
        </div>
        <div className={`rounded-lg border p-2.5 ${usage.paidAdsAllowed ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
          <div className="flex items-center gap-1.5 font-medium">{usage.paidAdsAllowed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <CircleAlert className="h-3.5 w-3.5 text-amber-600" />} Mídia paga</div>
          <p className="mt-1 text-muted-foreground">{usage.paidAdsAllowed ? "Permitido" : "Não liberado"}</p>
        </div>
      </div>

      {usage.expired && <p className="mt-2 text-xs font-medium text-red-600">A licença cadastrada está vencida.</p>}

      <button disabled={saving} onClick={() => void save()} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        Salvar passaporte
      </button>
    </div>
  );
}
