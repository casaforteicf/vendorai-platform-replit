import { useState, useRef } from 'react'
import { useSiteGenerator } from './useSiteGenerator.js'
import './SiteGenerator.css'

// ===========================================================
// Cores de destaque disponíveis
// ===========================================================
const COLORS = [
  { hex: '#6366F1', label: 'Indigo' },
  { hex: '#0EA5E9', label: 'Azul' },
  { hex: '#10B981', label: 'Verde' },
  { hex: '#F59E0B', label: 'Âmbar' },
  { hex: '#EF4444', label: 'Vermelho' },
  { hex: '#EC4899', label: 'Rosa' },
  { hex: '#8B5CF6', label: 'Roxo' },
  { hex: '#14B8A6', label: 'Teal' },
]

const SUGGESTIONS = [
  'Muda a cor principal para verde',
  'Adiciona seção de depoimentos',
  'Reescreve o hero com mais urgência',
  'Adiciona uma seção de FAQ',
  'Deixa os textos mais curtos e diretos',
  'Adiciona um WhatsApp flutuante',
]

// ===========================================================
// Formulário de configuração
// ===========================================================
function ConfigForm({ onGenerate }) {
  const [siteType, setSiteType] = useState('landing')
  const [color, setColor] = useState('#6366F1')
  const [products, setProducts] = useState([{ name: '', price: '' }])

  function addProduct() {
    setProducts((p) => [...p, { name: '', price: '' }])
  }

  function removeProduct(i) {
    setProducts((p) => p.filter((_, idx) => idx !== i))
  }

  function updateProduct(i, field, value) {
    setProducts((p) => p.map((prod, idx) => (idx === i ? { ...prod, [field]: value } : prod)))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    onGenerate({
      type: siteType,
      name: fd.get('name'),
      sector: fd.get('sector'),
      desc: fd.get('desc'),
      pain: fd.get('pain'),
      tone: fd.get('tone'),
      cta: fd.get('cta'),
      color,
      products: products.filter((p) => p.name.trim()),
    })
  }

  return (
    <form className="sg-form" onSubmit={handleSubmit}>
      {/* tipo */}
      <div className="sg-section">
        <span className="sg-label">Tipo de site</span>
        <div className="sg-type-grid">
          {[
            { id: 'landing', icon: '📢', label: 'Landing page' },
            { id: 'ecommerce', icon: '🛒', label: 'E-commerce' },
            { id: 'institutional', icon: '🏢', label: 'Institucional' },
          ].map((t) => (
            <button
              type="button"
              key={t.id}
              className={`sg-type-card ${siteType === t.id ? 'sg-type-card--active' : ''}`}
              onClick={() => setSiteType(t.id)}
            >
              <span className="sg-type-icon">{t.icon}</span>
              <span className="sg-type-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* dados básicos */}
      <div className="sg-grid">
        <div className="sg-field">
          <label htmlFor="sg-name">Nome do negócio *</label>
          <input id="sg-name" name="name" type="text" required placeholder="Ex: Floricultura Primavera" />
        </div>
        <div className="sg-field">
          <label htmlFor="sg-sector">Setor / nicho</label>
          <input id="sg-sector" name="sector" type="text" placeholder="Ex: floricultura, consultoria, moda" />
        </div>
        <div className="sg-field sg-field--full">
          <label htmlFor="sg-desc">O que o negócio faz *</label>
          <textarea id="sg-desc" name="desc" rows={3} required placeholder="Descreva em 1-2 frases o que o negócio faz e para quem..." />
        </div>
        <div className="sg-field sg-field--full">
          <label htmlFor="sg-pain">Maior dor do cliente (SPIN — Implicação)</label>
          <input id="sg-pain" name="pain" type="text" placeholder="Ex: difícil encontrar flores frescas de qualidade na cidade" />
        </div>
      </div>

      {/* produtos (só e-commerce) */}
      {siteType === 'ecommerce' && (
        <div className="sg-section">
          <span className="sg-label">Produtos</span>
          {products.map((p, i) => (
            <div key={i} className="sg-product-row">
              <input
                type="text"
                placeholder="Nome do produto"
                value={p.name}
                onChange={(e) => updateProduct(i, 'name', e.target.value)}
              />
              <input
                type="text"
                placeholder="R$ 0,00"
                value={p.price}
                onChange={(e) => updateProduct(i, 'price', e.target.value)}
                style={{ width: 90 }}
              />
              {products.length > 1 && (
                <button type="button" className="sg-btn-remove" onClick={() => removeProduct(i)} aria-label="Remover">
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" className="sg-btn-add" onClick={addProduct}>
            + Adicionar produto
          </button>
        </div>
      )}

      {/* aparência e tom */}
      <div className="sg-grid">
        <div className="sg-field">
          <label>Cor principal</label>
          <div className="sg-colors">
            {COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                className={`sg-color-chip ${color === c.hex ? 'sg-color-chip--active' : ''}`}
                style={{ background: c.hex }}
                title={c.label}
                onClick={() => setColor(c.hex)}
                aria-label={c.label}
                aria-pressed={color === c.hex}
              />
            ))}
          </div>
        </div>
        <div className="sg-field">
          <label htmlFor="sg-tone">Tom de voz</label>
          <select id="sg-tone" name="tone">
            <option value="profissional">Profissional e confiável</option>
            <option value="amigavel">Amigável e próximo</option>
            <option value="urgente">Urgente e direto</option>
            <option value="premium">Premium e sofisticado</option>
            <option value="descontraido">Descontraído e criativo</option>
          </select>
        </div>
        <div className="sg-field sg-field--full">
          <label htmlFor="sg-cta">CTA principal</label>
          <input id="sg-cta" name="cta" type="text" placeholder="Ex: Solicitar orçamento, Comprar agora, Agendar visita" />
        </div>
      </div>

      <button type="submit" className="sg-btn-generate">
        ✦ Gerar site com IA
      </button>
    </form>
  )
}

// ===========================================================
// Preview + ações
// ===========================================================
function SitePreview({ html, status, onDownload, onRefine }) {
  return (
    <div className="sg-preview">
      {status === 'generating' && (
        <div className="sg-generating">
          <span className="sg-spinner" aria-hidden="true" />
          Gerando site com Claude...
        </div>
      )}

      {status === 'error' && (
        <div className="sg-error-banner">
          Erro ao gerar o site. Verifique a conexão e tente novamente.
        </div>
      )}

      <div className="sg-iframe-wrap">
        {html ? (
          <iframe
            className="sg-iframe"
            srcDoc={html}
            title="Preview do site gerado"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="sg-iframe-placeholder">
            <p>Configure o site e clique em "Gerar" para ver o preview aqui.</p>
          </div>
        )}
      </div>

      {html && (
        <div className="sg-preview-actions">
          <button className="sg-btn-action" onClick={onDownload}>
            ↓ Baixar HTML
          </button>
          <button className="sg-btn-action sg-btn-action--primary" onClick={onRefine}>
            ✎ Refinar com chat
          </button>
        </div>
      )}
    </div>
  )
}

// ===========================================================
// Chat de refinamento
// ===========================================================
function RefinementChat({ onRefine, onViewPreview }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Site gerado! Peça ajustes aqui — mude seções, cores, textos ou adicione novos blocos.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  async function send() {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: msg }])
    setLoading(true)

    try {
      await onRefine(msg)
      setMessages((m) => [...m, { role: 'assistant', text: 'Site atualizado! Veja o preview.' }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: 'Não consegui aplicar o ajuste. Tente novamente com outra instrução.' }])
    } finally {
      setLoading(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  return (
    <div className="sg-chat">
      <div className="sg-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`sg-msg sg-msg--${m.role}`}>
            {m.text}
          </div>
        ))}
        {loading && (
          <div className="sg-msg sg-msg--assistant">
            <span className="sg-typing">
              <span /><span /><span />
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sg-suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="sg-suggestion" onClick={() => setInput(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="sg-chat-input-row">
        <input
          type="text"
          value={input}
          placeholder="Peça um ajuste no site..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={loading}
        />
        <button className="sg-btn-send" onClick={send} disabled={loading || !input.trim()}>
          Enviar
        </button>
      </div>

      <button className="sg-btn-link" onClick={onViewPreview}>
        ← Ver preview atualizado
      </button>
    </div>
  )
}

// ===========================================================
// Módulo principal
// ===========================================================
export default function SiteGenerator({ supabase, tenantId }) {
  const [activeTab, setActiveTab] = useState('config')
  const { status, generatedHTML, error, generate, refine, download, reset } = useSiteGenerator({
    supabase,
    tenantId,
  })

  async function handleGenerate(config) {
    setActiveTab('preview')
    await generate(config)
  }

  async function handleRefine(msg) {
    const updated = await refine(msg)
    if (!updated) throw new Error('Sem resposta')
    return updated
  }

  const tabs = [
    { id: 'config', label: '① Configurar' },
    { id: 'preview', label: '② Preview', disabled: status === 'idle' },
    { id: 'refine', label: '③ Refinar', disabled: status !== 'ready' },
  ]

  return (
    <div className="sg-root">
      <div className="sg-header">
        <div>
          <h1 className="sg-title">Gerador de Sites</h1>
          <p className="sg-subtitle">Crie landing pages, e-commerces e sites institucionais com IA em segundos.</p>
        </div>
        {status === 'ready' && (
          <button className="sg-btn-new" onClick={() => { reset(); setActiveTab('config') }}>
            + Novo site
          </button>
        )}
      </div>

      <div className="sg-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`sg-tab ${activeTab === t.id ? 'sg-tab--active' : ''}`}
            onClick={() => !t.disabled && setActiveTab(t.id)}
            disabled={t.disabled}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="sg-content">
        {activeTab === 'config' && <ConfigForm onGenerate={handleGenerate} />}
        {activeTab === 'preview' && (
          <SitePreview
            html={generatedHTML}
            status={status}
            onDownload={() => {
              const name = 'site-gerado'
              download(name)
            }}
            onRefine={() => setActiveTab('refine')}
          />
        )}
        {activeTab === 'refine' && (
          <RefinementChat
            onRefine={handleRefine}
            onViewPreview={() => setActiveTab('preview')}
          />
        )}
      </div>
    </div>
  )
}
