import { useCallback, useEffect, useMemo, useState } from "react";
import { T } from "../../shared/arqdor-theme";

const BASE = "/api";

function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem("vendorai_token");
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

type GalleryRender = {
  id: string;
  imageUrl: string | null;
  versao: number | null;
  origem: string | null;
  createdAt: string;
  cenaId: string;
  cenaNome: string | null;
  projetoId: string;
};

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
  created_at?: string | null;
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error || `HTTP ${response.status}`);
  return data as any;
}

const DIMENSIONS: Array<[keyof FidelityReview, string]> = [
  ["camera", "Câmera"],
  ["geometry", "Geometria"],
  ["openings", "Aberturas"],
  ["volumetry", "Volumetria"],
  ["materials", "Materiais"],
  ["lighting", "Iluminação"],
];

export function AIReviewModule() {
  const [renders, setRenders] = useState<GalleryRender[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [history, setHistory] = useState<ReviewHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRenders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BASE}/arch/renders/gallery?limit=20`, { headers: authHeaders() });
      const data = await readJson(response);
      const list = Array.isArray(data) ? data : [];
      setRenders(list);
      setSelId(current => current && list.some((item: GalleryRender) => item.id === current) ? current : list[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar renders");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReview = useCallback(async (renderId: string | null) => {
    if (!renderId) {
      setHistory([]);
      return;
    }
    setReviewLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BASE}/arch/ai-render/${encodeURIComponent(renderId)}/reviews`, {
        headers: authHeaders(),
      });
      const data = await readJson(response);
      setHistory(Array.isArray(data.reviews) ? data.reviews : []);
    } catch (err) {
      setHistory([]);
      setError(err instanceof Error ? err.message : "Erro ao carregar Fidelity Review");
    } finally {
      setReviewLoading(false);
    }
  }, []);

  useEffect(() => { void loadRenders(); }, [loadRenders]);
  useEffect(() => { void loadReview(selId); }, [selId, loadReview]);

  async function runReview() {
    if (!selId) return;
    setReviewLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BASE}/arch/ai-render/${encodeURIComponent(selId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
      await readJson(response);
      await loadReview(selId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar Fidelity Review");
    } finally {
      setReviewLoading(false);
    }
  }

  const selected = renders.find(item => item.id === selId) ?? null;
  const latest = history[0]?.review ?? null;
  const scoreColor = (score: number) => score >= 85 ? "#4ade80" : score >= 70 ? "#fbbf24" : "#f87171";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: T.bg }}>
      <div style={{ padding: "14px 20px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 800, color: "#fff" }}>🔍 AI Review · Fidelity</h2>
          <p style={{ margin: 0, fontSize: 11, color: T.dim }}>Comparação real imagem-base × versão persistida</p>
        </div>
        <button
          onClick={() => void runReview()}
          disabled={!selId || reviewLoading}
          style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: T.purple, color: "#fff", cursor: !selId || reviewLoading ? "not-allowed" : "pointer", opacity: !selId || reviewLoading ? .5 : 1, fontSize: 11, fontWeight: 700 }}
        >
          {reviewLoading ? "Analisando…" : history.length ? "Executar novo Review" : "Executar Review"}
        </button>
        <button onClick={() => void loadRenders()} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.dim, cursor: "pointer", fontSize: 10 }}>↻</button>
      </div>

      {error && <div style={{ padding: "8px 20px", background: "rgba(248,113,113,0.08)", borderBottom: "1px solid rgba(248,113,113,0.2)", fontSize: 11, color: "#f87171" }}>⚠ {error}</div>}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${T.border}`, overflowY: "auto", padding: "10px 12px" }}>
          <p style={{ margin: "0 0 8px", fontSize: 9, fontWeight: 700, color: T.dim, letterSpacing: "0.06em" }}>RENDERS DISPONÍVEIS</p>
          {loading && <div style={{ color: T.dim, fontSize: 11 }}>Carregando…</div>}
          {!loading && renders.length === 0 && <div style={{ color: T.dim, fontSize: 11, padding: 12 }}>Nenhum render disponível.</div>}
          {renders.map(render => (
            <button
              key={render.id}
              onClick={() => setSelId(render.id)}
              style={{ width: "100%", textAlign: "left", borderRadius: 8, marginBottom: 8, cursor: "pointer", overflow: "hidden", border: `1px solid ${selId === render.id ? "rgba(124,58,237,0.5)" : T.border}`, background: selId === render.id ? "rgba(124,58,237,0.10)" : "rgba(255,255,255,0.03)", padding: 0, color: "#fff" }}
            >
              {render.imageUrl && <img src={render.imageUrl} alt="" style={{ width: "100%", height: 50, objectFit: "cover", display: "block" }} />}
              <div style={{ padding: "6px 8px" }}>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{render.cenaNome ?? "Cena"}</div>
                <div style={{ marginTop: 2, fontSize: 9, color: T.dim }}>{render.versao != null ? `V${render.versao}` : "Render"} · {new Date(render.createdAt).toLocaleDateString("pt-BR")}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          {selected?.imageUrl && <img src={selected.imageUrl} alt="Render selecionado" style={{ width: "100%", maxHeight: 280, objectFit: "contain", background: "#0a0a0a", borderRadius: 10, border: `1px solid ${T.border}` }} />}

          {!reviewLoading && !latest && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 10, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.dim, fontSize: 11, lineHeight: 1.6 }}>
              Ainda não existe Fidelity Review persistido para esta versão. Nenhum score é calculado localmente ou inventado.
            </div>
          )}

          {latest && (
            <>
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16, padding: 14, borderRadius: 10, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: 42, fontWeight: 900, color: scoreColor(latest.overallScore) }}>{Math.round(latest.overallScore)}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>{latest.requiresHumanReview ? "Revisão humana recomendada" : "Sem alerta crítico"}</div>
                  <div style={{ marginTop: 5, fontSize: 11, color: T.dim, lineHeight: 1.5 }}>{latest.summary}</div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {DIMENSIONS.map(([key, label]) => {
                  const dim = latest[key] as FidelityDimension;
                  return (
                    <div key={String(key)} style={{ padding: 10, borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.dim }}><span>{label}</span><strong style={{ color: scoreColor(dim.score) }}>{Math.round(dim.score)}</strong></div>
                      <div style={{ marginTop: 5, fontSize: 9, color: T.dim }}>confiança {Math.round(dim.confidence * 100)}%</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: T.dim, marginBottom: 6 }}>ALTERAÇÕES NÃO SOLICITADAS</div>
                {latest.unsolicitedChanges.length === 0 ? (
                  <div style={{ padding: 10, borderRadius: 8, background: "rgba(16,185,129,.10)", color: "#6ee7b7", fontSize: 11 }}>Nenhuma alteração não solicitada detectada com evidência suficiente.</div>
                ) : latest.unsolicitedChanges.map((issue, index) => (
                  <div key={index} style={{ padding: 10, marginBottom: 7, borderRadius: 8, background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.22)" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>{issue.category} · {issue.severity}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "#fff" }}>{issue.description}</div>
                    <div style={{ marginTop: 4, fontSize: 10, color: T.dim }}>{issue.evidence}</div>
                  </div>
                ))}
              </div>

              {history.length > 1 && <div style={{ marginTop: 12, fontSize: 10, color: T.dim }}>{history.length} reviews persistidos para esta versão.</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
