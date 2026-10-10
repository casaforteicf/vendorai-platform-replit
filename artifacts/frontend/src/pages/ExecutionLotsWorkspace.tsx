import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type Item = { itemId: string; name: string; unit: string; group?: string | null; contractedQuantity: number };
type Balance = { itemId: string; contracted: number; allocated: number; completed: number; available: number };
type Allocation = { lot_id: string; source_item_id: string; quantity: string; completed_quantity: string };
type Lot = { id: string; label?: string; status: string };
type Payload = { contractedItems: Item[]; balances: Balance[]; allocations: Allocation[]; lots: Lot[] };

export default function ExecutionLotsWorkspace() {
  const { token } = useAuth();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const dealId = params.get("dealId") ?? "";
  const proposalId = params.get("proposalId") ?? "";
  const [data, setData] = useState<Payload | null>(null);
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const call = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, {
      ...init,
      headers: { ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json" },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Não foi possível completar a operação");
    return result;
  }, [token]);

  const refresh = useCallback(async () => {
    if (!dealId || !proposalId || !token) return;
    try {
      setData(await call("/api/execution-lots/deals/" + encodeURIComponent(dealId) + "/proposals/" + encodeURIComponent(proposalId)));
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha na consulta"); }
  }, [call, dealId, proposalId, token]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function reserve() {
    const items = Object.entries(selection).filter(([, quantity]) => Number(quantity) > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) }));
    if (!items.length) return setError("Selecione pelo menos um item e informe a quantidade.");
    setBusy(true);
    try {
      await call("/api/execution-lots/deals/" + encodeURIComponent(dealId), {
        method: "POST",
        body: JSON.stringify({ proposalId, requestKey: crypto.randomUUID(), label, items }),
      });
      setSelection({});
      setLabel("");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao reservar"); }
    finally { setBusy(false); }
  }
  async function changeStatus(lot: Lot, nextStatus: string) {
    let reason: string | undefined;
    if (nextStatus === "cancelled") {
      const value = window.prompt("Justificativa do cancelamento (obrigatória):");
      if (!value || value.trim().length < 5) return;
      reason = value.trim();
    }
    setBusy(true);
    try {
      await call("/api/execution-lots/deals/" + encodeURIComponent(dealId) + "/lots/" + encodeURIComponent(lot.id) + "/status", {
        method: "POST", body: JSON.stringify({ nextStatus, reason }),
      });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha na atualização"); }
    finally { setBusy(false); }
  }
  async function saveProgress(lotId: string, itemId: string, original: number) {
    const key = lotId + ":" + itemId;
    setBusy(true);
    try {
      await call("/api/execution-lots/deals/" + encodeURIComponent(dealId) + "/lots/" + encodeURIComponent(lotId) + "/items/" + encodeURIComponent(itemId) + "/progress", {
        method: "POST", body: JSON.stringify({ completedQuantity: progress[key] ?? original }),
      });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha no progresso"); }
    finally { setBusy(false); }
  }
  if (!dealId || !proposalId) return <p className="p-6">Informe dealId e proposalId na URL.</p>;
  return <main className="mx-auto max-w-6xl space-y-5 p-6">
    <header className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Lotes de execução</h1><p className="text-sm text-muted-foreground">Separe itens e quantidades da proposta em lotes independentes.</p></div>
      <Button variant="outline" onClick={() => void refresh()}>Atualizar</Button>
    </header>
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
    <Card><CardContent className="space-y-3 pt-5">
      <h2 className="font-semibold">Enviar itens para execução</h2>
      <Input aria-label="Nome do lote" placeholder="Nome do lote (ex.: Etapa térreo)" value={label} onChange={e => setLabel(e.target.value)} />
      {data?.contractedItems.map(item => {
        const balance = data.balances.find(x => x.itemId === item.itemId);
        return <div key={item.itemId} className="flex flex-wrap items-center justify-between gap-3 border-b py-2">
          <div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.group ?? "Sem grupo"} · Contratado: {item.contractedQuantity} {item.unit} · Disponível: {balance?.available ?? 0}</p></div>
          <Input className="w-28" aria-label={"Quantidade " + item.name} type="number" min={0} step="any" max={balance?.available ?? 0}
            value={selection[item.itemId] ?? ""} onChange={e => setSelection(old => ({ ...old, [item.itemId]: Number(e.target.value) }))} />
        </div>;
      })}
      <Button onClick={() => void reserve()} disabled={busy || !data}>Criar lote de execução</Button>
    </CardContent></Card>
    <h2 className="text-lg font-semibold">Lotes existentes</h2>
    {data?.lots.map(lot => <Card key={lot.id}><CardContent className="space-y-3 pt-5">
      <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{lot.label || "Lote " + lot.id.slice(0, 8)}</h3><p className="text-sm text-muted-foreground">Status: {lot.status}</p></div>
        <div className="flex gap-2">{lot.status === "reserved" && <Button disabled={busy} onClick={() => void changeStatus(lot, "in_progress")}>Iniciar</Button>}
          {lot.status === "in_progress" && <Button disabled={busy} onClick={() => void changeStatus(lot, "completed")}>Concluir</Button>}
          {(lot.status === "reserved" || lot.status === "in_progress") && <Button variant="outline" disabled={busy} onClick={() => void changeStatus(lot, "cancelled")}>Cancelar</Button>}</div></div>
      {data.allocations.filter(x => x.lot_id === lot.id).map(allocation => {
        const key = lot.id + ":" + allocation.source_item_id;
        const name = data.contractedItems.find(x => x.itemId === allocation.source_item_id)?.name ?? allocation.source_item_id;
        const current = Number(allocation.completed_quantity);
        return <div key={key} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <span className="text-sm">{name} · {current}/{Number(allocation.quantity)} executados</span>
          {lot.status === "in_progress" && <div className="flex gap-2"><Input className="w-28" type="number" min={current} max={Number(allocation.quantity)} step="any"
            aria-label={"Progresso " + name} value={progress[key] ?? current} onChange={e => setProgress(old => ({ ...old, [key]: Number(e.target.value) }))} />
            <Button variant="outline" disabled={busy} onClick={() => void saveProgress(lot.id, allocation.source_item_id, current)}>Salvar</Button></div>}
        </div>;
      })}
    </CardContent></Card>)}
    {!data && !error && <p className="text-sm text-muted-foreground">Carregando...</p>}
  </main>;
}
