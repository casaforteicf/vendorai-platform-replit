import { validateRenderImage } from "../../shared/import-guard"
// ─── ARQDOR Studio — Experiência unificada de render ─────────────────────────
// Fluxo: Upload + Configurar → Gerar Render → Resultado + Painel de ajustes
//        → Aplicar → Novo Render → Comparar → Baixar
// NUNCA expõe prompts ao usuário.

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ArqProjectState } from '../../hooks/useArqProject'
import { PHX } from '../../shared/arqdor-theme'

// ─── Constantes ──────────────────────────────────────────────────────────────
const BASE = '/api'
const getToken   = () => localStorage.getItem('vendorai_token') ?? ''
const authHeader = () => ({ Authorization: `Bearer ${getToken()}` })
const jsonHeader = () => ({ ...authHeader(), 'Content-Type': 'application/json' })

// Ambientes disponíveis
const AMBIENTES = [
  { id: 'sala de estar', label: 'Sala',      icon: '🛋️' },
  { id: 'cozinha',       label: 'Cozinha',   icon: '🍳' },
  { id: 'quarto',        label: 'Quarto',    icon: '🛏️' },
  { id: 'banheiro',      label: 'Banheiro',  icon: '🚿' },
  { id: 'escritorio',    label: 'Escritório', icon: '💼' },
  { id: 'varanda',       label: 'Varanda',   icon: '🌿' },
  { id: 'fachada',       label: 'Fachada',   icon: '🏠' },
]

// Estilos visuais
const ESTILOS = [
  { id: 'moderno',        label: 'Moderno'      },
  { id: 'minimalista',    label: 'Minimalista'  },
  { id: 'escandinavo',    label: 'Escandinavo'  },
  { id: 'classico',       label: 'Clássico'     },
  { id: 'industrial',     label: 'Industrial'   },
  { id: 'tropical',       label: 'Tropical'     },
]

// Catálogo de materiais — _prompt NUNCA exibido
interface MatItem { id: string; label: string; bg: string; _prompt: string }
const MATERIALS: Record<string, MatItem[]> = {
  armarios: [
    { id: 'mdf-branco',   label: 'MDF Branco',    bg: '#f5f5f0', _prompt: 'cabinetry white MDF smooth satin finish' },
    { id: 'cinza',        label: 'Cinza Cimento',  bg: '#9ca3af', _prompt: 'cabinetry cement grey MDF matte' },
    { id: 'freijo',       label: 'Freijó',         bg: 'linear-gradient(135deg,#8B6914,#A0783A)', _prompt: 'cabinetry Freijo wood-grain MDF warm brown vertical grain satin' },
    { id: 'carvalho',     label: 'Carvalho',       bg: 'linear-gradient(135deg,#C8A96E,#B8914A)', _prompt: 'cabinetry European oak veneer light warm wood fine grain' },
    { id: 'nogueira',     label: 'Nogueira',       bg: 'linear-gradient(135deg,#4A2C0A,#6B3D12)', _prompt: 'cabinetry dark walnut wood veneer rich brown premium' },
    { id: 'preto-fosco',  label: 'Preto Fosco',    bg: '#1f2937', _prompt: 'cabinetry matte black lacquer premium finish' },
  ],
  bancadas: [
    { id: 'granito-branco', label: 'Granito Branco',   bg: '#f0ede8', _prompt: 'countertop white granite polished' },
    { id: 'granito-preto',  label: 'Granito Preto',    bg: '#1c1c1c', _prompt: 'countertop absolute black granite polished' },
    { id: 'quartzo',        label: 'Quartzo Branco',   bg: '#f8f8f8', _prompt: 'countertop engineered white quartz seamless polished' },
    { id: 'silestone',      label: 'Silestone Bege',   bg: '#d4b896', _prompt: 'countertop Silestone desert silver quartz beige tone' },
    { id: 'marmore',        label: 'Mármore Carrara',  bg: 'repeating-linear-gradient(25deg,#f0ece8 0,#f0ece8 8px,#d4cfc9 8px,#d4cfc9 9px)', _prompt: 'countertop Carrara white marble grey veining polished' },
    { id: 'calacatta',      label: 'Calacatta Gold',   bg: 'repeating-linear-gradient(15deg,#f5f0e8 0,#f5f0e8 12px,#c9a84c 12px,#c9a84c 13px)', _prompt: 'countertop Calacatta Gold marble white golden veining polished' },
  ],
  pisos: [
    { id: 'porc-cinza',   label: 'Porcelanato Cinza',    bg: '#6b7280', _prompt: 'floor large-format grey porcelain 120x60cm polished seamless' },
    { id: 'porc-branco',  label: 'Porcelanato Branco',   bg: '#f3f4f6', _prompt: 'floor white porcelain tile 120x60cm polished' },
    { id: 'cimento',      label: 'Cimento Queimado',     bg: '#78716c', _prompt: 'floor polished burnt cement microcement matte grey-brown' },
    { id: 'madeira-clara', label: 'Madeira Clara',       bg: 'repeating-linear-gradient(90deg,#c19a6b 0,#c19a6b 60px,#b08850 60px,#b08850 62px)', _prompt: 'floor light oak hardwood planks natural finish' },
    { id: 'madeira-esc',  label: 'Madeira Escura',       bg: 'repeating-linear-gradient(90deg,#5c3d1e 0,#5c3d1e 60px,#4a2e14 60px,#4a2e14 62px)', _prompt: 'floor dark walnut hardwood planks rich tone' },
    { id: 'vinilico',     label: 'Vinílico Amadeirado',  bg: '#a0784a', _prompt: 'floor vinyl plank flooring wood-look light brown' },
  ],
  paredes: [
    { id: 'branco',      label: 'Branco Puro',      bg: '#ffffff', _prompt: 'walls painted white smooth finish' },
    { id: 'cinza-claro', label: 'Cinza Claro',      bg: '#e5e7eb', _prompt: 'walls light grey paint matte' },
    { id: 'microcimento', label: 'Microcimento',    bg: '#9ca3af', _prompt: 'walls microcement plaster light grey artisanal texture seamless' },
    { id: 'ripado',      label: 'Painel Ripado',    bg: 'repeating-linear-gradient(90deg,#8B6914 0,#8B6914 18px,#9a7820 18px,#9a7820 21px)', _prompt: 'walls vertical Freijo wood slat panel ripado 3cm spacing warm tone' },
    { id: 'grafiato',    label: 'Grafiato',         bg: '#d1cfc9', _prompt: 'walls grafiato textured plaster decorative finish beige' },
    { id: 'pedra',       label: 'Pedra Natural',    bg: '#a0948a', _prompt: 'walls natural stone veneer rustic texture accent wall' },
  ],
  metais: [
    { id: 'preto-fosco', label: 'Preto Fosco',     bg: '#111827', _prompt: 'metal fixtures and faucets matte black finish all hardware' },
    { id: 'inox',        label: 'Inox Escovado',   bg: 'linear-gradient(90deg,#9ca3af,#cbd5e1,#9ca3af)', _prompt: 'metal fixtures brushed stainless steel inox escovado minimalist' },
    { id: 'dourado',     label: 'Dourado',         bg: 'linear-gradient(90deg,#d97706,#f59e0b,#d97706)', _prompt: 'metal fixtures champagne gold brushed brass warm luxury' },
    { id: 'cromado',     label: 'Cromado',         bg: 'linear-gradient(90deg,#94a3b8,#f8fafc,#94a3b8)', _prompt: 'metal fixtures polished chrome high shine traditional' },
  ],
}

