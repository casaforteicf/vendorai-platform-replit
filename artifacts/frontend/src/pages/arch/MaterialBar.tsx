import { useRef, useState } from 'react'
import { MATERIALS } from './render-types'

type Mat = typeof MATERIALS[number]

const CATS = [
  { key: 'todos',    label: 'Todos' },
  { key: 'madeira',  label: 'Madeira' },
  { key: 'mdf',      label: 'MDF' },
  { key: 'pedra',    label: 'Pedra' },
  { key: 'ferro',    label: 'Ferro' },
  { key: 'ceramica', label: 'Cerâmica' },
  { key: 'concreto', label: 'Concreto' },
]

interface MaterialBarProps {
  applied: Record<string, any>
  onDragStart: (mat: Mat) => void
  onImport: (file: File, name: string, color: string) => void
}

async function readAvgColor(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      URL.revokeObjectURL(url)
      resolve(`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('#888888') }
    img.src = url
  })
}

export default function MaterialBar({ applied, onDragStart, onImport }: MaterialBarProps) {
  const [cat, setCat] = useState('todos')
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = cat === 'todos' ? MATERIALS : MATERIALS.filter(m => m.cat === cat)

  async function handleFiles(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      const color = await readAvgColor(file)
      onImport(file, file.name.replace(/\.[^.]+$/, ''), color)
    }
  }

  return (
    <div style={{
      height: 110,
      background: '#0e0c1a',
      borderTop: '0.5px solid rgba(255,255,255,0.12)',
      display: 'flex',
      flexDirection: 'column',
      padding: '6px 12px 4px',
      gap: 6,
      flexShrink: 0,
    }}>
      {/* Row 1 — label + category chips + import */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          Materiais
        </span>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: 1 }}>
          {CATS.map(c => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              style={{
                padding: '2px 8px',
                borderRadius: 20,
                border: 'none',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                background: cat === c.key ? 'rgba(139,92,246,0.85)' : 'rgba(255,255,255,0.08)',
                color: cat === c.key ? '#fff' : 'rgba(255,255,255,0.55)',
                transition: 'background 0.15s',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            padding: '3px 10px',
            borderRadius: 6,
            border: '0.5px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 10,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Importar
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {/* Row 2 — material cards */}
      <div style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        overflowY: 'hidden',
        flex: 1,
        alignItems: 'center',
        paddingBottom: 2,
      }}>
        {filtered.map(mat => {
          const isApplied = Object.values(applied).some((a: any) => a?.id === mat.id)
          return (
            <div
              key={mat.id}
              draggable
              onDragStart={() => onDragStart(mat)}
              onMouseDown={() => onDragStart(mat)}
              title={mat.name}
              style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              <div style={{
                width: 44,
                height: 38,
                borderRadius: 6,
                background: `linear-gradient(135deg, ${mat.c1}, ${mat.c2})`,
                border: isApplied
                  ? '1.5px solid rgba(139,92,246,0.9)'
                  : '1px solid rgba(255,255,255,0.15)',
                boxShadow: isApplied ? '0 0 6px rgba(139,92,246,0.5)' : 'none',
                transition: 'border 0.15s, box-shadow 0.15s',
              }} />
              <span style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.55)',
                maxWidth: 44,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {mat.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
