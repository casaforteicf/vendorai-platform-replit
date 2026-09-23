import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, Sparkles, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Context = {
  kind: "agent" | "simulator" | "arqdor_pre_project" | "external";
  agentKey?: string;
  toolName?: string | null;
  companyName: string;
  vertical?: string | null;
  leadName?: string | null;
};

type ChatItem = { from: "lead" | "agent"; text: string };

function getToken() {
  return new URLSearchParams(window.location.search).get("deliveryToken") ?? "";
}

async function trackDeliveryEvent(token: string, event: "started" | "completed" | "cta_clicked") {
  if (!token) return;
  await fetch(`/api/public/smart-delivery/${encodeURIComponent(token)}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  }).catch(() => undefined);
}

export default function PublicDeliveryRuntime() {
  const token = useMemo(getToken, []);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<ChatItem[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState({
    lotWidth: "12",
    lotDepth: "30",
    desiredArea: "160",
    floors: "1",
    bedrooms: "3",
    suites: "1",
    style: "contemporâneo",
    notes: "",
  });
  const [preProjectBusy, setPreProjectBusy] = useState(false);
  const [preProject, setPreProject] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!token) {
        setError("Link de entrega inválido.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/public/delivery-runtime/${encodeURIComponent(token)}/context`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? "Entrega indisponível.");
        if (alive) {
          setCtx(body as Context);
          void trackDeliveryEvent(token, "started");
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Entrega indisponível.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [token]);

  async function sendMessage() {
    const text = message.trim();
    if (!text || sending) return;
    const next = [...history, { from: "lead" as const, text }];
    setHistory(next);
    setMessage("");
    setSending(true);
    try {
      const res = await fetch(`/api/public/delivery-runtime/${encodeURIComponent(token)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Não foi possível responder.");
      setHistory((current) => {
        const updated = [...current, { from: "agent" as const, text: body.reply }];
        const leadTurns = updated.filter((item) => item.from === "lead").length;
        if (leadTurns >= 2) void trackDeliveryEvent(token, "completed");
        return updated;
      });
    } catch (err) {
      setHistory((current) => [...current, {
        from: "agent",
        text: err instanceof Error ? err.message : "Não foi possível responder agora.",
      }]);
    } finally {
      setSending(false);
    }
  }

  async function generatePreProject(event: React.FormEvent) {
    event.preventDefault();
    setPreProjectBusy(true);
    setPreProject(null);
    setError(null);
    try {
      const res = await fetch(`/api/public/delivery-runtime/${encodeURIComponent(token)}/arqdor-pre-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotWidth: Number(form.lotWidth),
          lotDepth: Number(form.lotDepth),
          desiredArea: Number(form.desiredArea),
          floors: Number(form.floors),
          bedrooms: Number(form.bedrooms),
          suites: Number(form.suites),
          style: form.style,
          notes: form.notes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Não foi possível gerar o pré-projeto.");
      setPreProject(body);
      void trackDeliveryEvent(token, "completed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o pré-projeto.");
    } finally {
      setPreProjectBusy(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
    </div>;
  }

  if (error && !ctx) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Entrega indisponível</h1>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
      </div>
    </div>;
  }

  if (!ctx) return null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white">
              {ctx.kind === "arqdor_pre_project" ? <Building2 className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-950">{ctx.toolName || "Experiência gratuita"}</h1>
              <p className="text-sm text-slate-500">{ctx.companyName}</p>
            </div>
          </div>
        </div>

        {(ctx.kind === "agent" || ctx.kind === "simulator") && (
          <div className="rounded-2xl border bg-white shadow-sm">
            <div className="h-[56vh] min-h-[360px] overflow-y-auto p-4 sm:p-6">
              {history.length === 0 && (
                <div className="mx-auto max-w-md py-14 text-center text-sm text-slate-500">
                  {ctx.kind === "simulator"
                    ? "Envie uma mensagem para experimentar o atendimento."
                    : "Converse com o agente especializado desta empresa."}
                </div>
              )}
              <div className="space-y-3">
                {history.map((item, index) => (
                  <div key={index} className={item.from === "lead" ? "flex justify-end" : "flex justify-start"}>
                    <div className={item.from === "lead"
                      ? "max-w-[85%] rounded-2xl rounded-br-md bg-slate-950 px-4 py-3 text-sm text-white"
                      : "max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm text-slate-800"}>
                      {item.text}
                    </div>
                  </div>
                ))}
                {sending && <div className="flex justify-start"><div className="rounded-2xl bg-slate-100 px-4 py-3"><Loader2 className="h-4 w-4 animate-spin" /></div></div>}
              </div>
            </div>
            <div className="border-t p-3 sm:p-4">
              <div className="flex gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="Digite sua mensagem..."
                />
                <Button type="button" onClick={() => void sendMessage()} disabled={!message.trim() || sending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {history.length >= 2 && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => {
                    void trackDeliveryEvent(token, "cta_clicked");
                    setHistory((current) => [...current, {
                      from: "agent",
                      text: "Perfeito. Registrei seu interesse e a equipe dará sequência usando tudo que você já informou aqui.",
                    }]);
                  }}
                >
                  Quero avançar
                </Button>
              )}
            </div>
          </div>
        )}

        {ctx.kind === "arqdor_pre_project" && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
            {!preProject ? (
              <form onSubmit={generatePreProject} className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold">Seu pré-projeto inicial</h2>
                  <p className="mt-1 text-sm text-slate-500">Informe os dados básicos. O estudo gerado será vinculado ao seu atendimento.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">Largura do terreno (m)<Input value={form.lotWidth} onChange={(e) => setForm({ ...form, lotWidth: e.target.value })} type="number" min="5" /></label>
                  <label className="text-sm">Profundidade do terreno (m)<Input value={form.lotDepth} onChange={(e) => setForm({ ...form, lotDepth: e.target.value })} type="number" min="8" /></label>
                  <label className="text-sm">Área desejada (m²)<Input value={form.desiredArea} onChange={(e) => setForm({ ...form, desiredArea: e.target.value })} type="number" min="30" /></label>
                  <label className="text-sm">Pavimentos<Input value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })} type="number" min="1" max="3" /></label>
                  <label className="text-sm">Quartos<Input value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} type="number" min="1" max="10" /></label>
                  <label className="text-sm">Suítes<Input value={form.suites} onChange={(e) => setForm({ ...form, suites: e.target.value })} type="number" min="0" max="10" /></label>
                  <label className="text-sm sm:col-span-2">Estilo desejado<Input value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} /></label>
                  <label className="text-sm sm:col-span-2">Observações<Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} /></label>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" disabled={preProjectBusy}>
                  {preProjectBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando...</> : "Gerar pré-projeto"}
                </Button>
              </form>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Pré-projeto inicial</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{preProject.summary}</p>
                </div>
                {[
                  ["Programa sugerido", preProject.program],
                  ["Implantação", preProject.implantation],
                  ["Direção da fachada", preProject.facadeDirection],
                  ["Próximos passos", preProject.nextSteps],
                ].map(([title, items]) => Array.isArray(items) && items.length ? (
                  <div key={title as string} className="rounded-xl border p-4">
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {(items as string[]).map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                ) : null)}
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    void trackDeliveryEvent(token, "cta_clicked");
                    setPreProject((current: any) => ({ ...current, requestedNextStep: true }));
                  }}
                  disabled={Boolean(preProject?.requestedNextStep)}
                >
                  {preProject?.requestedNextStep ? "Interesse registrado" : "Quero avançar com este projeto"}
                </Button>
                <p className="text-xs text-slate-400">Estudo preliminar. Não substitui projeto arquitetônico, estrutural ou aprovação técnica.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
