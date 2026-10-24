import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Item = { nome: string; quantidade: number; valorUnitario: number; contratual?: Record<string, any>; [key: string]: any };
type Budget = { id: string; status: string; itens: Item[]; [key: string]: any };
type Props = { budgetId: string; token: string; onSaved: () => void };

// Edits draft item metadata only; never derives contractual approval from an AI suggestion.
export function BudgetContractualEditor({ budgetId, token, onSaved }: Props) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [original, setOriginal] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [annexPreview, setAnnexPreview] = useState<any | null>(null);
  const [financeSources, setFinanceSources] = useState<any | null>(null);

  async function getCurrent(): Promise<Budget> {
    const response = await fetch(`/api/propostas/${encodeURIComponent(budgetId)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.id) throw new Error(data?.error ?? "Não foi possível consultar o orçamento.");
    return data as Budget;
  }

  async function loadFinancialSources() {
    setError(""); setFinanceSources(null);
    try {
      const response = await fetch(`/api/propostas/${encodeURIComponent(budgetId)}/anexos/fontes-financeiras`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Falha ao consultar fontes financeiras.");
      setFinanceSources(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao consultar fontes financeiras."); }
  }

  async function loadAnnexPreview() {
    setError(""); setAnnexPreview(null);
    try {
      const response = await fetch(`/api/propostas/${encodeURIComponent(budgetId)}/anexos/previa`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Falha na conferência documental.");
      setAnnexPreview(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha na conferência documental."); }
  }

  async function load() {
    setBusy(true); setError(""); setSuccess(""); setAnnexPreview(null);
    try {
      const current = await getCurrent();
      if (current.status !== "rascunho") throw new Error("Orçamento emitido: crie uma revisão para alterar especificações.");
      if (!Array.isArray(current.itens)) throw new Error("Orçamento sem lista válida de itens.");
      setBudget(current);
      setItems(current.itens.map((i) => ({ ...i, contratual: i.contratual ? { ...i.contratual } : {} })));
      setOriginal(JSON.stringify(current.itens));
    } catch (e) { setError(e instanceof Error ? e.message : "Erro na consulta."); }
    finally { setBusy(false); }
  }

  function edit(index: number, field: string, value: string) {
    setItems((previous) => previous.map((item, i) => i !== index ? item : ({
      ...item,
      contratual: { ...item.contratual, [field]: value || undefined },
    })));
    setSuccess("");
  }

  async function save() {
    if (!budget) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const fresh = await getCurrent();
      if (fresh.status !== "rascunho" || JSON.stringify(fresh.itens) !== original) {
        throw new Error("A revisão ou os itens mudaram desde a abertura. Recarregue antes de salvar.");
      }
      const response = await fetch(`/api/propostas/${encodeURIComponent(budget.id)}/itens/contratual`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedItems: JSON.parse(original),
          changes: items.map((item, index) => ({ index, contratual: item.contratual ?? {} })),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Erro ao salvar especificações.");
      setBudget(body as Budget);
      setItems((body.itens ?? []) as Item[]);
      setOriginal(JSON.stringify(body.itens ?? []));
      setAnnexPreview(null);
      setSuccess("Especificações gravadas no orçamento. Aprovação contratual ainda depende da revisão oficial.");
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Especificações contratuais dos itens</h3>
          <p className="text-xs text-muted-foreground">Origem: orçamento salvo. Apenas rascunhos; não modifica preços ou quantidades.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>Carregar itens atuais</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void loadAnnexPreview()}>Conferir anexos A/B/C</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void loadFinancialSources()}>Fontes financeiras da obra</Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
      {financeSources && <section className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
        <p className="font-semibold">Fontes ERP — obra {financeSources.obraId || "não vinculada"}</p>
        <p>{financeSources.titulos?.length ?? 0} título(s) financeiro(s), {financeSources.medicoes?.length ?? 0} medição(ões) de fase e {financeSources.linhasBase?.length ?? 0} linha(s) de base vinculadas à proposta.</p>
        <p>Os títulos não representam automaticamente as parcelas contratuais.</p>
        {financeSources.amortizacaoPendente && <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
          <p>Amortização observada nas medições: R$ {financeSources.amortizacaoPendente.valorAmortizadoObservado}</p>
          <p>{financeSources.amortizacaoPendente.motivo}</p>
          <p>Saldo inicial e saldo remanescente do adiantamento: pendentes de conferência contratual.</p>
        </div>}
        {(financeSources.pendencias ?? []).map((p: any, i: number) => <p key={i} role="status">{p.message}</p>)}
        {(financeSources.medicoes ?? []).map((m: any) => <p key={m.id}>Medição {m.data} — {m.etapaNome || "etapa não identificada"} — bruto R$ {m.valorBruto}; amortização R$ {m.amortizacaoEntrada}; líquido R$ {m.valorLiquido}</p>)}
        {(financeSources.titulos ?? []).map((t: any) => <p key={t.id}>{t.descricao} — {t.tipo} / {t.status} — R$ {t.valorOriginal} — vencimento {t.vencimento || "pendente"} — fonte {t.origem}</p>)}
      </section>}
      {annexPreview && <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs space-y-2">
        <p className="font-semibold">Prévia não contratual — {annexPreview.numero || annexPreview.propostaId} / {annexPreview.revision || "revisão não identificada"}</p>
        <p>{annexPreview.anexoA?.items?.length ?? 0} itens no memorial; {annexPreview.anexoB?.etapas?.length ?? 0} etapas previstas; {annexPreview.anexoC?.itensParaVistoria?.length ?? 0} itens candidatos à vistoria.</p>
        <p>Emissão e aceite permanecem bloqueados até validação independente da versão aprovada no servidor.</p>
        {(annexPreview.pending ?? []).map((p: any, i: number) => <p key={i} className="text-amber-900">• {p.message}</p>)}
      </section>}
      {budget && <div className="space-y-3">
        {items.map((item, index) => <div key={index} className="space-y-2 rounded-lg border p-3">
          <div className="text-sm font-medium">{item.nome} — {item.quantidade} × R$ {Number(item.valorUnitario).toFixed(2)}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">Escopo contratual
              <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={item.contratual?.classificacao ?? ""} onChange={(e) => edit(index, "classificacao", e.target.value)}>
                <option value="">Não definido</option>
                <option value="incluido">Incluso</option><option value="excluido">Excluído</option>
                <option value="opcional">Opcional</option><option value="condicionado">Condicionado</option>
              </select>
            </label>
            <label className="text-xs">Local de aplicação
              <Input className="mt-1" value={item.contratual?.localAplicacao ?? ""} onChange={(e) => edit(index, "localAplicacao", e.target.value)} />
            </label>
            <label className="text-xs">Marca
              <Input className="mt-1" value={item.contratual?.marca ?? ""} onChange={(e) => edit(index, "marca", e.target.value)} />
            </label>
            <label className="text-xs">Modelo
              <Input className="mt-1" value={item.contratual?.modelo ?? ""} onChange={(e) => edit(index, "modelo", e.target.value)} />
            </label>
          </div>
          <label className="block text-xs">Especificação técnica
            <Textarea className="mt-1" value={item.contratual?.especificacao ?? ""} onChange={(e) => edit(index, "especificacao", e.target.value)} />
          </label>
          <label className="block text-xs">Observações para o Anexo A
            <Textarea className="mt-1" value={item.contratual?.observacoesMemorial ?? ""} onChange={(e) => edit(index, "observacoesMemorial", e.target.value)} />
          </label>
        </div>)}
        <Button type="button" disabled={busy || items.length === 0} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar especificações no rascunho"}</Button>
      </div>}
    </section>
  );
}
