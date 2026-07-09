import { useState, useEffect } from 'react'
import { AVAILABLE_PLUGINS, PROVIDER_TYPE_LABELS, PROVIDER_TYPE_ICONS, buildRegistry } from '../../plugins/plugin-registry'
import type { PluginRegistration } from '../../shared/platform-types'
import { T } from '../../shared/arqdor-theme'
import { ArqdorThemeSettingsPanel } from '../../theme/ArqdorThemeSettingsPanel'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

const STORAGE_KEY = 'arqdor_plugin_states'
const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  'mock-image-analysis':       'Motor de análise de imagem local. Não requer conexão.',
  'mock-prompt':               'Gerador de prompts baseado nos motores de domínio. Não requer conexão.',
  'mock-render':               'Motor de renderização simulado para desenvolvimento.',
  'mock-material-recognition': 'Reconhecimento de materiais simulado para desenvolvimento.',
  'mock-style-recognition':    'Reconhecimento de estilo simulado para desenvolvimento.',
  'nano-banana-render':        'Renderização via Nano Banana. Requer chave de API e endpoint.',
  'openai-images':             'Geração de imagens via OpenAI gpt-image-1. Requer chave de API.',
  'flux-render':               'Renderização via Flux no Replicate. Requer API Token.',
  'gemini-vision':             'Análise de imagens via Google Gemini Vision. Requer chave de API.',
  'krea-ai':                   'Renderização e refinamento via Krea AI.',
  'd5-ai':                     'Renderização arquitetônica via D5 AI Render.',
}

function loadSavedStates(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!on)} style={{
      width: 36, height: 20, borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s',
      background: on ? T.purple : 'rgba(255,255,255,0.12)',
      position: 'relative', flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: 3, left: on ? 19 : 3, width: 14, height: 14, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
      }}/>
    </div>
  )
}

interface ProjectConfig {
  id?:          string
  style?:       string
  lighting?:    string
  materials?:   string[]
  resolution?:  string
}

