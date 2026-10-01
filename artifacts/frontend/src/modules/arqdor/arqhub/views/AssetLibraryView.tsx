import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'
import { useWorkspace } from '../../workspace/context/WorkspaceContext'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface PolyHavenItem {
  slug: string
  name: string
  description: string
  thumbnailUrl: string | null
  category: string
  tags: string[]
  authors: Record<string,string>
  license: string
}

interface SketchfabItem {
  uid: string
  name: string
  description: string | null
  viewerUrl: string
  thumbnailUrl: string | null
  authorName: string | null
  licenseLabel: string | null
  isDownloadable: boolean
  vertexCount: number | null
  faceCount: number | null
}

interface CatItem {
  id: string
  nome: string
  descricao: string | null
  categoria: string | null
  subcategoria: string | null
  fornecedor: string | null
  precoBase: string | null
  imagens: string[] | null
  especificacoes: Record<string, unknown> | null
  createdAt: string
}

function AssetCard({ item, selected, onSelect }: { item: CatItem; selected: boolean; onSelect: () => void }) {
  const img = item.imagens?.[0]
  return (
    <button type="button" onClick={onSelect} className="arq-asset-card" aria-pressed={selected}
      style={{ textAlign:'left', cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, padding:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:10 }}>
        {img ? <img src={img} alt={item.nome} style={{ width:48, height:48, borderRadius:8, objectFit:'cover' }} /> : <span style={{ fontSize:28 }}>📦</span>}
        <div style={{ display:'flex', flexDirection:'column', gap:3, alignItems:'flex-end' }}>
          {item.categoria && <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(124,58,237,0.12)', color:T.purpleL, fontWeight:700 }}>{item.categoria}</span>}
          {item.subcategoria && <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(255,255,255,0.05)', color:T.dim }}>{item.subcategoria}</span>}
        </div>
      </div>
      <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{item.nome}</p>
      <p style={{ margin:0, fontSize:9, color:T.dim }}>{item.fornecedor ?? '—'}</p>
    </button>
  )
}

function AssetDetail({ item, projectId, canApply, onClose }: { item: CatItem; projectId: string | null; canApply: boolean; onClose: () => void }) {
  const [handoff, setHandoff] = useState(false)
  const useInProject = () => {
    if (!projectId || !canApply) return
    sessionStorage.setItem('arqdor:pendingCatalogItem', JSON.stringify({ id:item.id, name:item.nome, category:item.categoria, source:'asset-library', projectId }))
    setHandoff(true)
    window.dispatchEvent(new CustomEvent('arqdor:navigate', { detail: { module:'real-specification' } }))
  }

  return (
    <aside className="arq-asset-detail" aria-label={`Detalhes de ${item.nome}`}>
      <button type="button" className="arq-mobile-close" onClick={onClose}>← Voltar à biblioteca</button>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        {item.imagens?.[0] ? <img src={item.imagens[0]} alt={item.nome} style={{ width:56, height:56, borderRadius:10, objectFit:'cover' }} /> : <span style={{ fontSize:42 }}>📦</span>}
        <div style={{ minWidth:0 }}>
          <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:'#fff', overflowWrap:'anywhere' }}>{item.nome}</p>
          <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim }}>{item.fornecedor ?? '—'}</p>
        </div>
      </div>

      {item.descricao && <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{item.descricao}</p>}

      <div className="arq-detail-grid">
        {[
          ['Categoria', item.categoria ?? '—'], ['Fornecedor', item.fornecedor ?? '—'],
          ['Preço base', item.precoBase ? `R$ ${Number(item.precoBase).toFixed(2)}` : '—'],
          ['Adicionado', new Date(item.createdAt).toLocaleDateString('pt-BR')],
        ].map(([k,v]) => <div key={k} className="arq-detail-info"><p>{k}</p><strong>{v}</strong></div>)}
      </div>

      {item.especificacoes && Object.keys(item.especificacoes).length > 0 && (
        <div style={{ marginBottom:14 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim }}>ESPECIFICAÇÕES</p>
          {Object.entries(item.especificacoes).slice(0,8).map(([k,v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:10 }}><span style={{ color:T.dim }}>{k}</span><span style={{ color:T.text, textAlign:'right', overflowWrap:'anywhere' }}>{String(v)}</span></div>
          ))}
        </div>
      )}

      {item.imagens && item.imagens.length > 1 && <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>{item.imagens.slice(0,6).map((url,i)=><img key={i} src={url} alt="" style={{ width:60, height:60, borderRadius:6, objectFit:'cover', border:`1px solid ${T.border}` }} />)}</div>}

      {!projectId && <div className="arq-alert arq-alert-warn">Abra ou selecione um projeto antes de aplicar este item.</div>}
      {projectId && !canApply && <div className="arq-alert arq-alert-error">Seu perfil não possui permissão para editar especificações deste projeto.</div>}
      <button type="button" onClick={useInProject} disabled={!projectId || !canApply || handoff} className="arq-use-btn">{handoff ? '✓ Abrindo especificações…' : '📥 Usar neste Projeto'}</button>
      {projectId && canApply && <p style={{ margin:'7px 0 0', fontSize:9, color:T.dim, lineHeight:1.45, textAlign:'center' }}>Você escolherá o objeto antes da aplicação. Nenhum material é alterado automaticamente.</p>}
    </aside>
  )
}

