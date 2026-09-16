import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'
import { useWorkspace } from '../../workspace/context/WorkspaceContext'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface CatItem {
  id: string
  nome: string
  descricao: string | null
  categoria: string | null
  subcategoria: string | null
  fornecedor: string | null
  imagens: string[] | null
  especificacoes: Record<string, unknown> | null
  createdAt: string
}

function SpaceCard({ item, selected, onSelect }: { item: CatItem; selected: boolean; onSelect: () => void }) {
  const img = item.imagens?.[0]
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className="arq-space-card"
      style={{ textAlign:'left', cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, overflow:'hidden', padding:0 }}>
      <div style={{ height:90, background:'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', justifyContent:'center', borderBottom:`1px solid ${T.border}`, overflow:'hidden' }}>
        {img ? <img src={img} alt={item.nome} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <span style={{ fontSize:30 }}>🏠</span>}
      </div>
      <div style={{ padding:'10px 12px 12px' }}>
        <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{item.nome}</p>
        <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim }}>{item.categoria ?? '—'} · {item.subcategoria ?? '—'}</p>
        {item.fornecedor && <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>{item.fornecedor}</span>}
      </div>
    </button>
  )
}

function SpaceDetail({ item, projectId, canApply, onClose }: { item: CatItem; projectId: string | null; canApply: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [handoff, setHandoff] = useState(false)
  const prompt = item.descricao ?? item.nome
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(()=>setCopied(false), 2000)
    } catch { setCopied(false) }
  }
  const useInProject = () => {
    if (!projectId || !canApply) return
    sessionStorage.setItem('arqdor:pendingCatalogItem', JSON.stringify({ id:item.id, name:item.nome, category:item.categoria, source:'space-hub', projectId }))
    setHandoff(true)
    window.dispatchEvent(new CustomEvent('arqdor:navigate', { detail:{ module:'real-specification' } }))
  }

  return (
    <aside className="arq-space-detail" aria-label={`Detalhes de ${item.nome}`}>
      <button type="button" className="arq-space-back" onClick={onClose}>← Voltar aos ambientes</button>
      {item.imagens?.[0] ? <img src={item.imagens[0]} alt={item.nome} className="arq-space-hero" /> : <div className="arq-space-placeholder">🏠</div>}
      <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:'#fff' }}>{item.nome}</p>
      <p style={{ margin:'0 0 12px', fontSize:10, color:T.dim }}>{item.categoria ?? '—'} · {item.subcategoria ?? '—'}{item.fornecedor ? ` · ${item.fornecedor}` : ''}</p>
      {item.descricao && <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{item.descricao}</p>}

      {item.especificacoes && Object.keys(item.especificacoes).length > 0 && <div style={{ marginBottom:12 }}>
        {[['OBJETOS','objetos'],['MATERIAIS','materiais'],['DESIGN INTENT','designIntent'],['ESTILO','estilo']].map(([label,key]) => {
          const val = item.especificacoes?.[key]
          if (!val) return null
          const arr = Array.isArray(val) ? val : [val]
          return <div key={key} style={{ marginBottom:10 }}><p style={{ margin:'0 0 5px', fontSize:9, fontWeight:700, color:T.dim }}>{label}</p><div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>{arr.map((v,i)=><span key={i} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(255,255,255,0.05)', color:T.text }}>{String(v)}</span>)}</div></div>
        })}
      </div>}

      <div style={{ padding:'10px 12px', borderRadius:7, background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.2)', marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginBottom:4 }}><p style={{ margin:0, fontSize:9, fontWeight:700, color:T.dim }}>DESCRIÇÃO / PROMPT</p><button type="button" onClick={()=>void copy()} style={{ padding:'2px 8px', borderRadius:5, border:`1px solid ${T.border}`, background:'transparent', color:copied?'#4ade80':T.dim, cursor:'pointer', fontSize:9 }}>{copied?'✓ Copiado':'📋 Copiar'}</button></div>
        <p style={{ margin:0, fontSize:10, color:T.text, lineHeight:1.6, fontFamily:'monospace', overflowWrap:'anywhere' }}>{prompt}</p>
      </div>

      {!projectId && <div className="arq-space-alert warn">Abra ou selecione um projeto antes de usar esta referência.</div>}
      {projectId && !canApply && <div className="arq-space-alert error">Seu perfil não possui permissão para editar este projeto.</div>}
      <button type="button" onClick={useInProject} disabled={!projectId || !canApply || handoff} className="arq-space-use">{handoff?'✓ Abrindo projeto…':'🏠 Usar neste Projeto'}</button>
      {projectId && canApply && <p style={{ margin:'7px 0 0', fontSize:9, color:T.dim, lineHeight:1.45, textAlign:'center' }}>Você confirmará onde aplicar a referência. O sistema não substitui o ambiente inteiro automaticamente.</p>}
    </aside>
  )
}

export function SpaceHubView() {
  const { activeProject, hasPermission } = useWorkspace()
  const [items, setItems] = useState<CatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [catFilt, setCatFilt] = useState('')
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<CatItem|null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ limit:'60' })
      if (catFilt) params.set('categoria', catFilt)
      if (query) params.set('busca', query)
      const res = await fetch(`${BASE}/arch/catalogo?${params}`, { headers:authHeaders() })
      if (!res.ok) throw new Error(res.status === 403 ? 'Sem permissão para acessar os ambientes.' : `Falha ao carregar ambientes (${res.status}).`)
      const data: CatItem[] = await res.json()
      setItems(data)
      setSel(current => current && data.some(item=>item.id===current.id) ? current : null)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao carregar ambientes') }
    finally { setLoading(false) }
  }, [catFilt, query])

  useEffect(() => { void load() }, [load])
  const categories = [...new Set(items.map(i=>i.categoria).filter(Boolean))] as string[]
  const canApply = hasPermission('PROJECT_EDIT')

  return (
    <div className="arq-space-shell" data-has-selection={Boolean(sel)}>
      <style>{`
        .arq-space-shell{height:100%;display:flex;flex-direction:column;min-width:0}.arq-space-toolbar{padding:10px 16px;border-bottom:1px solid ${T.border};display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-shrink:0}.arq-space-body{flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,320px);min-height:0;overflow:hidden}.arq-space-list{overflow:auto;padding:16px;min-width:0}.arq-space-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}.arq-space-detail{height:100%;overflow:auto;padding:16px;border-left:1px solid ${T.border};box-sizing:border-box}.arq-space-back{display:none;margin:0 0 12px;padding:7px 10px;border:1px solid ${T.border};border-radius:7px;background:transparent;color:${T.text};cursor:pointer}.arq-space-hero,.arq-space-placeholder{width:100%;height:110px;border-radius:8px;margin-bottom:14px;border:1px solid ${T.border};box-sizing:border-box}.arq-space-hero{object-fit:cover}.arq-space-placeholder{display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.04);font-size:42px}.arq-space-alert{margin-bottom:10px;padding:8px 10px;border-radius:7px;font-size:10px;line-height:1.45}.arq-space-alert.warn{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.22);color:#fbbf24}.arq-space-alert.error{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.22);color:#f87171}.arq-space-use{width:100%;padding:10px;border-radius:8px;border:0;background:${T.purple};color:#fff;cursor:pointer;font-size:12px;font-weight:700}.arq-space-use:disabled{background:rgba(255,255,255,.08);color:${T.dim};cursor:not-allowed}
        @media(max-width:760px){.arq-space-toolbar{padding:10px}.arq-space-toolbar input{flex-basis:100%}.arq-space-body{display:block;overflow:auto}.arq-space-list{padding:10px}.arq-space-grid{grid-template-columns:1fr}.arq-space-detail{height:auto;min-height:100%;border-left:0;border-top:1px solid ${T.border};padding:14px}.arq-space-back{display:inline-flex}.arq-space-shell[data-has-selection="true"] .arq-space-list{display:none}}
      `}</style>
      <div className="arq-space-toolbar">
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar ambiente…" style={{ flex:1, minWidth:120, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'7px 10px', outline:'none' }} />
        <select value={catFilt} onChange={e=>setCatFilt(e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:catFilt?T.text:T.dim, fontSize:10, padding:'7px 8px' }}><option value="">Todos os tipos</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <button type="button" onClick={()=>void load()} disabled={loading} style={{ padding:'7px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:loading?'wait':'pointer', fontSize:10 }}>{loading?'…':'↻'}</button>
        <span style={{ fontSize:10, color:T.dim }}>{items.length} ambientes</span>
      </div>
      {error && <div style={{ padding:'10px 16px', background:'rgba(248,113,113,0.08)', borderBottom:'1px solid rgba(248,113,113,0.2)', fontSize:11, color:'#f87171', display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}><span>⚠ {error}</span><button type="button" onClick={()=>void load()} style={{ border:`1px solid ${T.border}`, borderRadius:6, background:'transparent', color:T.text, padding:'5px 8px', cursor:'pointer' }}>Tentar novamente</button></div>}
      <div className="arq-space-body">
        <div className="arq-space-list">
          {loading && <div className="arq-space-grid">{[1,2,3,4].map(i=><div key={i} style={{ height:140, borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}` }} />)}</div>}
          {!loading && !error && items.length===0 && <div style={{ textAlign:'center', padding:'48px 16px', color:T.dim, fontSize:12 }}><p style={{ margin:'0 0 8px', fontSize:28 }}>🏠</p><p>Nenhum ambiente encontrado. Ajuste os filtros ou cadastre referências na Biblioteca.</p></div>}
          {!loading && !error && items.length>0 && <div className="arq-space-grid">{items.map(item=><SpaceCard key={item.id} item={item} selected={sel?.id===item.id} onSelect={()=>setSel(item)} />)}</div>}
        </div>
        {sel ? <SpaceDetail item={sel} projectId={activeProject?.id ?? null} canApply={canApply} onClose={()=>setSel(null)} /> : <div className="arq-space-detail" style={{ display:'flex', alignItems:'center', justifyContent:'center', color:T.dim, fontSize:11, textAlign:'center' }}>Selecione um ambiente para ver detalhes e usar como referência.</div>}
      </div>
    </div>
  )
}
