import React, { useEffect, useMemo, useState } from "react";

type OwnerManualPayload = {
  generated_at: string;
  manual_status: "ready" | "pending_specification";
  project: {
    id: string;
    titulo: string;
    cliente_nome?: string | null;
    cliente_email?: string | null;
    cliente_telefone?: string | null;
    status?: string | null;
    area_m2?: string | number | null;
    arquiteto_responsavel?: string | null;
  };
  specifications: Array<{
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    quantity?: string | number | null;
    unit?: string | null;
    product_name?: string | null;
    material_name?: string | null;
    manufacturer_name?: string | null;
    supplier_name?: string | null;
    catalog_code?: string | null;
    technical_approved_at?: string | null;
    project_revision?: string | null;
  }>;
  budget?: {
    id: string;
    title: string;
    status: string;
    version: number;
    sale_total?: string | number | null;
  } | null;
  proposal?: {
    id: string;
    title: string;
    status: string;
    version: number;
    portal_token?: string | null;
    approved_at?: string | null;
  } | null;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function money(value?: string | number | null) {
  if (value == null || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
}

export function OwnerManual({ projectId }: { projectId?: string | null }) {
  const [data, setData] = useState<OwnerManualPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setData(null);
      setError(null);
      return;
    }

    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/arch/documentacao/${encodeURIComponent(projectId)}`, {
          headers: authHeaders(),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        if (active) setData(payload);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar a documentação.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [projectId]);

  const categories = useMemo(() => {
    const groups = new Map<string, OwnerManualPayload["specifications"]>();
    for (const item of data?.specifications ?? []) {
      const key = item.category?.trim() || "Especificações";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [data]);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Documentação final</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">Manual do Proprietário</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
            Documento vivo consolidado a partir do projeto, especificações técnicas aprovadas, orçamento e proposta.
          </p>
        </div>

        {data ? (
          <span className={[
            "rounded-full px-3 py-1 text-xs font-semibold",
            data.manual_status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
          ].join(" ")}>
            {data.manual_status === "ready" ? "Documentação pronta" : "Aguardando especificações aprovadas"}
          </span>
        ) : null}
      </div>

      {!projectId ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          Selecione um projeto para carregar o manual técnico.
        </div>
      ) : null}

      {loading ? <p className="mt-6 text-sm text-slate-500">Carregando documentação do projeto…</p> : null}

      {error ? (
        <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Info label="Projeto" value={data.project.titulo} />
            <Info label="Cliente" value={data.project.cliente_nome || "Não informado"} />
            <Info label="Área" value={data.project.area_m2 ? `${data.project.area_m2} m²` : "—"} />
            <Info label="Valor comercial" value={money(data.budget?.sale_total)} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Projeto</p>
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <Row label="Responsável" value={data.project.arquiteto_responsavel || "Não informado"} />
                <Row label="E-mail" value={data.project.cliente_email || "Não informado"} />
                <Row label="Telefone" value={data.project.cliente_telefone || "Não informado"} />
                <Row label="Status" value={data.project.status || "—"} />
              </div>
            </article>

            <article className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comercial / cliente</p>
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <Row label="Orçamento" value={data.budget ? `${data.budget.title} · v${data.budget.version}` : "Não gerado"} />
                <Row label="Proposta" value={data.proposal ? `${data.proposal.title} · v${data.proposal.version}` : "Não gerada"} />
                <Row label="Status proposta" value={data.proposal?.status || "—"} />
                <Row label="Portal" value={data.proposal?.portal_token ? "Ativo" : "Não ativado"} />
              </div>
            </article>
          </div>

          <div className="mt-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Memorial técnico aprovado</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">
                  {data.specifications.length} item{data.specifications.length === 1 ? "" : "s"}
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Atualizado em {new Date(data.generated_at).toLocaleString("pt-BR")}
              </p>
            </div>

            <div className="mt-4 space-y-4">
              {categories.length ? categories.map(([category, items]) => (
                <article key={category} className="rounded-3xl border border-slate-100 p-5">
                  <h4 className="font-semibold text-slate-900">{category}</h4>
                  <div className="mt-3 divide-y divide-slate-100">
                    {items.map((item) => (
                      <div key={item.id} className="grid gap-2 py-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
                        <div>
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.product_name || item.material_name || item.description || "—"}</p>
                        </div>
                        <Row label="Fabricante" value={item.manufacturer_name || "—"} compact />
                        <Row label="SKU / referência" value={item.catalog_code || "—"} compact />
                        <Row label="Quantidade" value={`${item.quantity ?? "—"} ${item.unit ?? ""}`.trim()} compact />
                      </div>
                    ))}
                  </div>
                </article>
              )) : (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Nenhuma especificação com aprovação técnica disponível ainda.
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Row({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={compact ? "" : "flex items-start justify-between gap-4"}>
      <span className="text-xs text-slate-400">{label}</span>
      <span className={compact ? "mt-1 block text-sm font-medium text-slate-800" : "text-right font-medium text-slate-800"}>{value}</span>
    </div>
  );
}