export function SettingsModule() {
  const savedStates    = loadSavedStates()
  const initialPlugins = AVAILABLE_PLUGINS.map(p => ({ ...p, enabled: savedStates[p.id] ?? p.enabled }))

  const [plugins,        setPlugins]        = useState<PluginRegistration[]>(initialPlugins)
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)
  const [savedMsg,       setSavedMsg]       = useState(false)

  // Render config state (persisted via /arch/project-config)
  const [renderCfg,    setRenderCfg]    = useState<ProjectConfig>({})
  const [cfgLoading,   setCfgLoading]   = useState(true)
  const [cfgSaving,    setCfgSaving]    = useState(false)

  useEffect(() => {
    async function loadConfig() {
      setCfgLoading(true)
      try {
        const res = await fetch(`${BASE}/arch/project-config`, { headers: authHeaders() })
        if (res.ok) {
          const data: ProjectConfig[] = await res.json()
          if (data.length > 0) {
            const cfg = data[0]
            setRenderCfg({ style: cfg.style ?? '', lighting: cfg.lighting ?? '', resolution: cfg.resolution ?? '' })
          }
        }
      } catch {
        /* silently ignore */
      } finally {
        setCfgLoading(false)
      }
    }
    loadConfig()
  }, [])

  const toggle = (id: string, enabled: boolean) => {
    const next = plugins.map(p => p.id === id ? { ...p, enabled } : p)
    setPlugins(next)
    const states: Record<string, boolean> = {}
    next.forEach(p => { states[p.id] = p.enabled })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states))
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2000)
  }

  const saveRenderConfig = async () => {
    setCfgSaving(true)
    try {
      await fetch(`${BASE}/arch/project-config`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style:      renderCfg.style || undefined,
          lighting:   renderCfg.lighting || undefined,
          resolution: renderCfg.resolution || undefined,
        }),
      })
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2500)
    } catch {
      alert('Erro ao salvar configuração de render')
    } finally {
      setCfgSaving(false)
    }
  }

  const registry    = buildRegistry(plugins)
  const activeCount = plugins.filter(p => p.enabled).length
  const types       = [...new Set(plugins.map(p => p.providerType))]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' as const, background: T.bg }}>
      <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#fff' }}>⚙️ Configurações</h2>
          <p style={{ margin: 0, fontSize: 11, color: T.dim }}>
            {activeCount} provider(s) ativo(s). Estados salvos localmente.
          </p>
        </div>
        {savedMsg && (
          <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, background: 'rgba(74,222,128,0.1)', color: '#4ade80', fontWeight: 700 }}>
            ✓ Salvo
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' as const, padding: '16px 20px', display: 'flex', flexDirection: 'column' as const, gap: 20 }}>

        {/* Aparência — tema claro/escuro/automático */}
        <ArqdorThemeSettingsPanel />

        {/* Render config (backend-persisted) */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '0.06em' }}>🎬 CONFIGURAÇÃO DE RENDER (persistida no servidor)</p>
          {cfgLoading ? (
            <p style={{ fontSize:11, color:T.dim }}>Carregando…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {([
                  { field: 'style' as const,      label: 'Estilo padrão',    placeholder: 'Ex: Contemporâneo Minimalista' },
                  { field: 'lighting' as const,   label: 'Iluminação padrão', placeholder: 'Ex: Natural difusa 3000K' },
                  { field: 'resolution' as const, label: 'Resolução',        placeholder: 'Ex: 1920x1080' },
                ] as const).map(({ field, label, placeholder }) => (
                  <div key={field}>
                    <label style={{ fontSize: 9, color: T.dim, fontWeight: 700, display: 'block', marginBottom: 4, letterSpacing: '0.06em' }}>{label}</label>
                    <input
                      value={(renderCfg[field] as string) ?? ''}
                      onChange={e => setRenderCfg(c => ({ ...c, [field]: e.target.value }))}
                      placeholder={placeholder}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 11, padding: '6px 10px', outline: 'none', boxSizing: 'border-box' as const }}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={saveRenderConfig}
                disabled={cfgSaving}
                style={{ alignSelf: 'flex-start', padding: '6px 16px', borderRadius: 6, border: 'none', background: T.purple, color: '#fff', cursor: cfgSaving ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700 }}
              >
                {cfgSaving ? 'Salvando…' : '💾 Salvar no servidor'}
              </button>
            </div>
          )}
        </div>

        {/* Registry status */}
        <div style={{ background: 'rgba(124,58,237,0.07)', border: `1px solid rgba(124,58,237,0.2)`, borderRadius: 10, padding: '14px 16px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: T.purpleL, letterSpacing: '0.06em' }}>📡 REGISTRY ATIVO</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {(Object.entries(registry) as [string, { name: string } | undefined][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: v ? '#4ade80' : T.dim }}>{v ? '●' : '○'}</span>
                <span style={{ fontSize: 10, color: v ? T.text : T.dim }}>{v ? v.name : `(sem ${k})`}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plugin groups */}
        {types.map(type => {
          const typePlugins = plugins.filter(p => p.providerType === type)
          return (
            <div key={type}>
              <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: T.dim, letterSpacing: '0.06em' }}>
                {PROVIDER_TYPE_ICONS[type]} {PROVIDER_TYPE_LABELS[type].toUpperCase()}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {typePlugins.map(p => (
                  <div key={p.id} style={{
                    borderRadius: 10, border: `1px solid ${p.enabled ? 'rgba(124,58,237,0.25)' : T.border}`,
                    background: p.enabled ? 'rgba(124,58,237,0.05)' : T.card, overflow: 'hidden',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: `rgba(${p.enabled ? '124,58,237' : '255,255,255'},0.1)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                        {PROVIDER_TYPE_ICONS[p.providerType]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#fff' }}>{p.name}</p>
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, border: `1px solid ${T.border}`, color: T.dim }}>v{p.version}</span>
                          {p.id.startsWith('mock') && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>dev only</span>}
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 10, color: T.dim }}>{PROVIDER_DESCRIPTIONS[p.id] ?? '—'}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {!p.enabled && !p.id.startsWith('mock') && (
                          <button
                            onClick={() => setExpandedPlugin(expandedPlugin === p.id ? null : p.id)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid rgba(124,58,237,0.4)`, background: 'transparent', color: T.purpleL, fontSize: 10, cursor: 'pointer' }}
                          >
                            Configurar
                          </button>
                        )}
                        <ToggleSwitch on={p.enabled} onChange={v => toggle(p.id, v)}/>
                      </div>
                    </div>
                    {expandedPlugin === p.id && !p.id.startsWith('mock') && (
                      <div style={{ padding: '0 16px 14px', borderTop: `1px solid rgba(255,255,255,0.05)` }}>
                        {Object.keys(p.config).map(k => (
                          <div key={k} style={{ marginTop: 10 }}>
                            <label style={{ fontSize: 10, color: T.dim, display: 'block', marginBottom: 4 }}>{k}</label>
                            <input
                              type={k.toLowerCase().includes('key') || k.toLowerCase().includes('token') ? 'password' : 'text'}
                              placeholder={`${k}…`}
                              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 11, padding: '6px 10px', outline: 'none', boxSizing: 'border-box' as const }}
                            />
                          </div>
                        ))}
                        <button
                          onClick={() => setExpandedPlugin(null)}
                          style={{ marginTop: 10, padding: '5px 12px', borderRadius: 6, border: 'none', background: T.purple, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                        >
                          Salvar configuração
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
