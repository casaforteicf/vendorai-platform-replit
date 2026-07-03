// ─── VKG Demo View — FASE 18 ──────────────────────────────────────────────────
// Visualização navegável do Vendor Knowledge Graph.
// Grafo SVG com layout force-directed simplificado.
// Sem dependências externas — React + SVG puro.

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { T } from '../arqdor/shared/arqdor-theme'

// ─── Demo dataset ─────────────────────────────────────────────────────────────
// Representa o exemplo do spec: Projeto→Cliente→Materiais→Fabricantes→Render→CRM

interface DemoNode {
  id:     string
  type:   string
  label:  string
  icon:   string
  color:  string
  domain: string
  x:      number
  y:      number
  props:  Record<string, string>
}

interface DemoEdge {
  id:       string
  source:   string
  target:   string
  label:    string
  weight:   number
  inferred: boolean
}

const DEMO_NODES: DemoNode[] = [
  // Core — Projeto
  { id:'proj1',    type:'Project',      icon:'🏗️', label:'Residência São Paulo',    color:'#7c3aed', domain:'architecture', x:400, y:300, props:{ tipoObra:'Residencial', area:'180m²', status:'Em andamento' } },

  // Cliente
  { id:'cust1',    type:'Customer',     icon:'🤝', label:'Família Rodrigues',        color:'#4ade80', domain:'crm',          x:220, y:140, props:{ email:'rodrigues@email.com', company:'Autônomo' } },
  { id:'lead1',    type:'Lead',         icon:'🎯', label:'Lead #0412',               color:'#34d399', domain:'crm',          x:100, y:240, props:{ stage:'Proposta', value:'R$ 45.000' } },

  // Ambientes
  { id:'env1',     type:'Environment',  icon:'🍳', label:'Cozinha',                  color:'#6d28d9', domain:'architecture', x:280, y:420, props:{ sqm:'22m²', category:'Cozinha' } },
  { id:'env2',     type:'Environment',  icon:'🛁', label:'Banheiro Principal',       color:'#6d28d9', domain:'architecture', x:520, y:420, props:{ sqm:'12m²', category:'Banheiro' } },

  // Materiais
  { id:'mat1',     type:'Material',     icon:'🪵', label:'Dekton Laurent',           color:'#c4b5fd', domain:'architecture', x:160, y:520, props:{ category:'Superfície', finish:'Fosco', gloss:'5%' } },
  { id:'mat2',     type:'Material',     icon:'🪵', label:'Porcelanato 90x90',         color:'#c4b5fd', domain:'architecture', x:350, y:570, props:{ category:'Piso', finish:'Polido', gloss:'80%' } },
  { id:'mat3',     type:'Material',     icon:'🪵', label:'MDF Freijó',               color:'#c4b5fd', domain:'architecture', x:560, y:520, props:{ category:'Marcenaria', finish:'Natural', gloss:'10%' } },

  // Fabricantes
  { id:'mfg1',     type:'Manufacturer', icon:'🏭', label:'Cosentino',               color:'#f59e0b', domain:'commerce',     x:80,  y:420, props:{ country:'Espanha', website:'cosentino.com' } },
  { id:'mfg2',     type:'Manufacturer', icon:'🏭', label:'Portobello',              color:'#f59e0b', domain:'commerce',     x:350, y:650, props:{ country:'Brasil', website:'portobello.com.br' } },

  // Fornecedor
  { id:'sup1',     type:'Supplier',     icon:'🚚', label:'Revendedor Centro-Oeste', color:'#fbbf24', domain:'commerce',     x:80,  y:550, props:{ region:'SP-Interior', contact:'(16) 9000-0000' } },

  // DNA / Style
  { id:'dna1',     type:'DNA',          icon:'🧬', label:'DNA Japandi',             color:'#f472b6', domain:'creative',    x:580, y:150, props:{ style:'Japandi', language:'Minimalista', atmosphere:'Sereno' } },
  { id:'style1',   type:'Style',        icon:'🎨', label:'Estilo Japandi',          color:'#fb7185', domain:'creative',    x:680, y:260, props:{ tags:'madeira, neutros, linhas limpas' } },

  // Prompt / Render / Review
  { id:'prompt1',  type:'Prompt',       icon:'⚡', label:'Prompt Cozinha v3',       color:'#e879f9', domain:'creative',    x:650, y:400, props:{ tokens:'1.240', translator:'Standard' } },
  { id:'render1',  type:'Render',       icon:'🎬', label:'Render Cozinha 01',       color:'#d946ef', domain:'creative',    x:720, y:480, props:{ model:'flux-1.1-pro-ultra', fidelity:'92%', status:'Aprovado' } },
  { id:'review1',  type:'Review',       icon:'🔍', label:'AI Review #01',           color:'#c026d3', domain:'creative',    x:680, y:570, props:{ score:'88/100', approved:'Sim' } },

  // Workflow
  { id:'wf1',      type:'Workflow',     icon:'🔄', label:'Workflow Residencial',    color:'#38bdf8', domain:'workflow',    x:400, y:120, props:{ status:'Em andamento', steps:'10' } },
  { id:'task1',    type:'Task',         icon:'✅', label:'Confirmar puxadores',     color:'#7dd3fc', domain:'workflow',    x:550, y:60,  props:{ status:'PENDENTE', priority:'HIGH' } },

  // Compra
  { id:'purch1',   type:'Purchase',     icon:'🛒', label:'Pedido Dekton',           color:'#4ade80', domain:'commerce',    x:80,  y:660, props:{ total:'R$ 8.200', status:'Aguardando' } },

  // Agente
  { id:'agent1',   type:'Agent',        icon:'🤖', label:'ARQ Copilot',             color:'#94a3b8', domain:'knowledge',   x:400, y:220, props:{ model:'claude-opus', type:'Copilot' } },
]

