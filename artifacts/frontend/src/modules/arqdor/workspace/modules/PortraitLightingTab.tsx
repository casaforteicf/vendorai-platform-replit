import { useEffect, useMemo, useState } from 'react'
import {
  MediaAssetPicker,
  mediaAssetUrl,
  type MediaPickerAsset,
} from '../../../../components/media/MediaAssetPicker'
import { T } from '../../shared/arqdor-theme'
import {
  DEFAULT_PORTRAIT_LIGHTING_CONFIG,
  PORTRAIT_PRESETS,
  buildPortraitPrompt,
  type PortraitContrast,
  type PortraitFinish,
  type PortraitKeySide,
  type PortraitLightingConfig,
  type PortraitRimStrength,
  type PortraitSaturation,
  type PortraitShadowEdge,
} from './portrait-prompt'

const USER_CACHE_KEY = 'vendorai_user_cache'
const OVERRIDE_KEY = 'vendorai_sa_tenant_override'
const CONFIG_STORAGE_KEY = 'vendorai_prompt_hub_portrait_config_v1'

type CachedUser = { tenantId?: string | null }
type CachedOverride = { id?: string | null }

function currentTenantId(): string {
  try {
    const overrideRaw = localStorage.getItem(OVERRIDE_KEY)
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw) as CachedOverride
      if (override?.id) return override.id
    }
  } catch {
    // Ignora override inválido e tenta o usuário normal.
  }
  try {
    const userRaw = localStorage.getItem(USER_CACHE_KEY)
    if (!userRaw) return ''
    const user = JSON.parse(userRaw) as CachedUser
    return user?.tenantId ?? ''
  } catch {
    return ''
  }
}

