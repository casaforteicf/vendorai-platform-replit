import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { RenderStudioSelectionRect as SelectionRect, RenderStudioStep as Step } from "./renderStudioModel";
import { renderApiPost as apiPost } from "./renderStudioApi";
import { RENDER_STUDIO_THEME as D, renderStudioInputStyle as inputStyle } from "./renderStudioTheme";

type CopilotMessage = { role: "user" | "assistant"; content: string; timestamp: Date };

function Spinner({ size = 12 }: { size?: number }) {
  return (
    <>
      <div style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${D.border}`, borderTopColor: D.purple, animation: "arq-spin 0.7s linear infinite", flexShrink: 0 }} />
      <style>{`@keyframes arq-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ─── P3-23/24/25: CopilotPanel ────────────────────────────────────────────────

export function RenderStudioCopilot({ projectId, step, selections, onTestAction }: {
  projectId: string | null; step: Step; selections: SelectionRect[]; onTestAction: (prompt: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<CopilotMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingActions, setPendingActions] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  async function sendMessage(overrideMsg?: string) {
    const msg = (overrideMsg ?? input).trim();
    if (!msg || busy) return;
    setInput("");
    const userMsg: CopilotMessage = { role: "user", content: msg, timestamp: new Date() };
    setHistory(prev => [...prev, userMsg]);
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      const apiHistory = [...history.slice(-8), userMsg].map(m => ({ role: m.role, content: m.content }));
      const data = await apiPost("/api/arch/copilot/chat", {
        message: msg, projectId: projectId ?? undefined,
        history: apiHistory.slice(0, -1),
      });
      const reply: string = data.reply ?? data.message ?? data.content ?? data.resposta ?? "Sem resposta.";
      const actionMatch = reply.match(/ACTIONS:\s*\[([^\]]+)\]/i);
      if (actionMatch) {
        const parsed = actionMatch[1].split(",").map((a: string) => a.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        setPendingActions(parsed);
      } else {
        setPendingActions([]);
      }
      const assistantMsg: CopilotMessage = { role: "assistant", content: reply.replace(/ACTIONS:\s*\[[^\]]+\]/i, "").trim(), timestamp: new Date() };
      setHistory(prev => [...prev, assistantMsg]);
    } catch {
      setHistory(prev => [...prev, { role: "assistant", content: "Erro ao consultar o Copilot. Tente novamente.", timestamp: new Date() }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const stepSuggestions: Partial<Record<Step, string>> = {
    render:   "Qual estilo de render você recomenda para este ambiente?",
    melhoria: selections.length > 0 ? `Que material sugere para a região "${selections[0].label}"?` : "Quais materiais combinam com este ambiente?",
    versao:   "Qual versão tem melhor aproveitamento da luz natural?",
    aprovar:  "Este render está pronto para aprovação do cliente?",
  };
  const suggestion = stepSuggestions[step];
  const unreadCount = history.filter(m => m.role === "assistant").length;

  return (
    <div className="arqdor-copilot-strip arqdor-studio-copilot" style={{ borderTop: `1px solid ${D.border}`, background: `${D.surface}F8`, flexShrink: 0 }}>
      <button onClick={() => setIsOpen(o => !o)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }} aria-expanded={isOpen}>
        <span style={{ fontSize: 11, color: D.purple }}>✦</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: D.purple, letterSpacing: "0.06em", flex: 1 }}>IA COPILOT</span>
        {unreadCount > 0 && !isOpen && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 10, background: D.purple, color: "#fff" }}>{unreadCount}</span>}
        <span style={{ fontSize: 9, color: D.dim }}>{isOpen ? "▲" : "▼"}</span>
      </button>
      {isOpen && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {history.length > 0 && (
            <div style={{ overflowY: "auto", padding: "6px 12px", display: "flex", flexDirection: "column", gap: 6, maxHeight: 180 }}>
              {history.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "88%", padding: "6px 9px", borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px", background: m.role === "user" ? `${D.purple}33` : D.card, border: `1px solid ${m.role === "user" ? D.purple + "44" : D.border}`, fontSize: 11, color: D.text, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {m.content}
                  </div>
                  <span style={{ fontSize: 9, color: D.dim, marginTop: 2 }}>{m.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
              {busy && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}><Spinner size={12} /><span style={{ fontSize: 10, color: D.muted }}>Copilot pensando…</span></div>}
              <div ref={messagesEndRef} />
            </div>
          )}
          {pendingActions.length > 0 && (
            <div style={{ padding: "6px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: D.dim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Ações sugeridas</div>
              {pendingActions.map(action => (
                <div key={action} style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 8px", borderRadius: 6, background: `${D.purple}12`, border: `1px solid ${D.purple}33` }}>
                  <span style={{ fontSize: 10, color: D.purpleText, flex: 1 }}>{action}</span>
                  <button onClick={() => { onTestAction(action); setPendingActions(prev => prev.filter(a => a !== action)); }} style={{ padding: "2px 8px", borderRadius: 5, fontSize: 9, fontWeight: 700, background: D.purple, color: "#fff", border: "none", cursor: "pointer" }}>Testar</button>
                  <button onClick={() => setPendingActions(prev => prev.filter(a => a !== action))} style={{ padding: "2px 6px", borderRadius: 5, fontSize: 9, background: "transparent", color: D.dim, border: "none", cursor: "pointer" }}>Ignorar</button>
                </div>
              ))}
            </div>
          )}
          {suggestion && history.length === 0 && (
            <div style={{ padding: "4px 12px" }}>
              <button onClick={() => void sendMessage(suggestion)} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 10, background: `${D.purple}18`, color: D.purpleText, border: `1px solid ${D.purple}33`, cursor: "pointer", maxWidth: "100%", textAlign: "left" }}>
                💡 {suggestion}
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderTop: `1px solid ${D.border}` }}>
            <input className="arqdor-render-tech-field" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
              placeholder="Pergunte ao Copilot…" disabled={busy}
              aria-label="Mensagem para o Copilot" style={{ ...inputStyle, flex: 1, fontSize: 11 }} />
            <button onClick={() => void sendMessage()} disabled={busy || !input.trim()}
              style={{ padding: "5px 10px", borderRadius: 6, background: D.purple, color: "#fff", border: "none", cursor: busy || !input.trim() ? "not-allowed" : "pointer", opacity: busy || !input.trim() ? 0.45 : 1, fontWeight: 700, fontSize: 11 }}>
              {busy ? "…" : "→"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