const DEMO_EDGES: DemoEdge[] = [
  // Projeto → Ambientes
  { id:'e1',  source:'proj1',  target:'env1',    label:'CONTAINS',      weight:1.0, inferred:false },
  { id:'e2',  source:'proj1',  target:'env2',    label:'CONTAINS',      weight:1.0, inferred:false },

  // Projeto → Cliente
  { id:'e3',  source:'proj1',  target:'cust1',   label:'BELONGS_TO',    weight:1.0, inferred:false },
  { id:'e4',  source:'cust1',  target:'lead1',   label:'ASSOCIATED_WITH', weight:0.8, inferred:false },

  // Projeto → DNA
  { id:'e5',  source:'proj1',  target:'dna1',    label:'REFERENCES',    weight:0.9, inferred:false },
  { id:'e6',  source:'dna1',   target:'style1',  label:'RELATED_TO',    weight:0.8, inferred:false },

  // Projeto → Workflow
  { id:'e7',  source:'proj1',  target:'wf1',     label:'FOLLOWS',       weight:1.0, inferred:false },
  { id:'e8',  source:'wf1',    target:'task1',   label:'CONTAINS',      weight:1.0, inferred:false },

  // Ambientes → Materiais
  { id:'e9',  source:'env1',   target:'mat1',    label:'USES',          weight:0.9, inferred:false },
  { id:'e10', source:'env1',   target:'mat2',    label:'USES',          weight:0.9, inferred:false },
  { id:'e11', source:'env2',   target:'mat2',    label:'USES',          weight:0.7, inferred:false },
  { id:'e12', source:'env2',   target:'mat3',    label:'USES',          weight:0.8, inferred:false },

  // Materiais → Fabricantes
  { id:'e13', source:'mat1',   target:'mfg1',    label:'PURCHASED_FROM', weight:1.0, inferred:false },
  { id:'e14', source:'mat2',   target:'mfg2',    label:'PURCHASED_FROM', weight:1.0, inferred:false },

  // Fabricante → Fornecedor
  { id:'e15', source:'mfg1',   target:'sup1',    label:'INSTALLED_BY',  weight:0.8, inferred:false },

  // Fornecedor → Compra
  { id:'e16', source:'sup1',   target:'purch1',  label:'CONTAINS',      weight:1.0, inferred:false },
  { id:'e17', source:'purch1', target:'mat1',    label:'CONTAINS',      weight:1.0, inferred:false },

  // Prompt → Render
  { id:'e18', source:'prompt1', target:'render1', label:'GENERATED_BY', weight:0.9, inferred:false },
  { id:'e19', source:'env1',    target:'prompt1', label:'REFERENCES',   weight:0.8, inferred:false },

  // Render → Review
  { id:'e20', source:'render1', target:'review1', label:'GENERATED_BY', weight:1.0, inferred:false },

  // Agente
  { id:'e21', source:'agent1', target:'prompt1', label:'CREATED_BY',   weight:0.9, inferred:false },
  { id:'e22', source:'agent1', target:'proj1',   label:'ASSOCIATED_WITH', weight:0.7, inferred:true },

  // Inferred
  { id:'e23', source:'style1', target:'mat1',   label:'INFLUENCES_BY', weight:0.6, inferred:true },
  { id:'e24', source:'style1', target:'mat3',   label:'INFLUENCED_BY', weight:0.5, inferred:true },
]

