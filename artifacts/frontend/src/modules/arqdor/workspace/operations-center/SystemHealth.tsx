import React, { useEffect, useMemo, useState } from "react";
import { healthClass } from "./operationsUtils";

    openai?: { configured?: boolean };
    database?: { configured?: boolean; reachable?: boolean };
    storage?: { configured?: boolean };
  };
  render?: {
    status?: "online" | "warning" | "offline";
    total?: number;
    completed?: number;
    failed?: number;
    successRate?: number | null;
    averageDurationMs?: number | null;
  };
  error?: string;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDuration(ms?: number | null) {
  if (!ms || ms <= 0) return "sem amostra";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

type HealthPayload = {
  measuredAt: string;
  windowHours: number;
  providers?: {
    openai?: { configured?: boolean };
    database?: { configured?: boolean; reachable?: boolean };
    storage?: { configured?: boolean };
  };
  render?: {
    status?: "online" | "warning" | "offline";
    total?: number;
    completed?: number;
    failed?: number;
    successRate?: number | null;
    averageDurationMs?: number | null;
  };
  error?: string;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDuration(ms?: number | null) {
  if (!ms || ms <= 0) return "sem amostra";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export function SystemHealth() {
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/arch/health", { headers: authHeaders() });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        if (active) setData(payload);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Falha ao medir saúde operacional");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);
  const items = useMemo(() => {
    if (!data) return [];
    const renderStatus = data.render?.status ?? "warning";
    const openAiConfigured = Boolean(data.providers?.openai?.configured);
    const dbReachable = Boolean(data.providers?.database?.reachable);
    const storageConfigured = Boolean(data.providers?.storage?.configured);
    const successRate = data.render?.successRate;
    return [
      {
        id: "render",
        service: "Render / IA",
        status: renderStatus,
        latency: formatDuration(data.render?.averageDurationMs),
        uptime: successRate == null ? "sem amostra" : `${successRate.toFixed(1)}% sucesso / 24h`,
      },
      {
        id: "openai",
        service: "OpenAI",
        status: openAiConfigured ? "online" : "offline",
        latency: "configuração",
        uptime: openAiConfigured ? "credencial disponível" : "sem credencial",
      },
      {
        id: "database",
        service: "Banco de dados",
        status: dbReachable ? "online" : "offline",
        latency: "consulta atual",
        uptime: dbReachable ? "respondendo" : "indisponível",
      },
      {
        id: "storage",
        service: "Storage",
        status: storageConfigured ? "online" : "warning",
        latency: "configuração",
        uptime: storageConfigured ? "configurado" : "não confirmado",
      },
    ] as const;
  }, [data]);
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/arch/health", { headers: authHeaders() });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        if (active) setData(payload);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Falha ao medir saúde operacional");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const items = useMemo(() => {
    if (!data) return [];
    const renderStatus = data.render?.status ?? "warning";
    const openAiConfigured = Boolean(data.providers?.openai?.configured);
    const dbReachable = Boolean(data.providers?.database?.reachable);
    const storageConfigured = Boolean(data.providers?.storage?.configured);
    const successRate = data.render?.successRate;

    return [
      {
        id: "render",
        service: "Render / IA",
        status: renderStatus,
        latency: formatDuration(data.render?.averageDurationMs),
        uptime: successRate == null ? "sem amostra" : `${successRate.toFixed(1)}% sucesso / 24h`,
      },
      {
        id: "openai",
        service: "OpenAI",
        status: openAiConfigured ? "online" : "offline",
        latency: "configuração",
        uptime: openAiConfigured ? "credencial disponível" : "sem credencial",
      },
      {
        id: "database",
        service: "Banco de dados",
        status: dbReachable ? "online" : "offline",
        latency: "consulta atual",
        uptime: dbReachable ? "respondendo" : "indisponível",
      },
      {
        id: "storage",
        service: "Storage",
        status: storageConfigured ? "online" : "warning",
        latency: "configuração",
        uptime: storageConfigured ? "configurado" : "não confirmado",
      },
    ] as const;
  }, [data]);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">System Health</p>

      {loading ? <p className="mt-5 text-sm text-slate-500">Medindo ambiente…</p> : null}
      {error ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => (
              <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-semibold text-slate-950">{item.service}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthClass(item.status)}`}>{item.status}</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Info label="Medição" value={item.latency} />
                  <Info label="Estado" value={item.uptime} />
                </div>
              </article>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Medido em {data?.measuredAt ? new Date(data.measuredAt).toLocaleString("pt-BR") : "—"} · janela {data?.windowHours ?? 24}h · renders {data?.render?.total ?? 0}.
          </p>
        </>
      ) : null}
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Saúde medida dos módulos</h2>
      <p className="mt-2 text-sm text-slate-500">
        Dados reais do ambiente e dos renders persistidos nas últimas 24h. Sem uptime ou latência simulados.
      </p>
      {loading ? <p className="mt-5 text-sm text-slate-500">Medindo ambiente…</p> : null}
      {error ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {!loading && !error ? (
        <>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => (
              <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-semibold text-slate-950">{item.service}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthClass(item.status)}`}>{item.status}</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Info label="Medição" value={item.latency} />
                  <Info label="Estado" value={item.uptime} />
                </div>
              </article>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Medido em {data?.measuredAt ? new Date(data.measuredAt).toLocaleString("pt-BR") : "—"} · janela {data?.windowHours ?? 24}h · renders {data?.render?.total ?? 0}.
          </p>
        </>
      ) : null}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
