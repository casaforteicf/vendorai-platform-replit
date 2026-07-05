// ─── InstantRenderZone — "Resultado Primeiro" UX Revolution ──────────────────
// Filosofia: RESULTADO ANTES DE CONFIGURAÇÃO.
// Fluxo: Soltar imagem → render automático → resultado → opções de melhoria.
// Critério: primeiro render em < 60 segundos sem treinamento.

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ArqProjectState } from '../../hooks/useArqProject'
import { PHX } from '../../shared/arqdor-theme'

// ─── Constants ──────────────────────────────────────────────────────────────
const BASE = '/api'

function getToken() { return localStorage.getItem('vendorai_token') ?? '' }
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  }
}

type Phase = 'idle' | 'step1' | 'step2' | 'step3' | 'step4' | 'done' | 'error'

interface AnalysisStep { label: string; icon: string; doneLabel: string }

const ANALYSIS_STEPS: AnalysisStep[] = [
  { icon: '🔍', label: 'Analisando imagem...',       doneLabel: 'Imagem analisada'       },
  { icon: '🏠', label: 'Detectando ambiente...',     doneLabel: 'Ambiente detectado'     },
  { icon: '🧱', label: 'Identificando materiais...', doneLabel: 'Materiais identificados' },
  { icon: '✨', label: 'Preparando render...',       doneLabel: 'Render em progresso'    },
]

const PHASE_STEP_INDEX: Record<Phase, number> = {
  idle: -1, step1: 0, step2: 1, step3: 2, step4: 3, done: 4, error: -1,
}

interface ActionChip { icon: string; label: string; module: string }

const ACTION_CHIPS: ActionChip[] = [
  { icon: '✏️',  label: 'Trocar materiais',   module: 'correcoes'    },
  { icon: '💡',  label: 'Melhorar iluminação', module: 'correcoes'    },
  { icon: '🎨',  label: 'Mudar estilo',        module: 'correcoes'    },
  { icon: '🪑',  label: 'Adicionar decoração', module: 'correcoes'    },
  { icon: '⭐',  label: 'Versão premium',      module: 'correcoes'    },
  { icon: '💰',  label: 'Versão econômica',    module: 'correcoes'    },
  { icon: '📋',  label: 'Gerar memorial',      module: 'especificacao' },
  { icon: '💾',  label: 'Ver projeto',         module: 'projeto'      },
]

