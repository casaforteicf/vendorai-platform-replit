import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarClock, ClipboardList, FileWarning, Wrench } from "lucide-react";
import type { MaintenanceApi, Summary } from "./api";
import { Card, DueBadge, Empty, ErrorBox, SectionTitle, Stat, fmtDate } from "./components";

type Tab = "visao" | "chamados" | "preventiva" | "checklist" | "equipamentos" | "medidores" | "documentos";

export default function VisaoGeral({ api, onNavigate }: { api: MaintenanceApi; onNavigate: (tab: Tab) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setSummary(await api.get<Summary>("/resumo"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !summary) return <Card><p className="text-sm text-muted-foreground">Carregando a central de manutenção…</p></Card>;
  if (error) return <ErrorBox message={error} onRetry={() => void load()} />;
  if (!summary) return null;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Chamados abertos" value={summary.chamados.abertos} tone={summary.chamados.atrasados > 0 ? "danger" : "default"} hint={`${summary.chamados.atrasados} atrasado(s) · ${summary.chamados.concluidos_mes} concluído(s) no mês`} />
        <Stat label="Preventivas" value={summary.preventiva.proximos} tone={summary.preventiva.atrasados > 0 ? "danger" : "warn"} hint={`${summary.preventiva.atrasados} atrasada(s) · próximas 7 dias`} />
        <Stat label="Checklists de hoje" value={summary.checklist.abertos} tone={summary.checklist.abertos > 0 ? "warn" : "good"} hint={`${summary.checklist.concluidos_hoje} concluído(s)`} />
        <Stat label="Equipamentos" value={summary.equipamentos.total} hint={`${summary.equipamentos.inativos} inativo(s) · ${summary.medidores.total} medidor(es)`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle title="Chamados em aberto" subtitle="Ordenados por prazo" action={<button type="button" onClick={() => onNavigate("chamados")} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Ver todos <ArrowRight className="h-3.5 w-3.5" /></button>} />
          {summary.proximos.chamados.length === 0 ? <Empty>Nenhum chamado em aberto.</Empty> : (
            <ul className="space-y-2">
              {summary.proximos.chamados.map((item) => (
                <li key={item.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.area_name ?? "Sem local"}</p>
                    </div>
                    <DueBadge date={item.due_at} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle title="Preventivas próximas" subtitle="Equipamentos e vencimentos" action={<button type="button" onClick={() => onNavigate("preventiva")} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Abrir <ArrowRight className="h-3.5 w-3.5" /></button>} />
          {summary.proximos.preventivas.length === 0 ? <Empty>Nenhum plano preventivo ativo.</Empty> : (
            <ul className="space-y-2">
              {summary.proximos.preventivas.map((item) => (
                <li key={item.id} className="flex items-start gap-2 rounded-lg border p-3">
                  <Wrench className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.asset_code} · {item.asset_name}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs font-semibold">{fmtDate(item.next_due_on)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle title="Documentos e vencimentos" subtitle="Alvarás, laudos e contratos" action={<button type="button" onClick={() => onNavigate("documentos")} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Abrir <ArrowRight className="h-3.5 w-3.5" /></button>} />
          <div className="mb-3 flex gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800"><FileWarning className="h-3.5 w-3.5" />{summary.documentos.vencidos} vencido(s)</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"><CalendarClock className="h-3.5 w-3.5" />{summary.documentos.vencendo} em 30 dias</span>
          </div>
          {summary.proximos.documentos.length === 0 ? <Empty>Nenhum documento cadastrado.</Empty> : (
            <ul className="space-y-2">
              {summary.proximos.documentos.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.kind}</p></div>
                  <span className="whitespace-nowrap text-xs font-semibold">{fmtDate(item.valid_until)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="bg-muted/30">
        <div className="flex flex-wrap items-center gap-3">
          <ClipboardList className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Rotina do dia</p>
            <p className="text-xs text-muted-foreground">Abra os checklists, registre as leituras dos medidores e acompanhe as OS em aberto.</p>
          </div>
          <button type="button" onClick={() => onNavigate("checklist")} className="rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">Abrir checklists</button>
          <button type="button" onClick={() => onNavigate("medidores")} className="rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">Lançar leitura</button>
        </div>
      </Card>
    </div>
  );
}