// Opções de iluminação
const ILUMINACAO_OPTS = [
  { id: 'natural',     label: 'Luz Natural',    icon: '☀️', _prompt: 'abundant natural daylight through windows, bright airy atmosphere' },
  { id: 'artificial',  label: 'Artificial',     icon: '💡', _prompt: 'warm artificial lighting, ceiling fixtures and lamps, evening ambiance' },
  { id: 'penumbra',    label: 'Penumbra',       icon: '🌆', _prompt: 'dramatic low-light atmosphere, selective spotlighting, moody shadows' },
  { id: 'ampla',       label: 'Ampla Geral',    icon: '🔆', _prompt: 'bright even general lighting, no shadows, clean bright environment' },
  { id: 'acolhedora',  label: 'Acolhedora',     icon: '🕯️', _prompt: 'warm cozy intimate lighting, soft glow, hygge atmosphere' },
  { id: 'dramática',   label: 'Dramática',      icon: '🎭', _prompt: 'high-contrast dramatic lighting, architectural accent lights, bold shadows' },
]

// Paletas de cores
const CORES_OPTS = [
  { id: 'neutros',       label: 'Neutros',       bg: 'linear-gradient(90deg,#f5f5f0,#e5e5e0,#d4d4c8)', _prompt: 'neutral color palette, whites, beiges, light greys, warm naturals' },
  { id: 'frios',         label: 'Frios',         bg: 'linear-gradient(90deg,#bfdbfe,#93c5fd,#60a5fa)', _prompt: 'cool color palette, blues, grey-blues, cool whites, slate tones' },
  { id: 'quentes',       label: 'Quentes',       bg: 'linear-gradient(90deg,#fde68a,#fbbf24,#f59e0b)', _prompt: 'warm color palette, amber, terracotta, warm whites, honey tones' },
  { id: 'terrosos',      label: 'Terrosos',      bg: 'linear-gradient(90deg,#d6b99a,#c19a6b,#8B6914)', _prompt: 'earthy color palette, terracotta, sienna, ochre, natural earth tones' },
  { id: 'monocromatico', label: 'Monocromático', bg: 'linear-gradient(90deg,#1f2937,#6b7280,#f3f4f6)', _prompt: 'monochromatic palette, shades of same color family, elegant tonal variation' },
  { id: 'colorido',      label: 'Colorido',      bg: 'linear-gradient(90deg,#f87171,#4ade80,#60a5fa)', _prompt: 'bold vibrant color palette, accent colors, design statement pieces' },
]

// Estilos de móveis
const MOVEIS_OPTS = [
  { id: 'contemporaneo', label: 'Contemporâneo',   _prompt: 'contemporary minimalist furniture, clean lines, linen upholstery, metal legs' },
  { id: 'escandinavo',   label: 'Escandinavo',     _prompt: 'Scandinavian furniture, light wood, organic forms, neutral palette, hygge' },
  { id: 'industrial',    label: 'Industrial',      _prompt: 'industrial chic furniture, leather, exposed metal, reclaimed wood, urban loft' },
  { id: 'classico',      label: 'Clássico',        _prompt: 'classic traditional furniture, carved wood details, rich fabrics, timeless elegance' },
  { id: 'rustico',       label: 'Rústico',         _prompt: 'rustic furniture, natural wood, handcrafted, warm textures, farmhouse style' },
  { id: 'luxo',          label: 'Luxo',            _prompt: 'luxury high-end furniture, premium materials, velvet, marble accents, designer pieces' },
]

// ─── Tipos ───────────────────────────────────────────────────────────────────
type MainPhase   = 'upload' | 'rendering' | 'result'
type AdjustType  = 'materiais' | 'cores' | 'iluminacao' | 'moveis' | 'itens' | 'melhorar' | 'variacao' | 'comparar'
type MatCategory = 'armarios' | 'bancadas' | 'pisos' | 'paredes' | 'metais'

