import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

type NavModule = {
  moduleKey: string;
  isEnabled: boolean;
};

export function ErpEntitlementGate({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const isSuperAdmin = user?.platformRole === "super_admin";
  const tenantId = user?.tenantId;

  const { data: modules, isLoading } = useQuery<NavModule[]>({
    queryKey: ["tenant-nav-modules", tenantId],
    enabled: !!token && !!tenantId && !isSuperAdmin,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/nav-modules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const hasErp = isSuperAdmin || modules?.some((module) => module.moduleKey === "financeiro" && module.isEnabled) === true;

  useEffect(() => {
    if (!isSuperAdmin && token && user && !isLoading && !hasErp) {
      setLocation("/");
    }
  }, [hasErp, isLoading, isSuperAdmin, setLocation, token, user]);

  if (isSuperAdmin) return <>{children}</>;

  if (!token || !user || isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!hasErp) return null;

  return <>{children}</>;
}
