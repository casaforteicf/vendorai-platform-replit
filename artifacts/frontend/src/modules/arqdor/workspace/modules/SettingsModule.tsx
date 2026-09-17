import { useEffect, useState } from 'react'
import { ArqdorThemeSettingsPanel } from '../../theme/ArqdorThemeSettingsPanel'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('vendorai_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

interface ProjectConfig {
  id?: string
  style?: string
  lighting?: string
  resolution?: string
}

export function SettingsModule() {
  const [renderCfg, setRenderCfg] = useState<ProjectConfig>({})
  const [cfgLoading, setCfgLoading] = useState(true)
  const [cfgSaving, setCfgSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      setCfgLoading(true)
      try {
        const response = await fetch(`${BASE}/arch/project-config`, { headers: authHeaders() })
        if (!response.ok) return
        const rows = await response.json() as ProjectConfig[]
        if (!cancelled && rows.length > 0) {
          const config = rows[0]
          setRenderCfg({
            style: config.style ?? '',
            lighting: config.lighting ?? '',
            resolution: config.resolution ?? '',
          })
        }
      } finally {
        if (!cancelled) setCfgLoading(false)
      }
    }
    loadConfig()
    return () => { cancelled = true }
  }, [])

  async function saveRenderConfig() {
    setCfgSaving(true)
    setSaved(false)
    try {
      const response = await fetch(`${BASE}/arch/project-config`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          style: renderCfg.style || undefined,
          lighting: renderCfg.lighting || undefined,
          resolution: renderCfg.resolution || undefined,
        }),
      })
      if (!response.ok) throw new Error('Falha ao salvar configuração')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch {
      alert('Não foi possível salvar a configuração de render.')
    } finally {
      setCfgSaving(false)
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: T.bg, color: T.text }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>⚙️ Configurações do Arqdor</h2>
        <p style={{ margin: '5px 0 0', fontSize: 11, color: T.dim }}>
          Configurações reais do projeto e da interface.
        </p>
      </div>

      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <ArqdorThemeSettingsPanel />

        <section style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, background: T.card }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#fff' }}>Motor oficial de render</h3>
              <p style={{ margin: '5px 0 0', maxWidth: 720, fontSize: 11, lineHeight: 1.55, color: T.dim }}>
                O antigo registro local de plugins Mock foi removido desta tela. O Arqdor passa a usar somente o motor de render integrado da plataforma e suas configurações persistidas no servidor. Providers simulados não podem mais ser ativados pelo usuário.
              </p>
            </div>
            <span style={{ borderRadius: 999, padding: '4px 9px', fontSize: 10, fontWeight: 700, background: 'rgba(74,222,128,.1)', color: '#4ade80' }}>
              Produção
            </span>
          </div>
        </section>

        <section style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, background: T.card }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: '#fff' }}>Configuração de render</h3>
          {cfgLoading ? (
            <p style={{ fontSize: 11, color: T.dim }}>Carregando configuração real…</p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {([
                ['style', 'Estilo padrão', 'Ex: Contemporâneo Minimalista'],
                ['lighting', 'Iluminação padrão', 'Ex: Natural difusa 3000K'],
                ['resolution', 'Resolução', 'Ex: 1920x1080'],
              ] as const).map(([field, label, placeholder]) => (
                <label key={field} style={{ display: 'grid', gap: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.dim }}>{label}</span>
                  <input
                    value={renderCfg[field] ?? ''}
                    onChange={(event) => setRenderCfg((current) => ({ ...current, [field]: event.target.value }))}
                    placeholder={placeholder}
                    style={{ minHeight: 38, borderRadius: 7, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,.05)', color: T.text, padding: '8px 10px', outline: 'none' }}
                  />
                </label>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  disabled={cfgSaving}
                  onClick={saveRenderConfig}
                  style={{ minHeight: 38, border: 0, borderRadius: 7, padding: '8px 15px', background: T.purple, color: '#fff', fontWeight: 700, cursor: cfgSaving ? 'not-allowed' : 'pointer', opacity: cfgSaving ? .6 : 1 }}
                >
                  {cfgSaving ? 'Salvando…' : 'Salvar configuração'}
                </button>
                {saved && <span style={{ fontSize: 11, color: '#4ade80' }}>✓ Salvo no servidor</span>}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
