import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { useRenderState } from './useRenderState'
import ImageCanvas from './ImageCanvas'
import { MATERIALS, AppliedMaterial } from './render-types'
import { useListLeads } from '@workspace/api-client-react'

type CustomMat = {
  id: string; name: string; cat: string; c1: string; c2: string
  prompt: string; imageUrl?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AMBIENTES = [
  { id: 'sala',         label: 'Sala de Estar'  },
  { id: 'cozinha',      label: 'Cozinha'         },
  { id: 'quarto',       label: 'Quarto'           },
  { id: 'banheiro',     label: 'Banheiro'         },
  { id: 'escritorio',   label: 'Escritório'       },
  { id: 'varanda',      label: 'Varanda'          },
  { id: 'area_lazer',   label: 'Área de Lazer'   },
  { id: 'area_externa', label: 'Área Externa'    },
  { id: 'fachada',      label: 'Fachada'          },
]

const ESTILOS = [
  { id: 'minimalista',   label: 'Minimalista'   },
  { id: 'contemporaneo', label: 'Contemporâneo' },
  { id: 'classico',      label: 'Clássico'       },
  { id: 'industrial',    label: 'Industrial'     },
  { id: 'escandinavo',   label: 'Escandinavo'   },
  { id: 'tropical',      label: 'Tropical'       },
]

const LUZES = [
  { id: 'auto',    label: '🔄 Auto'    },
  { id: 'manha',   label: '🌅 Manhã'   },
  { id: 'tarde',   label: '☀️ Tarde'   },
  { id: 'golden',  label: '🌇 Golden'  },
  { id: 'noturno', label: '🌙 Noturno' },
  { id: 'nublado', label: '☁️ Nublado' },
]

const ANGULOS = [
  { id: 'frontal',      label: 'Frontal'   },
  { id: '45',           label: '45°'       },
  { id: 'lateral_esq',  label: 'Lat. Esq.' },
  { id: 'lateral_dir',  label: 'Lat. Dir.' },
  { id: 'ampla',        label: 'Ampla'     },
  { id: 'aerea',        label: 'Aérea'     },
]

const MAT_CATS = ['Todos', 'Madeira', 'MDF', 'Pedra', 'Ferro', 'Cerâmica', 'Concreto']

const ROOM_TYPE_MAP: Record<string, string> = {
  fachada:      'fachada externa',
  area_externa: 'fachada externa',
}

function getBase()  { return (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') }
function getToken() { return localStorage.getItem('vendorai_token') ?? '' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function RenderPage() {
  const rs            = useRenderState()
  const { toast }     = useToast()
  const { user }      = useAuth()
  const tenantId      = user?.tenantId ?? ''
  const fileRef       = useRef<HTMLInputElement>(null)
  const sliderAreaRef = useRef<HTMLDivElement>(null)
  const draggingRef   = useRef<CustomMat | null>(null)

  // Material state
  const [customMats,  setCustomMats]  = useState<CustomMat[]>([])
  const [draggingMat, setDraggingMat] = useState<CustomMat | null>(null)
  const [ghostPos,    setGhostPos]    = useState({ x: -200, y: -200 })
  draggingRef.current = draggingMat

  // Config
  const [ambiente,    setAmbiente]    = useState('cozinha')
  const [estilo,      setEstilo]      = useState('')
  const [observacoes, setObservacoes] = useState('')

  // Modo de renderização
  const [renderMode,  setRenderMode]  = useState<'preservar' | 'criar'>('preservar')
  // Último render_id do pipeline assíncrono
  const [lastRenderId, setLastRenderId] = useState<string | null>(null)
  // version_tag retornado pelo backend
  const [versionTag,   setVersionTag]  = useState<string | null>(null)
  // Modal de salvar configuração
  const [showSaveConfig,   setShowSaveConfig]   = useState(false)
  const [saveConfigName,   setSaveConfigName]   = useState('')
  const [savingConfig,     setSavingConfig]     = useState(false)

  // Panel UI
  const [openSection, setOpenSection] = useState<number>(0)
  const [matCat,      setMatCat]      = useState('Todos')

  // History & before/after
  const [history,        setHistory]        = useState<string[]>([])
  const [beforeAfter,    setBeforeAfter]    = useState(false)
  const [splitPos,       setSplitPos]       = useState(50)
  const [isDraggingSplit,setIsDraggingSplit] = useState(false)

  // Salvar no Lead
  const [showSalvar,   setShowSalvar]   = useState(false)
  const [selectedLead, setSelectedLead] = useState('')
  const [savingLead,   setSavingLead]   = useState(false)

  const { data: leadsRaw } = useListLeads({ query: { enabled: showSalvar } } as any)
  const leads: any[] = Array.isArray(leadsRaw) ? leadsRaw : []

  // Mobile detection
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768
  )
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Track history
  useEffect(() => {
    if (rs.renderResult && !history.includes(rs.renderResult)) {
      setHistory(prev => [rs.renderResult!, ...prev].slice(0, 6))
    }
  }, [rs.renderResult])

  // Drag ghost
  useEffect(() => {
    if (!draggingMat) return
    const onMove = (e: MouseEvent) => setGhostPos({ x: e.clientX, y: e.clientY })
    const onUp   = () => { setDraggingMat(null); setGhostPos({ x: -200, y: -200 }) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',  onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [draggingMat])

  // Before/After slider drag
  useEffect(() => {
    if (!isDraggingSplit) return
    const onMove = (e: MouseEvent) => {
      const el = sliderAreaRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const pos  = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100))
      setSplitPos(pos)
    }
    const onUp = () => setIsDraggingSplit(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',  onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [isDraggingSplit])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleLoadImage(file: File) {
    rs.loadImage(file)
    setBeforeAfter(false)
  }

  function applyMat(zone: string) {
    const mat = draggingRef.current
    if (!mat) return
    rs.applyMaterial(zone, { zone, name: mat.name, color: mat.c1, promptFragment: mat.prompt } as AppliedMaterial)
    setDraggingMat(null)
    setGhostPos({ x: -200, y: -200 })
  }

  function handleImportMat(file: File) {
    const c = document.createElement('canvas'); c.width = 1; c.height = 1
    const ctx = c.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 12)
      setCustomMats(prev => [...prev, {
        id: `user-${Date.now()}`, name, cat: 'usuario',
        c1: hex, c2: hex,
        prompt: `texture from uploaded image "${name}", photorealistic`,
        imageUrl: URL.createObjectURL(file),
      }])
    }
    img.src = URL.createObjectURL(file)
  }

  async function doRender() {
    if (!rs.imageUrl) {
      toast({ variant: 'destructive', description: 'Selecione uma imagem primeiro.' })
      return
    }
    rs.setLoading(true)
    setVersionTag(null)
    try {
      const materials = Object.entries(rs.applied).map(([zone, mat]) => ({
        zone, materialName: mat.name, promptFragment: mat.promptFragment,
      }))
      const maskZones = renderMode === 'preservar'
        ? Object.keys(rs.applied).concat(['piso', 'parede']).filter((v, i, a) => a.indexOf(v) === i)
        : []

      // ── Novo pipeline assíncrono (mode=preservar usa Flux Fill Pro) ──
      const res = await fetch(`${getBase()}/api/arch/ai-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          original_image_url: rs.imageUrl,
          mode:        renderMode,
          ambiente,
          estilo:      renderMode === 'criar' ? (estilo || undefined) : undefined,
          iluminacao:  rs.config.light !== 'auto' ? rs.config.light : undefined,
          angulo:      renderMode === 'criar' ? rs.config.angle : undefined,
          mask_zones:  maskZones,
          materials,
          user_notes:  observacoes || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as any).error ?? `Erro ${res.status}`)
      }
      const { render_id } = await res.json()
      setLastRenderId(render_id)

      // ── Polling até concluir ──
      let attempts = 0
      const MAX_POLLS = 90 // 3 minutos a 2s
      while (attempts < MAX_POLLS) {
        await new Promise(r => setTimeout(r, 2000))
        const poll = await fetch(`${getBase()}/api/arch/ai-render/${render_id}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        if (!poll.ok) break
        const data = await poll.json()
        if (data.status === 'concluido' && data.result_image_url) {
          rs.setRenderResult(data.result_image_url)
          setVersionTag(data.version_tag ?? null)
          const motorLabel = data.motor?.includes('flux-fill') ? ' via Flux Fill Pro' : data.motor ? ` via ${data.motor}` : ''
          const compositeLabel = data.composited ? ' + compositing' : ''
          toast({ description: `✨ Render concluído${motorLabel}${compositeLabel}` })
          return
        }
        if (data.status === 'erro') {
          throw new Error(data.erro_msg ?? 'Erro no processamento do render')
        }
        attempts++
      }
      throw new Error('Tempo esgotado aguardando o render.')
    } catch (err: any) {
      toast({ variant: 'destructive', description: err?.message ?? 'Erro ao gerar render.' })
    } finally {
      rs.setLoading(false)
    }
  }

  async function handleSalvarConfig() {
    if (!saveConfigName.trim()) return
    setSavingConfig(true)
    try {
      const materials = Object.entries(rs.applied).reduce((acc, [zone, mat]) => {
        acc[zone] = mat.name
        return acc
      }, {} as Record<string, string>)
      const res = await fetch(`${getBase()}/api/arch/project-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          nome_config:      saveConfigName.trim(),
          mode:             renderMode,
          estilo:           estilo || undefined,
          iluminacao:       rs.config.light !== 'auto' ? rs.config.light : undefined,
          angulo_padrao:    rs.config.angle,
          paleta_materiais: Object.keys(materials).length > 0 ? materials : undefined,
        }),
      })
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      toast({ description: '✅ Configuração salva!' })
      setShowSaveConfig(false)
      setSaveConfigName('')
    } catch (err: any) {
      toast({ variant: 'destructive', description: err?.message ?? 'Erro ao salvar.' })
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleSalvarNoLead() {
    if (!selectedLead || !rs.renderResult) return
    setSavingLead(true)
    try {
      const res = await fetch(`${getBase()}/api/tenants/${tenantId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          leadId:          selectedLead,
          tipo:            'tarefa',
          conteudo:        `🖼 Render de projeto Arch: ${window.location.origin}${rs.renderResult}`,
          status:          'concluida',
        }),
      })
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      toast({ description: '✅ Render salvo no lead!' })
      setShowSalvar(false)
      setSelectedLead('')
    } catch (err: any) {
      toast({ variant: 'destructive', description: err?.message ?? 'Erro ao salvar.' })
    } finally {
      setSavingLead(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const allMats = [
    ...MATERIALS.map(m => ({ ...m, imageUrl: undefined as string | undefined })),
    ...customMats,
  ]
  const hasUserMats  = customMats.length > 0
  const filteredMats = matCat === 'Todos'
    ? allMats
    : matCat === 'Meus'
      ? allMats.filter(m => m.cat === 'usuario')
      : allMats.filter(m => m.cat.toLowerCase() === matCat.toLowerCase())

  const appliedCount = Object.keys(rs.applied).length
  const hasHistory   = history.length > 0

  // No modo Preservar: oculta seções ESTILO (idx=1) e ÂNGULO (idx=3)
  const visibleSections = renderMode === 'preservar' ? [0, 2, 4] : [0, 1, 2, 3, 4]

  const allSectionLabels = [
    `1 · AMBIENTE${ambiente ? ` — ${AMBIENTES.find(a => a.id === ambiente)?.label ?? ambiente}` : ''}`,
    `2 · ESTILO${estilo ? ` — ${ESTILOS.find(s => s.id === estilo)?.label ?? estilo}` : ''}`,
    `3 · ILUMINAÇÃO — ${LUZES.find(l => l.id === rs.config.light)?.label ?? '🔄 Auto'}`,
    renderMode === 'preservar'
      ? '4 · ÂNGULO — Preservado (original)'
      : `4 · ÂNGULO — ${ANGULOS.find(a => a.id === rs.config.angle)?.label ?? 'Frontal'}`,
    `5 · COMPONENTES${appliedCount > 0 ? ` (${appliedCount})` : ''}`,
  ]
  const sectionLabels = visibleSections.map(i => allSectionLabels[i]!)

  // ── Styles ────────────────────────────────────────────────────────────────

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
    background: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
    border: active ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
    color: active ? '#c4b5fd' : 'rgba(255,255,255,0.55)',
  })

  const gridBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 4px', borderRadius: 6, fontSize: 10, cursor: 'pointer',
    fontWeight: active ? 600 : 400, textAlign: 'center',
    background: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
    border: active ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.08)',
    color: active ? '#c4b5fd' : 'rgba(255,255,255,0.55)',
    width: '100%',
  })

  const panelBtn: React.CSSProperties = {
    padding: '3px 9px', borderRadius: 6,
    border: '0.5px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.65)',
    fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap',
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '1fr 300px',
      gridTemplateRows: isMobile
        ? `1fr 500px${hasHistory ? ' 72px' : ''}`
        : `1fr${hasHistory ? ' 72px' : ''}`,
      height: '100vh',
      background: '#070611',
      overflow: 'hidden',
      userSelect: draggingMat ? 'none' : undefined,
      cursor: draggingMat ? 'grabbing' : 'default',
    }}>

      {/* ── LEFT: Canvas area ──────────────────────────────────────────── */}
      <div
        ref={sliderAreaRef}
        style={{ position: 'relative', overflow: 'hidden', background: '#070611', gridRow: 1 }}
      >
        {/* Image / empty state */}
        {(rs.imageUrl || rs.renderResult) ? (
          beforeAfter && rs.imageUrl && rs.renderResult ? (
            /* ── Before/After overlay ── */
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
              <img src={rs.renderResult} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} alt="Render" />
              <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}>
                <img src={rs.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Original" />
              </div>
              {/* Divider handle */}
              <div
                onMouseDown={() => setIsDraggingSplit(true)}
                style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${splitPos}%`, transform: 'translateX(-50%)',
                  width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'col-resize', zIndex: 30,
                }}
              >
                <div style={{ width: 2, height: '100%', background: '#a78bfa' }} />
                <div style={{
                  position: 'absolute', width: 28, height: 28, borderRadius: '50%',
                  background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.5)', color: '#fff', fontSize: 12, fontWeight: 700,
                }}>↔</div>
              </div>
              <div style={{ position: 'absolute', top: 12, left: 14, padding: '2px 8px', background: 'rgba(0,0,0,0.65)', borderRadius: 4, fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em' }}>ORIGINAL</div>
              <div style={{ position: 'absolute', top: 12, right: 14, padding: '2px 8px', background: 'rgba(139,92,246,0.55)', borderRadius: 4, fontSize: 9, color: '#fff', letterSpacing: '0.06em' }}>RENDER</div>
            </div>
          ) : (
            /* ── Normal canvas ── */
            <ImageCanvas
              imageUrl={rs.renderResult || rs.imageUrl!}
              applied={rs.applied}
              draggingMat={draggingMat}
              onDrop={applyMat}
              onMouseUpZone={applyMat}
              onLoadImage={handleLoadImage}
            />
          )
        ) : (
          /* ── Empty state ── */
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f?.type.startsWith('image/')) handleLoadImage(f)
            }}
            style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 14,
              border: '1.5px dashed rgba(255,255,255,0.1)', borderRadius: 12,
              margin: 20, cursor: 'pointer', background: 'rgba(255,255,255,0.015)',
            }}
          >
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, margin: 0, fontWeight: 500 }}>Arraste uma foto do ambiente</p>
              <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 12, margin: '5px 0 0' }}>ou clique para selecionar</p>
            </div>
          </div>
        )}

        {/* ── Overlay action buttons ── */}
        {!rs.loading && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 8, zIndex: 20,
          }}>
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 12,
                background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
                border: '0.5px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer',
              }}
            >🎯 Selecionar</button>
            {rs.renderResult && rs.imageUrl && (
              <button
                onClick={() => setBeforeAfter(v => !v)}
                style={{
                  padding: '7px 16px', borderRadius: 8, fontSize: 12,
                  background: beforeAfter ? 'rgba(139,92,246,0.35)' : 'rgba(0,0,0,0.72)',
                  backdropFilter: 'blur(8px)',
                  border: `0.5px solid ${beforeAfter ? 'rgba(139,92,246,0.65)' : 'rgba(255,255,255,0.18)'}`,
                  color: beforeAfter ? '#c4b5fd' : 'rgba(255,255,255,0.85)', cursor: 'pointer',
                }}
              >↔ Antes/Depois</button>
            )}
          </div>
        )}

        {/* ── Badge de modo no resultado ── */}
        {rs.renderResult && versionTag && (
          <div style={{
            position: 'absolute', top: 12, right: 14, zIndex: 25,
            padding: '3px 9px', borderRadius: 20, fontSize: 9, fontWeight: 700,
            letterSpacing: '0.06em', backdropFilter: 'blur(8px)',
            ...(versionTag === 'fiel_ao_original'
              ? { background: 'rgba(22,163,74,0.75)', color: '#dcfce7', border: '0.5px solid rgba(34,197,94,0.6)' }
              : { background: 'rgba(124,58,237,0.75)', color: '#ede9fe', border: '0.5px solid rgba(167,139,250,0.6)' }),
          }}>
            {versionTag === 'fiel_ao_original' ? '🔒 Fiel ao original' : '✨ Conceito'}
          </div>
        )}

        {/* ── Loading skeleton overlay ── */}
        {rs.loading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(7,6,17,0.88)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
            backdropFilter: 'blur(6px)', zIndex: 50,
          }}>
            <div style={{ width: 220, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div className="render-progress-bar" style={{
                height: '100%', width: '65%', borderRadius: 3,
                background: renderMode === 'preservar'
                  ? 'linear-gradient(90deg, #14532d, #16a34a, #4ade80, #16a34a, #14532d)'
                  : 'linear-gradient(90deg, #4c1d95, #7c3aed, #a855f7, #7c3aed, #4c1d95)',
                backgroundSize: '300% 100%',
              }} />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, margin: 0, fontWeight: 500 }}>
              {renderMode === 'preservar' ? '🔒 Inpainting estrutural…' : '✨ Gerando conceito…'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 11, margin: 0 }}>
              {renderMode === 'preservar'
                ? 'Segmentação + Flux Fill Pro + compositing — pode levar 60–120s'
                : 'Pode levar até 60–90 segundos'}
            </p>
          </div>
        )}

        <input
          ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleLoadImage(f) }}
        />
      </div>

      {/* ── RIGHT: Accordion Panel ─────────────────────────────────────── */}
      <div style={{
        gridRow: isMobile ? 2 : 1,
        gridColumn: isMobile ? 1 : 2,
        borderLeft: isMobile ? 'none' : '0.5px solid rgba(255,255,255,0.08)',
        borderTop:  isMobile ? '1px solid rgba(255,255,255,0.1)' : 'none',
        background: '#0e0c1a', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Panel header */}
        <div style={{
          padding: '9px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#a78bfa', letterSpacing: '0.06em', marginRight: 4 }}>
            🖼 PROJETO
          </span>
          <button style={panelBtn} onClick={() => fileRef.current?.click()}>Trocar imagem</button>
          <button
            style={{ ...panelBtn, opacity: rs.renderResult ? 1 : 0.4, cursor: rs.renderResult ? 'pointer' : 'not-allowed' }}
            disabled={!rs.renderResult}
            onClick={() => rs.renderResult && setShowSalvar(true)}
          >Salvar no Lead</button>
          {rs.renderResult && (
            <>
              <a
                href={rs.renderResult} download="render-hd.png"
                style={{ ...panelBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >⬇ HD</a>
              <button
                style={panelBtn}
                onClick={() => setShowSaveConfig(true)}
              >💾 Config</button>
            </>
          )}
        </div>

        {/* ── Seletor de Modo ─────────────────────────────────────────── */}
        <div style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '0 0 7px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Modo de geração</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {/* Card: Preservar */}
            <button
              onClick={() => setRenderMode('preservar')}
              style={{
                padding: '8px 7px', borderRadius: 7, textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                background: renderMode === 'preservar' ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                border: renderMode === 'preservar' ? '1px solid rgba(34,197,94,0.45)' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontSize: 14, marginBottom: 2 }}>🔒</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: renderMode === 'preservar' ? '#86efac' : 'rgba(255,255,255,0.7)', marginBottom: 2 }}>
                Preservar
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.38)', lineHeight: 1.4 }}>
                Só troca acabamentos, preserva móveis e geometria
              </div>
            </button>
            {/* Card: Criar */}
            <button
              onClick={() => setRenderMode('criar')}
              style={{
                padding: '8px 7px', borderRadius: 7, textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                background: renderMode === 'criar' ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                border: renderMode === 'criar' ? '1px solid rgba(139,92,246,0.45)' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontSize: 14, marginBottom: 2 }}>✨</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: renderMode === 'criar' ? '#c4b5fd' : 'rgba(255,255,255,0.7)', marginBottom: 2 }}>
                Criar conceito
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.38)', lineHeight: 1.4 }}>
                IA recria ambiente livre, móveis e layout podem mudar
              </div>
            </button>
          </div>
        </div>

        {/* Accordion sections */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sectionLabels.map((label, listIdx) => {
            const idx = visibleSections[listIdx]!
            const isOpen = openSection === idx
            return (
              <div key={idx} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>

                {/* Accordion header */}
                <button
                  onClick={() => setOpenSection(isOpen ? -1 : idx)}
                  disabled={renderMode === 'preservar' && idx === 3}
                  style={{
                    width: '100%', padding: '10px 12px', textAlign: 'left',
                    background: isOpen ? 'rgba(139,92,246,0.07)' : 'transparent',
                    border: 'none', cursor: renderMode === 'preservar' && idx === 3 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    color: isOpen ? '#c4b5fd' : (renderMode === 'preservar' && idx === 3) ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)',
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', transition: 'all 0.12s',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 6 }}>
                    {label}
                  </span>
                  <span style={{ opacity: 0.5, fontSize: 8, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* Accordion content */}
                {isOpen && (
                  <div style={{ padding: '10px 12px 14px', background: 'rgba(0,0,0,0.12)' }}>

                    {/* 1 · AMBIENTE */}
                    {idx === 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                        {AMBIENTES.map(a => (
                          <button key={a.id} onClick={() => { setAmbiente(a.id); setOpenSection(1) }}
                            style={gridBtn(ambiente === a.id)}>
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 2 · ESTILO */}
                    {idx === 1 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
                        {ESTILOS.map(s => (
                          <button key={s.id}
                            onClick={() => { setEstilo(s.id === estilo ? '' : s.id); setOpenSection(2) }}
                            style={gridBtn(estilo === s.id)}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 3 · ILUMINAÇÃO */}
                    {idx === 2 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {LUZES.map(l => (
                          <button key={l.id}
                            onClick={() => { rs.setConfig(p => ({ ...p, light: l.id as any })); setOpenSection(3) }}
                            style={chip(rs.config.light === l.id)}>
                            {l.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 4 · ÂNGULO */}
                    {idx === 3 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {ANGULOS.map(a => (
                          <button key={a.id}
                            onClick={() => { rs.setConfig(p => ({ ...p, angle: a.id as any })); setOpenSection(4) }}
                            style={chip(rs.config.angle === a.id)}>
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 5 · COMPONENTES */}
                    {idx === 4 && (
                      <div>
                        {/* Category filter */}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                          {[...MAT_CATS, ...(hasUserMats ? ['Meus'] : [])].map(cat => (
                            <button key={cat} onClick={() => setMatCat(cat)} style={chip(matCat === cat)}>{cat}</button>
                          ))}
                        </div>

                        {/* Import */}
                        <label style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px',
                          borderRadius: 6, border: '0.5px dashed rgba(255,255,255,0.18)',
                          color: 'rgba(255,255,255,0.38)', fontSize: 9, cursor: 'pointer', marginBottom: 8,
                        }}>
                          + Importar textura
                          <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                            onChange={e => Array.from(e.target.files ?? []).forEach(handleImportMat)}
                          />
                        </label>

                        {/* Materials grid */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {filteredMats.map(mat => (
                            <div
                              key={mat.id}
                              title={mat.name}
                              onMouseDown={e => {
                                e.preventDefault()
                                setDraggingMat(mat as CustomMat)
                                setGhostPos({ x: e.clientX, y: e.clientY })
                              }}
                              style={{
                                width: 48, height: 42, borderRadius: 5, cursor: 'grab', flexShrink: 0,
                                background: mat.imageUrl
                                  ? `url(${mat.imageUrl}) center/cover`
                                  : `linear-gradient(135deg, ${mat.c1}, ${mat.c2})`,
                                border: '1px solid rgba(255,255,255,0.1)',
                                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                                overflow: 'hidden',
                              }}
                            >
                              <span style={{
                                fontSize: 7, fontWeight: 600, color: '#fff',
                                background: 'rgba(0,0,0,0.55)', width: '100%',
                                textAlign: 'center', padding: '1px 0', pointerEvents: 'none',
                              }}>{mat.name}</span>
                            </div>
                          ))}
                        </div>

                        {/* Applied materials */}
                        {appliedCount > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aplicados</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {Object.entries(rs.applied).map(([zone, mat]) => (
                                <div key={zone} style={{
                                  display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 8px',
                                  borderRadius: 20, background: 'rgba(139,92,246,0.15)',
                                  border: '1px solid rgba(139,92,246,0.3)', fontSize: 9, color: '#c4b5fd',
                                }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: mat.color, flexShrink: 0 }} />
                                  <span>{zone} · {mat.name}</span>
                                  <button
                                    onClick={() => rs.removeMaterial(zone)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 10, padding: 0, lineHeight: 1, marginLeft: 2 }}
                                  >✕</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Panel footer */}
        <div style={{ padding: '12px', borderTop: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <textarea
            placeholder="Observações adicionais…"
            value={observacoes}
            onChange={e => setObservacoes(e.target.value)}
            rows={2}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)',
              border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 6,
              color: 'rgba(255,255,255,0.75)', fontSize: 11, padding: '6px 8px',
              resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit',
            }}
          />
          {/* Banner de aviso no modo Criar */}
          {renderMode === 'criar' && (
            <div style={{
              padding: '6px 9px', borderRadius: 6, marginBottom: 8,
              background: 'rgba(245,158,11,0.1)', border: '0.5px solid rgba(245,158,11,0.3)',
              fontSize: 9, color: 'rgba(245,158,11,0.9)', lineHeight: 1.5,
            }}>
              ⚠️ Este modo pode alterar móveis, medidas e disposição do ambiente.
            </div>
          )}
          <button
            onClick={doRender}
            disabled={rs.loading || !rs.imageUrl}
            style={{
              width: '100%', padding: '11px', borderRadius: 8,
              background: rs.loading || !rs.imageUrl
                ? 'rgba(124,58,237,0.2)'
                : renderMode === 'preservar'
                  ? 'linear-gradient(135deg, #166534, #16a34a, #22c55e)'
                  : 'linear-gradient(135deg, #6d28d9, #7c3aed, #a855f7)',
              border: `1px solid ${renderMode === 'preservar' ? 'rgba(34,197,94,0.4)' : 'rgba(139,92,246,0.4)'}`,
              color: rs.loading || !rs.imageUrl ? 'rgba(255,255,255,0.3)' : '#fff',
              fontSize: 13, fontWeight: 700, cursor: rs.loading || !rs.imageUrl ? 'not-allowed' : 'pointer',
              letterSpacing: '0.06em', transition: 'opacity 0.2s',
            }}
          >
            {rs.loading
              ? (renderMode === 'preservar' ? '⏳ Inpainting…' : '⏳ Gerando conceito…')
              : renderMode === 'preservar'
                ? '🔒 GERAR RENDER (PRESERVADO)'
                : '✨ GERAR CONCEITO'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.25)', margin: '7px 0 0', letterSpacing: '0.04em' }}>
            {renderMode === 'preservar' ? '🔒 Flux Fill Pro · compositing garantido' : '✨ Geração livre via Flux ControlNet'}
          </p>
        </div>
      </div>

      {/* ── BOTTOM: History strip ─────────────────────────────────────── */}
      {hasHistory && (
        <div style={{
          gridColumn: '1 / -1',
          background: '#0a0918', borderTop: '0.5px solid rgba(255,255,255,0.08)',
          height: 72, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8,
          overflowX: 'auto', flexShrink: 0,
        }}>
          <span style={{
            fontSize: 9, color: 'rgba(255,255,255,0.28)', marginRight: 4, flexShrink: 0,
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>🕐 Histórico</span>
          {history.map((url, i) => (
            <img
              key={i} src={url} alt={`Render ${i + 1}`}
              onClick={() => { rs.setRenderResult(url); setBeforeAfter(false) }}
              style={{
                height: 52, width: 82, objectFit: 'cover', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                border: rs.renderResult === url ? '1.5px solid #a78bfa' : '1px solid rgba(255,255,255,0.1)',
                transition: 'border-color 0.15s', opacity: rs.renderResult === url ? 1 : 0.7,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Modal: Salvar Configuração ─────────────────────────────── */}
      {showSaveConfig && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowSaveConfig(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#16142a', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 24, width: 340, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}
          >
            <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: '0 0 3px' }}>💾 Salvar Configuração</h3>
            <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, margin: '0 0 16px' }}>
              Salva modo ({renderMode}), iluminação, ângulo e materiais para reutilizar neste projeto.
            </p>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 }}>Nome da configuração</span>
              <input
                type="text"
                placeholder="ex: Cozinha — Pedra Branca Manhã"
                value={saveConfigName}
                onChange={e => setSaveConfigName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSalvarConfig()}
                autoFocus
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.07)',
                  border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 6,
                  color: '#fff', fontSize: 12, padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowSaveConfig(false); setSaveConfigName('') }}
                style={{ padding: '7px 16px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.55)', fontSize: 12, cursor: 'pointer' }}
              >Cancelar</button>
              <button
                onClick={handleSalvarConfig}
                disabled={!saveConfigName.trim() || savingConfig}
                style={{
                  padding: '7px 18px', borderRadius: 6, border: 'none',
                  background: saveConfigName.trim() && !savingConfig ? '#7c3aed' : 'rgba(124,58,237,0.3)',
                  color: saveConfigName.trim() && !savingConfig ? '#fff' : 'rgba(255,255,255,0.3)',
                  fontSize: 12, fontWeight: 600, cursor: saveConfigName.trim() && !savingConfig ? 'pointer' : 'not-allowed',
                }}
              >{savingConfig ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drag ghost ───────────────────────────────────────────────── */}
      {draggingMat && (
        <div style={{
          position: 'fixed', left: ghostPos.x - 24, top: ghostPos.y - 21,
          width: 48, height: 42,
          background: draggingMat.imageUrl
            ? `url(${draggingMat.imageUrl}) center/cover`
            : `linear-gradient(135deg, ${draggingMat.c1}, ${draggingMat.c2})`,
          borderRadius: 6, border: '1.5px solid rgba(255,255,255,0.4)',
          zIndex: 9999, pointerEvents: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        }} />
      )}

      {/* ── Salvar no Lead modal ─────────────────────────────────────── */}
      {showSalvar && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
          }}
          onClick={() => setShowSalvar(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#16142a', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 12,
              padding: 24, width: 360, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}
          >
            <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: '0 0 3px' }}>Salvar no Lead</h3>
            <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, margin: '0 0 14px' }}>
              Associar este render a um lead do CRM
            </p>
            {rs.renderResult && (
              <img src={rs.renderResult} alt="Render" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6, marginBottom: 14 }} />
            )}
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 }}>Lead</span>
              <select
                value={selectedLead}
                onChange={e => setSelectedLead(e.target.value)}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.07)',
                  border: '0.5px solid rgba(255,255,255,0.15)',
                  borderRadius: 6, color: '#fff', fontSize: 12, padding: '8px 10px', outline: 'none',
                }}
              >
                <option value="">Selecione um lead…</option>
                {leads.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.nome ?? l.empresa ?? l.id}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSalvar(false)}
                style={{
                  padding: '7px 16px', borderRadius: 6,
                  border: '0.5px solid rgba(255,255,255,0.15)',
                  background: 'transparent', color: 'rgba(255,255,255,0.55)', fontSize: 12, cursor: 'pointer',
                }}
              >Cancelar</button>
              <button
                onClick={handleSalvarNoLead}
                disabled={!selectedLead || savingLead}
                style={{
                  padding: '7px 18px', borderRadius: 6, border: 'none',
                  background: selectedLead && !savingLead ? '#7c3aed' : 'rgba(124,58,237,0.3)',
                  color: selectedLead && !savingLead ? '#fff' : 'rgba(255,255,255,0.3)',
                  fontSize: 12, fontWeight: 600,
                  cursor: selectedLead && !savingLead ? 'pointer' : 'not-allowed',
                }}
              >{savingLead ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .render-progress-bar {
          animation: renderProg 1.8s ease-in-out infinite;
        }
        @keyframes renderProg {
          0%   { background-position: 0% 50%;   width: 20% }
          50%  { background-position: 100% 50%; width: 75% }
          100% { background-position: 0% 50%;   width: 20% }
        }
      `}</style>
    </div>
  )
}
