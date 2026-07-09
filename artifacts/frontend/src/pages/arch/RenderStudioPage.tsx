// OriginalRenderWorkspace — /arch/render
// Fluxo linear: Projeto → Ambiente → Imagem base → Render IA →
//               Melhoria/Material → Nova versão → Aprovar → Especificação

import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useArqProject } from "@/modules/arqdor/hooks/useArqProject";
import { WorkspaceProvider } from "@/modules/arqdor/workspace/WorkspaceContext";
import { ArqdorThemeProvider } from "@/modules/arqdor/theme/ArqdorThemeProvider";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step =
  | "projeto"
  | "ambiente"
  | "imagem"
  | "render"
  | "melhoria"
  | "versao"
  | "aprovar"
  | "especificacao";

const STEPS: { id: Step; label: string; short: string }[] = [
  { id: "projeto",       label: "Projeto",        short: "1" },
  { id: "ambiente",      label: "Ambiente",        short: "2" },
  { id: "imagem",        label: "Imagem base",     short: "3" },
  { id: "render",        label: "Render IA",       short: "4" },
  { id: "melhoria",      label: "Melhoria",        short: "5" },
  { id: "versao",        label: "Nova versão",     short: "6" },
  { id: "aprovar",       label: "Aprovar",         short: "7" },
  { id: "especificacao", label: "Especificação",   short: "8" },
];

function stepIndex(s: Step) {
  return STEPS.findIndex((x) => x.id === s);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const tok = localStorage.getItem("vendorai_token") ?? "";
  if (tok) return { Authorization: `Bearer ${tok}` };
  return {};
}

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() } as Record<string, string>,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? `Erro ${res.status}`);
  return data;
}

async function apiGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeader() as HeadersInit });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function waitForRenderCompletion(renderId: string, timeoutAttempts = 90) {
  let attempts = 0;

  while (attempts < timeoutAttempts) {
    await new Promise((r) => setTimeout(r, 2000));

    const data = await apiGet(`/api/arch/ai-render/${renderId}`);

    if (data.status === "concluido" && data.result_image_url) {
      return data;
    }

    if (data.status === "erro") {
      throw new Error(data.erro_msg ?? "Erro no processamento do render");
    }

    attempts++;
  }

  throw new Error("Tempo esgotado aguardando o render.");
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:        "#F8FAFC",
  surface:   "#FFFFFF",
  purple:    "#7C3AED",
  purpleHov: "#6D28D9",
  purpleLight:"#EDE9FE",
  purpleText:"#5B21B6",
  text:      "#0F172A",
  sub:       "#64748B",
  dim:       "#94A3B8",
  border:    "#E2E8F0",
  green:     "#10B981",
  red:       "#EF4444",
  amber:     "#F59E0B",
  inputBg:   "#F8FAFC",
} as const;

// ─── Small shared UI ─────────────────────────────────────────────────────────

function Btn({
  children, onClick, disabled, variant = "primary", fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  fullWidth?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: T.purple, color: "#fff", border: "none" },
    secondary: { background: T.surface, color: T.text, border: `1px solid ${T.border}` },
    ghost:     { background: "transparent", color: T.sub, border: "none" },
    danger:    { background: T.red, color: "#fff", border: "none" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        width: fullWidth ? "100%" : undefined,
        transition: "opacity 0.15s",
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: 8, background: "#FEF2F2",
      border: `1px solid #FECACA`, color: T.red, fontSize: 13 }}>
      {msg}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        border: `3px solid ${T.purpleLight}`, borderTopColor: T.purple,
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Step card wrapper ────────────────────────────────────────────────────────

function StepCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: T.surface, borderRadius: 18, border: `1px solid ${T.border}`,
      padding: 32, maxWidth: 560, width: "100%", display: "flex",
      flexDirection: "column", gap: 20,
      boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
    }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.text }}>{title}</h2>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: T.sub }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Progress stepper ─────────────────────────────────────────────────────────

