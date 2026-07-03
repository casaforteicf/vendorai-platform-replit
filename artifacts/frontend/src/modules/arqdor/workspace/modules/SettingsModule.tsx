import { useState } from 'react'
import { AVAILABLE_PLUGINS, PROVIDER_TYPE_LABELS, PROVIDER_TYPE_ICONS, buildRegistry } from '../../plugins/plugin-registry'
import type { PluginRegistration } from '../../shared/platform-types'

const T = {
  bg:'#0d0b1e', border:'rgba(255,255,255,0.08)', purple:'#7c3aed', purpleL:'#a78bfa',
  text:'rgba(255,255,255,0.88)', dim:'rgba(255,255,255,0.44)', card:'rgba(255,255,255,0.04)',
} as const

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

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean)=>void }) {
  return (
    <div onClick={()=>onChange(!on)} style={{
      width:36, height:20, borderRadius:10, cursor:'pointer', transition:'background 0.2s',
      background: on ? T.purple : 'rgba(255,255,255,0.12)',
      position:'relative', flexShrink:0,
    }}>
      <div style={{
        position:'absolute', top:3, left: on ? 19 : 3, width:14, height:14, borderRadius:'50%',
        background:'#fff', transition:'left 0.2s',
      }}/>
    </div>
  )
}

export function SettingsModule() {
  const [plugins, setPlugins] = useState<PluginRegistration[]>(AVAILABLE_PLUGINS)
  const [expandedPlugin, setExpandedPlugin] = useState<string|null>(null)

  const toggle = (id: string, enabled: boolean) => {
    setPlugins(prev => prev.map(p => p.id===id ? { ...p, enabled } : p))
  }

  const registry = buildRegistry(plugins)
  const activeCount = plugins.filter(p => p.enabled).length

  // Group by type
  const types = [...new Set(plugins.map(p => p.providerType))]

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      <div style={{ padding:'14px 20px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <h2 style={{ margin:'0 0 4px', fontSize:16, fontWeight:800, color:'#fff' }}>⚙️ Configurações de Providers</h2>
        <p style={{ margin:0, fontSize:11, color:T.dim }}>
          {activeCount} provider(s) ativo(s) de {plugins.length} disponíveis. Nenhum módulo depende diretamente de um provedor específico.
        </p>
      </div>

      <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px', display:'flex', flexDirection:'column' as const, gap:20 }}>
        {/* Registry status */}
        <div style={{ background:'rgba(124,58,237,0.07)', border:`1px solid rgba(124,58,237,0.2)`, borderRadius:10, padding:'14px 16px' }}>
          <p style={{ margin:'0 0 8px', fontSize:10, fontWeight:700, color:T.purpleL, letterSpacing:'0.06em' }}>📡 REGISTRY ATIVO</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {(Object.entries(registry) as [string, { name: string }|undefined][]).map(([k,v]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:10, color: v ? '#4ade80' : T.dim }}>{ v ? '●' : '○' }</span>
                <span style={{ fontSize:10, color: v ? T.text : T.dim }}>{ v ? v.name : `(sem ${k})` }</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plugin groups */}
        {types.map(type => {
          const typePlugins = plugins.filter(p => p.providerType===type)
          return (
            <div key={type}>
              <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>
                {PROVIDER_TYPE_ICONS[type]} {PROVIDER_TYPE_LABELS[type].toUpperCase()}
              </p>
              <div style={{ display:'flex', flexDirection:'column' as const, gap:8 }}>
                {typePlugins.map(p => (
                  <div key={p.id} style={{
                    borderRadius:10, border:`1px solid ${p.enabled ? 'rgba(124,58,237,0.25)' : T.border}`,
                    background: p.enabled ? 'rgba(124,58,237,0.05)' : T.card, overflow:'hidden',
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px' }}>
                      <div style={{ width:36, height:36, borderRadius:8, background:`rgba(${p.enabled?'124,58,237':'255,255,255'},0.1)`,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                        {PROVIDER_TYPE_ICONS[p.providerType]}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#fff' }}>{p.name}</p>
                          <span style={{ fontSize:9, padding:'1px 6px', borderRadius:6, border:`1px solid ${T.border}`, color:T.dim }}>v{p.version}</span>
                          {p.id.startsWith('mock') && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:6, background:'rgba(245,158,11,0.1)', color:'#fbbf24' }}>dev only</span>}
                        </div>
                        <p style={{ margin:'2px 0 0', fontSize:10, color:T.dim }}>{PROVIDER_DESCRIPTIONS[p.id] ?? '—'}</p>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        {!p.enabled && !p.id.startsWith('mock') && (
                          <button style={{ padding:'4px 10px', borderRadius:6, border:`1px solid rgba(124,58,237,0.4)`, background:'transparent', color:T.purpleL, fontSize:10, cursor:'pointer' }}>
                            Conectar
                          </button>
                        )}
                        <ToggleSwitch on={p.enabled} onChange={v => toggle(p.id, v)}/>
                      </div>
                    </div>
                    {/* Config fields for non-mock enabled */}
                    {expandedPlugin===p.id && !p.id.startsWith('mock') && (
                      <div style={{ padding:'0 16px 14px', borderTop:`1px solid rgba(255,255,255,0.05)` }}>
                        {Object.keys(p.config).map(k => (
                          <div key={k} style={{ marginTop:10 }}>
                            <label style={{ fontSize:10, color:T.dim, display:'block', marginBottom:4 }}>{k}</label>
                            <input type={k.toLowerCase().includes('key')||k.toLowerCase().includes('token')?'password':'text'}
                              placeholder={`${k}…`}
                              style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`,
                                borderRadius:6, color:T.text, fontSize:11, padding:'6px 10px', outline:'none', boxSizing:'border-box' as const }}
                            />
                          </div>
                        ))}
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
