import { useState } from 'react'
import { useRenderState } from './useRenderState'
import MaterialBar from './MaterialBar'
import ImageCanvas from './ImageCanvas'
import ConfigBar from './ConfigBar'
import BottomBar from './BottomBar'
import { MATERIALS, AppliedMaterial } from './render-types'

type CustomMat = typeof MATERIALS[number]

const STEPS = ['Imagem', 'Materiais', 'Config', 'Prompt', 'Render']

export default function RenderPage() {
  const rs = useRenderState()
  const [draggingMat, setDraggingMat] = useState<CustomMat | null>(null)
  const [ghostPos, setGhostPos] = useState({ x: -200, y: -200 })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [customMats, setCustomMats] = useState<CustomMat[]>([])

  function handleLoadImage(file: File) {
    setImageFile(file)
    rs.loadImage(file)
  }

  function applyDraggingToZone(zoneName: string) {
    if (!draggingMat) return
    rs.applyMaterial(zoneName, {
      zone: zoneName,
      name: draggingMat.name,
      color: draggingMat.c1,
      promptFragment: draggingMat.prompt,
    } as AppliedMaterial)
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!draggingMat) return
    setGhostPos({ x: e.clientX, y: e.clientY })
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (!draggingMat) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const zoneEl = el?.closest('[data-zone]') as HTMLElement | null
    if (zoneEl?.dataset.zone) {
      applyDraggingToZone(zoneEl.dataset.zone)
    }
    setDraggingMat(null)
    setGhostPos({ x: -200, y: -200 })
  }

  function handleImport(file: File, name: string, color: string) {
    setCustomMats(prev => [...prev, {
      id: `custom-${Date.now()}`,
      name,
      cat: 'custom',
      c1: color,
      c2: color,
      prompt: `${name} texture, photorealistic`,
    }])
  }

  async function doRender() {
    if (!imageFile || rs.loading) return
    rs.setLoading(true)
    try {
      const matDesc = Object.values(rs.applied)
        .map(m => `${m.zone}: ${m.promptFragment}`)
        .join('; ')
      const notes = rs.config.prompt || matDesc

      const form = new FormData()
      form.append('image', imageFile)
      form.append('style', 'realistic')
      form.append('angle', rs.config.angle)
      form.append('lighting', rs.config.light)
      form.append('notes', notes)

      const res = await fetch('/api/render/quick', { method: 'POST', body: form })
      const data = await res.json()
      if (data.imageUrl) {
        rs.setRenderResult(data.imageUrl)
        rs.setStep(5)
      }
    } catch {
      // silently ignore — UI feedback TBD
    } finally {
      rs.setLoading(false)
    }
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
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

      {/* Row 2 — ImageCanvas */}
      <ImageCanvas
        imageUrl={rs.renderResult || rs.imageUrl}
        applied={rs.applied}
        draggingMat={draggingMat}
        onDrop={applyDraggingToZone}
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
          style={{
            position: 'fixed',
            left: ghostPos.x - 20,
            top: ghostPos.y - 17,
            width: 40,
            height: 34,
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
