import React, { useCallback, useMemo, useState } from "react";
import { useWorkspaceProject } from "../WorkspaceContext";

type Props = { arqState?: any };

function token() {
  return localStorage.getItem("vendorai_token") ?? "";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error ?? `Erro ${response.status}`);
  return data as T;
}

function projectMeta(arqState: any, projectCtx: any) {
  const candidate = arqState?.currentProject ?? arqState?.selectedProject ?? arqState?.project ?? {};
  return {
    id: String(projectCtx?.id || arqState?.projectId || candidate?.id || ""),
    name: String(projectCtx?.name || candidate?.titulo || candidate?.title || candidate?.name || "Projeto ARQDOR"),
    clientName: candidate?.clienteNome || candidate?.clientName || null,
    budget: candidate?.orcamentoTotal || null,
    status: candidate?.status || null,
  };
}

export default function ConstructionClientPortalButton({ arqState }: Props) {
  const { projectCtx } = useWorkspaceProject();
  const meta = useMemo(() => projectMeta(arqState, projectCtx), [arqState, projectCtx]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPortal = useCallback(async () => {
    if (!meta.id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ensured = await api<{ obra: any }>("/api/arch/construction/ensure", {
        method: "POST",
        body: JSON.stringify({
          projectId: meta.id,
          name: meta.name,
          clientName: meta.clientName,
          budget: meta.budget,
          status: meta.status,
        }),
      });
      const obraId = String(ensured.obra?.id ?? "");
      if (!obraId) throw new Error("Obra vinculada não encontrada.");

      const bundle = await api<{ obra: any }>(`/api/arch/construction/${obraId}`);
      const portalToken = String(bundle.obra?.portalToken ?? bundle.obra?.portal_token ?? ensured.obra?.portalToken ?? ensured.obra?.portal_token ?? "");
      if (!portalToken) throw new Error("Portal do cliente ainda não possui token de acesso.");

      window.open(`/portal/obra/${portalToken}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o portal do cliente.");
    } finally {
      setBusy(false);
    }
  }, [busy, meta.budget, meta.clientName, meta.id, meta.name, meta.status]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void openPortal()}
        disabled={!meta.id || busy}
        className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Abrindo portal…" : "Portal do Cliente ↗"}
      </button>
      {error ? <span className="max-w-[260px] text-right text-[11px] text-rose-600">{error}</span> : null}
    </div>
  );
}
