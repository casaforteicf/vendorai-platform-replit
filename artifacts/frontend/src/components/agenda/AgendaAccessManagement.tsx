import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Grant = { userId: string; createdAt?: string };
type AgendaOption = { id: string; nome: string };
type Member = { id: string; name: string };
export function AgendaAccessManagement({ agendas, users }: { agendas: AgendaOption[]; users: Member[] }) {
  const [agendaId, setAgendaId] = useState("");
  const [userId, setUserId] = useState("");
  const [grants, setGrants] = useState<Grant[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = agendas.find(a => a.id === agendaId);
  async function call(path: string, init?: RequestInit) {
    const token = localStorage.getItem("vendorai_token");
    const response = await fetch(`/api${path}`, {
      ...init, headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok) throw new Error(`Falha na operação (HTTP ${response.status})`);
    return response.status === 204 ? null : response.json();
  }
  async function refresh(id: string) {
    setError("");
    if (!id) { setGrants([]); return; }
    try { setGrants(await call(`/agendas/${encodeURIComponent(id)}/access`)); }
    catch (e) { setGrants([]); setError(e instanceof Error ? e.message : "Erro ao carregar acessos"); }
  }
  useEffect(() => { void refresh(agendaId); }, [agendaId]);
  async function change(action: "grant" | "revoke", target: string) {
    if (!agendaId || !target || busy) return;
    setBusy(true); setError("");
    try {
      await call(action === "grant"
        ? `/agendas/${encodeURIComponent(agendaId)}/access`
        : `/agendas/${encodeURIComponent(agendaId)}/access/${encodeURIComponent(target)}`,
        action === "grant" ? { method: "POST", body: JSON.stringify({ userId: target }) } : { method: "DELETE" });
      setUserId("");
      await refresh(agendaId);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível alterar o acesso"); }
    finally { setBusy(false); }
  }
  return <div className="rounded-xl border bg-card p-3 space-y-3">
    <div><h3 className="text-sm font-semibold">Compartilhamento de agendas</h3>
      <p className="text-xs text-muted-foreground">Conceda acesso somente a usuários desta empresa.</p></div>
    <Select value={agendaId} onValueChange={setAgendaId}><SelectTrigger><SelectValue placeholder="Selecionar agenda" /></SelectTrigger>
      <SelectContent>{agendas.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select>
    {active && <><div className="flex gap-2">
      <Select value={userId} onValueChange={setUserId}><SelectTrigger><SelectValue placeholder="Selecionar colaborador" /></SelectTrigger>
        <SelectContent>{users.filter(u => !grants.some(g => g.userId === u.id)).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
      <Button type="button" disabled={!userId || busy} onClick={() => void change("grant", userId)}>Conceder</Button>
    </div><div className="space-y-2">{grants.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma concessão individual.</p>}
      {grants.map(g => <div key={g.userId} className="flex items-center justify-between gap-2 text-xs">
        <span>{users.find(u => u.id === g.userId)?.name ?? g.userId}</span>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void change("revoke", g.userId)}>Revogar</Button>
      </div>)}</div></>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
