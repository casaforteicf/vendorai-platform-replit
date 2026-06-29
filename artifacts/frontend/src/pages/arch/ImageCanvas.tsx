import { useRef } from 'react'
import { AppliedMaterial } from './render-types'

interface Zone {
  name: string
  top: string
  left: string
  width: string
  height: string
}

const ZONES: Zone[] = [
  { name: 'Parede',        top: '0%',  left: '0%',  width: '60%',  height: '38%' },
  { name: 'Armários sup.', top: '10%', left: '0%',  width: '55%',  height: '28%' },
  { name: 'Bancada',       top: '53%', left: '0%',  width: '55%',  height: '6%'  },
  { name: 'Armários inf.', top: '58%', left: '0%',  width: '55%',  height: '22%' },
  { name: 'Piso',          top: '80%', left: '0%',  width: '100%', height: '20%' },
]

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface ImageCanvasProps {
  imageUrl: string
  applied: Record<string, AppliedMaterial>
  draggingMat: any
  onDrop: (zone: string) => void
  onLoadImage: (file: File) => void
}

export default function ImageCanvas({ imageUrl, applied, draggingMat, onDrop, onLoadImage }: ImageCanvasProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) onLoadImage(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onLoadImage(file)
  }

  function handleZoneDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleZoneDrop(e: React.DragEvent, zoneName: string) {
    e.preventDefault()
    e.stopPropagation()
    onDrop(zoneName)
  }

  if (!imageUrl) {
    return (
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={handleFileDrop}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          border: '1.5px dashed rgba(255,255,255,0.18)',
          borderRadius: 12,
          margin: 16,
          cursor: 'pointer',
          background: 'rgba(255,255,255,0.02)',
          transition: 'border-color 0.2s, background 0.2s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(139,92,246,0.5)'
          ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(139,92,246,0.04)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.18)'
          ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, margin: 0 }}>
            Arraste uma foto do ambiente
          </p>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, margin: '4px 0 0' }}>
            ou clique para selecionar
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </div>
    )
  }

  return (
    <div style={{
      flex: 1,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      margin: 8,
    }}>
      {/* Base image */}
      <img
        src={imageUrl}
        alt="Ambiente"
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          display: 'block',
          borderRadius: 8,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {/* Zone overlays — positioned relative to image container */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {ZONES.map(zone => {
            const mat = applied[zone.name]
            const isDraggingOver = !!draggingMat
            return (
              <div
                key={zone.name}
                data-zone={zone.name}
                onDragOver={(e) => e.preventDefault()}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(zone.name) }}
                style={{
                  position: 'absolute',
                  top: zone.top,
                  left: zone.left,
                  width: zone.width,
                  height: zone.height,
                  background: mat
                    ? hexToRgba(mat.color, 0.25)
                    : isDraggingOver
                      ? 'rgba(139,92,246,0.08)'
                      : 'transparent',
                  border: mat
                    ? `2px solid ${hexToRgba(mat.color, 0.7)}`
                    : isDraggingOver
                      ? '1.5px dashed rgba(139,92,246,0.5)'
                      : '1px dashed rgba(255,255,255,0.08)',
                  borderRadius: 3,
                  cursor: draggingMat ? 'copy' : 'default',
                  transition: 'background 0.2s, border 0.2s',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  padding: '3px 6px',
                  boxSizing: 'border-box',
                }}
              >
                {mat ? (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: '#fff',
                    background: 'rgba(0,0,0,0.6)',
                    borderRadius: 3,
                    padding: '1px 5px',
                    backdropFilter: 'blur(4px)',
                    letterSpacing: '0.03em',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}>
                    {zone.name} · {mat.name}
                  </span>
                ) : isDraggingOver ? (
                  <span style={{
                    fontSize: 9,
                    color: 'rgba(167,139,250,0.7)',
                    pointerEvents: 'none',
                  }}>
                    {zone.name}
                  </span>
                ) : null}
              </div>
            )
          })}

          {/* Blocked elements — pointer-events none, above zones */}
          {/* These overlay areas protect fixed elements (fogão, pia, janela) from material drops */}
          <div style={{ position: 'absolute', top: '40%', left: '28%', width: '18%', height: '20%', pointerEvents: 'none', zIndex: 20 }} />
          <div style={{ position: 'absolute', top: '42%', left: '48%', width: '8%',  height: '12%', pointerEvents: 'none', zIndex: 20 }} />
        </div>
      </div>
    </div>
  )
}
