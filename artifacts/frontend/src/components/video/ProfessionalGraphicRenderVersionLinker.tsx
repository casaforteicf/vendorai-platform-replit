import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

type ProjectPayload = {
  project?: {
    context?: {
      graphicDesign?: {
        finalRender?: {
          assetId?: string;
          renderedAt?: string;
          renderer?: string;
          ratio?: string;
          width?: number;
          height?: number;
          durationSeconds?: number;
        };
      };
    } | null;
  };
};

type Version = { id?: string; assetId?: string | null; asset_id?: string | null; operation?: string | null };

function headers(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export default function ProfessionalGraphicRenderVersionLinker() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const projectId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") ?? "" : "";
  const busy = useRef(false);
  const linkedAsset = useRef("");

  useEffect(() => {
    if (!tenantId || !projectId) return;
    let disposed = false;

    const sync = async () => {
      if (busy.current || disposed) return;
      busy.current = true;
      try {
        const projectResponse = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, { headers: headers(), cache: "no-store" });
        if (!projectResponse.ok) return;
        const projectData = await projectResponse.json().catch(() => ({})) as ProjectPayload;
        const finalRender = projectData.project?.context?.graphicDesign?.finalRender;
        const assetId = finalRender?.assetId ?? "";
        if (!assetId || linkedAsset.current === assetId) return;

        const versionsResponse = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}/versions`, { headers: headers(), cache: "no-store" });
        const versionsData = await versionsResponse.json().catch(() => ({})) as { versions?: Version[] };
        const alreadyLinked = (versionsData.versions ?? []).some((version) => (version.assetId ?? version.asset_id) === assetId);

        await fetch(`/api/tenants/${tenantId}/media/assets/${assetId}`, {
          method: "PATCH",
          headers: headers(true),
          body: JSON.stringify({ projectId, role: "output" }),
        }).catch(() => undefined);

        if (!alreadyLinked) {
          const response = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}/versions`, {
            method: "POST",
            headers: headers(true),
            body: JSON.stringify({
              assetId,
              operation: "graphic_wysiwyg_render",
              label: "Render gráfico final",
              metadata: {
                renderer: finalRender?.renderer ?? "professional-graphic-wysiwyg-v1",
                renderedAt: finalRender?.renderedAt ?? null,
                ratio: finalRender?.ratio ?? null,
                width: finalRender?.width ?? null,
                height: finalRender?.height ?? null,
                durationSeconds: finalRender?.durationSeconds ?? null,
              },
            }),
          });
          if (!response.ok) return;
        }
        linkedAsset.current = assetId;
      } finally {
        busy.current = false;
      }
    };

    void sync();
    const timer = window.setInterval(() => void sync(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [projectId, tenantId]);

  return null;
}