export function AssetLibraryView() {
  const { activeProject, hasPermission } = useWorkspace()
  const [items, setItems] = useState<CatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [query, setQuery] = useState('')
  const [catFilt, setCatFilt] = useState('')
  const [sel, setSel] = useState<CatItem|null>(null)
  const [externalOpen, setExternalOpen] = useState(false)
  const [externalItems, setExternalItems] = useState<SketchfabItem[]>([])
  const [externalLoading, setExternalLoading] = useState(false)
  const [externalError, setExternalError] = useState<string|null>(null)
  const [sketchfabConnected, setSketchfabConnected] = useState(false)
  const [sketchfabConfigured, setSketchfabConfigured] = useState(true)
  const [sketchfabAccount, setSketchfabAccount] = useState<string|null>(null)
  const [importingUid, setImportingUid] = useState<string|null>(null)
  const [importMessage, setImportMessage] = useState<string|null>(null)
  const [polyItems, setPolyItems] = useState<PolyHavenItem[]>([])
  const [polyLoading, setPolyLoading] = useState(false)
  const [polyOpen, setPolyOpen] = useState(false)
  const [importingPoly, setImportingPoly] = useState<string|null>(null)
  const [unifiedOpen, setUnifiedOpen] = useState(false)
  const [unifiedLoading, setUnifiedLoading] = useState(false)
  const [sourceView, setSourceView] = useState<'all'|'mine'|'poly'|'sketchfab'>('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ limit:'60' })
      if (catFilt) params.set('categoria', catFilt)
      if (query) params.set('busca', query)
      const res = await fetch(`${BASE}/arch/catalogo?${params}`, { headers:authHeaders() })
      if (!res.ok) throw new Error(res.status === 403 ? 'Sem permissão para acessar a biblioteca.' : `Falha ao carregar a biblioteca (${res.status}).`)
      const data: CatItem[] = await res.json()
      setItems(data)
      setSel(current => current && data.some(item => item.id === current.id) ? current : null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar assets')
    } finally { setLoading(false) }
  }, [catFilt, query])

  useEffect(() => { void load() }, [load])

  const loadSketchfabConnection = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/arch/sketchfab/connection`, { headers:authHeaders() })
      if (!res.ok) return
      const data = await res.json() as { configured?: boolean; connected?: boolean; accountName?: string|null }
      setSketchfabConfigured(data.configured !== false)
      setSketchfabConnected(Boolean(data.connected))
      setSketchfabAccount(data.accountName ?? null)
    } catch { /* biblioteca interna continua disponível */ }
  }, [])

  useEffect(() => { void loadSketchfabConnection() }, [loadSketchfabConnection])

  const connectSketchfab = useCallback(async () => {
    setExternalError(null)
    try {
      const returnTo = window.location.pathname + window.location.search
      const res = await fetch(`${BASE}/auth/sketchfab?returnTo=${encodeURIComponent(returnTo)}`, { headers:authHeaders() })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error === 'sketchfab_not_configured' ? 'Integração Sketchfab ainda não configurada no servidor.' : 'Não foi possível iniciar a conexão com Sketchfab.')
      window.location.assign(data.url)
    } catch (e: unknown) {
      setExternalError(e instanceof Error ? e.message : 'Falha ao conectar Sketchfab')
    }
  }, [])

  const searchExternal = useCallback(async () => {
    const q = query.trim()
    setExternalOpen(true)
    setExternalError(null)
    if (q.length < 2) { setExternalItems([]); return }
    setExternalLoading(true)
    try {
      const res = await fetch(`${BASE}/arch/sketchfab/search?q=${encodeURIComponent(q)}&limit=24`, { headers:authHeaders() })
      if (!res.ok) throw new Error(`Falha ao consultar Sketchfab (${res.status}).`)
      const data = await res.json() as { items?: SketchfabItem[] }
      setExternalItems(Array.isArray(data.items) ? data.items : [])
    } catch (e: unknown) {
      setExternalError(e instanceof Error ? e.message : 'Erro ao consultar biblioteca externa')
      setExternalItems([])
    } finally { setExternalLoading(false) }
  }, [query])

  const importSketchfab = useCallback(async (item: SketchfabItem) => {
    setImportingUid(item.uid); setImportMessage(null); setExternalError(null)
    try {
      const res = await fetch(`${BASE}/arch/sketchfab/import`, {
        method:'POST', headers:{ ...authHeaders(), 'Content-Type':'application/json' }, body:JSON.stringify({ uid:item.uid }),
      })
      const data = await res.json() as { error?: string; product?: { nome?: string } }
      if (!res.ok) {
        if (data.error === 'sketchfab_not_connected' || data.error === 'sketchfab_reconnect_required') setSketchfabConnected(false)
        throw new Error(data.error === 'sketchfab_archive_too_large' ? 'Este modelo excede o limite de importação de 45 MB.' : data.error === 'gltf_not_available' ? 'Este modelo não possui glTF disponível.' : 'Não foi possível importar este modelo.')
      }
      setImportMessage(`✓ ${data.product?.nome ?? item.name} adicionado à Biblioteca do Arqdor.`)
      await load()
    } catch (e: unknown) {
      setExternalError(e instanceof Error ? e.message : 'Falha ao importar modelo')
    } finally { setImportingUid(null) }
  }, [load])
  const searchPolyHaven = useCallback(async () => {
    const q = query.trim() || 'furniture'
    setPolyOpen(true)
    setExternalOpen(false)
    setExternalError(null)
    setPolyLoading(true)
    try {
      const res = await fetch(`${BASE}/arch/polyhaven/search?q=${encodeURIComponent(q)}&limit=24`, { headers:authHeaders() })
      if (!res.ok) throw new Error(`Falha ao consultar Poly Haven (${res.status}).`)
      const data = await res.json() as { items?: PolyHavenItem[] }
      setPolyItems(Array.isArray(data.items) ? data.items : [])
    } catch (e: unknown) {
      setExternalError(e instanceof Error ? e.message : 'Erro ao consultar Poly Haven')
      setPolyItems([])
    } finally { setPolyLoading(false) }
  }, [query])

  const importPolyHaven = useCallback(async (item: PolyHavenItem) => {
    setImportingPoly(item.slug); setImportMessage(null); setExternalError(null)
    try {
      const res = await fetch(`${BASE}/arch/polyhaven/import`, {
        method:'POST',
        headers:{ ...authHeaders(), 'Content-Type':'application/json' },
        body:JSON.stringify({ slug:item.slug }),
      })
      const data = await res.json() as { error?: string; product?: { nome?: string } }
      if (!res.ok) throw new Error(data.error === 'polyhaven_asset_too_large' ? 'Este modelo excede o limite de 45 MB.' : 'Não foi possível importar este modelo.')
      setImportMessage(`✓ ${data.product?.nome ?? item.name} adicionado à Biblioteca do Arqdor.`)
      await load()
    } catch (e: unknown) {
      setExternalError(e instanceof Error ? e.message : 'Falha ao importar modelo')
    } finally { setImportingPoly(null) }
  }, [load])


  const searchUniversal = useCallback(async () => {
    const q = query.trim()
    if (q.length < 2) {
      setExternalError('Digite ao menos 2 caracteres para buscar em todas as bibliotecas.')
      return
    }

    setUnifiedOpen(true)
    setSourceView('all')
    setUnifiedLoading(true)
    setExternalLoading(true)
    setPolyLoading(true)
    setExternalError(null)
    setImportMessage(null)

    const headers = authHeaders()
    const [polyResult, sketchResult] = await Promise.allSettled([
      fetch(`${BASE}/arch/polyhaven/search?q=${encodeURIComponent(q)}&limit=24`, { headers })
        .then(async res => {
          if (!res.ok) throw new Error(`Poly Haven (${res.status})`)
          return res.json() as Promise<{ items?: PolyHavenItem[] }>
        }),
      fetch(`${BASE}/arch/sketchfab/search?q=${encodeURIComponent(q)}&limit=24`, { headers })
        .then(async res => {
          if (!res.ok) throw new Error(`Sketchfab (${res.status})`)
          return res.json() as Promise<{ items?: SketchfabItem[] }>
        }),
    ])

    if (polyResult.status === 'fulfilled') setPolyItems(Array.isArray(polyResult.value.items) ? polyResult.value.items : [])
    else setPolyItems([])

    if (sketchResult.status === 'fulfilled') setExternalItems(Array.isArray(sketchResult.value.items) ? sketchResult.value.items : [])
    else setExternalItems([])

    const failures = [
      polyResult.status === 'rejected' ? 'Poly Haven' : null,
      sketchResult.status === 'rejected' ? 'Sketchfab' : null,
    ].filter(Boolean)

    if (failures.length) setExternalError(`Algumas fontes não responderam: ${failures.join(', ')}.`)

    setPolyOpen(true)
    setExternalOpen(true)
    setPolyLoading(false)
    setExternalLoading(false)
    setUnifiedLoading(false)
  }, [query])

  const categories = [...new Set(items.map(i=>i.categoria).filter(Boolean))] as string[]
  const canApply = hasPermission('PROJECT_EDIT') && hasPermission('MATERIAL_SELECT')

  return (
    <div className="arq-asset-shell">
      <style>{`
        .arq-asset-shell{height:100%;display:flex;flex-direction:column;min-width:0}
        .arq-asset-toolbar{padding:10px 16px;border-bottom:1px solid ${T.border};display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-shrink:0}
        .arq-asset-body{flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,320px);min-height:0;overflow:hidden}
        .arq-asset-grid-wrap{overflow:auto;padding:16px;min-width:0}
        .arq-asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
        .arq-asset-card{min-width:0}
        .arq-asset-detail{height:100%;overflow:auto;padding:16px;border-left:1px solid ${T.border};box-sizing:border-box}
        .arq-mobile-close{display:none;margin:0 0 12px;padding:7px 10px;border:1px solid ${T.border};border-radius:7px;background:transparent;color:${T.text};cursor:pointer}
        .arq-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px}
        .arq-detail-info{padding:6px 8px;border-radius:6px;background:rgba(255,255,255,.03);border:1px solid ${T.border};min-width:0}.arq-detail-info p{margin:0 0 2px;font-size:8px;color:${T.dim};font-weight:700}.arq-detail-info strong{display:block;font-size:10px;color:${T.text};overflow-wrap:anywhere}
        .arq-alert{margin-bottom:10px;padding:8px 10px;border-radius:7px;font-size:10px;line-height:1.45}.arq-alert-warn{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.22);color:#fbbf24}.arq-alert-error{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.22);color:#f87171}
        .arq-use-btn{width:100%;padding:10px;border:0;border-radius:8px;background:${T.purple};color:#fff;cursor:pointer;font-size:11px;font-weight:700}.arq-use-btn:disabled{background:rgba(255,255,255,.08);color:${T.dim};cursor:not-allowed}
        @media(max-width:760px){.arq-asset-toolbar{padding:10px}.arq-asset-toolbar input{flex-basis:100%}.arq-asset-body{display:block;overflow:auto}.arq-asset-grid-wrap{padding:10px}.arq-asset-grid{grid-template-columns:1fr}.arq-asset-detail{border-left:0;border-top:1px solid ${T.border};height:auto;min-height:100%;padding:14px}.arq-mobile-close{display:inline-flex}.arq-detail-grid{grid-template-columns:1fr}.arq-asset-shell[data-has-selection="true"] .arq-asset-grid-wrap{display:none}}
      `}</style>
      <div className="arq-asset-toolbar">
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar asset…" style={{ flex:1, minWidth:120, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'7px 10px', outline:'none' }} />
        <select value={catFilt} onChange={e=>setCatFilt(e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:catFilt?T.text:T.dim, fontSize:10, padding:'7px 8px' }}><option value="">Todos os tipos</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <button type="button" onClick={()=>void load()} disabled={loading} style={{ padding:'7px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:loading?'wait':'pointer', fontSize:10 }}>{loading?'…':'↻'}</button>
        <button type="button" onClick={()=>void searchUniversal()} disabled={unifiedLoading || query.trim().length < 2} style={{ padding:'7px 12px', borderRadius:6, border:`1px solid ${unifiedOpen?'rgba(124,58,237,.45)':T.border}`, background:unifiedOpen?'rgba(124,58,237,0.12)':'transparent', color:unifiedOpen?T.purpleL:T.text, cursor:unifiedLoading?'wait':'pointer', fontSize:10, fontWeight:700 }}>{unifiedLoading?'Buscando em tudo…':'⌕ Buscar em tudo'}</button>
        <span style={{ fontSize:10, color:T.dim }}>{items.length} assets</span>
      </div>

      {unifiedOpen && <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, background:'rgba(124,58,237,0.03)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
          <div>
            <strong style={{ fontSize:11, color:T.text }}>Busca Universal</strong>
            <span style={{ marginLeft:8, fontSize:9, color:T.dim }}>uma pesquisa · todas as bibliotecas</span>
          </div>
          <button type="button" onClick={()=>{setUnifiedOpen(false);setPolyOpen(false);setExternalOpen(false)}} style={{ border:0, background:'transparent', color:T.dim, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:9 }}>
          {([
            ['all','Tudo',items.length + polyItems.length + externalItems.length],
            ['mine','Minha Biblioteca',items.length],
            ['poly','Poly Haven',polyItems.length],
            ['sketchfab','Sketchfab',externalItems.length],
          ] as const).map(([key,label,count]) => <button key={key} type="button" onClick={()=>setSourceView(key)} style={{ padding:'5px 8px', borderRadius:999, border:`1px solid ${sourceView===key?'rgba(124,58,237,.45)':T.border}`, background:sourceView===key?'rgba(124,58,237,.12)':'transparent', color:sourceView===key?T.purpleL:T.dim, fontSize:8, cursor:'pointer' }}>{label} · {count}</button>)}
          <span style={{ padding:'5px 8px', fontSize:8, color:T.dim, border:`1px dashed ${T.border}`, borderRadius:999 }}>Fabricantes · em breve</span>
          <span style={{ padding:'5px 8px', fontSize:8, color:T.dim, border:`1px dashed ${T.border}`, borderRadius:999 }}>BIM · em breve</span>
        </div>
        {externalError && <div style={{ marginTop:8, fontSize:9, color:'#fbbf24' }}>⚠ {externalError}</div>}
      </div>}

      {polyOpen && unifiedOpen && (sourceView==='all' || sourceView==='poly') && <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}`, background:'rgba(34,197,94,0.035)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:10 }}>
          <div><strong style={{ fontSize:11, color:T.text }}>Biblioteca externa · Poly Haven</strong><span style={{ marginLeft:8, fontSize:9, color:T.dim }}>CC0 · sem login</span></div>
          <button type="button" onClick={()=>setPolyOpen(false)} style={{ border:0, background:'transparent', color:T.dim, cursor:'pointer' }}>✕</button>
        </div>
        {externalError && <div style={{ fontSize:10, color:'#f87171', marginBottom:8 }}>{externalError}</div>}
        {!polyLoading && !externalError && polyItems.length===0 && <div style={{ fontSize:10, color:T.dim }}>Busque por sofá, mesa, cadeira, planta, iluminação, eletrodoméstico ou outro item.</div>}
        {polyItems.length>0 && <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:8, maxHeight:300, overflow:'auto' }}>
          {polyItems.map(item => <div key={item.slug} style={{ display:'block', padding:8, borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, minWidth:0 }}>
            {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.name} style={{ width:'100%', height:88, objectFit:'cover', borderRadius:6, marginBottom:7 }} /> : <div style={{ height:88, display:'grid', placeItems:'center', fontSize:28 }}>🧊</div>}
            <div style={{ fontSize:10, fontWeight:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
            <div style={{ marginTop:3, fontSize:8, color:T.dim }}>{item.category} · CC0</div>
            <button type="button" onClick={()=>void importPolyHaven(item)} disabled={importingPoly===item.slug} style={{ width:'100%', marginTop:7, padding:'6px 7px', borderRadius:6, border:0, background:'#166534', color:'#fff', fontSize:8, fontWeight:700, cursor:'pointer' }}>{importingPoly===item.slug?'Importando…':'Adicionar à Biblioteca'}</button>
          </div>)}
        </div>}
        <div style={{ marginTop:9, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:8, color:'#4ade80' }}>Powered by Poly Haven · assets CC0</span>
          {importMessage && <span style={{ fontSize:8, color:'#4ade80' }}>{importMessage}</span>}
        </div>
      </div>}

      {externalOpen && unifiedOpen && (sourceView==='all' || sourceView==='sketchfab') && <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}`, background:'rgba(124,58,237,0.035)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:10 }}>
          <div><strong style={{ fontSize:11, color:T.text }}>Biblioteca externa · Sketchfab</strong><span style={{ marginLeft:8, fontSize:9, color:T.dim }}>somente modelos com download permitido</span></div>
          <button type="button" onClick={()=>setExternalOpen(false)} style={{ border:0, background:'transparent', color:T.dim, cursor:'pointer' }}>✕</button>
        </div>
        {externalError && <div style={{ fontSize:10, color:'#f87171', marginBottom:8 }}>{externalError}</div>}
        {!externalLoading && !externalError && externalItems.length===0 && <div style={{ fontSize:10, color:T.dim }}>Digite ao menos 2 caracteres e clique em “Buscar Sketchfab”.</div>}
        {externalItems.length>0 && <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:8, maxHeight:260, overflow:'auto' }}>
          {externalItems.map(item => <div key={item.uid} style={{ display:'block', padding:8, borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, minWidth:0 }}>
            {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.name} style={{ width:'100%', height:88, objectFit:'cover', borderRadius:6, marginBottom:7 }} /> : <div style={{ height:88, display:'grid', placeItems:'center', fontSize:28 }}>🧊</div>}
            <div style={{ fontSize:10, fontWeight:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
            <div style={{ marginTop:3, fontSize:8, color:T.dim }}>{item.authorName ?? 'Autor não informado'} · {item.licenseLabel ?? 'licença não informada'}</div>
            <div style={{ display:'flex', gap:6, marginTop:7 }}>
              <a href={item.viewerUrl} target="_blank" rel="noreferrer" style={{ flex:1, textDecoration:'none', textAlign:'center', padding:'6px 7px', borderRadius:6, border:`1px solid ${T.border}`, color:T.dim, fontSize:8 }}>Ver ↗</a>
              <button type="button" onClick={()=>void importSketchfab(item)} disabled={!sketchfabConnected || importingUid===item.uid} style={{ flex:2, padding:'6px 7px', borderRadius:6, border:0, background:sketchfabConnected?T.purple:'rgba(255,255,255,.07)', color:sketchfabConnected?'#fff':T.dim, fontSize:8, fontWeight:700, cursor:sketchfabConnected?'pointer':'not-allowed' }}>{importingUid===item.uid?'Importando…':'Adicionar à Biblioteca'}</button>
            </div>
          </div>)}
        </div>}
        <div style={{ marginTop:9, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:8, color:sketchfabConnected?'#4ade80':T.dim }}>{sketchfabConnected ? `✓ Sketchfab conectado${sketchfabAccount ? ` · ${sketchfabAccount}` : ''}` : sketchfabConfigured ? 'Sketchfab precisa ser conectado para importar.' : 'Credenciais Sketchfab ainda não configuradas no servidor.'}</span>
          {!sketchfabConnected && sketchfabConfigured && <button type="button" onClick={()=>void connectSketchfab()} style={{ padding:'5px 8px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.purpleL, cursor:'pointer', fontSize:8, fontWeight:700 }}>Conectar Sketchfab</button>}
          {importMessage && <span style={{ fontSize:8, color:'#4ade80' }}>{importMessage}</span>}
        </div>
      </div>}

      {error && <div style={{ padding:'10px 16px', background:'rgba(248,113,113,0.08)', borderBottom:'1px solid rgba(248,113,113,0.2)', fontSize:11, color:'#f87171', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}><span>⚠ {error}</span><button type="button" onClick={()=>void load()} style={{ border:`1px solid ${T.border}`, borderRadius:6, background:'transparent', color:T.text, padding:'5px 8px', cursor:'pointer' }}>Tentar novamente</button></div>}

      <div className="arq-asset-body" data-has-selection={Boolean(sel)} style={{ display: unifiedOpen && sourceView!=='all' && sourceView!=='mine' ? 'none' : undefined }}>
        <div className="arq-asset-grid-wrap">
          {loading && <div className="arq-asset-grid">{[1,2,3,4,5,6].map(i=><div key={i} style={{ height:120, borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}` }} />)}</div>}
          {!loading && !error && items.length===0 && <div style={{ textAlign:'center', padding:'48px 16px', color:T.dim, fontSize:12 }}><p style={{ fontSize:28, margin:'0 0 8px' }}>📦</p><p>Nenhum item encontrado. Ajuste os filtros ou cadastre itens na Biblioteca.</p></div>}
          {!loading && !error && items.length>0 && <div className="arq-asset-grid">{items.map(item=><AssetCard key={item.id} item={item} selected={sel?.id===item.id} onSelect={()=>setSel(item)} />)}</div>}
        </div>
        {sel ? <AssetDetail item={sel} projectId={activeProject?.id ?? null} canApply={canApply} onClose={()=>setSel(null)} /> : <div className="arq-asset-detail" style={{ display:'flex', alignItems:'center', justifyContent:'center', color:T.dim, fontSize:11, textAlign:'center' }}>Selecione um item para ver detalhes e usar no projeto.</div>}
      </div>
    </div>
  )
}
