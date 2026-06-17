import { useState, useCallback } from 'react'

// ===========================================================
// useSiteGenerator
// Gera HTML via API do Claude e persiste no Supabase.
// Usado pelo módulo SiteGenerator do Vendor.ai.
// ===========================================================

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'

const TYPE_LABELS = {
  landing: 'landing page de marketing/vendas',
  ecommerce: 'e-commerce com produtos e carrinho',
  institutional: 'site institucional (sobre, serviços, contato)',
}

const TONE_LABELS = {
  profissional: 'profissional e confiável',
  amigavel: 'amigável e próximo',
  urgente: 'urgente e direto ao ponto',
  premium: 'premium e sofisticado',
  descontraido: 'descontraído e criativo',
}

function buildGeneratePrompt(config) {
  const { type, name, sector, desc, pain, tone, color, cta, products = [] } = config

  const productsBlock =
    type === 'ecommerce' && products.length
      ? `\nProdutos para listar:\n${products.map((p) => `- ${p.name}${p.price ? ': ' + p.price : ''}`).join('\n')}`
      : ''

  return `Você é um especialista em desenvolvimento web e copywriting. Gere um site HTML completo e autocontido (HTML + CSS + JS em um único arquivo) para o seguinte negócio:

Tipo de site: ${TYPE_LABELS[type] || type}
Nome do negócio: ${name}
Setor / nicho: ${sector || 'não informado'}
Descrição: ${desc}
Maior dor do cliente: ${pain || 'não informada'}
Tom de voz: ${TONE_LABELS[tone] || tone}
Cor principal: ${color}
CTA principal: ${cta || 'Entre em contato'}
${productsBlock}

REGRAS OBRIGATÓRIAS:
1. Use SPIN Selling: abra com a situação/problema que o cliente reconhece, amplie a implicação (custo do problema) ANTES de apresentar a solução
2. Use ${color} como cor de destaque principal — gradientes suaves, botões, bordas de destaque
3. Gere copy real e específica para o negócio — zero placeholder Lorem ipsum
4. Site bonito, moderno, responsivo, fontes do Google Fonts incluídas via link
5. Para landing page: hero (S+P) → custo do problema (I) → solução (N) → benefícios → depoimentos placeholder → CTA forte
6. Para e-commerce: hero → grid de produtos com preços e botão "Adicionar ao carrinho" → carrinho lateral simples com JS → CTA de finalização
7. Para institucional: hero → sobre a empresa → serviços → equipe (avatares placeholder) → contato com formulário
8. Inclua um header fixo com logo (nome do negócio) e navegação suave com âncoras
9. Footer com copyright e informações básicas
10. Retorne APENAS o código HTML completo, sem explicações, sem markdown, sem \`\`\`html`
}

function buildRefinePrompt(userMessage) {
  return `O usuário quer ajustar o site gerado. Pedido exato: "${userMessage}"

Aplique exatamente o que foi pedido e retorne APENAS o HTML completo e atualizado do site.
Mantenha todas as outras seções inalteradas. Sem explicações, sem markdown.`
}

// ===========================================================
// Hook principal
// ===========================================================

export function useSiteGenerator({ supabase, tenantId }) {
  const [status, setStatus] = useState('idle') // idle | generating | ready | error
  const [generatedHTML, setGeneratedHTML] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [savedSiteId, setSavedSiteId] = useState(null)
  const [error, setError] = useState(null)

  // ---- Gera o site inicial ----
  const generate = useCallback(async (config) => {
    setStatus('generating')
    setError(null)
    setGeneratedHTML('')
    setChatHistory([])

    const userPrompt = buildGeneratePrompt(config)

    try {
      const res = await fetch(CLAUDE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)

      const data = await res.json()
      let html = data.content?.[0]?.text || ''
      html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim()

      if (!html || html.length < 500) throw new Error('HTML inválido ou muito curto')

      setGeneratedHTML(html)
      setChatHistory([
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: html },
      ])
      setStatus('ready')

      // Persiste no Supabase se tiver cliente e tenantId
      if (supabase && tenantId) {
        const { data: row, error: dbErr } = await supabase
          .from('generated_sites')
          .insert({
            tenant_id: tenantId,
            name: config.name,
            site_type: config.type,
            config,
            html,
          })
          .select('id')
          .single()

        if (!dbErr && row) setSavedSiteId(row.id)
      }
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }, [supabase, tenantId])

  // ---- Refina o site via chat ----
  const refine = useCallback(async (userMessage) => {
    if (!generatedHTML) return null

    const refinePrompt = buildRefinePrompt(userMessage)
    const nextHistory = [...chatHistory, { role: 'user', content: refinePrompt }]

    try {
      const res = await fetch(CLAUDE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          messages: nextHistory,
        }),
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)

      const data = await res.json()
      let html = data.content?.[0]?.text || ''
      html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim()

      if (!html || html.length < 500) throw new Error('Resposta inválida')

      setGeneratedHTML(html)
      setChatHistory([...nextHistory, { role: 'assistant', content: html }])

      // Atualiza no Supabase se já estava salvo
      if (supabase && savedSiteId) {
        await supabase
          .from('generated_sites')
          .update({ html, updated_at: new Date().toISOString() })
          .eq('id', savedSiteId)
      }

      return html
    } catch (err) {
      throw new Error(err.message)
    }
  }, [generatedHTML, chatHistory, supabase, savedSiteId])

  // ---- Download do HTML ----
  const download = useCallback((filename = 'site') => {
    if (!generatedHTML) return
    const blob = new Blob([generatedHTML], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename.toLowerCase().replace(/\s+/g, '-') + '.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [generatedHTML])

  return {
    status,       // 'idle' | 'generating' | 'ready' | 'error'
    generatedHTML,
    savedSiteId,
    error,
    generate,
    refine,
    download,
    reset: () => { setStatus('idle'); setGeneratedHTML(''); setChatHistory([]); setSavedSiteId(null); setError(null) },
  }
}
