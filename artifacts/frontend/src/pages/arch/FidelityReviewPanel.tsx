import { useCallback, useEffect, useState } from "react";

type FidelityDimension = {
  score: number;
  confidence: number;
  evidence: string[];
};

type FidelityIssue = {
  category: string;
  severity: "MINOR" | "MAJOR" | "CRITICAL";
  description: string;
  evidence: string;
  unsolicited: boolean;
};

type FidelityReview = {
  overallScore: number;
  camera: FidelityDimension;
  geometry: FidelityDimension;
  openings: FidelityDimension;
  volumetry: FidelityDimension;
  materials: FidelityDimension;
  lighting: FidelityDimension;
  unsolicitedChanges: FidelityIssue[];
  acceptedChanges: FidelityIssue[];
  summary: string;
  requiresHumanReview: boolean;
};

type ReviewHistoryItem = {
  id: string;
  review: FidelityReview;
  model?: string | null;
  created_at?: string | null;
  usage?: { cost_usd?: string | number | null; input_tokens?: number | null; output_tokens?: number | null };
};

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error ?? `Erro ${res.status}`);
  return data as any;
}

const dimensionLabels: Array<[keyof FidelityReview, string]> = [
  ["camera", "Câmera"],
  ["geometry", "Geometria"],
  ["openings", "Aberturas"],
  ["volumetry", "Volumetria"],
  ["materials", "Materiais"],
  ["lighting", "Iluminação"],
];

export default function FidelityReviewPanel({ renderId, onClose }: { renderId: string; onClose: () => void }) {
  const [history, setHistory] = useState<ReviewHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!renderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/arch/ai-render/${encodeURIComponent(renderId)}/reviews`, { headers: authHeader() });
      const data = await readJson(res);
      setHistory(Array.isArray(data.reviews) ? data.reviews : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar AI Review");
    } finally {
      setLoading(false);
    }
  }, [renderId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function runReview() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/arch/ai-render/${encodeURIComponent(renderId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({}),
      });
      await readJson(res);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar AI Review");
    } finally {
      setRunning(false);
    }
  }

  const latest = history[0]?.review;

  return (
    <aside style={{ position: "fixed", right: 16, top: 64, bottom: 16, width: 380, zIndex: 1300, background: "#0C1120", border: "1px solid #253347", borderRadius: 12, boxShadow: "0 24px 80px rgba(0,0,0,.5)", color: "#EDF2F7", overflow: "hidden", display: "flex", flexDirection: "column" }} aria-label="AI Review de fidelidade">
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #1E2A3A", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>AI Review · Fidelity</div>
          <div style={{ fontSize: 10, color: "#7B8EA5", marginTop: 2 }}>Comparação visual base × versão atual</div>
        </div>
        <button onClick={onClose} aria-label="Fechar AI Review" style={{ border: 0, background: "transparent", color: "#A7B4C5", fontSize: 18, cursor: "pointer" }}>×</button>
      </div>
      <div style={{ padding: 14, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <button onClick={() => void runReview()} disabled={running || loading} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #6D28D9", background: "#7C3AED", color: "white", fontWeight: 800, cursor: running || loading ? "not-allowed" : "pointer", opacity: running || loading ? .55 : 1 }}>{running ? "Analisando fidelidade…" : history.length ? "Executar novo AI Review" : "Executar AI Review"}</button>
        {error && <div style={{ padding: 10, borderRadius: 8, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.3)", color: "#F87171", fontSize: 11 }}>{error}</div>}
        {loading && <div style={{ color: "#7B8EA5", fontSize: 11 }}>Carregando histórico…</div>}
        {latest && <>
          <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12, alignItems: "center", padding: 12, background: "#111827", border: "1px solid #1E2A3A", borderRadius: 10 }}>
            <div style={{ width: 88, height: 88, borderRadius: "50%", border: `7px solid ${latest.requiresHumanReview ? "#F59E0B" : "#10B981"}`, display: "grid", placeItems: "center", fontSize: 24, fontWeight: 900 }}>{Math.round(latest.overallScore)}</div>
            <div><div style={{ fontSize: 12, fontWeight: 800 }}>{latest.requiresHumanReview ? "Revisão humana recomendada" : "Sem alerta crítico"}</div><div style={{ marginTop: 6, color: "#94A3B8", fontSize: 11, lineHeight: 1.45 }}>{latest.summary}</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{dimensionLabels.map(([key, label]) => { const d = latest[key] as FidelityDimension; return <div key={String(key)} style={{ padding: 9, background: "#111827", border: "1px solid #1E2A3A", borderRadius: 8 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94A3B8" }}><span>{label}</span><strong style={{ color: "#EDF2F7" }}>{Math.round(d.score)}</strong></div><div style={{ height: 4, marginTop: 6, background: "#1E2A3A", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${Math.max(0, Math.min(100, d.score))}%`, height: "100%", background: d.score >= 85 ? "#10B981" : d.score >= 70 ? "#F59E0B" : "#EF4444" }} /></div><div style={{ marginTop: 5, fontSize: 9, color: "#64748B" }}>confiança {Math.round(d.confidence * 100)}%</div></div>; })}</div>
          <section><div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", marginBottom: 6, textTransform: "uppercase" }}>Alterações não solicitadas</div>{latest.unsolicitedChanges.length === 0 ? <div style={{ padding: 9, borderRadius: 8, background: "rgba(16,185,129,.10)", color: "#6EE7B7", fontSize: 11 }}>Nenhuma alteração não solicitada detectada com evidência suficiente.</div> : latest.unsolicitedChanges.map((issue, index) => <div key={`${issue.category}-${index}`} style={{ padding: 9, marginBottom: 6, borderRadius: 8, background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.22)" }}><div style={{ display: "flex", gap: 6, alignItems: "center" }}><strong style={{ fontSize: 10 }}>{issue.category}</strong><span style={{ fontSize: 9, color: issue.severity === "CRITICAL" ? "#F87171" : "#FBBF24" }}>{issue.severity}</span></div><div style={{ marginTop: 4, fontSize: 11 }}>{issue.description}</div><div style={{ marginTop: 4, color: "#94A3B8", fontSize: 10 }}>{issue.evidence}</div></div>)}</section>
          <section><div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", marginBottom: 6, textTransform: "uppercase" }}>Evidências por dimensão</div>{dimensionLabels.map(([key, label]) => { const d = latest[key] as FidelityDimension; if (!d.evidence?.length) return null; return <div key={`evidence-${String(key)}`} style={{ marginBottom: 8 }}><div style={{ fontSize: 10, fontWeight: 700 }}>{label}</div><ul style={{ paddingLeft: 17, margin: "4px 0 0", color: "#94A3B8", fontSize: 10, lineHeight: 1.45 }}>{d.evidence.map((item, i) => <li key={i}>{item}</li>)}</ul></div>; })}</section>
        </>}
        {!loading && !latest && !error && <div style={{ padding: 12, background: "#111827", border: "1px solid #1E2A3A", borderRadius: 8, color: "#94A3B8", fontSize: 11, lineHeight: 1.5 }}>Ainda não existe AI Review persistido para esta versão. Execute a análise para comparar a imagem-base com o render atual.</div>}
        {history.length > 1 && <div style={{ fontSize: 10, color: "#64748B" }}>{history.length} análises registradas para esta versão.</div>}
      </div>
    </aside>
  );
}