function Stepper({ current }: { current: Step }) {
  const ci = stepIndex(current);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto",
      padding: "0 2px", scrollbarWidth: "none" }}>
      {STEPS.map((s, i) => {
        const done   = i < ci;
        const active = i === ci;
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: done ? T.green : active ? T.purple : T.border,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800,
                color: done || active ? "#fff" : T.dim,
              }}>
                {done ? "✓" : s.short}
              </div>
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 400,
                color: active ? T.purpleText : done ? T.green : T.dim,
                whiteSpace: "nowrap", maxWidth: 60, textAlign: "center",
                lineHeight: 1.2,
              }}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 24, height: 2, background: i < ci ? T.green : T.border,
                margin: "0 2px", marginBottom: 16, flexShrink: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Inner workspace ──────────────────────────────────────────────────────────

function OriginalRenderWorkspaceInner() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const arq = useArqProject();

  const [step, setStep]           = useState<Step>("projeto");
  const [ambiente, setAmbiente]   = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [renderId, setRenderId]   = useState<string | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [versions, setVersions]   = useState<{ id: string; url: string; label: string }[]>([]);
  const [approved, setApproved]   = useState(false);
  const [specDone, setSpecDone]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [melhoriaPrompt, setMelhoriaPrompt] = useState("");
  const [melhoriaMode, setMelhoriaMode] = useState<
    "improve" | "change-material" | "change-lighting"
  >("improve");

  const fileRef = useRef<HTMLInputElement>(null);

  const go = useCallback((s: Step) => { setErr(null); setStep(s); }, []);

  // ── Step: Projeto ─────────────────────────────────────────────────────────
  function renderProjeto() {
    const proj = arq.projectMeta;
    return (
      <StepCard title="Selecionar Projeto" subtitle="Escolha o projeto de arquitetura para este render.">
        {arq.projectsLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner /></div>
        ) : arq.projects.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: T.sub }}>
            <p style={{ margin: "0 0 12px", fontSize: 14 }}>Nenhum projeto encontrado.</p>
            <Btn onClick={() => {
              const name = prompt("Nome do projeto:");
              if (name?.trim()) void arq.createProject(name.trim());
            }}>+ Criar projeto</Btn>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {arq.projects.map((p) => {
              const active = p.id === arq.projectId;
              return (
                <button
                  key={p.id}
                  onClick={() => void arq.selectProject(p.id)}
                  style={{
                    padding: "12px 16px", borderRadius: 10, textAlign: "left",
                    border: `2px solid ${active ? T.purple : T.border}`,
                    background: active ? T.purpleLight : T.surface,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.titulo}</div>
                  {p.clienteNome && (
                    <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>Cliente: {p.clienteNome}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {err && <ErrBox msg={err} />}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Btn variant="ghost" onClick={() => setLocation("/arch/projetos")}>← Projetos</Btn>
          <Btn disabled={!proj} onClick={() => go("ambiente")}>Continuar →</Btn>
        </div>
      </StepCard>
    );
  }

  // ── Step: Ambiente ────────────────────────────────────────────────────────
  function renderAmbiente() {
    const options = ["Sala de Estar", "Quarto Master", "Cozinha", "Banheiro", "Escritório", "Varanda", "Hall de Entrada"];
    return (
      <StepCard
        title="Definir Ambiente"
        subtitle={`Projeto: ${arq.projectMeta?.titulo ?? "—"}`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((opt) => (
            <button key={opt} onClick={() => setAmbiente(opt)} style={{
              padding: "10px 16px", borderRadius: 9, textAlign: "left",
              border: `2px solid ${ambiente === opt ? T.purple : T.border}`,
              background: ambiente === opt ? T.purpleLight : T.inputBg,
              cursor: "pointer", fontSize: 13, fontWeight: ambiente === opt ? 700 : 400,
              color: ambiente === opt ? T.purpleText : T.text,
            }}>{opt}</button>
          ))}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <input
              value={options.includes(ambiente) ? "" : ambiente}
              onChange={(e) => setAmbiente(e.target.value)}
              placeholder="Outro ambiente..."
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 9, fontSize: 13,
                border: `1px solid ${T.border}`, background: T.inputBg,
                outline: "none", color: T.text,
              }}
            />
          </div>
        </div>
        {err && <ErrBox msg={err} />}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Btn variant="secondary" onClick={() => go("projeto")}>← Voltar</Btn>
          <Btn disabled={!ambiente.trim()} onClick={() => go("imagem")}>Continuar →</Btn>
        </div>
      </StepCard>
    );
  }

  // ── Step: Imagem base ─────────────────────────────────────────────────────
  function renderImagem() {
    return (
      <StepCard
        title="Imagem base"
        subtitle={`Ambiente: ${ambiente}`}
      >
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${imageDataUrl ? T.purple : T.border}`,
            borderRadius: 14, padding: 24, cursor: "pointer",
            background: imageDataUrl ? T.purpleLight : T.inputBg,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            transition: "all 0.2s",
          }}
        >
          {imageDataUrl ? (
            <>
              <img src={imageDataUrl} alt="base" style={{
                maxHeight: 220, maxWidth: "100%", borderRadius: 10,
                objectFit: "contain", boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              }} />
              <span style={{ fontSize: 12, color: T.purpleText, fontWeight: 600 }}>
                {imageFile?.name} — clique para trocar
              </span>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36 }}>📷</div>
              <p style={{ margin: 0, fontSize: 13, color: T.sub, textAlign: "center" }}>
                Clique para selecionar uma foto do ambiente<br />
                <span style={{ fontSize: 11 }}>JPG, PNG, WEBP — máx. 10 MB</span>
              </p>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setImageFile(f);
            setImageDataUrl(await fileToDataUrl(f));
          }}
        />
        {err && <ErrBox msg={err} />}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Btn variant="secondary" onClick={() => go("ambiente")}>← Voltar</Btn>
          <Btn disabled={!imageDataUrl} onClick={() => go("render")}>Continuar →</Btn>
        </div>
      </StepCard>
    );
  }

  // ── Step: Render IA ───────────────────────────────────────────────────────
  async function startRender() {
    if (!imageDataUrl) return;
    setLoading(true);
    setErr(null);
    setRenderUrl(null);
    setRenderId(null);
    try {
      const { render_id } = await apiPost("/api/arch/ai-render", {
        project_id: arq.projectId ?? undefined,
        original_image_url: imageDataUrl,
        mode: "preservar",
        ambiente: ambiente.toLowerCase().replace(/\s+/g, "_"),
        user_notes: "Preservar absolutamente o projeto, medidas, câmera, perspectiva, layout, marcenaria, circulação, aberturas e proporções. Alterar somente a qualidade visual do render.",
      });

      setRenderId(render_id);

      const data = await waitForRenderCompletion(render_id);
      setRenderUrl(data.result_image_url);
      setVersions([{ id: render_id, url: data.result_image_url, label: "Versão 1 · Original" }]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao gerar render.");
    } finally {
      setLoading(false);
    }
  }

  function renderRender() {
    return (
      <StepCard
        title="Render IA"
        subtitle={`${arq.projectMeta?.titulo} · ${ambiente}`}
      >
        {!renderUrl && !loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "8px 0" }}>
            {imageDataUrl && (
              <img src={imageDataUrl} alt="original" style={{
                maxHeight: 180, maxWidth: "100%", borderRadius: 10, objectFit: "contain",
                opacity: 0.8, border: `1px solid ${T.border}`,
              }} />
            )}
            <p style={{ margin: 0, fontSize: 13, color: T.sub, textAlign: "center" }}>
              Pronto para gerar o render com IA.<br />
              <span style={{ fontSize: 11 }}>Tempo estimado: 30–90 segundos</span>
            </p>
            <Btn onClick={startRender} fullWidth>✦ Gerar Render com IA</Btn>
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "24px 0" }}>
            <Spinner />
            <p style={{ margin: 0, fontSize: 13, color: T.sub, textAlign: "center" }}>
              Processando com IA...<br />
              <span style={{ fontSize: 11 }}>Aguarde, isso pode levar alguns segundos</span>
            </p>
          </div>
        )}

        {renderUrl && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <img src={renderUrl} alt="render" style={{
              width: "100%", borderRadius: 12, objectFit: "cover",
              maxHeight: 280, boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
            }} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="secondary" onClick={startRender} fullWidth>↺ Novo render</Btn>
              <Btn onClick={() => go("melhoria")} fullWidth>Melhorar →</Btn>
            </div>
          </div>
        )}

        {err && <ErrBox msg={err} />}
        {!loading && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Btn variant="ghost" onClick={() => go("imagem")}>← Voltar</Btn>
            {renderUrl && <Btn variant="ghost" onClick={() => go("aprovar")}>Pular melhoria →</Btn>}
          </div>
        )}
      </StepCard>
    );
  }

  // ── Step: Melhoria / Material ─────────────────────────────────────────────
  async function applyMelhoria() {
    if (!renderId || !melhoriaPrompt.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const { render_id } = await apiPost(`/api/arch/ai-render/${renderId}/adjust`, {
        ajuste_prompt: [
          melhoriaMode === "change-material" ? "Alteração de material solicitada." : null,
          melhoriaMode === "change-lighting" ? "Ajuste de iluminação solicitado." : null,
          melhoriaPrompt.trim(),
          "Preservar absolutamente medidas, câmera, perspectiva, layout, marcenaria, circulação e proporções. Criar nova versão sem substituir a original.",
        ].filter(Boolean).join(" "),
        mask_zones: melhoriaMode === "change-material" ? ["material"] : [],
        createNewVersion: true,
        preserveGeometry: true,
        preserveCamera: true,
      });

      const data = await waitForRenderCompletion(render_id);

      setRenderUrl(data.result_image_url);
      setRenderId(render_id);
      setVersions((v) => [
        {
          id: render_id,
          url: data.result_image_url,
          label: `Versão ${v.length + 1} · ${
            melhoriaMode === "change-material" ? "Material" :
            melhoriaMode === "change-lighting" ? "Iluminação" :
            "Melhoria"
          }`,
        },
        ...v,
      ]);
      go("versao");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao aplicar melhoria.");
    } finally {
      setLoading(false);
    }
  }

  function renderMelhoria() {
    const modes: { id: typeof melhoriaMode; label: string; icon: string }[] = [
      { id: "improve",         label: "Melhorar qualidade",  icon: "✨" },
      { id: "change-material", label: "Trocar material",     icon: "🎨" },
      { id: "change-lighting", label: "Ajustar iluminação",  icon: "💡" },
    ];
    return (
      <StepCard title="Melhoria / Material" subtitle="Ajuste o render atual ou troque materiais.">
        {renderUrl && (
          <img src={renderUrl} alt="render" style={{
            width: "100%", borderRadius: 10, maxHeight: 200,
            objectFit: "cover", border: `1px solid ${T.border}`,
          }} />
        )}
        <div style={{ display: "flex", gap: 6 }}>
          {modes.map((m) => (
            <button key={m.id} onClick={() => setMelhoriaMode(m.id)} style={{
              flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 11, fontWeight: 700,
              border: `2px solid ${melhoriaMode === m.id ? T.purple : T.border}`,
              background: melhoriaMode === m.id ? T.purpleLight : T.inputBg,
              color: melhoriaMode === m.id ? T.purpleText : T.sub,
              cursor: "pointer", textAlign: "center",
            }}>
              <div style={{ fontSize: 16, marginBottom: 2 }}>{m.icon}</div>
              {m.label}
            </button>
          ))}
        </div>
        <textarea
          value={melhoriaPrompt}
          onChange={(e) => setMelhoriaPrompt(e.target.value)}
          placeholder={
            melhoriaMode === "change-material"
              ? "Ex: trocar piso de madeira por mármore branco..."
              : melhoriaMode === "change-lighting"
              ? "Ex: iluminação natural, tarde, luz suave..."
              : "Ex: aumentar detalhe das texturas, melhorar sombras..."
          }
          rows={3}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 9, fontSize: 13,
            border: `1px solid ${T.border}`, background: T.inputBg, color: T.text,
            outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
        {err && <ErrBox msg={err} />}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <Btn variant="secondary" onClick={() => go("render")}>← Voltar</Btn>
          <Btn
            disabled={!melhoriaPrompt.trim() || loading}
            onClick={applyMelhoria}
          >
            {loading ? "Aplicando..." : "✦ Aplicar melhoria"}
          </Btn>
        </div>
      </StepCard>
    );
  }

  // ── Step: Nova versão ─────────────────────────────────────────────────────
  function renderVersao() {
    return (
      <StepCard title="Versões do render" subtitle="Histórico de versões geradas nesta sessão.">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {versions.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: T.sub, textAlign: "center", padding: 16 }}>
              Nenhuma versão gerada ainda.
            </p>
          ) : (
            versions.map((v, i) => (
              <div key={v.id} style={{
                display: "flex", gap: 12, alignItems: "center",
                padding: "10px 12px", borderRadius: 10,
                border: `1px solid ${i === 0 ? T.purple : T.border}`,
                background: i === 0 ? T.purpleLight : T.inputBg,
              }}>
                <img src={v.url} alt={v.label} style={{
                  width: 64, height: 48, objectFit: "cover", borderRadius: 6,
                  border: `1px solid ${T.border}`,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? T.purpleText : T.text }}>
                    {v.label} {i === 0 ? "· Atual" : ""}
                  </div>
                </div>
                {i > 0 && (
                  <button
                    onClick={() => { setRenderUrl(v.url); setRenderId(v.id); }}
                    style={{ fontSize: 11, color: T.purple, background: "none",
                      border: "none", cursor: "pointer", fontWeight: 600 }}>
                    Usar esta
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <Btn variant="secondary" onClick={() => go("melhoria")}>← Nova melhoria</Btn>
          <Btn onClick={() => go("aprovar")}>Aprovar render →</Btn>
        </div>
      </StepCard>
    );
  }

  // ── Step: Aprovar ─────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!renderId || !arq.projectId) return;
    setLoading(true);
    setErr(null);
    try {
      await apiPost(`/api/arch/ai-render/${renderId}/approve`, {
        renderId,
        projectId: arq.projectId,
        notes: `Aprovado via ARQDOR — ${ambiente}`,
      });
      setApproved(true);
      go("especificacao");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao aprovar.");
    } finally {
      setLoading(false);
    }
  }

  function renderAprovar() {
    return (
      <StepCard title="Aprovar render" subtitle="Confirme o render final antes de gerar a especificação.">
        {renderUrl && (
          <img src={renderUrl} alt="render final" style={{
            width: "100%", borderRadius: 12, objectFit: "cover",
            maxHeight: 300, boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
          }} />
        )}
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#F0FDF4",
          border: "1px solid #BBF7D0", color: "#166534", fontSize: 13 }}>
          ✓ Este render representa o resultado final aprovado para o ambiente <strong>{ambiente}</strong>.
          A aprovação liberará a geração da especificação técnica.
        </div>
        {err && <ErrBox msg={err} />}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <Btn variant="secondary" onClick={() => go("versao")}>← Voltar</Btn>
          <Btn disabled={loading} onClick={handleApprove}>
            {loading ? "Aprovando..." : "✓ Aprovar este render"}
          </Btn>
        </div>
      </StepCard>
    );
  }

  // ── Step: Especificação ───────────────────────────────────────────────────
  async function handleSendToSpec() {
    if (!renderId || !arq.projectId || !renderUrl) return;
    setLoading(true);
    setErr(null);
    try {
      await apiPost(`/api/arch/specification/analyze`, {
        renderId,
        projetoId: arq.projectId,
        imageUrl: renderUrl,
      });
      setSpecDone(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao enviar para especificação.");
    } finally {
      setLoading(false);
    }
  }

  function renderEspecificacao() {
    return (
      <StepCard
        title="Especificação técnica"
        subtitle="Extraia a especificação de materiais e objetos do render aprovado."
      >
        {renderUrl && (
          <img src={renderUrl} alt="render aprovado" style={{
            width: "100%", borderRadius: 12, objectFit: "cover",
            maxHeight: 220, border: `2px solid ${T.green}`,
            boxShadow: "0 2px 16px rgba(16,185,129,0.15)",
          }} />
        )}

        {specDone ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
            padding: "16px 0", textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: T.text }}>
              Especificação gerada com sucesso!
            </p>
            <p style={{ margin: 0, fontSize: 13, color: T.sub }}>
              Os materiais e objetos do render foram extraídos e adicionados à especificação do projeto.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <Btn variant="secondary" onClick={() => {
                setStep("projeto");
                setRenderUrl(null); setRenderId(null);
                setVersions([]); setApproved(false); setSpecDone(false);
                setImageDataUrl(null); setImageFile(null);
                setAmbiente("");
              }}>
                Novo render
              </Btn>
              <Btn onClick={() => setLocation(`/arch/projetos/${arq.projectId}`)}>
                Ver projeto →
              </Btn>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 16px", borderRadius: 10, background: T.purpleLight,
              border: `1px solid ${T.border}`, fontSize: 13, color: T.purpleText }}>
              ✦ O ARQDOR vai extrair automaticamente os materiais, acabamentos e objetos
              do render para gerar a especificação técnica do ambiente.
            </div>
            {err && <ErrBox msg={err} />}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <Btn variant="secondary" onClick={() => go("aprovar")}>← Voltar</Btn>
              <Btn disabled={loading} onClick={handleSendToSpec}>
                {loading ? "Gerando..." : "✦ Gerar especificação"}
              </Btn>
            </div>
          </>
        )}
      </StepCard>
    );
  }

  // ── Render map ────────────────────────────────────────────────────────────
  const stepContent: Record<Step, () => React.ReactNode> = {
    projeto:       renderProjeto,
    ambiente:      renderAmbiente,
    imagem:        renderImagem,
    render:        renderRender,
    melhoria:      renderMelhoria,
    versao:        renderVersao,
    aprovar:       renderAprovar,
    especificacao: renderEspecificacao,
  };

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: T.bg, fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      boxSizing: "border-box", overflow: "hidden",
    }}>
      {/* Top bar */}
      <div style={{
        height: 52, display: "flex", alignItems: "center", padding: "0 20px",
        background: "#0A0C10", borderBottom: "1px solid #1E2330", flexShrink: 0,
        gap: 16,
      }}>
        <button
          onClick={() => setLocation("/arch/projetos")}
          style={{ background: "none", border: "none", cursor: "pointer",
            fontSize: 12, color: "#64748B", fontWeight: 600, padding: "4px 8px",
            borderRadius: 6, display: "flex", alignItems: "center", gap: 4 }}
        >
          ← ARQDOR
        </button>
        <div style={{ width: 1, height: 18, background: "#1E2330" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#EDE9FE", letterSpacing: "0.05em" }}>
          RENDER STUDIO
        </span>
        {arq.projectMeta && (
          <>
            <div style={{ width: 1, height: 18, background: "#1E2330" }} />
            <span style={{ fontSize: 11, color: "#64748B" }}>{arq.projectMeta.titulo}</span>
          </>
        )}
      </div>

      {/* Stepper */}
      <div style={{
        padding: "14px 24px", background: T.surface,
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <Stepper current={step} />
      </div>

      {/* Main content */}
      <div style={{
        flex: 1, overflowY: "auto", display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        padding: "32px 20px",
      }}>
        {stepContent[step]()}
      </div>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function RenderStudioPage() {
  return (
    <ArqdorThemeProvider>
      <WorkspaceProvider>
        <OriginalRenderWorkspaceInner />
      </WorkspaceProvider>
    </ArqdorThemeProvider>
  );
}