function readConfig(): PortraitLightingConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return DEFAULT_PORTRAIT_LIGHTING_CONFIG
    return { ...DEFAULT_PORTRAIT_LIGHTING_CONFIG, ...(JSON.parse(raw) as Partial<PortraitLightingConfig>) }
  } catch {
    return DEFAULT_PORTRAIT_LIGHTING_CONFIG
  }
}

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${localStorage.getItem('vendorai_token') ?? ''}`,
  }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

const cardStyle = {
  borderRadius: 12,
  border: `1px solid ${T.border}`,
  background: 'rgba(255,255,255,0.025)',
  padding: 14,
} as const

const labelStyle = {
  margin: '0 0 6px',
  fontSize: 9,
  color: T.dim,
  fontWeight: 800,
  letterSpacing: '0.07em',
} as const

function Toggle({ checked, label, description, onChange }: {
  checked: boolean
  label: string
  description: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
        border: checked ? '1px solid rgba(124,58,237,0.45)' : `1px solid ${T.border}`,
        background: checked ? 'rgba(124,58,237,0.10)' : 'rgba(255,255,255,0.02)',
        color: T.text,
      }}>
      <span style={{
        width: 30, height: 17, padding: 2, borderRadius: 20, flexShrink: 0,
        background: checked ? T.purple : 'rgba(255,255,255,0.12)',
        display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start', alignItems: 'center',
      }}>
        <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#fff' }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: 11, color: checked ? '#fff' : T.text }}>{label}</strong>
        <span style={{ display: 'block', marginTop: 2, fontSize: 9, color: T.dim, lineHeight: 1.4 }}>{description}</span>
      </span>
    </button>
  )
}

function SegmentButton<T extends string>({ value, current, label, onChange }: {
  value: T
  current: T
  label: string
  onChange: (value: T) => void
}) {
  const active = value === current
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      style={{
        flex: 1, minWidth: 72, padding: '7px 9px', borderRadius: 7, cursor: 'pointer',
        border: active ? '1px solid rgba(124,58,237,0.55)' : `1px solid ${T.border}`,
        background: active ? 'rgba(124,58,237,0.14)' : 'rgba(255,255,255,0.025)',
        color: active ? '#c4b5fd' : T.dim,
        fontSize: 10, fontWeight: active ? 800 : 500,
      }}>
      {label}
    </button>
  )
}

function LightingDiagram({ config }: { config: PortraitLightingConfig }) {
  const keyRight = config.keySide === 'right'
  const rimVisible = config.rimStrength !== 'off'
  return (
    <div style={{ ...cardStyle, minHeight: 205, display: 'flex', flexDirection: 'column' }}>
      <p style={labelStyle}>MAPA DE LUZ</p>
      <p style={{ margin: '0 0 12px', fontSize: 10, color: T.dim }}>
        Prévia esquemática da direção das luzes. A imagem final é gerada pela IA.
      </p>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 140px 1fr', alignItems: 'center', gap: 8 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, opacity: keyRight ? 0.45 : 1 }}>{keyRight ? '↠' : '☀ →'}</div>
          <p style={{ margin: '4px 0 0', fontSize: 9, color: keyRight ? T.dim : '#fbbf24' }}>
            {keyRight ? (rimVisible ? 'Rim / recorte' : 'Sombra') : 'Luz principal'}
          </p>
        </div>
        <div style={{ position: 'relative', height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 96, height: 118, borderRadius: '48% 48% 42% 42%',
            border: '1px solid rgba(255,255,255,0.18)', position: 'relative', overflow: 'hidden',
            boxShadow: rimVisible ? `0 0 0 1px rgba(196,181,253,0.18)` : 'none',
            background: keyRight
              ? 'linear-gradient(90deg, rgba(8,8,18,.96) 0 47%, rgba(255,235,198,.82) 58% 100%)'
              : 'linear-gradient(90deg, rgba(255,235,198,.82) 0 42%, rgba(8,8,18,.96) 53% 100%)',
          }}>
            <span style={{ position: 'absolute', top: 43, left: 29, width: 7, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,.65)' }} />
            <span style={{ position: 'absolute', top: 43, right: 29, width: 7, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,.65)' }} />
            <span style={{ position: 'absolute', top: 66, left: 44, width: 9, height: 18, borderBottom: '1px solid rgba(255,255,255,.35)' }} />
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, opacity: keyRight ? 1 : 0.45 }}>{keyRight ? '← ☀' : '↞'}</div>
          <p style={{ margin: '4px 0 0', fontSize: 9, color: keyRight ? '#fbbf24' : T.dim }}>
            {keyRight ? 'Luz principal' : (rimVisible ? 'Rim / recorte' : 'Sombra')}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: '#fbbf24' }}>Principal {config.keyIntensity}%</span>
        <span style={{ fontSize: 9, color: T.dim }}>•</span>
        <span style={{ fontSize: 9, color: '#c4b5fd' }}>Rim {config.rimStrength}</span>
        <span style={{ fontSize: 9, color: T.dim }}>•</span>
        <span style={{ fontSize: 9, color: T.dim }}>Contraste {config.contrast}</span>
      </div>
    </div>
  )
}

export function PortraitLightingTab() {
  const tenantId = currentTenantId()
  const [config, setConfig] = useState<PortraitLightingConfig>(() => readConfig())
  const [activePreset, setActivePreset] = useState('cinematic-indigo')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<MediaPickerAsset | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationLabel, setGenerationLabel] = useState('')
  const [error, setError] = useState('')
  const [generatedUrls, setGeneratedUrls] = useState<string[]>([])
  const [librarySaved, setLibrarySaved] = useState(0)

  const prompt = useMemo(() => buildPortraitPrompt(config), [config])

  useEffect(() => {
    try { localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config)) } catch { /* sem bloqueio */ }
  }, [config])

  const patch = <K extends keyof PortraitLightingConfig>(key: K, value: PortraitLightingConfig[K]) => {
    setConfig(current => ({ ...current, [key]: value }))
    setActivePreset('custom')
  }

  const applyPreset = (id: string) => {
    const preset = PORTRAIT_PRESETS.find(item => item.id === id)
    if (!preset) return
    setConfig({ ...preset.config })
    setActivePreset(id)
    setGeneratedUrls([])
    setLibrarySaved(0)
    setError('')
  }

  const copyPrompt = () => {
    void navigator.clipboard.writeText(prompt)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const registerGeneratedAsset = async (imageUrl: string, index: number) => {
    const response = await fetch(`/api/tenants/${tenantId}/media/assets`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({
        type: 'image',
        role: 'output',
        source: 'generated',
        storageUrl: imageUrl,
        originalFilename: `portrait-lighting-${Date.now()}-${index + 1}.png`,
        mimeType: 'image/png',
        metadata: {
          sourceModule: 'prompt_hub_portrait',
          referenceAssetId: selectedAsset?.id ?? null,
          presetId: activePreset,
          prompt,
          lighting: config,
        },
      }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error ?? 'Falha ao salvar a imagem gerada na Biblioteca')
    }
  }

  const generate = async (count: 1 | 4) => {
    if (!tenantId) {
      setError('Não foi possível identificar o tenant atual. Recarregue a sessão e tente novamente.')
      return
    }
    if (!selectedAsset) {
      setError('Selecione primeiro uma foto da Biblioteca de Mídias para usar como referência de identidade.')
      return
    }

    setGenerating(true)
    setError('')
    setGeneratedUrls([])
    setLibrarySaved(0)
    setGenerationLabel('Preparando referência e prompt...')

    try {
      const referenceImageUrl = mediaAssetUrl(selectedAsset.storageUrl)
      const baseResponse = await fetch(`/api/tenants/${tenantId}/content/generate`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          type: 'feed',
          theme: prompt,
          variations: 1,
          imageCount: 1,
          imageUrls: [referenceImageUrl],
          contentFormat: 'feed_square',
          aspectRatio: '1:1',
        }),
      })
      const baseBody = await baseResponse.json().catch(() => ({})) as { id?: string | null; error?: string }
      if (!baseResponse.ok || !baseBody.id) {
        throw new Error(baseBody.error ?? 'Não foi possível preparar a geração do retrato.')
      }

      const urls: string[] = []
      for (let index = 0; index < count; index += 1) {
        setGenerationLabel(count === 1 ? 'Reconstruindo a iluminação...' : `Gerando variação ${index + 1} de ${count}...`)
        const editResponse = await fetch(`/api/tenants/${tenantId}/content/${baseBody.id}/variations/0/generate-image`, {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({ referenceImageUrl }),
        })
        const editBody = await editResponse.json().catch(() => ({})) as { imageUrl?: string; error?: string }
        if (!editResponse.ok || !editBody.imageUrl) {
          throw new Error(editBody.error ?? `Falha ao gerar a variação ${index + 1}.`)
        }
        urls.push(editBody.imageUrl)
        setGeneratedUrls([...urls])
      }

      setGenerationLabel('Salvando na Biblioteca de Mídias...')
      let saved = 0
      for (let index = 0; index < urls.length; index += 1) {
        try {
          await registerGeneratedAsset(urls[index]!, index)
          saved += 1
          setLibrarySaved(saved)
        } catch {
          // A geração continua disponível mesmo se o registro na biblioteca falhar.
        }
      }

      if (saved < urls.length) {
        setError(`${urls.length} imagem(ns) gerada(s), mas ${urls.length - saved} não puderam ser registradas na Biblioteca de Mídias.`)
      }
      setGenerationLabel('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha inesperada ao gerar o retrato.')
      setGenerationLabel('')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 20px 24px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#fff', fontWeight: 850 }}>💡 Retrato / Iluminação IA</p>
            <p style={{ margin: '5px 0 0', fontSize: 10, color: T.dim, lineHeight: 1.55 }}>
              Use uma foto real somente como referência de identidade. A iluminação, o contraste e o fundo são reconstruídos pelo gerador.
            </p>
          </div>
          <span style={{ padding: '4px 9px', borderRadius: 99, fontSize: 9, color: '#a7f3d0', background: 'rgba(16,185,129,.10)', border: '1px solid rgba(16,185,129,.25)' }}>
            Biblioteca integrada
          </span>
          <span style={{ padding: '4px 9px', borderRadius: 99, fontSize: 9, color: '#fde68a', background: 'rgba(245,158,11,.10)', border: '1px solid rgba(245,158,11,.25)' }}>
            Usa 1 geração do plano por sessão
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={cardStyle}>
              <p style={labelStyle}>1. FOTO DE REFERÊNCIA</p>
              {selectedAsset ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <img
                    src={mediaAssetUrl(selectedAsset.storageUrl)}
                    alt={selectedAsset.originalFilename || 'Foto selecionada'}
                    style={{ width: 92, height: 92, borderRadius: 10, objectFit: 'cover', border: `1px solid ${T.border}` }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 11, color: '#fff', fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedAsset.originalFilename || 'Imagem da Biblioteca'}
                    </p>
                    <p style={{ margin: '4px 0 10px', fontSize: 9, color: T.dim }}>Usada como identidade e proporções faciais.</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setPickerOpen(true)} style={{ padding: '5px 9px', borderRadius: 6, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,.04)', color: T.text, cursor: 'pointer', fontSize: 9 }}>Trocar foto</button>
                      <button type="button" onClick={() => { setSelectedAsset(null); setGeneratedUrls([]); setLibrarySaved(0) }} style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid rgba(248,113,113,.25)', background: 'rgba(248,113,113,.05)', color: '#fca5a5', cursor: 'pointer', fontSize: 9 }}>Remover</button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  style={{
                    width: '100%', padding: '18px 12px', borderRadius: 10, cursor: 'pointer',
                    border: '1px dashed rgba(167,139,250,.45)', background: 'rgba(124,58,237,.07)',
                    color: '#c4b5fd', fontSize: 11, fontWeight: 700,
                  }}>
                  🖼️ Selecionar da Biblioteca de Mídias
                </button>
              )}
            </div>

            <div style={cardStyle}>
              <p style={labelStyle}>2. PRESETS</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 7 }}>
                {PORTRAIT_PRESETS.map(preset => {
                  const active = activePreset === preset.id
                  return (
                    <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} style={{
                      padding: 10, borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                      border: active ? '1px solid rgba(124,58,237,.65)' : `1px solid ${T.border}`,
                      background: active ? 'rgba(124,58,237,.14)' : 'rgba(255,255,255,.025)', color: T.text,
                    }}>
                      <strong style={{ display: 'block', fontSize: 10, color: active ? '#c4b5fd' : '#fff' }}>{preset.name}</strong>
                      <span style={{ display: 'block', marginTop: 4, fontSize: 8, lineHeight: 1.4, color: T.dim }}>{preset.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={cardStyle}>
              <p style={labelStyle}>3. PRESERVAÇÃO</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Toggle checked={config.preserveIdentity} label="Manter identidade" description="Preserva geometria e características reconhecíveis do rosto." onChange={value => patch('preserveIdentity', value)} />
                <Toggle checked={config.preserveHair} label="Manter cabelo" description="Preserva linha, volume e características do cabelo." onChange={value => patch('preserveHair', value)} />
                <Toggle checked={config.ignoreOriginalLighting} label="Ignorar iluminação original" description="Reconstrói direção, exposição, sombras e highlights do zero." onChange={value => patch('ignoreOriginalLighting', value)} />
              </div>
            </div>

            <div style={cardStyle}>
              <p style={labelStyle}>4. ILUMINAÇÃO</p>
              <p style={{ margin: '0 0 5px', fontSize: 9, color: T.dim }}>Luz principal</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 11 }}>
                <SegmentButton<PortraitKeySide> value="right" current={config.keySide} label="Direita" onChange={value => patch('keySide', value)} />
                <SegmentButton<PortraitKeySide> value="left" current={config.keySide} label="Esquerda" onChange={value => patch('keySide', value)} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <input type="range" min={35} max={100} value={config.keyIntensity} onChange={event => patch('keyIntensity', Number(event.target.value))} style={{ flex: 1 }} />
                <span style={{ minWidth: 38, fontSize: 10, color: '#fbbf24', fontWeight: 800 }}>{config.keyIntensity}%</span>
              </div>

              <p style={{ margin: '0 0 5px', fontSize: 9, color: T.dim }}>Contraste</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 11 }}>
                <SegmentButton<PortraitContrast> value="medium" current={config.contrast} label="Médio" onChange={value => patch('contrast', value)} />
                <SegmentButton<PortraitContrast> value="high" current={config.contrast} label="Alto" onChange={value => patch('contrast', value)} />
                <SegmentButton<PortraitContrast> value="very-high" current={config.contrast} label="Muito alto" onChange={value => patch('contrast', value)} />
              </div>

              <p style={{ margin: '0 0 5px', fontSize: 9, color: T.dim }}>Borda da sombra</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 11 }}>
                <SegmentButton<PortraitShadowEdge> value="soft" current={config.shadowEdge} label="Suave" onChange={value => patch('shadowEdge', value)} />
                <SegmentButton<PortraitShadowEdge> value="defined" current={config.shadowEdge} label="Definida" onChange={value => patch('shadowEdge', value)} />
              </div>

              <p style={{ margin: '0 0 5px', fontSize: 9, color: T.dim }}>Rim light no lado da sombra</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <SegmentButton<PortraitRimStrength> value="off" current={config.rimStrength} label="Desligado" onChange={value => patch('rimStrength', value)} />
                <SegmentButton<PortraitRimStrength> value="subtle" current={config.rimStrength} label="Leve" onChange={value => patch('rimStrength', value)} />
                <SegmentButton<PortraitRimStrength> value="medium" current={config.rimStrength} label="Médio" onChange={value => patch('rimStrength', value)} />
              </div>
            </div>

            <div style={cardStyle}>
              <p style={labelStyle}>5. FUNDO</p>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <input type="color" value={config.backgroundColor} onChange={event => patch('backgroundColor', event.target.value.toUpperCase())} style={{ width: 72, height: 38, border: 0, borderRadius: 7, background: 'transparent', cursor: 'pointer' }} />
                <input value={config.backgroundLabel} onChange={event => patch('backgroundLabel', event.target.value)} aria-label="Descrição da cor de fundo" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 9px', borderRadius: 7, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,.035)', color: T.text, fontSize: 10, outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <SegmentButton<PortraitSaturation> value="medium" current={config.saturation} label="Saturação média" onChange={value => patch('saturation', value)} />
                <SegmentButton<PortraitSaturation> value="high" current={config.saturation} label="Alta saturação" onChange={value => patch('saturation', value)} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <SegmentButton<PortraitFinish> value="matte" current={config.finish} label="Fosco" onChange={value => patch('finish', value)} />
                <SegmentButton<PortraitFinish> value="soft" current={config.finish} label="Studio suave" onChange={value => patch('finish', value)} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 0 }}>
            <LightingDiagram config={config} />

            <div style={{ ...cardStyle, border: '1px solid rgba(124,58,237,.30)', background: 'rgba(124,58,237,.055)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 11, color: '#fff', fontWeight: 800 }}>Prompt técnico</p>
                  <p style={{ margin: '3px 0 0', fontSize: 9, color: T.dim }}>{Math.max(1, Math.floor(prompt.length / 4))} tokens estimados</p>
                </div>
                <button type="button" onClick={() => setShowPrompt(value => !value)} style={{ padding: '5px 9px', borderRadius: 6, border: `1px solid ${T.border}`, background: 'transparent', color: T.dim, cursor: 'pointer', fontSize: 9 }}>{showPrompt ? 'Ocultar' : 'Ver avançado'}</button>
                <button type="button" onClick={copyPrompt} style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid rgba(124,58,237,.4)', background: 'rgba(124,58,237,.15)', color: '#c4b5fd', cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>{copied ? '✓ Copiado' : '📋 Copiar'}</button>
              </div>
              {showPrompt && (
                <pre style={{ margin: '12px 0 0', maxHeight: 330, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: 9, lineHeight: 1.6, color: T.text, padding: 10, borderRadius: 8, background: 'rgba(0,0,0,.16)', border: `1px solid ${T.border}` }}>{prompt}</pre>
              )}
            </div>

            <div style={cardStyle}>
              <p style={labelStyle}>GERAR</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" disabled={generating || !selectedAsset} onClick={() => { void generate(1) }} style={{ padding: '10px 12px', borderRadius: 8, border: 'none', background: generating || !selectedAsset ? 'rgba(124,58,237,.20)' : T.purple, color: '#fff', cursor: generating || !selectedAsset ? 'not-allowed' : 'pointer', fontSize: 10, fontWeight: 800, opacity: generating || !selectedAsset ? .55 : 1 }}>✨ Gerar retrato</button>
                <button type="button" disabled={generating || !selectedAsset} onClick={() => { void generate(4) }} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(124,58,237,.45)', background: 'rgba(124,58,237,.12)', color: '#c4b5fd', cursor: generating || !selectedAsset ? 'not-allowed' : 'pointer', fontSize: 10, fontWeight: 800, opacity: generating || !selectedAsset ? .55 : 1 }}>▦ Gerar 4 variações</button>
              </div>
              {!selectedAsset && <p style={{ margin: '7px 0 0', fontSize: 9, color: T.dim }}>Selecione uma foto da Biblioteca para habilitar a geração.</p>}
              {generationLabel && <p style={{ margin: '9px 0 0', fontSize: 10, color: '#c4b5fd' }}>⏳ {generationLabel}</p>}
              {error && <p style={{ margin: '9px 0 0', fontSize: 10, lineHeight: 1.5, color: '#fca5a5', padding: 8, borderRadius: 7, background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.20)' }}>{error}</p>}
            </div>

            {generatedUrls.length > 0 && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 11, color: '#fff', fontWeight: 800 }}>Resultados</p>
                    <p style={{ margin: '3px 0 0', fontSize: 9, color: T.dim }}>{generatedUrls.length} gerado(s) · {librarySaved} salvo(s) na Biblioteca</p>
                  </div>
                  {librarySaved === generatedUrls.length && <span style={{ fontSize: 9, color: '#86efac', padding: '3px 7px', borderRadius: 99, background: 'rgba(34,197,94,.09)', border: '1px solid rgba(34,197,94,.20)' }}>✓ Biblioteca</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: generatedUrls.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: 8 }}>
                  {generatedUrls.map((url, index) => (
                    <div key={`${url}-${index}`} style={{ borderRadius: 9, overflow: 'hidden', border: `1px solid ${T.border}`, background: '#09090b' }}>
                      <img src={url} alt={`Retrato gerado ${index + 1}`} style={{ width: '100%', display: 'block', aspectRatio: '1 / 1', objectFit: 'cover' }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={['image']}
        maxSelection={1}
        title="Escolher foto de referência"
        confirmLabel="Usar como identidade"
        onConfirm={assets => {
          setSelectedAsset(assets[0] ?? null)
          setGeneratedUrls([])
          setLibrarySaved(0)
          setError('')
        }}
      />
    </div>
  )
}