interface Selections {
  materiais: Partial<Record<MatCategory, string>>
  cor:       string | null
  iluminacao: string | null
  movel:     string | null
  itens:     string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(f)
  })
}

function buildRenderBody(
  imageUrl:   string,
  ambiente:   string,
  estilo:     string,
  selections: Selections,
  adjustType: AdjustType | null,
  projectId?: string | null,
) {
  const materials: { zone: string; promptFragment: string }[] = []
  const notes: string[] = []

  // Materiais selecionados
  for (const [cat, matId] of Object.entries(selections.materiais)) {
    if (!matId) continue
    const item = MATERIALS[cat]?.find(m => m.id === matId)
    if (item) materials.push({ zone: cat, promptFragment: item._prompt })
  }

  // Cor
  if (selections.cor) {
    const c = CORES_OPTS.find(o => o.id === selections.cor)
    if (c) notes.push(c._prompt)
  }

  // Iluminação
  if (selections.iluminacao) {
    const il = ILUMINACAO_OPTS.find(o => o.id === selections.iluminacao)
    if (il) notes.push(il._prompt)
  }

  // Móveis
  if (selections.movel) {
    const mv = MOVEIS_OPTS.find(o => o.id === selections.movel)
    if (mv) notes.push(mv._prompt)
  }

  // Itens livres
  if (selections.itens.trim()) notes.push(selections.itens.trim())

  // Melhorar render
  if (adjustType === 'melhorar') {
    notes.push('enhance photorealism, improve lighting quality, sharper details, professional architectural photography')
  }

  return {
    project_id:         projectId || undefined,
    original_image_url: imageUrl,
    mode:               'preservar',
    ambiente,
    estilo:             estilo || undefined,
    user_notes:         notes.join('. ') || undefined,
    materials:          materials.length > 0 ? materials : undefined,
  }
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes s-in    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes s-fade  { from{opacity:0} to{opacity:1} }
  @keyframes s-spin  { to{transform:rotate(360deg)} }
  @keyframes s-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
  @keyframes s-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes s-shimmer {
    0%{background-position:200% 0} 100%{background-position:-200% 0}
  }

  .s-chip {
    transition: all 0.14s ease !important; cursor: pointer;
  }
  .s-chip:hover, .s-chip.active {
    background: rgba(124,58,237,0.1) !important;
    border-color: ${PHX.purple} !important;
    color: ${PHX.purple} !important;
  }
  .s-chip.active { font-weight: 800 !important; }

  .s-mat-swatch {
    transition: all 0.14s ease !important; cursor: pointer;
    position: relative;
  }
  .s-mat-swatch:hover { transform: scale(1.04) !important; }
  .s-mat-swatch.active {
    box-shadow: 0 0 0 3px ${PHX.purple} !important;
    transform: scale(1.04) !important;
  }

  .s-action-btn {
    transition: all 0.14s ease !important; cursor: pointer;
  }
  .s-action-btn:hover {
    background: rgba(124,58,237,0.08) !important;
    border-color: rgba(124,58,237,0.35) !important;
    color: ${PHX.purple} !important;
    transform: translateY(-1px) !important;
  }
  .s-action-btn.active {
    background: rgba(124,58,237,0.1) !important;
    border-color: ${PHX.purple} !important;
    color: ${PHX.purple} !important;
  }

  .s-render-btn {
    transition: all 0.14s ease !important; cursor: pointer;
  }
  .s-render-btn:hover:not(:disabled) {
    background: ${PHX.purpleD} !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 20px rgba(124,58,237,0.4) !important;
  }
  .s-render-btn:disabled { opacity: 0.55 !important; cursor: not-allowed !important; }

  .s-apply-btn {
    transition: all 0.14s ease !important; cursor: pointer;
  }
  .s-apply-btn:hover {
    background: ${PHX.purple} !important;
    color: #fff !important;
    transform: translateY(-1px) !important;
  }
`

const MAT_TABS: { id: MatCategory; label: string }[] = [
  { id: 'armarios', label: 'Armários'  },
  { id: 'bancadas', label: 'Bancadas'  },
  { id: 'pisos',    label: 'Pisos'     },
  { id: 'paredes',  label: 'Paredes'   },
  { id: 'metais',   label: 'Metais'    },
]

// ─── Main component ──────────────────────────────────────────────────────────
interface Props { arqState: ArqProjectState; onNavigate: (m: string) => void }

export function InstantRenderZone({ arqState }: Props) {
  // Main state
  const [phase,         setPhase]         = useState<MainPhase>('upload')
  const [dragging,      setDragging]      = useState(false)
  const [imageDataUrl,  setImageDataUrl]  = useState<string | null>(null)   // user's original
  const [currentRender, setCurrentRender] = useState<string | null>(null)   // latest render
  const [prevRender,    setPrevRender]    = useState<string | null>(null)   // for compare
  const [ambiente,      setAmbiente]      = useState('sala de estar')
  const [estilo,        setEstilo]        = useState('moderno')
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null)
  const [stepIdx,       setStepIdx]       = useState(0)
  const [reRendering,   setReRendering]   = useState(false)

  // Adjustment state
  const [activeAdj,    setActiveAdj]    = useState<AdjustType | null>(null)
  const [matTab,       setMatTab]       = useState<MatCategory>('armarios')
  const [selections,   setSelections]   = useState<Selections>({
    materiais: {}, cor: null, iluminacao: null, movel: null, itens: '',
  })
  const hasAdjustments = !!(
    Object.values(selections.materiais).some(Boolean) ||
    selections.cor || selections.iluminacao || selections.movel || selections.itens.trim()
  )

  const fileRef  = useRef<HTMLInputElement>(null)
  const matRef   = useRef<HTMLInputElement>(null)
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const h = () => { if (phase === 'upload') fileRef.current?.click() }
    window.addEventListener('arqdor:open-upload', h)
    return () => window.removeEventListener('arqdor:open-upload', h)
  }, [phase])

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    abortRef.current?.abort()
  }, [])

  // ── File handling ──────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    const validationError = validateRenderImage(file)
    if (validationError) {
      setErrorMsg(validationError)
      return
    }
    setErrorMsg(null)
    try {
      setImageDataUrl(await fileToDataUrl(file))
    } catch {
      setErrorMsg('Não foi possível abrir esta imagem. Tente outro arquivo.')
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [])

  // ── Start render ──────────────────────────────────────────────────────────
  async function startRender(body: Record<string, unknown>, isReRender = false) {
    if (!arqState.projectId) {
      setErrorMsg('Selecione ou crie um projeto com cliente antes de gerar o render.')
      window.location.assign('/arch/projetos/novo')
      return
    }

    if (isReRender) setReRendering(true)
    else { setPhase('rendering'); setStepIdx(0) }

    // Cosmetic steps (only for first render)
    if (!isReRender) {
      const steps = [1, 2, 3]
      steps.forEach((_, i) => setTimeout(() => setStepIdx(i + 1), (i + 1) * 1400))
    }

    try {
      abortRef.current = new AbortController()
      const res = await fetch(`${BASE}/arch/ai-render`, {
        method: 'POST', headers: jsonHeader(),
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})  ) as any)?.details ?? `HTTP ${res.status}`)
      const { render_id } = await res.json() as { render_id: string }
      poll(render_id, isReRender)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setErrorMsg(e?.message ?? 'Erro ao iniciar render')
      setPhase('result'); setReRendering(false)
    }
  }

  function poll(renderId: string, isReRender: boolean) {
    let n = 0
    pollRef.current = setInterval(async () => {
      if (++n > 100) {
        clearInterval(pollRef.current!)
        setErrorMsg('O render demorou demais. Tente novamente.')
        setPhase('result'); setReRendering(false); return
      }
      try {
        const r = await fetch(`${BASE}/arch/ai-render/${renderId}`, { headers: authHeader() })
        if (!r.ok) return
        const d = await r.json() as { status: string; result_image_url?: string; erro_msg?: string }
        if (d.status === 'concluido' && d.result_image_url) {
          clearInterval(pollRef.current!)
          if (isReRender) {
            setPrevRender(currentRender)
            setCurrentRender(d.result_image_url)
            setReRendering(false)
            setActiveAdj('comparar')
          } else {
            setCurrentRender(d.result_image_url)
            setPhase('result')
          }
          // Reset selections after applying
          setSelections({ materiais: {}, cor: null, iluminacao: null, movel: null, itens: '' })
        } else if (d.status === 'erro') {
          clearInterval(pollRef.current!)
          setErrorMsg(d.erro_msg ?? 'Render falhou'); setPhase('result'); setReRendering(false)
        }
      } catch {}
    }, 3000)
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function onGerar() {
    if (!imageDataUrl) return
    startRender(buildRenderBody(imageDataUrl, ambiente, estilo, { materiais:{}, cor:null, iluminacao:null, movel:null, itens:'' }, null, arqState.projectId))
  }

  function onAplicar(adj: AdjustType) {
    const src = adj === 'melhorar' ? (currentRender ?? imageDataUrl!) : imageDataUrl!
    startRender(buildRenderBody(src, ambiente, estilo, selections, adj, arqState.projectId), true)
    setActiveAdj(null)
  }

  function onNewRenderWithChanges() {
    startRender(buildRenderBody(imageDataUrl!, ambiente, estilo, selections, activeAdj), true)
    setActiveAdj(null)
  }

  function toggleAdj(a: AdjustType) {
    setActiveAdj(prev => prev === a ? null : a)
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current)
    abortRef.current?.abort()
    setPhase('upload'); setCurrentRender(null); setPrevRender(null)
    setImageDataUrl(null); setErrorMsg(null); setReRendering(false)
    setActiveAdj(null); setSelections({ materiais:{}, cor:null, iluminacao:null, movel:null, itens:'' })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  const STEPS = ['Analisando imagem...','Detectando ambiente...','Identificando materiais...','Preparando render...']

  return (
    <div style={{ height:'100%', overflowY:'auto', background:PHX.bg, display:'flex', flexDirection:'column', alignItems:'center', padding:'20px 16px 60px' }}>
      <style>{CSS}</style>

      {/* Hidden file inputs */}
      <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
        onChange={e => { const f=e.target.files?.[0]; if(f) handleFile(f); e.target.value='' }} />
      <input ref={matRef} type="file" accept="image/*" style={{display:'none'}}
        onChange={e => { /* upload de material — preview apenas, sem envio ainda */ e.target.value='' }} />

      {/* ─── UPLOAD phase ───────────────────────────────────────────────── */}
      {phase === 'upload' && (
        <div style={{ width:'100%', maxWidth:620, animation:'s-in 0.35s ease' }}>
          <h1 style={{ margin:'0 0 4px', fontSize:22, fontWeight:900, color:PHX.text, textAlign:'center' }}>
            ARQDOR Studio
          </h1>
          <p style={{ margin:'0 0 24px', fontSize:13, color:PHX.textSub, textAlign:'center' }}>
            Envie uma foto e gere uma visualização profissional
          </p>

          {/* Drop zone */}
          <div
            className={dragging ? 'dragging' : ''}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !imageDataUrl && fileRef.current?.click()}
            style={{
              borderRadius: 18, border: `2px dashed ${imageDataUrl ? PHX.purple : PHX.border}`,
              background: imageDataUrl ? 'rgba(124,58,237,0.03)' : PHX.surface,
              padding: imageDataUrl ? 0 : '40px 20px', textAlign:'center',
              cursor: imageDataUrl ? 'default' : 'pointer',
              overflow: 'hidden', marginBottom: 16,
              boxShadow: PHX.shadowM, transition: 'all 0.2s ease',
            }}
          >
            {imageDataUrl ? (
              <div style={{ position:'relative' }}>
                <img src={imageDataUrl} alt="Sua imagem" style={{ width:'100%', maxHeight:280, objectFit:'cover', display:'block' }} />
                <button
                  onClick={e => { e.stopPropagation(); setImageDataUrl(null) }}
                  style={{
                    position:'absolute', top:10, right:10,
                    width:30, height:30, borderRadius:'50%',
                    border:'none', background:'rgba(0,0,0,0.55)', color:'#fff',
                    cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center',
                  }}
                >✕</button>
                <div style={{ position:'absolute', bottom:10, left:10,
                  padding:'4px 10px', borderRadius:8,
                  background:'rgba(124,58,237,0.85)', color:'#fff', fontSize:11, fontWeight:700 }}>
                  ✓ Imagem carregada
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize:44, marginBottom:12, display:'inline-block', animation:'s-float 3s ease infinite' }}>📸</div>
                <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:800, color:PHX.text }}>Arraste ou clique para enviar</p>
                <p style={{ margin:0, fontSize:12, color:PHX.dim }}>JPG · PNG · WEBP</p>
              </>
            )}
          </div>

          {/* Ambiente */}
          <div style={{ marginBottom:14 }}>
            <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, color:PHX.dim, letterSpacing:'.06em' }}>TIPO DE AMBIENTE</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {AMBIENTES.map(a => (
                <button key={a.id} className={`s-chip${ambiente===a.id?' active':''}`} onClick={() => setAmbiente(a.id)}
                  style={{ padding:'7px 13px', borderRadius:9, border:`1.5px solid ${ambiente===a.id?PHX.purple:PHX.border}`,
                    background:ambiente===a.id?'rgba(124,58,237,0.08)':PHX.surface, color:ambiente===a.id?PHX.purple:PHX.text,
                    fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                  <span>{a.icon}</span>{a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Estilo */}
          <div style={{ marginBottom:22 }}>
            <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, color:PHX.dim, letterSpacing:'.06em' }}>ESTILO</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {ESTILOS.map(e => (
                <button key={e.id} className={`s-chip${estilo===e.id?' active':''}`} onClick={() => setEstilo(e.id)}
                  style={{ padding:'7px 13px', borderRadius:9, border:`1.5px solid ${estilo===e.id?PHX.purple:PHX.border}`,
                    background:estilo===e.id?'rgba(124,58,237,0.08)':PHX.surface, color:estilo===e.id?PHX.purple:PHX.text,
                    fontSize:12, fontWeight:600 }}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {errorMsg && <p style={{ margin:'0 0 12px', fontSize:12, color:PHX.red, textAlign:'center' }}>⚠️ {errorMsg}</p>}

          <button className="s-render-btn" onClick={onGerar} disabled={!imageDataUrl}
            style={{ width:'100%', padding:'14px 0', borderRadius:13, border:'none',
              background:`linear-gradient(135deg,${PHX.purple},${PHX.purpleD})`,
              color:'#fff', fontSize:15, fontWeight:900, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:9,
              boxShadow:'0 4px 18px rgba(124,58,237,0.3)',
              opacity: imageDataUrl ? 1 : 0.5,
            }}>
            <span style={{ fontSize:18 }}>✨</span>
            Gerar Render
          </button>
        </div>
      )}

      {/* ─── RENDERING phase ─────────────────────────────────────────────── */}
      {phase === 'rendering' && (
        <div style={{ width:'100%', maxWidth:600, animation:'s-in 0.35s ease', paddingTop:8 }}>
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ fontSize:36, marginBottom:10, display:'inline-block', animation:'s-spin 2s linear infinite' }}>⚙️</div>
            <h2 style={{ margin:'0 0 4px', fontSize:20, fontWeight:900, color:PHX.text }}>Gerando render…</h2>
            <p style={{ margin:0, fontSize:13, color:PHX.textSub }}>Isso leva entre 30 a 90 segundos</p>
          </div>

          <div style={{ display:'flex', gap:18, alignItems:'flex-start' }}>
            {imageDataUrl && (
              <div style={{ flexShrink:0, width:160, borderRadius:12, overflow:'hidden', border:`1px solid ${PHX.border}`, boxShadow:PHX.shadowM, position:'relative' }}>
                <img src={imageDataUrl} alt="" style={{ width:'100%', display:'block', objectFit:'cover', aspectRatio:'4/3' }} />
                <div style={{ position:'absolute', inset:0,
                  background:'linear-gradient(105deg,transparent 40%,rgba(124,58,237,0.1) 50%,transparent 60%)',
                  backgroundSize:'200% 100%', animation:'s-shimmer 2s linear infinite' }} />
              </div>
            )}
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
              {STEPS.map((s, i) => {
                const done   = stepIdx > i
                const active = stepIdx === i
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10,
                    border:`1px solid ${active?'rgba(124,58,237,0.3)':done?'rgba(22,163,74,0.2)':PHX.border}`,
                    background:active?'rgba(124,58,237,0.05)':done?'rgba(22,163,74,0.04)':PHX.muted,
                    opacity:stepIdx<i?0.4:1, transition:'all 0.4s ease' }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                      background:done?'rgba(22,163,74,0.12)':'rgba(124,58,237,0.1)', fontSize:12, flexShrink:0 }}>
                      {done ? '✓' : active ? (
                        <div style={{ width:14, height:14, border:`2px solid ${PHX.purple}`, borderTopColor:'transparent', borderRadius:'50%', animation:'s-spin 0.8s linear infinite' }} />
                      ) : (i + 1)}
                    </div>
                    <p style={{ margin:0, fontSize:12, fontWeight:active?700:500,
                      color:done?PHX.green:active?PHX.purple:PHX.dim,
                      animation:active?'s-pulse 1.5s ease infinite':'none' }}>
                      {done ? s.replace('...','') + ' ✓' : s}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ marginTop:24, height:4, borderRadius:2, background:PHX.muted, overflow:'hidden' }}>
            <div style={{ height:'100%', borderRadius:2, background:`linear-gradient(90deg,${PHX.purple},${PHX.purpleL})`,
              width:`${Math.min(((stepIdx+1)/STEPS.length)*100,94)}%`, transition:'width 1.4s ease' }} />
          </div>
        </div>
      )}

      {/* ─── RESULT phase ────────────────────────────────────────────────── */}
      {phase === 'result' && currentRender && (
        <div style={{ width:'100%', maxWidth:860, animation:'s-in 0.45s ease' }}>

          {/* Error banner */}
          {errorMsg && (
            <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:10,
              background:'rgba(220,38,38,0.06)', border:`1px solid rgba(220,38,38,0.2)`, color:PHX.red, fontSize:13 }}>
              ⚠️ {errorMsg} —{' '}
              <button onClick={() => setErrorMsg(null)} style={{ background:'none', border:'none', color:PHX.purple, cursor:'pointer', fontSize:12, fontWeight:700 }}>
                Fechar
              </button>
            </div>
          )}

          {/* Images: resultado + original mini */}
          <div style={{ display:'flex', gap:12, marginBottom:16, alignItems:'flex-start' }}>
            {/* Render principal */}
            <div style={{ flex:1, minWidth:0, position:'relative' }}>
              {reRendering && (
                <div style={{ position:'absolute', inset:0, borderRadius:16, background:'rgba(255,255,255,0.7)', zIndex:10,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
                  <div style={{ width:36, height:36, border:`3px solid ${PHX.purple}`, borderTopColor:'transparent', borderRadius:'50%', animation:'s-spin 0.9s linear infinite' }} />
                  <p style={{ margin:0, fontSize:13, fontWeight:700, color:PHX.purple }}>Gerando novo render…</p>
                </div>
              )}
              <div style={{ borderRadius:16, overflow:'hidden', border:`1.5px solid rgba(124,58,237,0.25)`, boxShadow:`0 8px 32px rgba(124,58,237,0.12)` }}>
                <img src={currentRender} alt="Render IA" style={{ width:'100%', display:'block', objectFit:'cover', maxHeight:400 }} />
              </div>
              <div style={{ display:'flex', gap:6, marginTop:8, justifyContent:'flex-end' }}>
                <a href={currentRender} download="render-arqdor.png"
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8,
                    background:PHX.surface, border:`1px solid ${PHX.border}`,
                    color:PHX.textSub, fontSize:11, fontWeight:600, textDecoration:'none', cursor:'pointer' }}>
                  ⬇️ Baixar
                </a>
                <button onClick={reset}
                  style={{ padding:'6px 12px', borderRadius:8, background:PHX.surface, border:`1px solid ${PHX.border}`,
                    color:PHX.dim, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                  🔄 Novo render
                </button>
              </div>
            </div>

            {/* Original mini */}
            {imageDataUrl && (
              <div style={{ flexShrink:0, width:120 }}>
                <p style={{ margin:'0 0 5px', fontSize:9, fontWeight:800, color:PHX.dim, letterSpacing:'.06em' }}>ORIGINAL</p>
                <div style={{ borderRadius:10, overflow:'hidden', border:`1px solid ${PHX.border}` }}>
                  <img src={imageDataUrl} alt="Original" style={{ width:'100%', display:'block', objectFit:'cover', aspectRatio:'4/3' }} />
                </div>
              </div>
            )}
          </div>

          {/* Action chips */}
          <p style={{ margin:'0 0 9px', fontSize:11, fontWeight:700, color:PHX.dim, letterSpacing:'.06em' }}>AJUSTES E AÇÕES</p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:16 }}>
            {([
              { id:'melhorar',  icon:'✨', label:'Melhorar render'      },
              { id:'materiais', icon:'🎨', label:'Trocar materiais'     },
              { id:'cores',     icon:'🖌️', label:'Trocar cores'          },
              { id:'iluminacao',icon:'💡', label:'Ajustar iluminação'   },
              { id:'moveis',    icon:'🛋️', label:'Alterar móveis'       },
              { id:'itens',     icon:'➕', label:'Remover/adicionar'    },
              { id:'variacao',  icon:'🔀', label:'Gerar variação'       },
              { id:'comparar',  icon:'◀▶', label:'Comparar',            disabled: !prevRender },
            ] as const).map(a => (
              <button key={a.id}
                className={`s-action-btn${activeAdj===a.id?' active':''}`}
                onClick={() => {
                  if ('disabled' in a && a.disabled) return
                  if (a.id === 'melhorar' || a.id === 'variacao') {
                    onAplicar(a.id as AdjustType)
                  } else {
                    toggleAdj(a.id as AdjustType)
                  }
                }}
                disabled={('disabled' in a && a.disabled) || reRendering}
                style={{
                  padding:'8px 14px', borderRadius:9,
                  border:`1.5px solid ${activeAdj===a.id?PHX.purple:PHX.border}`,
                  background:activeAdj===a.id?'rgba(124,58,237,0.08)':PHX.surface,
                  color:activeAdj===a.id?PHX.purple:PHX.text,
                  fontSize:12, fontWeight:600, cursor:'pointer',
                  display:'flex', alignItems:'center', gap:6,
                  opacity:(('disabled' in a && a.disabled)||reRendering)?0.4:1,
                }}>
                <span style={{ fontSize:14 }}>{a.icon}</span>{a.label}
              </button>
            ))}
          </div>

          {/* ─── Adjustment panels ─────────────────────────────────────── */}

          {/* COMPARAR */}
          {activeAdj === 'comparar' && prevRender && (
            <div style={{ borderRadius:14, border:`1px solid ${PHX.border}`, background:PHX.surface, padding:16, marginBottom:14, animation:'s-in 0.3s ease' }}>
              <p style={{ margin:'0 0 12px', fontSize:12, fontWeight:800, color:PHX.text }}>◀▶ Comparar antes / depois</p>
              <div style={{ display:'flex', gap:12 }}>
                <div style={{ flex:1 }}>
                  <p style={{ margin:'0 0 6px', fontSize:10, fontWeight:700, color:PHX.dim }}>ANTERIOR</p>
                  <div style={{ borderRadius:10, overflow:'hidden', border:`1px solid ${PHX.border}` }}>
                    <img src={prevRender} alt="Anterior" style={{ width:'100%', display:'block', objectFit:'cover', maxHeight:260 }} />
                  </div>
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:'0 0 6px', fontSize:10, fontWeight:700, color:PHX.purple }}>ATUAL ✨</p>
                  <div style={{ borderRadius:10, overflow:'hidden', border:`1.5px solid rgba(124,58,237,0.25)` }}>
                    <img src={currentRender} alt="Atual" style={{ width:'100%', display:'block', objectFit:'cover', maxHeight:260 }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MATERIAIS */}
          {activeAdj === 'materiais' && (
            <div style={{ borderRadius:14, border:`1px solid ${PHX.border}`, background:PHX.surface, padding:16, marginBottom:14, animation:'s-in 0.3s ease' }}>
              <p style={{ margin:'0 0 12px', fontSize:12, fontWeight:800, color:PHX.text }}>🎨 Selecione os materiais</p>

              {/* Tabs */}
              <div style={{ display:'flex', gap:0, marginBottom:16, borderBottom:`1px solid ${PHX.border}` }}>
                {MAT_TABS.map(tab => (
                  <button key={tab.id} onClick={() => setMatTab(tab.id)}
                    style={{ padding:'8px 14px', borderRadius:0, border:'none', borderBottom:`2px solid ${matTab===tab.id?PHX.purple:'transparent'}`,
                      background:'transparent', color:matTab===tab.id?PHX.purple:PHX.textSub,
                      fontSize:12, fontWeight:matTab===tab.id?800:500, cursor:'pointer', transition:'all 0.14s ease',
                      marginBottom:-1 }}>
                    {tab.label}
                    {selections.materiais[tab.id] && (
                      <span style={{ marginLeft:5, width:6, height:6, borderRadius:'50%', background:PHX.purple, display:'inline-block' }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Swatches */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:14 }}>
                {MATERIALS[matTab].map(mat => {
                  const isActive = selections.materiais[matTab] === mat.id
                  const isGradient = mat.bg.startsWith('linear') || mat.bg.startsWith('repeating')
                  return (
                    <button key={mat.id} className={`s-mat-swatch${isActive?' active':''}`}
                      onClick={() => setSelections(prev => ({
                        ...prev, materiais: { ...prev.materiais, [matTab]: isActive ? undefined : mat.id }
                      }))}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                        border:`2px solid ${isActive?PHX.purple:PHX.border}`, borderRadius:12,
                        padding:'10px 8px', background:PHX.muted, cursor:'pointer', width:88 }}>
                      <div style={{ width:56, height:40, borderRadius:7,
                        background:isGradient?mat.bg:undefined,
                        backgroundColor:!isGradient?mat.bg:undefined,
                        border:`1px solid rgba(0,0,0,0.1)` }} />
                      <span style={{ fontSize:10, fontWeight:isActive?700:500, color:isActive?PHX.purple:PHX.text,
                        textAlign:'center', lineHeight:1.3 }}>{mat.label}</span>
                    </button>
                  )
                })}
                {/* Upload de material */}
                <button onClick={() => matRef.current?.click()}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                    border:`2px dashed ${PHX.border}`, borderRadius:12,
                    padding:'10px 8px', background:'transparent', cursor:'pointer', width:88 }}>
                  <div style={{ width:56, height:40, borderRadius:7, border:`1px dashed ${PHX.border}`,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, background:PHX.muted }}>
                    +
                  </div>
                  <span style={{ fontSize:10, color:PHX.dim, textAlign:'center', lineHeight:1.3 }}>Upload<br/>material</span>
                </button>
              </div>

              {/* Summary of selections */}
              {Object.entries(selections.materiais).some(([,v]) => v) && (
                <div style={{ padding:'8px 12px', borderRadius:8, background:PHX.muted, marginBottom:12 }}>
                  <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:PHX.dim }}>SELECIONADOS:</p>
                  {Object.entries(selections.materiais).map(([cat, id]) => {
                    if (!id) return null
                    const m = MATERIALS[cat]?.find(m => m.id === id)
                    const label = MAT_TABS.find(t => t.id === cat)?.label
                    return m ? (
                      <span key={cat} style={{ display:'inline-block', margin:'2px 4px 2px 0', padding:'2px 8px',
                        borderRadius:6, background:'rgba(124,58,237,0.1)', color:PHX.purple, fontSize:11, fontWeight:600 }}>
                        {label}: {m.label}
                      </span>
                    ) : null
                  })}
                </div>
              )}

              <ApplyBtn onClick={() => onAplicar('materiais')} loading={reRendering} />
            </div>
          )}

          {/* CORES */}
          {activeAdj === 'cores' && (
            <AdjPanel title="🖌️ Paleta de cores" onApply={() => onAplicar('cores')} loading={reRendering}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {CORES_OPTS.map(c => {
                  const isActive = selections.cor === c.id
                  return (
                    <button key={c.id} className={`s-mat-swatch${isActive?' active':''}`}
                      onClick={() => setSelections(p => ({ ...p, cor: isActive ? null : c.id }))}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                        border:`2px solid ${isActive?PHX.purple:PHX.border}`, borderRadius:12,
                        padding:'10px 8px', background:PHX.muted, cursor:'pointer', width:100 }}>
                      <div style={{ width:72, height:28, borderRadius:6, background:c.bg, border:`1px solid rgba(0,0,0,0.08)` }} />
                      <span style={{ fontSize:11, fontWeight:isActive?700:500, color:isActive?PHX.purple:PHX.text }}>
                        {c.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </AdjPanel>
          )}

          {/* ILUMINAÇÃO */}
          {activeAdj === 'iluminacao' && (
            <AdjPanel title="💡 Tipo de iluminação" onApply={() => onAplicar('iluminacao')} loading={reRendering}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {ILUMINACAO_OPTS.map(il => {
                  const isActive = selections.iluminacao === il.id
                  return (
                    <button key={il.id} className={`s-chip${isActive?' active':''}`}
                      onClick={() => setSelections(p => ({ ...p, iluminacao: isActive ? null : il.id }))}
                      style={{ padding:'9px 16px', borderRadius:10, border:`1.5px solid ${isActive?PHX.purple:PHX.border}`,
                        background:isActive?'rgba(124,58,237,0.08)':PHX.surface,
                        color:isActive?PHX.purple:PHX.text, fontSize:13, fontWeight:isActive?700:500,
                        display:'flex', alignItems:'center', gap:7, cursor:'pointer' }}>
                      <span style={{ fontSize:16 }}>{il.icon}</span>{il.label}
                    </button>
                  )
                })}
              </div>
            </AdjPanel>
          )}

          {/* MÓVEIS */}
          {activeAdj === 'moveis' && (
            <AdjPanel title="🛋️ Estilo de móveis" onApply={() => onAplicar('moveis')} loading={reRendering}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {MOVEIS_OPTS.map(mv => {
                  const isActive = selections.movel === mv.id
                  return (
                    <button key={mv.id} className={`s-chip${isActive?' active':''}`}
                      onClick={() => setSelections(p => ({ ...p, movel: isActive ? null : mv.id }))}
                      style={{ padding:'9px 16px', borderRadius:10, border:`1.5px solid ${isActive?PHX.purple:PHX.border}`,
                        background:isActive?'rgba(124,58,237,0.08)':PHX.surface,
                        color:isActive?PHX.purple:PHX.text, fontSize:13, fontWeight:isActive?700:500, cursor:'pointer' }}>
                      {mv.label}
                    </button>
                  )
                })}
              </div>
            </AdjPanel>
          )}

          {/* ITENS */}
          {activeAdj === 'itens' && (
            <AdjPanel title="➕ Remover ou adicionar itens" onApply={() => onAplicar('itens')} loading={reRendering}>
              <textarea
                value={selections.itens}
                onChange={e => setSelections(p => ({ ...p, itens: e.target.value }))}
                placeholder="Descreva o que deseja remover ou adicionar. Ex: Adicionar planta grande no canto, remover o tapete, incluir mesa de jantar para 6 pessoas…"
                rows={4}
                style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:`1.5px solid ${PHX.border}`,
                  background:PHX.muted, color:PHX.text, fontSize:13, resize:'vertical',
                  fontFamily:'inherit', lineHeight:1.5, outline:'none', boxSizing:'border-box' }}
              />
            </AdjPanel>
          )}

        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function AdjPanel({ title, children, onApply, loading }: {
  title: string; children: React.ReactNode; onApply: () => void; loading: boolean
}) {
  return (
    <div style={{ borderRadius:14, border:`1px solid ${PHX.border}`, background:PHX.surface,
      padding:16, marginBottom:14, animation:'s-in 0.3s ease' }}>
      <p style={{ margin:'0 0 12px', fontSize:12, fontWeight:800, color:PHX.text }}>{title}</p>
      {children}
      <div style={{ marginTop:14 }}>
        <ApplyBtn onClick={onApply} loading={loading} />
      </div>
    </div>
  )
}

function ApplyBtn({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button className="s-render-btn" onClick={onClick} disabled={loading}
      style={{ width:'100%', padding:'12px 0', borderRadius:11, border:'none',
        background:`linear-gradient(135deg,${PHX.purple},${PHX.purpleD})`,
        color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        boxShadow:'0 4px 16px rgba(124,58,237,0.28)',
      }}>
      {loading ? (
        <>
          <div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'s-spin 0.8s linear infinite' }} />
          Gerando novo render…
        </>
      ) : (
        <><span style={{ fontSize:15 }}>✨</span> Aplicar e gerar novo render</>
      )}
    </button>
  )
}
