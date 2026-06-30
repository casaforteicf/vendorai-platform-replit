import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useRenderState } from './useRenderState'
import MaterialBar from './MaterialBar'
import ImageCanvas from './ImageCanvas'
import ConfigBar from './ConfigBar'
import BottomBar from './BottomBar'
import SuggestionsCard from './SuggestionsCard'
import { MATERIALS, AppliedMaterial } from './render-types'
import type { UserMat } from './MaterialBar'

type CustomMat = UserMat

const STEPS = ['Imagem', 'Materiais', 'Config', 'Prompt', 'Render']

function getBase() { return (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') }
function getToken() { return localStorage.getItem('vendorai_token') ?? '' }

export default function RenderPage() {
  const rs = useRenderState()
  const { toast } = useToast()
  const [draggingMat, setDraggingMat] = useState<CustomMat | null>(null)
  const [ghostPos, setGhostPos] = useState({ x: -200, y: -200 })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [customMats, setCustomMats] = useState<CustomMat[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Keep refs so event listeners always see latest values without stale closures
  const draggingMatRef = useRef<CustomMat | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  draggingMatRef.current = draggingMat

  // Attach global mouse listeners only while dragging
  useEffect(() => {
    if (!draggingMat) return

    function onMove(e: MouseEvent) {
      setGhostPos({ x: e.clientX, y: e.clientY })
    }

    function onUp() {
      // Global mouseup = cleanup only; material application is handled by onMouseUpZone on each zone div
      setDraggingMat(null)
      setGhostPos({ x: -200, y: -200 })
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [draggingMat])

  function handleLoadImage(file: File) {
    setImageFile(file)
    rs.loadImage(file)
  }

  function applyDraggingToZone(zoneName: string) {
    const mat = draggingMatRef.current
    if (!mat) return
    rs.applyMaterial(zoneName, {
      zone: zoneName,
      name: mat.name,
      color: mat.c1,
      promptFragment: mat.prompt,
    } as AppliedMaterial)
    setDraggingMat(null)
    setGhostPos({ x: -200, y: -200 })
  }

  // Called directly by each zone div's onMouseUp — most reliable drop detection
  function onMouseUpZone(zoneName: string) {
    const mat = draggingMatRef.current
    if (!mat) return
    rs.applyMaterial(zoneName, {
      zone: zoneName,
      name: mat.name,
      color: mat.c1,
      promptFragment: mat.prompt,
    } as AppliedMaterial)
    setDraggingMat(null)
    setGhostPos({ x: -200, y: -200 })
  }

  function handleImport(file: File, name: string, color: string) {
    setCustomMats(prev => [...prev, {
      id: `user-${Date.now()}`,
      name: name.slice(0, 10),
      cat: 'usuario',
      c1: color,
      c2: color,
      prompt: 'texture from user image, photorealistic',
      imageUrl: URL.createObjectURL(file),
    }])
  }

  const doRender = async () => {
    try {
      rs.setLoading(true)
      rs.setStep(3)
      const res = await fetch(`${getBase()}/api/arch/render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          referenceImageUrl: rs.imageUrl || undefined,
          lighting:  rs.config.light,
          angle:     rs.config.angle,
          roomType:  'fachada externa',
          materials: Object.entries(rs.applied).map(([zone, mat]) => ({
            zone,
            materialName:   mat.name,
            promptFragment: mat.promptFragment,
          })),
          userNotes: rs.config.prompt || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as any).error ?? `Erro ${res.status}`)
      }
      const data = await res.json()
      rs.setRenderResult(data.imageUrl)
      rs.setStep(4)
    } catch (err: any) {
      console.error('Erro no render:', err)
      toast({ variant: 'destructive', description: err?.message ?? 'Erro ao gerar render. Tente novamente.' })
    } finally {
      rs.setLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: '36px 1fr 36px 110px 36px',
        height: '100vh',
        background: '#0a0814',
        overflow: 'hidden',
        userSelect: draggingMat ? 'none' : undefined,
        cursor: draggingMat ? 'grabbing' : 'default',
      }}
    >
      {/* Row 1 — Topbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 12px',
        background: '#0e0c1a',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#a78bfa',
          letterSpacing: '-0.02em',
          marginRight: 8,
          flexShrink: 0,
        }}>
          Vendor.ai
        </span>

        {/* Steps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden' }}>
          {STEPS.map((label, i) => {
            const num = i + 1
            const active = rs.step === num
            const done = rs.step > num
            return (
              <div
                key={num}
                style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '1px 7px 1px 5px',
                  borderRadius: 20,
                  background: active
                    ? 'rgba(139,92,246,0.2)'
                    : done
                      ? 'rgba(139,92,246,0.08)'
                      : 'transparent',
                  cursor: done ? 'pointer' : 'default',
                }}>
                  <span style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8,
                    fontWeight: 700,
                    background: active || done ? '#7c3aed' : 'rgba(255,255,255,0.1)',
                    color: active || done ? '#fff' : 'rgba(255,255,255,0.3)',
                    flexShrink: 0,
                  }}>
                    {done ? '✓' : num}
                  </span>
                  <span style={{
                    fontSize: 10,
                    color: active
                      ? '#a78bfa'
                      : done
                        ? 'rgba(139,92,246,0.7)'
                        : 'rgba(255,255,255,0.3)',
                    fontWeight: active ? 600 : 400,
                  }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10 }}>›</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'image/*'
              input.onchange = () => {
                if (input.files?.[0]) handleLoadImage(input.files[0])
              }
              input.click()
            }}
            style={topBtn}
          >
            Trocar imagem
          </button>
          <button style={topBtn} disabled>
            Salvar no Lead
          </button>
          <button
            onClick={() => setShowSuggestions(v => !v)}
            style={{
              ...topBtn,
              background: showSuggestions ? 'rgba(139,92,246,0.2)' : undefined,
              border: showSuggestions ? '0.5px solid rgba(139,92,246,0.45)' : undefined,
              color: showSuggestions ? '#a78bfa' : undefined,
            }}
          >
            ✨ Sugestões
          </button>
          {rs.renderResult && (
            <a
              href={rs.renderResult}
              download="render-hd.png"
              style={{
                ...topBtn,
                background: 'rgba(139,92,246,0.2)',
                border: '0.5px solid rgba(139,92,246,0.45)',
                color: '#a78bfa',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
              } as React.CSSProperties}
            >
              Baixar HD
            </a>
          )}
        </div>
      </div>

      {/* Suggestions floating panel */}
      {showSuggestions && (
        <div style={{
          position: 'fixed',
          bottom: 160,
          right: 16,
          zIndex: 100,
        }}>
          <SuggestionsCard referenceImageUrl={rs.imageUrl || undefined} />
        </div>
      )}

      {/* Row 2 — ImageCanvas */}
      <ImageCanvas
        imageUrl={rs.renderResult || rs.imageUrl}
        applied={rs.applied}
        draggingMat={draggingMat}
        onDrop={applyDraggingToZone}
        onMouseUpZone={onMouseUpZone}
        onLoadImage={handleLoadImage}
      />

      {/* Row 3 — ConfigBar */}
      <ConfigBar
        config={rs.config}
        onChange={partial => rs.setConfig(prev => ({ ...prev, ...partial }))}
      />

      {/* Row 4 — MaterialBar */}
      <MaterialBar
        applied={rs.applied}
        customMats={customMats}
        onDragStart={mat => {
          setDraggingMat(mat as CustomMat)
          setGhostPos({ x: -200, y: -200 })
        }}
        onImport={handleImport}
      />

      {/* Row 5 — BottomBar */}
      <BottomBar
        applied={rs.applied}
        renderResult={rs.renderResult}
        prompt={rs.config.prompt}
        onPromptChange={v => rs.setConfig(prev => ({ ...prev, prompt: v }))}
        onRender={doRender}
        loading={rs.loading}
        onRemove={rs.removeMaterial}
      />

      {/* Drag ghost */}
      {draggingMat && (
        <div
          ref={ghostRef}
          style={{
            position: 'fixed',
            left: ghostPos.x - 20,
            top: ghostPos.y - 17,
            width: 44,
            height: 38,
            background: `linear-gradient(135deg, ${draggingMat.c1}, ${draggingMat.c2})`,
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.3)',
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            transition: 'none',
          }}
        />
      )}
    </div>
  )
}

const topBtn: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 6,
  border: '0.5px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.6)',
  fontSize: 10,
  cursor: 'pointer',
  height: 22,
}
