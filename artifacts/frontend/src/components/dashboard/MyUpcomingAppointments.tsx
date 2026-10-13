import { Link } from "wouter";
import { useListAgendamentos } from "@workspace/api-client-react";

/** Agenda preview is scoped to the signed-in user, never the whole tenant. */
export function MyUpcomingAppointments({ tenantId, userId }: { tenantId: string; userId: string }) {
  const { data, isLoading, isError } = useListAgendamentos(tenantId);
  const now = Date.now();
  const upcoming = (data ?? [])
    .filter(item => item.responsavelId === userId && ["agendado", "confirmado"].includes(item.status))
    .filter(item => Date.parse(item.dataHoraInicio) >= now)
    .sort((a, b) => Date.parse(a.dataHoraInicio) - Date.parse(b.dataHoraInicio))
    .slice(0, 4);
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Próximos compromissos">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Meus próximos compromissos</h2>
        <Link href="/agenda" className="text-xs text-primary hover:underline">Abrir agenda</Link>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando compromissos…</p> :
       isError ? <p className="text-sm text-muted-foreground">Não foi possível carregar a agenda.</p> :
       upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum compromisso atribuído a você.</p> :
       <ul className="space-y-2">{upcoming.map(item => (
         <li key={item.id} className="text-sm">
           <p className="font-medium">{item.titulo}</p>
           <p className="text-xs text-muted-foreground">{new Date(item.dataHoraInicio).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}</p>
         </li>
       ))}</ul>}
    </section>
  );
}