// ─── Domain color map ─────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  architecture: '#7c3aed',
  crm:          '#4ade80',
  commerce:     '#f59e0b',
  creative:     '#e879f9',
  workflow:     '#38bdf8',
  knowledge:    '#94a3b8',
  identity:     '#818cf8',
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function getStats(nodes: DemoNode[], edges: DemoEdge[]) {
  const byType: Record<string, number> = {}
  for (const n of nodes) byType[n.type] = (byType[n.type] ?? 0) + 1
  return {
    nodes:    nodes.length,
    edges:    edges.length,
    domains:  [...new Set(nodes.map(n => n.domain))].length,
    inferred: edges.filter(e => e.inferred).length,
    byType,
  }
}

// ─── VKGDemoView ──────────────────────────────────────────────────────────────

export function VKGDemoView() {
  const [selectedNode, setSelectedNode] = useState<DemoNode | null>(null)
  const [hoveredNode,  setHoveredNode]  = useState<string | null>(null)
  const [filterDomain, setFilterDomain] = useState<string | null>(null)
  const [searchTerm,   setSearchTerm]   = useState('')
  const [showInferred, setShowInferred] = useState(true)

  const svgRef   = useRef<SVGSVGElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.9)
  const dragging = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  // ── Pan & Zoom ──────────────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(2, Math.max(0.4, z - e.deltaY * 0.001)))
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest('.node-group')) return
    dragging.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
  }, [pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    setPan({
      x: dragging.current.panX + (e.clientX - dragging.current.startX),
      y: dragging.current.panY + (e.clientY - dragging.current.startY),
    })
  }, [])

  const onMouseUp = useCallback(() => { dragging.current = null }, [])

  // ── Filtered data ───────────────────────────────────────────────────────────

  const visibleNodes = useMemo(() => {
    let ns = DEMO_NODES
    if (filterDomain) ns = ns.filter(n => n.domain === filterDomain)
    if (searchTerm)   ns = ns.filter(n =>
      n.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.type.toLowerCase().includes(searchTerm.toLowerCase())
    )
    return ns
  }, [filterDomain, searchTerm])

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes])

  const visibleEdges = useMemo(() => DEMO_EDGES.filter(e =>
    visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target) &&
    (showInferred || !e.inferred)
  ), [visibleNodeIds, showInferred])

  // ── Highlight neighbors ─────────────────────────────────────────────────────

  const highlightedIds = useMemo(() => {
    const focused = selectedNode?.id ?? hoveredNode
    if (!focused) return null
    const neighbors = new Set<string>([focused])
    for (const e of visibleEdges) {
      if (e.source === focused) neighbors.add(e.target)
      if (e.target === focused) neighbors.add(e.source)
    }
    return neighbors
  }, [selectedNode, hoveredNode, visibleEdges])

  const stats = useMemo(() => getStats(visibleNodes, visibleEdges), [visibleNodes, visibleEdges])

  const domains = useMemo(() => [...new Set(DEMO_NODES.map(n => n.domain))], [])

  // ── Node position in transformed space ─────────────────────────────────────

  function nodePos(n: DemoNode) {
    return { x: n.x * zoom + pan.x, y: n.y * zoom + pan.y }
  }

  const nodeRadius = (n: DemoNode) => {
    const base = n.id === 'proj1' ? 28 : 18
    return base * zoom
  }

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg, color:T.text, fontFamily:'system-ui,sans-serif', overflow:'hidden' }}>

      {/* ── HEADER ── */}
      <div style={{ padding:'12px 20px', borderBottom:`1px solid ${T.border}`, background:T.sidebar, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' as const }}>
          <div>
            <h2 style={{ margin:0, fontSize:16, fontWeight:900, color:'#fff' }}>
              📊 Vendor Knowledge Graph
            </h2>
            <p style={{ margin:0, fontSize:10, color:T.dim }}>FASE 18 — Camada de inteligência da Vendor.ai</p>
          </div>

          {/* Stats */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const }}>
            {[
              ['Nós',      stats.nodes],
              ['Arestas',  stats.edges],
              ['Domínios', stats.domains],
              ['Inferidas', stats.inferred],
            ].map(([label, value]) => (
              <div key={label as string} style={{ padding:'4px 10px', borderRadius:6, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, textAlign:'center' as const }}>
                <p style={{ margin:0, fontSize:14, fontWeight:900, color:T.purpleL }}>{value}</p>
                <p style={{ margin:0, fontSize:9, color:T.dim }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar nó…"
            style={{
              padding:'6px 10px', borderRadius:6, border:`1px solid ${T.border}`,
              background:'rgba(255,255,255,0.06)', color:'#fff', fontSize:11, outline:'none', minWidth:160,
            }}
          />

          {/* Inferred toggle */}
          <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:11, color:T.dim }}>
            <input
              type="checkbox" checked={showInferred}
              onChange={e => setShowInferred(e.target.checked)}
              style={{ accentColor: T.purple }}
            />
            Exibir inferidas
          </label>

          {/* Reset */}
          <button
            onClick={() => { setPan({ x:0, y:0 }); setZoom(0.9) }}
            style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}
          >
            ⟳ Reset
          </button>
        </div>

        {/* Domain filters */}
        <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' as const }}>
          <button
            onClick={() => setFilterDomain(null)}
            style={{
              padding:'3px 10px', borderRadius:12, fontSize:9, fontWeight:700, cursor:'pointer',
              background: !filterDomain ? 'rgba(124,58,237,0.25)' : 'transparent',
              border: `1px solid ${!filterDomain ? T.purple : T.border}`,
              color: !filterDomain ? T.purpleL : T.dim,
            }}
          >
            Todos
          </button>
          {domains.map(d => (
            <button
              key={d}
              onClick={() => setFilterDomain(filterDomain === d ? null : d)}
              style={{
                padding:'3px 10px', borderRadius:12, fontSize:9, fontWeight:700, cursor:'pointer',
                background: filterDomain === d ? `${DOMAIN_COLORS[d]}22` : 'transparent',
                border: `1px solid ${filterDomain === d ? DOMAIN_COLORS[d] : T.border}`,
                color: filterDomain === d ? DOMAIN_COLORS[d] : T.dim,
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── GRAPH SVG ── */}
        <div style={{ flex:1, position:'relative' as const, overflow:'hidden', cursor:'grab' }}>
          <svg
            ref={svgRef}
            width="100%" height="100%"
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            style={{ userSelect:'none' }}
          >
            <defs>
              {/* Arrow markers */}
              <marker id="arrow-default" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.15)" />
              </marker>
              <marker id="arrow-highlight" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={T.purpleL} />
              </marker>
              <marker id="arrow-inferred" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="rgba(251,191,36,0.5)" />
              </marker>
            </defs>

            {/* ── Edges ── */}
            {visibleEdges.map(edge => {
              const src = visibleNodes.find(n => n.id === edge.source)
              const tgt = visibleNodes.find(n => n.id === edge.target)
              if (!src || !tgt) return null

              const sp = nodePos(src)
              const tp = nodePos(tgt)
              const isHighlighted = highlightedIds?.has(edge.source) && highlightedIds?.has(edge.target)
              const opacity = highlightedIds && !isHighlighted ? 0.08 : edge.inferred ? 0.35 : 0.55

              // Offset edge endpoint to node radius
              const dx = tp.x - sp.x
              const dy = tp.y - sp.y
              const dist = Math.sqrt(dx * dx + dy * dy) || 1
              const r2 = nodeRadius(tgt)
              const ex = tp.x - (dx / dist) * (r2 + 4)
              const ey = tp.y - (dy / dist) * (r2 + 4)

              return (
                <g key={edge.id}>
                  <line
                    x1={sp.x} y1={sp.y} x2={ex} y2={ey}
                    stroke={isHighlighted ? T.purpleL : edge.inferred ? T.amber : 'rgba(255,255,255,0.18)'}
                    strokeWidth={(isHighlighted ? 1.8 : 1) * zoom}
                    strokeDasharray={edge.inferred ? `${4 * zoom},${3 * zoom}` : undefined}
                    opacity={opacity}
                    markerEnd={`url(#arrow-${isHighlighted ? 'highlight' : edge.inferred ? 'inferred' : 'default'})`}
                  />
                  {/* Edge label on hover */}
                  {isHighlighted && zoom > 0.7 && (
                    <text
                      x={(sp.x + tp.x) / 2}
                      y={(sp.y + tp.y) / 2 - 4}
                      textAnchor="middle"
                      fontSize={8 * zoom}
                      fill={T.dim}
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* ── Nodes ── */}
            {visibleNodes.map(node => {
              const pos = nodePos(node)
              const r   = nodeRadius(node)
              const focused = selectedNode?.id === node.id
              const dimmed  = highlightedIds && !highlightedIds.has(node.id)
              const opacity = dimmed ? 0.18 : 1

              return (
                <g
                  key={node.id}
                  className="node-group"
                  onClick={() => setSelectedNode(prev => prev?.id === node.id ? null : node)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  style={{ cursor:'pointer' }}
                  opacity={opacity}
                >
                  {/* Glow for selected */}
                  {focused && (
                    <circle cx={pos.x} cy={pos.y} r={r + 8} fill={node.color} opacity={0.15} />
                  )}

                  {/* Node circle */}
                  <circle
                    cx={pos.x} cy={pos.y} r={r}
                    fill={focused ? node.color : `${node.color}30`}
                    stroke={focused ? node.color : `${node.color}70`}
                    strokeWidth={(focused ? 2.5 : 1.5) * zoom}
                  />

                  {/* Icon */}
                  <text
                    x={pos.x} y={pos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={r * 0.85}
                  >
                    {node.icon}
                  </text>

                  {/* Label */}
                  {zoom > 0.65 && (
                    <text
                      x={pos.x}
                      y={pos.y + r + 10 * zoom}
                      textAnchor="middle"
                      fontSize={9 * zoom}
                      fill={focused ? '#fff' : T.dim}
                      fontWeight={focused ? '700' : '400'}
                    >
                      {node.label.length > 16 ? node.label.slice(0, 15) + '…' : node.label}
                    </text>
                  )}

                  {/* Type badge for large zoom */}
                  {zoom > 1.2 && (
                    <text
                      x={pos.x}
                      y={pos.y + r + 20 * zoom}
                      textAnchor="middle"
                      fontSize={8 * zoom}
                      fill={node.color}
                    >
                      {node.type}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>

          {/* Zoom controls */}
          <div style={{ position:'absolute' as const, bottom:16, right:16, display:'flex', flexDirection:'column' as const, gap:4 }}>
            {[
              { label:'+', fn:() => setZoom(z => Math.min(2, z + 0.15)) },
              { label:'−', fn:() => setZoom(z => Math.max(0.4, z - 0.15)) },
            ].map(btn => (
              <button key={btn.label} onClick={btn.fn} style={{
                width:28, height:28, borderRadius:6, border:`1px solid ${T.border}`,
                background:T.sidebar, color:'#fff', cursor:'pointer', fontSize:16, lineHeight:1,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>{btn.label}</button>
            ))}
          </div>

          {/* Hint */}
          <div style={{ position:'absolute' as const, bottom:16, left:16, fontSize:9, color:T.dim }}>
            Scroll: zoom · Arrastar: pan · Clique no nó: detalhes
          </div>
        </div>

        {/* ── RIGHT PANEL — Node detail + Legend ── */}
        <div style={{ width:260, flexShrink:0, background:T.sidebar, borderLeft:`1px solid ${T.border}`, display:'flex', flexDirection:'column' as const, overflow:'hidden' }}>

          {/* Selected node detail */}
          {selectedNode ? (
            <div style={{ padding:14, borderBottom:`1px solid ${T.border}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:`${selectedNode.color}25`, border:`2px solid ${selectedNode.color}60`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                  {selectedNode.icon}
                </div>
                <div>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#fff' }}>{selectedNode.label}</p>
                  <p style={{ margin:0, fontSize:9, color:selectedNode.color }}>{selectedNode.type}</p>
                </div>
              </div>
              <div style={{ padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,0.04)', marginBottom:6 }}>
                <p style={{ margin:'0 0 2px', fontSize:9, color:T.dim, fontWeight:700 }}>DOMÍNIO</p>
                <p style={{ margin:0, fontSize:10, color:DOMAIN_COLORS[selectedNode.domain] ?? T.text }}>{selectedNode.domain}</p>
              </div>
              <div style={{ padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,0.04)' }}>
                <p style={{ margin:'0 0 4px', fontSize:9, color:T.dim, fontWeight:700 }}>PROPRIEDADES</p>
                {Object.entries(selectedNode.props).map(([k, v]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                    <span style={{ fontSize:9, color:T.dim }}>{k}</span>
                    <span style={{ fontSize:9, color:T.text, fontWeight:600 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Connections */}
              <div style={{ marginTop:8 }}>
                <p style={{ margin:'0 0 4px', fontSize:9, color:T.dim, fontWeight:700 }}>CONEXÕES</p>
                {DEMO_EDGES.filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                  .slice(0, 6)
                  .map(edge => {
                    const otherId   = edge.source === selectedNode.id ? edge.target : edge.source
                    const otherNode = DEMO_NODES.find(n => n.id === otherId)
                    const dir       = edge.source === selectedNode.id ? '→' : '←'
                    return otherNode ? (
                      <div key={edge.id} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 0', borderBottom:`1px solid ${T.border}` }}>
                        <span style={{ fontSize:9, color:T.dim }}>{dir}</span>
                        <span style={{ fontSize:9, color:T.purpleL }}>{edge.label}</span>
                        <span style={{ fontSize:9, color:T.text }}>{otherNode.label}</span>
                        {edge.inferred && <span style={{ fontSize:8, color:T.amber }}>inf.</span>}
                      </div>
                    ) : null
                  })}
              </div>
            </div>
          ) : (
            <div style={{ padding:14, borderBottom:`1px solid ${T.border}` }}>
              <p style={{ margin:0, fontSize:11, fontWeight:700, color:T.dim }}>Clique em um nó para ver detalhes</p>
            </div>
          )}

          {/* Legend */}
          <div style={{ padding:14, flex:1, overflowY:'auto' as const }}>
            <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>DOMÍNIOS</p>
            {domains.map(d => (
              <div key={d} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:DOMAIN_COLORS[d] ?? T.dim, flexShrink:0 }}/>
                <span style={{ fontSize:10, color:T.text }}>{d}</span>
                <span style={{ marginLeft:'auto', fontSize:9, color:T.dim }}>
                  {DEMO_NODES.filter(n => n.domain === d).length} nós
                </span>
              </div>
            ))}

            <p style={{ margin:'12px 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>ARESTAS</p>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <div style={{ width:24, height:1, background:'rgba(255,255,255,0.4)' }}/>
              <span style={{ fontSize:9, color:T.dim }}>Explícita</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <div style={{ width:24, height:1, background:T.amber, borderTop:`1px dashed ${T.amber}` }}/>
              <span style={{ fontSize:9, color:T.dim }}>Inferida</span>
            </div>

            <p style={{ margin:'12px 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>TIPOS DE NÓS ({Object.keys(stats.byType).length})</p>
            {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const sample = DEMO_NODES.find(n => n.type === type)
              return (
                <div key={type} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                  <span style={{ fontSize:12 }}>{sample?.icon ?? '●'}</span>
                  <span style={{ fontSize:9, color:T.text, flex:1 }}>{type}</span>
                  <span style={{ fontSize:9, color:T.dim }}>{count}</span>
                </div>
              )
            })}
          </div>

          {/* VKG version info */}
          <div style={{ padding:'10px 14px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
            <p style={{ margin:0, fontSize:9, color:T.dim, lineHeight:1.5 }}>
              VKG v0.1 · {DEMO_NODES.length} node types · {[...new Set(DEMO_EDGES.map(e => e.label))].length} relation types
            </p>
            <p style={{ margin:'2px 0 0', fontSize:9, color:T.dim }}>
              Motor: in-memory · LLM: pendente (FASE 19)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
