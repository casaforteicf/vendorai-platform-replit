import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { getLaunchAttribution } from "@/lib/launchAttribution";

type ChatMsg = { from: "lead" | "agent"; text: string };
type Step = "closed" | "form" | "chat";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export function AgentSimulatorWidget() {
  const [step, setStep] = useState<Step>("closed");
  const [personName, setPersonName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [segment, setSegment] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [pain, setPain] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  async function captureLead() {
    try {
      await fetch(`${API_BASE}/site/contato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: personName.trim(),
          email: email.trim(),
          telefone: phone.trim() || undefined,
          empresa: businessName.trim(),
          origem: "agent_simulator",
          mensagem: [
            `Iniciou demo do agente. Segmento: ${segment.trim()}.`,
            `Oferta: ${description.trim()}.`,
            objective.trim() ? `Objetivo: ${objective.trim()}.` : "",
            pain.trim() ? `Dificuldade: ${pain.trim()}.` : "",
          ].filter(Boolean).join(" "),
          ...getLaunchAttribution(),
        }),
      });
    } catch {
      // A captura comercial não deve impedir a demonstração.
    }
  }

  async function startChat() {
    if (!personName.trim() || !email.trim() || !businessName.trim() || !segment.trim() || !description.trim()) return;
    setStep("chat");
    setSending(true);
    await captureLead();
    try {
      const res = await fetch(`${API_BASE}/public/agent-simulator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, segment, description, history: [] }),
      });
      const data = await res.json();
      setMessages([{ from: "agent", text: res.ok ? data.reply : "Não consegui iniciar agora. Tenta de novo em instantes." }]);
    } catch {
      setMessages([{ from: "agent", text: "Não consegui iniciar agora. Tenta de novo em instantes." }]);
    } finally {
      setSending(false);
    }
  }

  async function send() {
    if (!input.trim() || sending || limitReached) return;
    const next: ChatMsg[] = [...messages, { from: "lead", text: input.trim() }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/public/agent-simulator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, segment, description, history: next }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) => [...prev, { from: "agent", text: data.reply }]);
        if (data.limitReached) setLimitReached(true);
      } else {
        setMessages((prev) => [...prev, { from: "agent", text: data.error ?? "Deu um erro aqui, tenta de novo." }]);
      }
    } catch {
      setMessages((prev) => [...prev, { from: "agent", text: "Deu um erro de conexão, tenta de novo." }]);
    } finally {
      setSending(false);
    }
  }

  function close() {
    setStep("closed");
    setMessages([]);
    setLimitReached(false);
    setPersonName(""); setEmail(""); setPhone(""); setBusinessName("");
    setSegment(""); setDescription(""); setObjective(""); setPain("");
  }

  const isTrialPage = typeof window !== "undefined" && window.location.pathname === "/demo";
  if (step === "closed" && isTrialPage) return null;

  if (step === "closed") {
    return (
      <button onClick={() => setStep("form")} aria-label="Testar um agente de IA agora" data-testid="btn-agent-simulator-open" className="fixed bottom-5 left-4 z-50 flex h-12 max-w-[calc(100vw-6rem)] items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_12px_35px_rgba(37,99,235,0.45)] transition hover:scale-105 hover:bg-blue-500 sm:left-5 sm:h-14 sm:max-w-none sm:px-5">
        <Sparkles className="h-5 w-5 shrink-0" /><span className="truncate">Testar um agente</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-start bg-black/40 p-0 sm:items-center sm:justify-center sm:p-4" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#0d1423] shadow-[0_40px_120px_rgba(0,0,0,0.5)] sm:h-[680px] sm:rounded-[28px]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300"><Bot className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-white">Simulador de Agente</p><p className="text-xs text-slate-500">Personalizado para o seu negócio</p></div></div>
          <button onClick={close} aria-label="Fechar" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {step === "form" && <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <p className="mb-4 text-sm leading-6 text-slate-300">Conte o essencial para personalizar a demonstração. Esses dados também iniciam seu perfil comercial no VendorAI.</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><Input placeholder="Seu nome *" value={personName} onChange={(e) => setPersonName(e.target.value)} className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" /><Input placeholder="WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" /></div>
            <Input placeholder="E-mail *" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
            <Input placeholder="Nome da empresa *" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
            <Input placeholder="Segmento *" value={segment} onChange={(e) => setSegment(e.target.value)} className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
            <Input placeholder="O que você vende ou oferece *" value={description} onChange={(e) => setDescription(e.target.value)} className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
            <Input placeholder="O que quer melhorar primeiro?" value={objective} onChange={(e) => setObjective(e.target.value)} className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
            <Input placeholder="Maior dificuldade comercial hoje" value={pain} onChange={(e) => setPain(e.target.value)} className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
          </div>
          <Button onClick={startChat} disabled={!personName.trim() || !email.trim() || !businessName.trim() || !segment.trim() || !description.trim()} className="mt-4 h-12 w-full rounded-xl bg-blue-500 hover:bg-blue-400">Começar simulação personalizada</Button>
        </div>}

        {step === "chat" && <><div className="flex-1 space-y-3 overflow-y-auto p-5">{messages.map((m, i) => <div key={i} className={`flex ${m.from === "agent" ? "justify-start" : "justify-end"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${m.from === "agent" ? "bg-white/[0.06] text-slate-200" : "bg-blue-500 text-white"}`}>{m.text}</div></div>)}{sending && <div className="flex justify-start"><div className="rounded-2xl bg-white/[0.06] px-4 py-2.5"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div></div>}<div ref={bottomRef} /></div><div className="border-t border-white/10 p-4">{limitReached ? <Button asChild className="h-12 w-full rounded-xl bg-blue-500 hover:bg-blue-400"><Link href="/demo">Continuar com meus 5 dias grátis</Link></Button> : <div className="flex gap-2"><Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Digite como se fosse seu cliente…" className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" disabled={sending} /><Button onClick={send} disabled={sending || !input.trim()} size="icon" className="h-10 w-10 shrink-0 rounded-xl bg-blue-500 hover:bg-blue-400"><Send className="h-4 w-4" /></Button></div>}</div></>}
      </div>
    </div>
  );
}
