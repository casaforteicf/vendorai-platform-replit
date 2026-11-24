import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Droplets, Flame, Gauge, Plus, RefreshCw, Thermometer, Zap } from "lucide-react";
import type { MaintenanceApi, Meter, MeterReading } from "./api";
import { Card, Empty, ErrorBox, Field, SectionTitle, fmtDate, inputClass, todayISO } from "./components";

const KINDS = [
  { value: "water", label: "Água", unit: "m³", icon: Droplets },
  { value: "gas", label: "Gás", unit: "m³", icon: Flame },
  { value: "energy", label: "Energia", unit: "kWh", icon: Zap },
  { value: "temperature", label: "Temperatura", unit: "°C", icon: Thermometer },
] as const;

const kindInfo = (kind: string) => KINDS.find((item) => item.value === kind) ?? KINDS[0];

export default function Medidores({ api }: { api: MaintenanceApi }) {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [selected, setSelected] = useState<Meter | null>(null);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("water");
  const [unit, setUnit] = useState("m³");
  const [location, setLocation] = useState("");
  const [readingDate, setReadingDate] = useState(todayISO());
  const [readingValue, setReadingValue] = useState("");
  const [readingNotes, setReadingNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await api.get<Meter[]>("/medidores");
      setMeters(rows);
      setSelected((current) => current ? rows.find((row) => row.id === current.id) ?? null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api]);

  const loadReadings = useCallback(async (meter: Meter) => {
    try {
      setReadings(await api.get<MeterReading[]>(`/medidores/${meter.id}/leituras`));
    } catch {
      setReadings([]);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selected) void loadReadings(selected); else setReadings([]); }, [selected, loadReadings]);

  async function createMeter(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Informe o nome do medidor."); return; }
    setBusy(true); setError(null);
    try {
      const created = await api.post<Meter>("/medidores", { name, kind, unit, location: location || null });
      setName(""); setLocation(""); setShowForm(false);
      await load();
      setSelected(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addReading(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const value = Number(readingValue.replace(",", "."));
    if (!Number.isFinite(value)) { setError("Informe um valor numérico para a leitura."); return; }
    setBusy(true); setError(null);
    try {
      await api.post(`/medidores/${selected.id}/leituras`, { readingDate, value, notes: readingNotes || null });
      setReadingValue(""); setReadingNotes("");
      await Promise.all([load(), loadReadings(selected)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title="Medidores e leituras"
          subtitle="Água, gás, energia e temperatura com histórico por medidor."
          action={
            <div className="flex gap-2">
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" />Atualizar</button>
              <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" />Novo medidor</button>
            </div>
          }
        />
        {error && <div className="mb-3"><ErrorBox message={error} onRetry={() => void load()} /></div>}

        {showForm && (
          <form onSubmit={createMeter} className="mb-4 grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Nome" className="sm:col-span-2"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Hidrômetro geral, energia cozinha…" required /></Field>
            <Field label="Tipo">
              <select className={inputClass} value={kind} onChange={(e) => {
                const next = e.target.value as (typeof KINDS)[number]["value"];
                setKind(next); setUnit(kindInfo(next).unit);
              }}>
                {KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Unidade"><input className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} required /></Field>
            <Field label="Local" className="sm:col-span-2 lg:col-span-4"><input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Casa de máquinas, cozinha, piscina…" /></Field>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Cadastrar</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        )}

        {meters.length === 0 ? <Empty>Nenhum medidor cadastrado.</Empty> : (
          <div className="grid gap-3 lg:grid-cols-3">
            {meters.map((meter) => {
              const info = kindInfo(meter.kind);
              const Icon = info.icon;
              return (
                <button key={meter.id} type="button" onClick={() => setSelected(meter)} className={`rounded-lg border p-4 text-left transition-colors ${selected?.id === meter.id ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" />{meter.name}</span>
                    {!meter.active && <span className="text-[10px] font-semibold text-muted-foreground">Inativo</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{info.label} · {meter.unit} · {meter.location ?? "Sem local"}</p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div><p className="text-lg font-semibold">{meter.ultima_leitura ?? "—"}</p><p className="text-[10px] text-muted-foreground">Última leitura {fmtDate(meter.ultima_data)}</p></div>
                    {meter.consumo !== null && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">Consumo {Number(meter.consumo).toLocaleString("pt-BR")} {meter.unit}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {selected && (
        <Card>
          <SectionTitle title={`Leituras · ${selected.name}`} subtitle={`${kindInfo(selected.kind).label} em ${selected.unit}`} />
          <form onSubmit={addReading} className="mb-4 grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Data"><input type="date" className={inputClass} value={readingDate} onChange={(e) => setReadingDate(e.target.value)} /></Field>
            <Field label={`Valor (${selected.unit})`}><input inputMode="decimal" className={inputClass} value={readingValue} onChange={(e) => setReadingValue(e.target.value)} placeholder="0,000" required /></Field>
            <Field label="Observação" className="sm:col-span-2"><input className={inputClass} value={readingNotes} onChange={(e) => setReadingNotes(e.target.value)} placeholder="Opcional" /></Field>
            <div className="sm:col-span-2 lg:col-span-4"><button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Gauge className="h-4 w-4" />Registrar leitura</button></div>
          </form>
          {readings.length === 0 ? <Empty>Nenhuma leitura registrada.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Data</th><th className="py-2">Leitura</th><th className="py-2">Consumo</th><th className="py-2">Observação</th></tr></thead>
                <tbody>
                  {readings.map((reading, index) => {
                    const previous = readings[index + 1];
                    const consumption = previous ? Number(reading.value) - Number(previous.value) : null;
                    return (
                      <tr key={reading.id} className="border-b last:border-0">
                        <td className="py-2">{fmtDate(reading.reading_date)}</td>
                        <td className="py-2 font-medium">{Number(reading.value).toLocaleString("pt-BR")} {selected.unit}</td>
                        <td className="py-2">{consumption === null ? "—" : `${consumption.toLocaleString("pt-BR")} ${selected.unit}`}</td>
                        <td className="py-2 text-muted-foreground">{reading.notes ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
