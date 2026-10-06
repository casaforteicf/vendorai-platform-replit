import { useEffect, useState } from "react";
import { useGetBusinessProfileByTenant } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

export function normalizeTenantLogoUrl(value?: string | null) {
  if (!value) return "";
  return value.startsWith("/objects/") ? `/api/storage${value}` : value;
}

export function TenantBrand({
  pendingName,
  pendingLogoUrl,
  className = "h-9 w-auto max-w-[160px] rounded-md border border-border/60 bg-background object-contain p-0.5",
}: {
  pendingName?: string | null;
  pendingLogoUrl?: string | null;
  className?: string;
}) {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { data: businessProfile } = useGetBusinessProfileByTenant(tenantId, {
    query: {
      enabled: !!tenantId,
      retry: false,
    },
  });
  const profile = businessProfile as any;
  const logoUrl = pendingLogoUrl
    ? normalizeTenantLogoUrl(pendingLogoUrl)
    : (profile?.logoAccessUrl || normalizeTenantLogoUrl(profile?.logoUrl));
  const name = pendingName?.trim() || profile?.nomeFantasia || profile?.razaoSocial || "Empresa";
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [logoUrl]);

  if (logoUrl && !imageFailed) {
    return (
      <img
        data-tenant-brand-logo
        src={logoUrl}
        alt={name}
        className={className}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      data-tenant-brand-fallback
      className="max-w-[180px] truncate text-sm font-semibold text-foreground"
      title={name}
    >
      {name}
    </span>
  );
}
