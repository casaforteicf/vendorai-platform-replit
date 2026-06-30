import { RenderConfig, RenderMode, LightOption, AngleOption } from './render-types'

interface ConfigBarProps {
  config: RenderConfig
  onChange: (partial: Partial<RenderConfig>) => void
}

type ChipDef<T extends string> = { value: T; label: string }

const MODOS: ChipDef<RenderMode>[] = [
  { value: 'hd',   label: '🛡 Original HD' },
  { value: 'full', label: '✨ Render completo' },
  { value: 'chat', label: '💬 Chat' },
]

const LUZES: ChipDef<LightOption>[] = [
  { value: 'auto',    label: '🔄' },
  { value: 'manha',   label: '🌅 Manhã' },
  { value: 'tarde',   label: '☀️ Tarde' },
  { value: 'golden',  label: '🌇 Golden' },
  { value: 'noturno', label: '🌙 Noturno' },
]

const ANGULOS: ChipDef<AngleOption>[] = [
  { value: 'frontal',     label: 'Frontal' },
  { value: '45',          label: '45°' },
  { value: 'lateral_esq', label: 'Lat. Esq.' },
  { value: 'lateral_dir', label: 'Lat. Dir.' },
  { value: 'ampla',       label: 'Ampla' },
  { value: 'aerea',       label: 'Aérea' },
]

const BASE_CHIP: React.CSSProperties = {
  padding: '2px 9px',
  borderRadius: 20,
  border: '1px solid transparent',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  background: 'transparent',
  color: 'rgba(255,255,255,0.45)',
  transition: 'background 0.15s, color 0.15s',
  lineHeight: '20px',
}

function modoActive(active: boolean): React.CSSProperties {
  return active ? {
    background: 'rgba(0,220,220,0.15)',
    border: '1px solid rgba(0,220,220,0.35)',
    color: '#67e8f9',
  } : {}
}

function luzActive(active: boolean): React.CSSProperties {
  return active ? {
    background: 'rgba(250,210,0,0.15)',
    border: '1px solid rgba(250,210,0,0.35)',
    color: '#fde68a',
  } : {}
}

function anguloActive(active: boolean): React.CSSProperties {
  return active ? {
    background: 'rgba(139,92,246,0.18)',
    border: '1px solid rgba(139,92,246,0.45)',
    color: '#a78bfa',
  } : {}
}

const DIVIDER: React.CSSProperties = {
  borderRight: '0.5px solid rgba(255,255,255,0.1)',
  height: '100%',
  margin: '0 4px',
  flexShrink: 0,
}

export default function ConfigBar({ config, onChange }: ConfigBarProps) {
  return (
    <div style={{
      height: 36,
      background: '#0e0c1a',
      borderBottom: '0.5px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      gap: 2,
      overflowX: 'auto',
      overflowY: 'hidden',
      flexShrink: 0,
    }}>
      {/* Grupo Modo */}
      {MODOS.map(m => (
        <button
          key={m.value}
          onClick={() => onChange({ mode: m.value })}
          style={{ ...BASE_CHIP, ...modoActive(config.mode === m.value) }}
        >
          {m.label}
        </button>
      ))}

      <div style={DIVIDER} />

      {/* Grupo Luz */}
      {LUZES.map(l => (
        <button
          key={l.value}
          onClick={() => onChange({ light: l.value })}
          style={{ ...BASE_CHIP, ...luzActive(config.light === l.value) }}
        >
          {l.label}
        </button>
      ))}

      <div style={DIVIDER} />

      {/* Grupo Ângulo */}
      {ANGULOS.map(a => (
        <button
          key={a.value}
          onClick={() => onChange({ angle: a.value })}
          style={{ ...BASE_CHIP, ...anguloActive(config.angle === a.value) }}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}