// Tenta detectar o tipo de ambiente pelo nome do arquivo
function detectAmbiente(filename: string): string {
  const f = filename.toLowerCase()
  if (/\b(sala|living|lounge|estar)\b/.test(f)) return 'sala de estar'
  if (/\b(cozinha|kitchen)\b/.test(f)) return 'cozinha'
  if (/\b(quarto|bedroom|dormit)\b/.test(f)) return 'quarto'
  if (/\b(banheiro|bath)\b/.test(f)) return 'banheiro'
  if (/\b(escritorio|office)\b/.test(f)) return 'escritorio'
  if (/\b(varanda|balcon)\b/.test(f)) return 'varanda'
  if (/\b(fachada|facade|exterior)\b/.test(f)) return 'fachada'
  return 'sala de estar'
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes irz-in   { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
  @keyframes irz-fade { from{opacity:0}to{opacity:1} }
  @keyframes irz-spin { to{transform:rotate(360deg)} }
  @keyframes irz-glow { 0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0)}50%{box-shadow:0 0 0 8px rgba(124,58,237,0.15)} }
  @keyframes irz-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
  @keyframes irz-step { from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)} }
  @keyframes irz-result-in { from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)} }
  @keyframes irz-chip { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
  @keyframes irz-pulse { 0%,100%{opacity:1}50%{opacity:0.5} }
  @keyframes irz-shimmer {
    0%{background-position:200% 0}
    100%{background-position:-200% 0}
  }

  .irz-drop-zone {
    transition: border-color 0.2s, background 0.2s, transform 0.15s !important;
  }
  .irz-drop-zone.dragging {
    border-color: ${PHX.purple} !important;
    background: rgba(124,58,237,0.04) !important;
    transform: scale(1.005) !important;
  }
  .irz-upload-btn {
    transition: all 0.15s ease !important;
    cursor: pointer;
  }
  .irz-upload-btn:hover {
    background: rgba(124,58,237,0.08) !important;
    border-color: rgba(124,58,237,0.3) !important;
    color: ${PHX.purple} !important;
    transform: translateY(-1px) !important;
  }
  .irz-chip {
    transition: all 0.15s ease !important;
    cursor: pointer;
  }
  .irz-chip:hover {
    background: rgba(124,58,237,0.1) !important;
    border-color: ${PHX.purple} !important;
    color: ${PHX.purple} !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 4px 12px rgba(124,58,237,0.15) !important;
  }
  .irz-retry-btn {
    transition: all 0.15s ease !important;
    cursor: pointer;
  }
  .irz-retry-btn:hover {
    background: ${PHX.purple} !important;
    color: #fff !important;
    transform: translateY(-1px) !important;
  }
  .irz-new-btn {
    transition: all 0.15s ease !important;
    cursor: pointer;
  }
  .irz-new-btn:hover {
    background: rgba(124,58,237,0.1) !important;
    border-color: ${PHX.purple} !important;
    color: ${PHX.purple} !important;
  }
`

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  arqState: ArqProjectState
  onNavigate: (module: string) => void
}

// ─── Main component ──────────────────────────────────────────────────────────
export function InstantRenderZone({ arqState, onNavigate }: Props) {
  const [phase,       setPhase]      = useState<Phase>('idle')
  const [dragging,    setDragging]   = useState(false)
  const [resultUrl,   setResultUrl]  = useState<string | null>(null)
  const [previewUrl,  setPreviewUrl] = useState<string | null>(null)
  const [errorMsg,    setErrorMsg]   = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)

  const fileRef  = useRef<HTMLInputElement>(null)
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Listen for "open upload" event from top bar CTA
  useEffect(() => {
    const handler = () => {
      if (phase === 'idle') fileRef.current?.click()
    }
    window.addEventListener('arqdor:open-upload', handler)
    return () => window.removeEventListener('arqdor:open-upload', handler)
  }, [phase])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      abortRef.current?.abort()
    }
  }, [])

  // ── File handling ──────────────────────────────────────────────────────────
  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Envie uma imagem: JPG, PNG, WEBP ou similar.')
      setPhase('error')
      return
    }

    const dataUrl  = await fileToDataUrl(file)
    const ambiente = detectAmbiente(file.name)
    setPreviewUrl(dataUrl)
    setPhase('step1')

    // Auto-criar projeto em background (sem bloquear UX)
    const today   = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    const projTitle = `Render Rápido — ${today}`
    setProjectName(projTitle)
    arqState.createProject(projTitle, 'interiores').catch(() => {/* silent */})

    // Avança etapas cosméticas a cada ~1.4s, na 4ª chama a API
    const advance = [
      () => setPhase('step2'),
      () => setPhase('step3'),
      () => { setPhase('step4'); startRender(dataUrl, ambiente) },
    ]
    advance.forEach((fn, i) => setTimeout(fn, (i + 1) * 1400))
  }

  // ── Render API ─────────────────────────────────────────────────────────────
  async function startRender(dataUrl: string, ambiente: string) {
    try {
      abortRef.current = new AbortController()
      const res = await fetch(`${BASE}/arch/ai-render`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          original_image_url: dataUrl,
          mode:               'preservar',
          ambiente,
        }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any
        throw new Error(err?.details ?? err?.error ?? `HTTP ${res.status}`)
      }
      const body = await res.json()
      startPolling(body.render_id as string)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setErrorMsg(err?.message ?? 'Não foi possível iniciar o render. Tente novamente.')
      setPhase('error')
    }
  }

  function startPolling(renderId: string) {
    const MAX_POLLS = 90  // 4.5 min máximo
    let polls = 0

    pollRef.current = setInterval(async () => {
      polls++
      if (polls > MAX_POLLS) {
        clearInterval(pollRef.current!)
        setErrorMsg('O render demorou mais que o esperado. Tente novamente.')
        setPhase('error')
        return
      }
      try {
        const res = await fetch(`${BASE}/arch/ai-render/${renderId}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        if (!res.ok) return
        const data = await res.json() as {
          status: string
          result_image_url?: string
          erro_msg?: string
        }
        if (data.status === 'concluido' && data.result_image_url) {
          clearInterval(pollRef.current!)
          setResultUrl(data.result_image_url)
          setPhase('done')
        } else if (data.status === 'erro') {
          clearInterval(pollRef.current!)
          setErrorMsg(data.erro_msg ?? 'O render falhou. Tente novamente.')
          setPhase('error')
        }
      } catch { /* ignore network errors, retry next tick */ }
    }, 3000)
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true)  }, [])
  const handleDragLeave = useCallback(()                    => { setDragging(false) }, [])
  const handleDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [phase])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current)
    abortRef.current?.abort()
    setPhase('idle')
    setResultUrl(null)
    setPreviewUrl(null)
    setErrorMsg(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const stepIndex = PHASE_STEP_INDEX[phase]

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      background: PHX.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: phase === 'idle' ? 'center' : 'flex-start',
      padding: '24px 24px 40px',
    }}>
      <style>{CSS}</style>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── IDLE: Drop zone ── */}
      {phase === 'idle' && (
        <div
          className={`irz-drop-zone${dragging ? ' dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            width: '100%',
            maxWidth: 600,
            borderRadius: 24,
            border: `2px dashed ${PHX.border}`,
            background: PHX.surface,
            padding: '56px 40px',
            textAlign: 'center',
            animation: 'irz-in 0.4s ease',
            boxShadow: PHX.shadow,
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 16, animation: 'irz-float 3s ease infinite', display: 'inline-block' }}>
            📸
          </div>

          <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 900, color: PHX.text, letterSpacing: '-0.02em' }}>
            Arraste uma foto do ambiente
          </h1>
          <p style={{ margin: '0 0 32px', fontSize: 14, color: PHX.textSub, lineHeight: 1.5 }}>
            Sala, quarto, cozinha, banheiro, fachada — qualquer foto.<br />
            A IA vai gerar uma visualização profissional automaticamente.
          </p>

          <button
            className="irz-upload-btn"
            onClick={() => fileRef.current?.click()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 28px',
              borderRadius: 12,
              border: `1.5px solid ${PHX.border}`,
              background: PHX.surface,
              color: PHX.text,
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 24,
              boxShadow: PHX.shadowM,
            }}
          >
            <span style={{ fontSize: 16 }}>📁</span>
            Escolher arquivo
          </button>

          <p style={{ margin: 0, fontSize: 11, color: PHX.dim }}>
            JPG · PNG · WEBP · HEIC
          </p>
        </div>
      )}

      {/* ── LOADING: Animated analysis steps ── */}
      {phase !== 'idle' && phase !== 'done' && phase !== 'error' && (
        <div style={{
          width: '100%',
          maxWidth: 700,
          animation: 'irz-in 0.35s ease',
          paddingTop: 8,
        }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12, display: 'inline-block', animation: 'irz-spin 2s linear infinite' }}>
              ⚙️
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 900, color: PHX.text }}>
              Gerando seu render…
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: PHX.textSub }}>
              Processamento de IA em andamento — aguarde
            </p>
          </div>

          {/* 2-column: preview + steps */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

            {/* Preview thumbnail */}
            {previewUrl && (
              <div style={{
                flexShrink: 0,
                width: 180,
                borderRadius: 16,
                overflow: 'hidden',
                border: `1px solid ${PHX.border}`,
                boxShadow: PHX.shadowM,
                position: 'relative',
              }}>
                <img
                  src={previewUrl}
                  alt="Sua imagem"
                  style={{ width: '100%', display: 'block', objectFit: 'cover', aspectRatio: '4/3' }}
                />
                {/* Shimmer overlay while processing */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(105deg, transparent 40%, rgba(124,58,237,0.12) 50%, transparent 60%)',
                  backgroundSize: '200% 100%',
                  animation: 'irz-shimmer 2s linear infinite',
                }} />
              </div>
            )}

            {/* Analysis steps */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ANALYSIS_STEPS.map((step, i) => {
                const isDone    = stepIndex > i
                const isActive  = stepIndex === i
                const isPending = stepIndex < i

                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: `1px solid ${isActive ? `rgba(124,58,237,0.3)` : isDone ? `rgba(22,163,74,0.2)` : PHX.border}`,
                      background: isActive
                        ? 'rgba(124,58,237,0.05)'
                        : isDone
                          ? 'rgba(22,163,74,0.04)'
                          : PHX.muted,
                      opacity: isPending ? 0.45 : 1,
                      transition: 'all 0.4s ease',
                      animation: isActive ? 'irz-step 0.3s ease' : 'none',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone
                        ? 'rgba(22,163,74,0.12)'
                        : isActive
                          ? 'rgba(124,58,237,0.12)'
                          : PHX.muted,
                      fontSize: 15,
                      flexShrink: 0,
                    }}>
                      {isDone ? '✓' : isActive ? (
                        <div style={{ width: 16, height: 16, border: `2px solid ${PHX.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'irz-spin 0.8s linear infinite' }} />
                      ) : step.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: isActive ? 700 : 600,
                        color: isDone ? PHX.green : isActive ? PHX.purple : PHX.dim,
                        animation: isActive ? 'irz-pulse 1.5s ease infinite' : 'none',
                      }}>
                        {isDone ? step.doneLabel : step.label}
                      </p>
                    </div>
                    {isDone && (
                      <span style={{ fontSize: 16, color: PHX.green }}>✓</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 28, height: 4, borderRadius: 2, background: PHX.muted, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: 2,
              background: `linear-gradient(90deg, ${PHX.purple}, ${PHX.purpleL})`,
              width: `${Math.min(((stepIndex + 1) / ANALYSIS_STEPS.length) * 100, 95)}%`,
              transition: 'width 1.4s ease',
            }} />
          </div>
          <p style={{ margin: '6px 0 0', textAlign: 'center', fontSize: 10, color: PHX.dim }}>
            {ANALYSIS_STEPS[Math.min(stepIndex, 3)]?.label}
          </p>
        </div>
      )}

      {/* ── DONE: Result + action chips ── */}
      {phase === 'done' && resultUrl && (
        <div style={{
          width: '100%',
          maxWidth: 860,
          animation: 'irz-result-in 0.5s ease',
        }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✨</div>
            <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 900, color: PHX.text }}>
              Render concluído!
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: PHX.textSub }}>
              {projectName ? `Projeto salvo como "${projectName}"` : 'Projeto salvo automaticamente'}
            </p>
          </div>

          {/* Before / After */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
            {previewUrl && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: PHX.dim, letterSpacing: '.06em' }}>ANTES</p>
                <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${PHX.border}`, boxShadow: PHX.shadowM }}>
                  <img src={previewUrl} alt="Original" style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 380 }} />
                </div>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: PHX.purple, letterSpacing: '.06em' }}>DEPOIS — IA ✨</p>
              <div style={{ borderRadius: 16, overflow: 'hidden', border: `1.5px solid rgba(124,58,237,0.3)`, boxShadow: `0 8px 32px rgba(124,58,237,0.15)` }}>
                <img src={resultUrl} alt="Render IA" style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 380 }} />
              </div>
            </div>
          </div>

          {/* Section label */}
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: PHX.dim, letterSpacing: '.08em' }}>
            O QUE FAZER AGORA?
          </p>

          {/* Action chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
            {ACTION_CHIPS.map((chip, i) => (
              <button
                key={chip.label}
                className="irz-chip"
                onClick={() => onNavigate(chip.module)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: `1.5px solid ${PHX.border}`,
                  background: PHX.surface,
                  color: PHX.text,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: PHX.shadow,
                  animation: `irz-chip 0.4s ease ${i * 0.06}s both`,
                }}
              >
                <span style={{ fontSize: 16 }}>{chip.icon}</span>
                {chip.label}
              </button>
            ))}
          </div>

          {/* New render + download row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="irz-new-btn"
              onClick={reset}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', borderRadius: 10,
                border: `1.5px solid ${PHX.border}`, background: PHX.surface,
                color: PHX.textSub, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14 }}>🔄</span>
              Novo render
            </button>
            <a
              href={resultUrl}
              download="render-arqdor.png"
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', borderRadius: 10,
                border: `1.5px solid rgba(124,58,237,0.3)`,
                background: 'rgba(124,58,237,0.06)',
                color: PHX.purple, fontSize: 13, fontWeight: 600,
                textDecoration: 'none', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: 14 }}>⬇️</span>
              Baixar imagem
            </a>
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {phase === 'error' && (
        <div style={{
          width: '100%',
          maxWidth: 480,
          textAlign: 'center',
          animation: 'irz-in 0.35s ease',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: PHX.text }}>
            Algo deu errado
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: PHX.textSub, lineHeight: 1.5 }}>
            {errorMsg}
          </p>
          <button
            className="irz-retry-btn"
            onClick={reset}
            style={{
              padding: '12px 28px',
              borderRadius: 10,
              border: `1.5px solid ${PHX.purple}`,
              background: 'transparent',
              color: PHX.purple,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  )
}
