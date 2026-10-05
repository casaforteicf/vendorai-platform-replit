// ─── Smart Specification — Sprint 4 ───────────────────────────────────────────
// Transforma um render em especificação inicial.
// Fluxo: selecionar render → IA identifica itens → busca catálogo → memorial.

import { useState, useEffect, useCallback, useRef } from 'react'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function authHeaders(json = false): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return {
    ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface GalleryRender {
  id: string; imageUrl: string | null; cenaNome: string | null
  createdAt: string; projetoId: string; origem: string | null
}
interface SpecItem {
  id: string; specificationId: string; categoria: string; descricao: string
  quantidade: number; confianca: string; status: 'pendente' | 'especificado' | 'nao_especificado'
  catalogoItemId: string | null; overrideNome: string | null; overrideFornecedor: string | null
  overridePreco: string | null
  codigo: string | null; modelo: string | null; fabricante: string | null; sku: string | null
  configuracao: string | null; material: string | null; acabamento: string | null; cor: string | null
  origemMedida: 'projeto' | 'catalogo' | 'confirmado' | 'estimativa_ia' | 'pendente' | null
  unidadeQuantificacao: string | null
  larguraCm: string | null; alturaCm: string | null; profundidadeCm: string | null
  notes: string | null
}
interface Specification {
  id: string; projetoId: string; renderId: string | null; renderImageUrl: string | null
  itemsCount: number; specifiedCount: number; status: string; createdAt: string
}
interface CatalogMatch {
  id: string; nome: string; categoria: string | null; fornecedor: string | null
  precoBase: string | null; imagens: string[] | null
}

// ─── Category icons ───────────────────────────────────────────────────────────
const CAT_ICON: Record<string, string> = {
  'Mobiliário':     '🛋',
  'Iluminação':     '💡',
  'Revestimento':   '🪟',
  'Metal':          '🔧',
  'Louça':          '🚿',
  'Decoração':      '🖼',
  'Eletrodoméstico':'⚡',
  'Esquadria':      '🚪',
  'Componente':     '🔩',
}
function catIcon(cat: string) { return CAT_ICON[cat] ?? '📦' }

function confColor(c: string) {
  const n = parseFloat(c)
  if (n >= 0.85) return T.green
  if (n >= 0.70) return T.amber
  return '#f87171'
}
function confLabel(c: string) {
  const n = parseFloat(c)
  if (n >= 0.85) return 'Alta'
  if (n >= 0.70) return 'Média'
  return 'Baixa'
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes ss-shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position: 600px 0; }
  }
  @keyframes ss-fadeIn {
    from { opacity:0; transform:translateY(6px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes ss-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes ss-pulse {
    0%,100% { opacity:1; }
    50%     { opacity:0.4; }
  }
  .ss-render-card {
    transition: border-color 0.18s ease, transform 0.18s ease !important;
    cursor: pointer;
  }
  .ss-render-card:hover { transform: translateY(-2px) !important; border-color: rgba(167,139,250,0.5) !important; }
  .ss-item-row {
    transition: background 0.15s ease, border-color 0.15s ease !important;
  }
  .ss-item-row:hover { background: rgba(255,255,255,0.04) !important; }
  .ss-btn {
    transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease !important;
  }
  .ss-btn:hover { transform: translateY(-1px) !important; }
  .ss-shimmer {
    background: linear-gradient(90deg,
      rgba(255,255,255,0.04) 0px,
      rgba(255,255,255,0.09) 80px,
      rgba(255,255,255,0.04) 160px);
    background-size: 600px 100%;
    animation: ss-shimmer 1.4s ease infinite;
  }
`

// ─── Analyzing animation ──────────────────────────────────────────────────────
function AnalyzingState({ imageUrl }: { imageUrl: string | null }) {
  const [step, setStep] = useState(0)
  const steps = ['Carregando imagem…', 'Detectando elementos…', 'Classificando itens…', 'Finalizando análise…']

  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 2200)
    return () => clearInterval(t)
  }, [steps.length])

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24, padding:'40px 20px', animation:'ss-fadeIn 0.4s ease' }}>
      {imageUrl && (
        <div style={{ position:'relative' }}>
          <img src={imageUrl} alt="render" style={{ width:200, height:130, objectFit:'cover', borderRadius:12, border:`1px solid ${T.border}`, opacity:0.5 }}/>
          <div style={{
            position:'absolute', inset:0, borderRadius:12,
            background:'linear-gradient(135deg, rgba(124,58,237,0.4), rgba(96,165,250,0.2))',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <div style={{ width:36, height:36, borderRadius:'50%', border:`3px solid ${T.purpleL}`, borderTopColor:'transparent', animation:'ss-spin 0.9s linear infinite' }}/>
          </div>
        </div>
      )}
      <div style={{ textAlign:'center' }}>
        <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:800, color:'#fff' }}>Analisando com IA…</p>
        <p style={{ margin:0, fontSize:12, color:T.purpleL, fontWeight:600, animation:'ss-pulse 1.5s ease infinite' }}>{steps[step]}</p>
      </div>
      <div style={{ display:'flex', gap:6 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ width:6, height:6, borderRadius:'50%', background: i <= step ? T.purpleL : T.border, transition:'background 0.3s' }}/>
        ))}
      </div>
    </div>
  )
}

// ─── Spec Item Row ────────────────────────────────────────────────────────────
function SpecItemRow({
  item, expanded, onToggle, onSearch, onSetStatus, catalogMatches, searching, onUseMatch,
}: {
  item: SpecItem
  expanded: boolean
  onToggle: () => void
  onSearch: () => void
  onSetStatus: (s: SpecItem['status']) => void
  catalogMatches: CatalogMatch[] | null
  searching: boolean
  onUseMatch: (match: CatalogMatch) => void
  onSaveDetails: (patch: Partial<SpecItem>) => Promise<void>
}) {
  const cc   = confColor(item.confianca)
  const pct  = Math.round(parseFloat(item.confianca) * 100)
  const [details, setDetails] = useState({
    larguraCm: item.larguraCm ?? '',
    alturaCm: item.alturaCm ?? '',
    profundidadeCm: item.profundidadeCm ?? '',
    modelo: item.modelo ?? '',
    fabricante: item.fabricante ?? '',
    sku: item.sku ?? '',
    configuracao: item.configuracao ?? '',
    material: item.material ?? '',
    acabamento: item.acabamento ?? '',
    cor: item.cor ?? '',
    origemMedida: item.origemMedida ?? 'pendente',
    unidadeQuantificacao: item.unidadeQuantificacao ?? 'un',
    notes: item.notes ?? '',
  })
  const [savingDetails, setSavingDetails] = useState(false)

  useEffect(() => {
    setDetails({
      larguraCm: item.larguraCm ?? '',
      alturaCm: item.alturaCm ?? '',
      profundidadeCm: item.profundidadeCm ?? '',
      modelo: item.modelo ?? '',
      fabricante: item.fabricante ?? '',
      sku: item.sku ?? '',
      configuracao: item.configuracao ?? '',
      material: item.material ?? '',
      acabamento: item.acabamento ?? '',
      cor: item.cor ?? '',
      origemMedida: item.origemMedida ?? 'pendente',
      unidadeQuantificacao: item.unidadeQuantificacao ?? 'un',
      notes: item.notes ?? '',
    })
  }, [item.id, item.larguraCm, item.alturaCm, item.profundidadeCm, item.modelo, item.fabricante, item.sku, item.configuracao, item.material, item.acabamento, item.cor, item.origemMedida, item.unidadeQuantificacao, item.notes])

  const isFurniture = ['Mobiliário', 'Componente'].includes(item.categoria) || item.categoria.toLowerCase().includes('marcen')
  const statusColors: Record<SpecItem['status'], string> = {
    pendente:           T.amber,
    especificado:       T.green,
    nao_especificado:   T.dim,
  }
  const statusLabels: Record<SpecItem['status'], string> = {
    pendente:           '● Pendente',
    especificado:       '✓ Especificado',
    nao_especificado:   '○ Referência',
  }

  return (
    <div style={{ marginBottom:6 }}>
      {/* Main row */}
      <div
        className="ss-item-row"
        onClick={onToggle}
        style={{
          display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
          borderRadius: expanded ? '8px 8px 0 0' : 8,
          background: expanded ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.02)',
          border:`1px solid ${expanded ? 'rgba(124,58,237,0.3)' : T.border}`,
          cursor:'pointer',
          borderBottom: expanded ? 'none' : undefined,
        }}
      >
        <span style={{ fontSize:18, flexShrink:0 }}>{catIcon(item.categoria)}</span>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
            <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {item.descricao}
            </p>
            {item.quantidade > 1 && (
              <span style={{ padding:'1px 6px', borderRadius:10, fontSize:9, fontWeight:700, background:'rgba(255,255,255,0.08)', color:T.dim, flexShrink:0 }}>
                ×{item.quantidade}
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <span style={{ fontSize:9, color:T.dim, fontWeight:700 }}>{item.categoria.toUpperCase()}</span>
            <div style={{ height:4, width:40, borderRadius:2, background:T.border, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background:cc, borderRadius:2 }}/>
            </div>
            <span style={{ fontSize:9, color:cc, fontWeight:700 }}>{confLabel(item.confianca)} {pct}%</span>
          </div>
        </div>

        <span style={{ fontSize:10, fontWeight:700, color:statusColors[item.status], flexShrink:0 }}>
          {statusLabels[item.status]}
        </span>
        <span style={{ color:T.dim, fontSize:11 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{
          border:`1px solid rgba(124,58,237,0.3)`, borderTop:'none',
          borderRadius:'0 0 8px 8px', background:'rgba(124,58,237,0.04)',
          padding:'12px', animation:'ss-fadeIn 0.2s ease',
        }}>
          {/* Ficha técnica do mobiliário / elemento */}
          {isFurniture && (
            <div style={{ marginBottom:12, padding:12, borderRadius:8, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.025)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center', marginBottom:10 }}>
                <div>
                  <p style={{ margin:0, fontSize:11, fontWeight:800, color:'#fff' }}>Ficha técnica {item.codigo ? `· ${item.codigo}` : ''}</p>
                  <p style={{ margin:'2px 0 0', fontSize:9, color:T.dim }}>Medidas, configuração e materiais usados no projeto e no orçamento.</p>
                </div>
                <span style={{ fontSize:9, color: details.origemMedida === 'confirmado' || details.origemMedida === 'projeto' || details.origemMedida === 'catalogo' ? T.green : T.amber, fontWeight:700 }}>
                  {details.origemMedida === 'projeto' ? 'MEDIDA DO PROJETO' :
                   details.origemMedida === 'catalogo' ? 'MEDIDA DO CATÁLOGO' :
                   details.origemMedida === 'confirmado' ? 'MEDIDA CONFIRMADA' :
                   details.origemMedida === 'estimativa_ia' ? 'ESTIMATIVA IA' : 'MEDIDA PENDENTE'}
                </span>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:8, marginBottom:8 }}>
                {[
                  ['larguraCm','Largura (cm)'],
                  ['profundidadeCm','Profundidade (cm)'],
                  ['alturaCm','Altura (cm)'],
                ].map(([key,label]) => (
                  <label key={key} style={{ fontSize:9, color:T.dim }}>
                    {label}
                    <input
                      type="number" min="0" step="0.1"
                      value={(details as any)[key]}
                      onChange={e => setDetails(d => ({ ...d, [key]: e.target.value }))}
                      style={{ marginTop:4, width:'100%', boxSizing:'border-box', padding:'7px 8px', borderRadius:6, border:`1px solid ${T.border}`, background:'rgba(0,0,0,0.18)', color:'#fff', fontSize:10 }}
                    />
                  </label>
                ))}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:8, marginBottom:8 }}>
                {[
                  ['modelo','Modelo'],
                  ['fabricante','Fabricante'],
                  ['sku','SKU / Código fabricante'],
                  ['configuracao','Configuração'],
                  ['material','Material / Revestimento'],
                  ['acabamento','Acabamento'],
                  ['cor','Cor'],
                ].map(([key,label]) => (
                  <label key={key} style={{ fontSize:9, color:T.dim }}>
                    {label}
                    <input
                      value={(details as any)[key]}
                      onChange={e => setDetails(d => ({ ...d, [key]: e.target.value }))}
                      style={{ marginTop:4, width:'100%', boxSizing:'border-box', padding:'7px 8px', borderRadius:6, border:`1px solid ${T.border}`, background:'rgba(0,0,0,0.18)', color:'#fff', fontSize:10 }}
                    />
                  </label>
                ))}
                <label style={{ fontSize:9, color:T.dim }}>
                  Origem das medidas
                  <select
                    value={details.origemMedida}
                    onChange={e => setDetails(d => ({ ...d, origemMedida: e.target.value as any }))}
                    style={{ marginTop:4, width:'100%', padding:'7px 8px', borderRadius:6, border:`1px solid ${T.border}`, background:'#171923', color:'#fff', fontSize:10 }}
                  >
                    <option value="pendente">Pendente</option>
                    <option value="projeto">Geometria do projeto</option>
                    <option value="catalogo">Catálogo / fabricante</option>
                    <option value="confirmado">Confirmada em projeto/obra</option>
                    <option value="estimativa_ia">Estimativa visual da IA</option>
                  </select>
                </label>
              </div>

              <label style={{ fontSize:9, color:T.dim, display:'block' }}>
                Observações técnicas
                <textarea
                  rows={2}
                  value={details.notes}
                  onChange={e => setDetails(d => ({ ...d, notes:e.target.value }))}
                  style={{ marginTop:4, width:'100%', boxSizing:'border-box', padding:'7px 8px', borderRadius:6, border:`1px solid ${T.border}`, background:'rgba(0,0,0,0.18)', color:'#fff', fontSize:10, resize:'vertical' }}
                />
              </label>

              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
                <button
                  className="ss-btn"
                  disabled={savingDetails}
                  onClick={async () => {
                    setSavingDetails(true)
                    try {
                      await onSaveDetails({
                        larguraCm: details.larguraCm || null,
                        profundidadeCm: details.profundidadeCm || null,
                        alturaCm: details.alturaCm || null,
                        modelo: details.modelo || null,
                        fabricante: details.fabricante || null,
                        sku: details.sku || null,
                        configuracao: details.configuracao || null,
                        material: details.material || null,
                        acabamento: details.acabamento || null,
                        cor: details.cor || null,
                        origemMedida: details.origemMedida as SpecItem['origemMedida'],
                        unidadeQuantificacao: details.unidadeQuantificacao || 'un',
                        notes: details.notes || null,
                      } as Partial<SpecItem>)
                    } finally {
                      setSavingDetails(false)
                    }
                  }}
                  style={{ padding:'7px 12px', borderRadius:7, border:`1px solid ${T.green}`, background:'rgba(74,222,128,0.1)', color:T.green, cursor:'pointer', fontSize:10, fontWeight:800 }}
                >
                  {savingDetails ? 'Salvando…' : 'Salvar ficha técnica'}
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
            <button className="ss-btn" onClick={onSearch} disabled={searching} style={{
              padding:'6px 12px', borderRadius:7, border:`1px solid ${T.purple}`,
              background:'rgba(124,58,237,0.15)', color:T.purpleL, cursor:'pointer',
              fontSize:10, fontWeight:700, display:'flex', alignItems:'center', gap:5,
            }}>
              {searching ? <span style={{ animation:'ss-spin 0.8s linear infinite', display:'inline-block' }}>⟳</span> : '🔍'}
              Buscar no Catálogo
            </button>
            <a
              href={`${import.meta.env.BASE_URL}arch/marketplace?q=${encodeURIComponent(item.descricao)}`}
              className="ss-btn"
              style={{
                padding:'6px 12px', borderRadius:7, border:`1px solid ${T.border}`,
                background:'rgba(255,255,255,0.04)', color:T.textSub, cursor:'pointer',
                fontSize:10, fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:5,
              }}
            >
              🛒 Marketplace
            </a>
            {item.status !== 'especificado' && (
              <button className="ss-btn" onClick={() => onSetStatus('nao_especificado')} style={{
                padding:'6px 12px', borderRadius:7, border:`1px solid ${T.border}`,
                background:'transparent', color:T.dim, cursor:'pointer', fontSize:10, fontWeight:700,
              }}>
                ○ Somente referência
              </button>
            )}
            {item.status !== 'pendente' && (
              <button className="ss-btn" onClick={() => onSetStatus('pendente')} style={{
                padding:'6px 12px', borderRadius:7, border:`1px solid ${T.border}`,
                background:'transparent', color:T.amber, cursor:'pointer', fontSize:10, fontWeight:700,
              }}>
                ↩ Reabrir
              </button>
            )}
          </div>

          {/* Catalog matches */}
          {searching && (
            <div style={{ display:'flex', gap:8 }}>
              {[1,2,3].map(i => <div key={i} className="ss-shimmer" style={{ flex:1, height:60, borderRadius:7 }}/>)}
            </div>
          )}

          {catalogMatches !== null && !searching && (
            catalogMatches.length === 0 ? (
              <div style={{ padding:'10px 12px', borderRadius:7, background:'rgba(251,146,60,0.06)', border:`1px solid rgba(251,146,60,0.15)`, fontSize:11, color:T.amber }}>
                Nenhum item encontrado no catálogo para "{item.descricao}".{' '}
                <a href={`${import.meta.env.BASE_URL}arch/marketplace`} style={{ color:T.amber, fontWeight:700 }}>Buscar no Marketplace →</a>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <p style={{ margin:'0 0 6px', fontSize:10, color:T.dim, fontWeight:700 }}>
                  {catalogMatches.length} resultado(s) no catálogo:
                </p>
                {catalogMatches.map(m => (
                  <div key={m.id} style={{
                    display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                    borderRadius:7, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`,
                  }}>
                    {m.imagens?.[0] ? (
                      <img src={m.imagens[0]} alt={m.nome} style={{ width:40, height:40, objectFit:'cover', borderRadius:5 }}/>
                    ) : (
                      <div style={{ width:40, height:40, borderRadius:5, background:'rgba(124,58,237,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>📦</div>
                    )}
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:'0 0 1px', fontSize:11, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.nome}</p>
                      <p style={{ margin:0, fontSize:9, color:T.dim }}>{m.fornecedor ?? '—'} · {m.categoria ?? '—'}</p>
                    </div>
                    {m.precoBase && (
                      <span style={{ fontSize:10, color:T.purpleL, fontWeight:700, flexShrink:0 }}>
                        R$ {Number(m.precoBase).toLocaleString('pt-BR', { minimumFractionDigits:2 })}
                      </span>
                    )}
                    <button className="ss-btn" onClick={() => onUseMatch(m)} style={{
                      padding:'5px 10px', borderRadius:6, border:`1px solid ${T.green}`,
                      background:'rgba(74,222,128,0.1)', color:T.green, cursor:'pointer', fontSize:10, fontWeight:700, flexShrink:0,
                    }}>
                      Usar ✓
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          {/* If specified — show what was linked */}
          {item.status === 'especificado' && item.overrideNome && (
            <div style={{ padding:'8px 10px', borderRadius:7, background:'rgba(74,222,128,0.06)', border:`1px solid rgba(74,222,128,0.2)`, fontSize:11, color:T.green }}>
              ✓ Vinculado: <strong>{item.overrideNome}</strong>{item.overrideFornecedor ? ` · ${item.overrideFornecedor}` : ''}
              {item.overridePreco ? ` · R$ ${Number(item.overridePreco).toFixed(2)}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Memorial generator ───────────────────────────────────────────────────────
function buildMemorial(items: SpecItem[]): string {
  const specified   = items.filter(i => i.status === 'especificado')
  const pending     = items.filter(i => i.status === 'pendente')
  const reference   = items.filter(i => i.status === 'nao_especificado')

  const grouped = specified.reduce<Record<string, SpecItem[]>>((acc, item) => {
    ;(acc[item.categoria] = acc[item.categoria] ?? []).push(item)
    return acc
  }, {})

  const fabricantes = [...new Set(specified.map(i => i.overrideFornecedor).filter(Boolean))]

  const lines: string[] = [
    '════════════════════════════════════════════════════════',
    '  MEMORIAL PRELIMINAR DE ESPECIFICAÇÕES — ARQDOR.AI',
    `  Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    '════════════════════════════════════════════════════════',
    '',
    `RESUMO: ${specified.length} especificados · ${pending.length} pendentes · ${reference.length} somente referência`,
    '',
    '────────────────────────────────────────────────────────',
    '  ITENS ESPECIFICADOS POR CATEGORIA',
    '────────────────────────────────────────────────────────',
  ]

  for (const [cat, catItems] of Object.entries(grouped)) {
    lines.push(`\n  ${catIcon(cat)} ${cat.toUpperCase()}`)
    catItems.forEach(item => {
      lines.push(`    • ${item.descricao} (×${item.quantidade})`)
      if (item.overrideNome)        lines.push(`      Produto:    ${item.overrideNome}`)
      if (item.overrideFornecedor)  lines.push(`      Fabricante: ${item.overrideFornecedor}`)
      if (item.overridePreco)       lines.push(`      Preço un.:  R$ ${Number(item.overridePreco).toFixed(2)}`)
    })
  }

  if (pending.length > 0) {
    lines.push('', '────────────────────────────────────────────────────────')
    lines.push('  ITENS PENDENTES DE ESPECIFICAÇÃO')
    lines.push('────────────────────────────────────────────────────────')
    pending.forEach(item => lines.push(`    ○ ${item.categoria} — ${item.descricao} (×${item.quantidade})`))
  }

  if (fabricantes.length > 0) {
    lines.push('', '────────────────────────────────────────────────────────')
    lines.push('  RESUMO DE FABRICANTES')
    lines.push('────────────────────────────────────────────────────────')
    fabricantes.forEach(f => {
      const count = specified.filter(i => i.overrideFornecedor === f).length
      lines.push(`    • ${f} (${count} item${count !== 1 ? 's' : ''})`)
    })
  }

  lines.push('', '════════════════════════════════════════════════════════')
  return lines.join('\n')
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SmartSpecModule({ projectId, onBack }: { projectId?: string | null; onBack?: () => void }) {
  const [renders,      setRenders]      = useState<GalleryRender[]>([])
  const [selRender,    setSelRender]    = useState<GalleryRender | null>(null)
  const [spec,         setSpec]         = useState<Specification | null>(null)
  const [items,        setItems]        = useState<SpecItem[]>([])
  const [analyzing,    setAnalyzing]    = useState(false)
  const [loadingSpec,  setLoadingSpec]  = useState(false)
  const [activeTab,    setActiveTab]    = useState<'todos'|'especificados'|'pendentes'|'nao_especificados'>('todos')
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [catalogMap,   setCatalogMap]   = useState<Record<string, CatalogMatch[] | null>>({})
  const [searchingMap, setSearchingMap] = useState<Record<string, boolean>>({})
  const [memorial,     setMemorial]     = useState<string | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [loadedSpecProjectId, setLoadedSpecProjectId] = useState<string | null>(null)
  const [sendingBudget, setSendingBudget] = useState(false)
  const [budgetMsg, setBudgetMsg] = useState<string | null>(null)
  const [requestedRenderId] = useState(() => typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('render_id') : null)
  const [requestedProjectId] = useState(() => typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('project_id') : null)
  const effectiveProjectId = projectId ?? requestedProjectId
  const autoAnalyzeRef = useRef<string | null>(null)

  // Load only renders from the active project. This prevents the specification
  // studio from mixing scenes/specifications from different projects in a tenant.
  useEffect(() => {
    const qs = new URLSearchParams({ limit: '50' })
    if (effectiveProjectId) qs.set('projetoId', effectiveProjectId)

    fetch(`${BASE}/arch/renders/gallery?${qs.toString()}`, { headers: authHeaders() })
      .then(r => r.json())
      .then((data: GalleryRender[]) => {
        const scoped = effectiveProjectId ? data.filter(render => render.projetoId === effectiveProjectId) : data
        setRenders(scoped)
        if (scoped.length === 0) {
          setSelRender(null)
          setSpec(null)
          setItems([])
          return
        }
        const preferred =
          (requestedRenderId ? scoped.find(render => render.id === requestedRenderId) : undefined) ??
          scoped[0]
        setSelRender(preferred ?? null)
      })
      .catch(() => {
        setRenders([])
        setSelRender(null)
      })
  }, [requestedRenderId, effectiveProjectId])

  // Load existing spec when render selected
  const loadExistingSpec = useCallback(async (projetoId: string) => {
    setLoadingSpec(true)
    setLoadedSpecProjectId(null)
    try {
      const r = await fetch(`${BASE}/arch/specification/${projetoId}`, { headers: authHeaders() })
      if (r.ok) {
        const data = await r.json()
        setSpec(data.spec)
        setItems(data.items)
      } else {
        setSpec(null)
        setItems([])
      }
    } finally {
      setLoadedSpecProjectId(projetoId)
      setLoadingSpec(false)
    }
  }, [])

  useEffect(() => {
    if (selRender?.projetoId) loadExistingSpec(selRender.projetoId)
  }, [selRender?.projetoId, loadExistingSpec])

  // Analyze render
  const analyze = async () => {
    if (!selRender?.imageUrl || !selRender.projetoId) return
    setAnalyzing(true); setError(null); setSpec(null); setItems([])
    setCatalogMap({}); setExpandedItem(null); setMemorial(null)
    try {
      const r = await fetch(`${BASE}/arch/specification/analyze`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ imageUrl: selRender.imageUrl, projetoId: selRender.projetoId, renderId: selRender.id }),
      })
      if (!r.ok) {
        const e = await r.json()
        throw new Error(e.error ?? `HTTP ${r.status}`)
      }
      const data = await r.json()
      setSpec(data.spec)
      setItems(data.items)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao analisar render')
    } finally {
      setAnalyzing(false)
    }
  }

  // A handoff from an approved render starts specification automatically.
  // Existing specification for the same render is reused; only a new source triggers analysis.
  useEffect(() => {
    if (!requestedRenderId || selRender?.id !== requestedRenderId) return
    if (!selRender.imageUrl || loadedSpecProjectId !== selRender.projetoId) return
    if (loadingSpec || analyzing) return
    if (spec?.renderId === requestedRenderId) return
    if (autoAnalyzeRef.current === requestedRenderId) return
    autoAnalyzeRef.current = requestedRenderId
    void analyze()
  }, [requestedRenderId, selRender?.id, selRender?.imageUrl, selRender?.projetoId, loadedSpecProjectId, loadingSpec, analyzing, spec?.renderId])

  const sendToBudget = async () => {
    if (!spec?.id) return
    const itemIds = items.filter(item => item.status === 'especificado').map(item => item.id)
    if (itemIds.length === 0) {
      setBudgetMsg('Confirme pelo menos um item antes de enviar ao orçamento.')
      return
    }
    setSendingBudget(true)
    setBudgetMsg(null)
    try {
      const r = await fetch(`${BASE}/arch/specification/${spec.id}/enviar-orcamento`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ itemIds }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
      const pending = Number(data.pendentes ?? 0)
      setBudgetMsg(pending > 0
        ? `${data.itensCriados} item(ns) enviados ao orçamento; ${pending} pendência(s) permanecem na especificação.`
        : `${data.itensCriados} item(ns) enviados ao orçamento.`)
    } catch (e: unknown) {
      setBudgetMsg(e instanceof Error ? e.message : 'Não foi possível enviar ao orçamento.')
    } finally {
      setSendingBudget(false)
    }
  }

  // Search catalog for an item
  const searchCatalog = async (item: SpecItem) => {
    setSearchingMap(m => ({ ...m, [item.id]: true }))
    setCatalogMap(m => ({ ...m, [item.id]: null }))
    try {
      const r = await fetch(`${BASE}/arch/catalogo?busca=${encodeURIComponent(item.descricao)}&limit=5`, { headers: authHeaders() })
      const data: CatalogMatch[] = r.ok ? await r.json() : []
      setCatalogMap(m => ({ ...m, [item.id]: data }))
    } finally {
      setSearchingMap(m => ({ ...m, [item.id]: false }))
    }
  }

  // Update item status
  const updateItem = async (itemId: string, patch: Partial<SpecItem>) => {
    try {
      const r = await fetch(`${BASE}/arch/specification/item/${itemId}`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify(patch),
      })
      if (r.ok) {
        const updated: SpecItem = await r.json()
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updated } : i))
        if (patch.status) setSpec(prev => prev ? {
          ...prev,
          specifiedCount: patch.status === 'especificado'
            ? prev.specifiedCount + 1
            : Math.max(0, prev.specifiedCount - (items.find(i => i.id === itemId)?.status === 'especificado' ? 1 : 0)),
        } : prev)
      }
    } catch {}
  }

  // Use catalog match
  const useMatch = async (item: SpecItem, match: CatalogMatch) => {
    await updateItem(item.id, {
      status:             'especificado',
      catalogoItemId:     match.id,
      overrideNome:       match.nome,
      overrideFornecedor: match.fornecedor ?? undefined,
      overridePreco:      match.precoBase ?? undefined,
    } as Partial<SpecItem>)
    setCatalogMap(m => ({ ...m, [item.id]: null }))
    setExpandedItem(null)
  }

  // Filtered items
  const filteredItems = items.filter(i => {
    if (activeTab === 'todos')             return true
    if (activeTab === 'especificados')     return i.status === 'especificado'
    if (activeTab === 'pendentes')         return i.status === 'pendente'
    if (activeTab === 'nao_especificados') return i.status === 'nao_especificado'
    return true
  })

  const counts = {
    todos:            items.length,
    especificados:    items.filter(i => i.status === 'especificado').length,
    pendentes:        items.filter(i => i.status === 'pendente').length,
    nao_especificados:items.filter(i => i.status === 'nao_especificado').length,
  }

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:T.bg }}>
      <style>{CSS}</style>

      {/* ── Header ── */}
      <div style={{
        padding:'12px 20px', flexShrink:0,
        background:'linear-gradient(180deg, rgba(124,58,237,0.08) 0%, transparent 100%)',
        borderBottom:`1px solid ${T.border}`,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {onBack && (
            <button
              type="button"
              className="ss-btn"
              onClick={onBack}
              aria-label="Voltar ao projeto"
              title="Voltar ao projeto"
              style={{
                width:34, height:34, flexShrink:0, borderRadius:9,
                border:`1px solid ${T.border}`,
                background:'rgba(255,255,255,0.04)', color:'#fff',
                display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer', fontSize:18, fontWeight:800, lineHeight:1,
              }}
            >
              ←
            </button>
          )}
          <div style={{ flex:1 }}>
            <h2 style={{ margin:'0 0 2px', fontSize:16, fontWeight:900, color:'#fff', letterSpacing:'-0.02em' }}>
              ✨ Smart Specification
            </h2>
            <p style={{ margin:0, fontSize:10, color:T.dim }}>
              Módulo independente · gera a especificação automaticamente a partir do render aprovado
            </p>
          </div>
          {spec && (
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <div style={{ textAlign:'center', padding:'6px 12px', borderRadius:8, background:'rgba(74,222,128,0.08)', border:`1px solid rgba(74,222,128,0.2)` }}>
                <p style={{ margin:'0 0 1px', fontSize:16, fontWeight:900, color:T.green }}>{spec.specifiedCount}</p>
                <p style={{ margin:0, fontSize:8, color:T.dim, fontWeight:700 }}>ESPECIFICADOS</p>
              </div>
              <div style={{ textAlign:'center', padding:'6px 12px', borderRadius:8, background:'rgba(251,191,36,0.08)', border:`1px solid rgba(251,191,36,0.2)` }}>
                <p style={{ margin:'0 0 1px', fontSize:16, fontWeight:900, color:T.amber }}>{counts.pendentes}</p>
                <p style={{ margin:0, fontSize:8, color:T.dim, fontWeight:700 }}>PENDENTES</p>
              </div>
              <div style={{ textAlign:'center', padding:'6px 12px', borderRadius:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}` }}>
                <p style={{ margin:'0 0 1px', fontSize:16, fontWeight:900, color:'#fff' }}>{spec.itemsCount}</p>
                <p style={{ margin:0, fontSize:8, color:T.dim, fontWeight:700 }}>TOTAL</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── Left: Render Picker + Controls ── */}
        <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', background:T.sidebar }}>

          {/* Render picker */}
          <div style={{ padding:'10px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <p style={{ margin:'0 0 8px', fontSize:9, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>SELECIONAR RENDER</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:300, overflowY:'auto' }}>
              {renders.length === 0 && (
                <div style={{ padding:'20px 10px', textAlign:'center', color:T.dim, fontSize:11 }}>
                  <div style={{ fontSize:24, marginBottom:6 }}>🎬</div>
                  Nenhum render encontrado.<br/>
                  <a href={`${import.meta.env.BASE_URL}arch/render`} style={{ color:T.purpleL, fontWeight:700, textDecoration:'none' }}>Gerar renders →</a>
                </div>
              )}
              {renders.map(r => (
                <div
                  key={r.id}
                  className="ss-render-card"
                  onClick={() => { setSelRender(r); setMemorial(null); setCatalogMap({}) }}
                  style={{
                    borderRadius:8, overflow:'hidden',
                    border:`1px solid ${selRender?.id === r.id ? T.purple : T.border}`,
                    background: selRender?.id === r.id ? 'rgba(124,58,237,0.1)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  {r.imageUrl
                    ? <img src={r.imageUrl} alt="" style={{ width:'100%', height:60, objectFit:'cover', display:'block' }}/>
                    : <div style={{ height:60, background:'rgba(124,58,237,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🎨</div>
                  }
                  <div style={{ padding:'5px 8px' }}>
                    <p style={{ margin:0, fontSize:9, color:'#fff', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {r.cenaNome ?? 'Sem nome'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Analyze CTA */}
          <div style={{ padding:'12px', flexShrink:0 }}>
            <button
              onClick={analyze}
              disabled={!selRender?.imageUrl || analyzing}
              className="ss-btn"
              style={{
                width:'100%', padding:'12px', borderRadius:10, border:'none', cursor:'pointer',
                background: !selRender?.imageUrl || analyzing
                  ? 'rgba(124,58,237,0.2)'
                  : `linear-gradient(135deg, ${T.purple} 0%, #5b21b6 100%)`,
                color:'#fff', fontSize:12, fontWeight:800,
                boxShadow: selRender?.imageUrl && !analyzing ? '0 4px 16px rgba(124,58,237,0.4)' : 'none',
                opacity: !selRender?.imageUrl ? 0.4 : 1,
              }}
            >
              {analyzing ? '⟳ Analisando…' : spec ? '🔄 Re-analisar' : '✨ Analisar com IA'}
            </button>
            {spec && (
              <p style={{ margin:'6px 0 0', fontSize:9, color:T.dim, textAlign:'center' }}>
                Especificação gerada em {new Date(spec.createdAt).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>

          {/* Memorial + orçamento */}
          {items.length > 0 && (
            <div style={{ padding:'0 12px 12px', flexShrink:0, display:'flex', flexDirection:'column', gap:7 }}>
              <button
                onClick={() => setMemorial(buildMemorial(items))}
                className="ss-btn"
                style={{
                  width:'100%', padding:'9px', borderRadius:8, border:`1px solid ${T.border}`,
                  background:'rgba(255,255,255,0.04)', color:T.text, cursor:'pointer', fontSize:11, fontWeight:700,
                }}
              >
                📄 Gerar Memorial
              </button>
              <button
                onClick={() => void sendToBudget()}
                disabled={sendingBudget || counts.especificados === 0}
                className="ss-btn"
                style={{
                  width:'100%', padding:'10px', borderRadius:8, border:`1px solid ${counts.especificados > 0 ? T.green : T.border}`,
                  background: counts.especificados > 0 ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.03)',
                  color: counts.especificados > 0 ? T.green : T.dim,
                  cursor: counts.especificados > 0 ? 'pointer' : 'default',
                  fontSize:11, fontWeight:800, opacity:sendingBudget ? 0.65 : 1,
                }}
              >
                {sendingBudget ? 'Enviando…' : `→ Enviar ${counts.especificados} ao orçamento`}
              </button>
              {budgetMsg && (
                <p style={{ margin:0, fontSize:9, lineHeight:1.45, color:T.textSub, textAlign:'center' }}>{budgetMsg}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Results ── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Error */}
          {error && (
            <div style={{ padding:'10px 16px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>
              ⚠ {error}
            </div>
          )}

          {/* Analyzing */}
          {analyzing && <AnalyzingState imageUrl={selRender?.imageUrl ?? null} />}

          {/* Loading spec */}
          {loadingSpec && !analyzing && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ width:28, height:28, borderRadius:'50%', border:`3px solid ${T.purpleL}`, borderTopColor:'transparent', animation:'ss-spin 0.9s linear infinite' }}/>
            </div>
          )}

          {/* No render / no spec */}
          {!analyzing && !loadingSpec && !spec && renders.length > 0 && (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:40, animation:'ss-fadeIn 0.4s ease' }}>
              <div style={{ fontSize:44 }}>✨</div>
              <div style={{ textAlign:'center' }}>
                <h3 style={{ margin:'0 0 6px', fontSize:17, fontWeight:900, color:'#fff' }}>
                  Pronto para especificar
                </h3>
                <p style={{ margin:0, fontSize:12, color:T.textSub, maxWidth:300, lineHeight:1.6 }}>
                  Selecione um render à esquerda e clique em <strong style={{ color:T.purpleL }}>Analisar com IA</strong> para identificar automaticamente todos os elementos do projeto.
                </p>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, maxWidth:320 }}>
                {['Mobiliário', 'Iluminação', 'Revestimentos', 'Metais', 'Esquadrias', 'Decoração'].map(cat => (
                  <div key={cat} style={{ padding:'8px 12px', borderRadius:7, background:'rgba(124,58,237,0.06)', border:`1px solid rgba(124,58,237,0.12)`, fontSize:11, color:T.dim }}>
                    {catIcon(cat)} {cat}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {!analyzing && !loadingSpec && items.length > 0 && !memorial && (
            <>
              {/* Tabs */}
              <div style={{ display:'flex', gap:2, padding:'10px 16px 0', flexShrink:0, borderBottom:`1px solid ${T.border}` }}>
                {([
                  { id:'todos',             label:'Todos',       count:counts.todos },
                  { id:'pendentes',         label:'Pendentes',   count:counts.pendentes,         color:T.amber },
                  { id:'especificados',     label:'Especificados',count:counts.especificados,    color:T.green },
                  { id:'nao_especificados', label:'Referência',  count:counts.nao_especificados, color:T.dim },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding:'6px 12px', borderRadius:'7px 7px 0 0', border:'none', cursor:'pointer',
                      background: activeTab === tab.id ? 'rgba(124,58,237,0.15)' : 'transparent',
                      color: activeTab === tab.id ? T.purpleL : T.dim,
                      borderBottom: `2px solid ${activeTab === tab.id ? T.purple : 'transparent'}`,
                      fontSize:11, fontWeight:700, transition:'all 0.15s',
                      display:'flex', alignItems:'center', gap:5,
                    }}
                  >
                    {tab.label}
                    <span style={{
                      padding:'1px 6px', borderRadius:10, fontSize:9, fontWeight:700,
                      background: activeTab === tab.id ? T.purple : 'rgba(255,255,255,0.07)',
                      color: activeTab === tab.id ? '#fff' : T.dim,
                    }}>{tab.count}</span>
                  </button>
                ))}
              </div>

              {/* Item list */}
              <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
                {filteredItems.length === 0 && (
                  <div style={{ textAlign:'center', padding:'30px', color:T.dim, fontSize:12 }}>
                    Nenhum item nesta categoria.
                  </div>
                )}
                {filteredItems.map(item => (
                  <SpecItemRow
                    key={item.id}
                    item={item}
                    expanded={expandedItem === item.id}
                    onToggle={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                    onSearch={() => searchCatalog(item)}
                    onSetStatus={status => updateItem(item.id, { status } as Partial<SpecItem>)}
                    catalogMatches={catalogMap[item.id] ?? null}
                    searching={searchingMap[item.id] ?? false}
                    onUseMatch={match => useMatch(item, match)}
                    onSaveDetails={patch => updateItem(item.id, patch)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Memorial view */}
          {memorial && (
            <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', animation:'ss-fadeIn 0.3s ease' }}>
              <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#fff', flex:1 }}>📄 Memorial Preliminar</p>
                <button onClick={() => {
                  const blob = new Blob([memorial], { type: 'text/plain' })
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                  a.download = 'memorial-preliminar.txt'; a.click()
                }} className="ss-btn" style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${T.purple}`, background:'rgba(124,58,237,0.15)', color:T.purpleL, cursor:'pointer', fontSize:10, fontWeight:700 }}>
                  ⬇ Baixar .txt
                </button>
                <button onClick={() => navigator.clipboard.writeText(memorial)} className="ss-btn" style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10, fontWeight:700 }}>
                  📋 Copiar
                </button>
                <button onClick={() => setMemorial(null)} style={{ background:'none', border:'none', color:T.dim, cursor:'pointer', fontSize:14 }}>✕</button>
              </div>
              <pre style={{
                flex:1, overflowY:'auto', margin:0, padding:'16px', fontSize:11,
                color:T.text, fontFamily:'ui-monospace,monospace', lineHeight:1.7,
                background:T.sidebar, whiteSpace:'pre-wrap',
              }}>
                {memorial}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
