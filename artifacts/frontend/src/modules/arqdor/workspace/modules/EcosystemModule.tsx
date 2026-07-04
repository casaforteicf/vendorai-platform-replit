// ─── EcosystemModule — Sprint 6: Ecosystem Engine ─────────────────────────────
// Painel de Parceiros: diretório, solicitações, histórico e compartilhamento.

import { useState, useEffect, useCallback, useRef } from 'react'
import { T } from '../../shared/arqdor-theme'
import { useArqProjectContext } from '../ArqWorkspace'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Partner {
  id: string
  nome: string
  tipo: string
  contato: string | null
  email: string | null
  telefone: string | null
  website: string | null
  cidade: string | null
  estado: string | null
  prazoDias: number | null
  prazoDescricao: string | null
  especialidades: string[] | null
  observacoes: string | null
  ativo: boolean
  createdAt: string
}

interface Solicitacao {
  id: string
  tipo: string
  status: string
  parceiroNome: string | null
  projetoTitulo: string | null
  itemNome: string | null
  mensagem: string | null
  canalEnvio: string | null
  enviadoEm: string | null
  createdAt: string
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes eco-fadeIn { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
  @keyframes eco-slideIn { from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)} }
  .eco-card {
    transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s !important;
    cursor: pointer;
    animation: eco-fadeIn 0.3s ease both;
  }
  .eco-card:hover {
    border-color: rgba(124,58,237,0.35) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 6px 24px rgba(124,58,237,0.12) !important;
  }
  .eco-card.selected { border-color: rgba(124,58,237,0.6) !important; background: rgba(124,58,237,0.08) !important; }
  .eco-btn { transition: background 0.13s, transform 0.13s !important; cursor: pointer; }
  .eco-btn:hover { background: rgba(124,58,237,0.2) !important; transform: translateY(-1px) !important; }
  .eco-input { transition: border-color 0.15s !important; }
  .eco-input:focus { border-color: rgba(124,58,237,0.5) !important; outline: none !important; }
  .eco-chip { transition: background 0.13s !important; cursor: pointer; }
  .eco-chip:hover { background: rgba(124,58,237,0.18) !important; }
  .eco-chip.active { background: rgba(124,58,237,0.25) !important; color: #a78bfa !important; }
`

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TIPO_COLORS: Record<string, string> = {
  fornecedor:     '#60a5fa',
  fabricante:     '#34d399',
  representante:  '#fbbf24',
  loja:           '#f472b6',
}

const TIPO_LABELS: Record<string, string> = {
  fornecedor:    'Fornecedor',
  fabricante:    'Fabricante',
  representante: 'Representante',
  loja:          'Loja',
}

const STATUS_COLORS: Record<string, string> = {
  pendente:   '#fbbf24',
  enviado:    '#60a5fa',
  respondido: '#a78bfa',
  concluido:  '#4ade80',
}

const TIPO_SOL_ICONS: Record<string, string> = {
  orcamento:    '💰',
  amostra:      '📦',
  visita:       '🤝',
  compartilhar: '📤',
}

function tipoColor(tipo: string) { return TIPO_COLORS[tipo] ?? T.purpleL }

// ─── PartnerForm ──────────────────────────────────────────────────────────────
function PartnerForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: Partial<Partner>
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState({
    nome:           initial?.nome ?? '',
    tipo:           initial?.tipo ?? 'fornecedor',
    contato:        initial?.contato ?? '',
    email:          initial?.email ?? '',
    telefone:       initial?.telefone ?? '',
    website:        initial?.website ?? '',
    cidade:         initial?.cidade ?? '',
    estado:         initial?.estado ?? '',
    prazoDescricao: initial?.prazoDescricao ?? '',
    especialidades: (initial?.especialidades ?? []).join(', '),
    observacoes:    initial?.observacoes ?? '',
  })

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const Field = ({ label, k, placeholder }: { label: string; k: string; placeholder?: string }) => (
    <div>
      <p style={{ margin:'0 0 3px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>{label}</p>
      <input
        className="eco-input"
        value={(form as Record<string, string>)[k]}
        onChange={e => set(k, e.target.value)}
        placeholder={placeholder}
        style={{ width:'100%', padding:'6px 9px', borderRadius:6, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:11, boxSizing:'border-box' as const }}
      />
    </div>
  )

  return (
    <div style={{ padding:'14px 16px', background:T.surface, borderRadius:10, border:`1px solid ${T.border}`, animation:'eco-fadeIn 0.2s ease' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
        <Field label="NOME *" k="nome" placeholder="Ex: Portobello, Deca…" />
        <div>
          <p style={{ margin:'0 0 3px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>TIPO *</p>
          <select
            value={form.tipo}
            onChange={e => set('tipo', e.target.value)}
            style={{ width:'100%', padding:'6px 9px', borderRadius:6, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:11 }}
          >
            {Object.entries(TIPO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <Field label="CONTATO" k="contato" placeholder="Nome do contato principal" />
        <Field label="EMAIL" k="email" placeholder="email@fornecedor.com.br" />
        <Field label="TELEFONE" k="telefone" placeholder="(11) 99999-9999" />
        <Field label="WEBSITE" k="website" placeholder="https://..." />
        <Field label="CIDADE" k="cidade" placeholder="São Paulo" />
        <Field label="ESTADO" k="estado" placeholder="SP" />
        <Field label="PRAZO DE ENTREGA" k="prazoDescricao" placeholder="15 dias úteis" />
        <Field label="ESPECIALIDADES (vírgula)" k="especialidades" placeholder="piso, parede, madeira" />
      </div>
      <div style={{ marginBottom:8 }}>
        <p style={{ margin:'0 0 3px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>OBSERVAÇÕES</p>
        <textarea
          className="eco-input"
          value={form.observacoes}
          onChange={e => set('observacoes', e.target.value)}
          rows={2}
          placeholder="Condições, tabela, contrato especial…"
          style={{ width:'100%', padding:'6px 9px', borderRadius:6, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:11, resize:'none', boxSizing:'border-box' as const }}
        />
      </div>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button onClick={onCancel} className="eco-btn" style={{ padding:'6px 14px', borderRadius:7, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, fontSize:11, cursor:'pointer' }}>
          Cancelar
        </button>
        <button
          onClick={() => onSave({
            ...form,
            especialidades: form.especialidades.split(',').map(s => s.trim()).filter(Boolean),
          })}
          disabled={saving || !form.nome.trim()}
          style={{ padding:'6px 18px', borderRadius:7, border:'none', background:T.purple, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', opacity:saving||!form.nome.trim()?0.5:1 }}
        >
          {saving ? 'Salvando…' : 'Salvar Parceiro'}
        </button>
      </div>
    </div>
  )
}

// ─── SolicitacaoForm ──────────────────────────────────────────────────────────
function SolicitacaoForm({
  tipo, partner, projetoId, projetoTitulo, onSend, onCancel,
}: {
  tipo: string; partner: Partner; projetoId?: string; projetoTitulo?: string
  onSend: (msg: string, canal: string) => Promise<void>
  onCancel: () => void
}) {
  const [mensagem, setMensagem] = useState('')
  const [canal, setCanal] = useState('email')
  const [sending, setSending] = useState(false)

  const labels: Record<string, { title: string; placeholder: string; icon: string }> = {
    orcamento:    { title:'Solicitar Orçamento', placeholder:'Descreva os materiais, quantidades e especificações necessárias…', icon:'💰' },
    amostra:      { title:'Solicitar Amostra', placeholder:'Descreva quais amostras deseja receber e o endereço para envio…', icon:'📦' },
    visita:       { title:'Solicitar Visita', placeholder:'Informe data preferencial, local e objetivo da visita técnica…', icon:'🤝' },
    compartilhar: { title:'Compartilhar Projeto', placeholder:'Adicione informações complementares para o fornecedor…', icon:'📤' },
  }
  const info = labels[tipo] ?? labels.orcamento

  return (
    <div style={{ padding:'14px 16px', background:'rgba(124,58,237,0.08)', borderRadius:10, border:`1px solid rgba(124,58,237,0.25)`, animation:'eco-slideIn 0.2s ease' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <span style={{ fontSize:18 }}>{info.icon}</span>
        <div>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#fff' }}>{info.title}</p>
          <p style={{ margin:0, fontSize:10, color:T.dim }}>Para: {partner.nome}</p>
        </div>
      </div>

      {projetoTitulo && (
        <div style={{ padding:'6px 10px', borderRadius:6, background:'rgba(255,255,255,0.04)', marginBottom:8, fontSize:10, color:T.textSub }}>
          📁 Projeto: <span style={{ color:'#fff', fontWeight:600 }}>{projetoTitulo}</span>
        </div>
      )}

      <textarea
        value={mensagem}
        onChange={e => setMensagem(e.target.value)}
        rows={4}
        placeholder={info.placeholder}
        style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:11, resize:'none', marginBottom:8, boxSizing:'border-box' as const }}
      />

      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
        <p style={{ margin:0, fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>CANAL DE ENVIO:</p>
        {['email','whatsapp','manual'].map(c => (
          <button key={c} onClick={() => setCanal(c)} className="eco-chip" style={{
            padding:'3px 10px', borderRadius:8, border:`1px solid ${canal===c?T.purple:T.border}`,
            background:canal===c?'rgba(124,58,237,0.2)':'transparent', color:canal===c?T.purpleL:T.dim,
            fontSize:10, fontWeight:canal===c?700:500, cursor:'pointer',
          }}>
            {c === 'email' ? '✉ Email' : c === 'whatsapp' ? '📱 WhatsApp' : '📋 Manual'}
          </button>
        ))}
      </div>

      {canal === 'email' && !partner.email && (
        <p style={{ margin:'0 0 8px', fontSize:10, color:T.amber }}>
          ⚠ Parceiro sem email cadastrado. Adicione um email para envio automático.
        </p>
      )}

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button onClick={onCancel} style={{ padding:'6px 14px', borderRadius:7, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, fontSize:11, cursor:'pointer' }}>
          Cancelar
        </button>
        <button
          onClick={async () => { setSending(true); await onSend(mensagem, canal); setSending(false) }}
          disabled={sending}
          style={{ padding:'6px 20px', borderRadius:7, border:'none', background:T.purple, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', opacity:sending?0.6:1 }}
        >
          {sending ? 'Enviando…' : `${info.icon} Enviar`}
        </button>
      </div>
    </div>
  )
}

// ─── PartnerDetail ────────────────────────────────────────────────────────────
function PartnerDetail({
  partner, onClose, onEdit, onDelete, projetoId, projetoTitulo,
}: {
  partner: Partner; onClose: () => void; onEdit: () => void; onDelete: () => void
  projetoId?: string; projetoTitulo?: string
}) {
  const [solicitando, setSolicitando] = useState<string|null>(null)
  const [sent, setSent] = useState<string|null>(null)
  const color = tipoColor(partner.tipo)

  async function handleSolicitar(tipo: string, mensagem: string, canal: string) {
    await fetch(`${BASE}/arch/partners/${partner.id}/solicitar`, {
      method:'POST',
      headers: authHeaders(),
      body: JSON.stringify({ tipo, mensagem, canal, projetoId, projetoTitulo }),
    })
    setSolicitando(null)
    setSent(tipo)
    setTimeout(() => setSent(null), 3000)
  }

  async function handleCompartilhar(mensagem: string, canal: string) {
    await fetch(`${BASE}/arch/partners/compartilhar`, {
      method:'POST',
      headers: authHeaders(),
      body: JSON.stringify({ partnerId: partner.id, mensagem, canal, projetoId, projetoTitulo }),
    })
    setSolicitando(null)
    setSent('compartilhar')
    setTimeout(() => setSent(null), 3000)
  }

  return (
    <div style={{ flex:1, background:T.surface, borderRadius:12, border:`1px solid ${T.border}`, overflow:'hidden', display:'flex', flexDirection:'column', animation:'eco-slideIn 0.2s ease' }}>
      {/* Header */}
      <div style={{ padding:'14px 16px', borderBottom:`1px solid ${T.border}`, background:`${color}08`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ fontSize:9, fontWeight:800, color, padding:'2px 8px', borderRadius:8, background:`${color}18`, border:`1px solid ${color}33` }}>
                {TIPO_LABELS[partner.tipo] ?? partner.tipo}
              </span>
              {partner.prazoDias && (
                <span style={{ fontSize:9, color:T.dim }}>⏱ {partner.prazoDescricao ?? `${partner.prazoDias} dias`}</span>
              )}
            </div>
            <h2 style={{ margin:0, fontSize:18, fontWeight:900, color:'#fff' }}>{partner.nome}</h2>
            {(partner.cidade || partner.estado) && (
              <p style={{ margin:'2px 0 0', fontSize:10, color:T.dim }}>
                📍 {[partner.cidade, partner.estado].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <button onClick={onEdit} className="eco-btn" style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, fontSize:10, cursor:'pointer' }}>
              ✏ Editar
            </button>
            <button onClick={onClose} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, fontSize:12, cursor:'pointer' }}>✕</button>
          </div>
        </div>

        {/* Contact row */}
        <div style={{ display:'flex', gap:12, marginTop:10, flexWrap:'wrap' as const }}>
          {partner.contato && <span style={{ fontSize:10, color:T.textSub }}>👤 {partner.contato}</span>}
          {partner.email && (
            <a href={`mailto:${partner.email}`} style={{ fontSize:10, color:T.blue, textDecoration:'none' }}>✉ {partner.email}</a>
          )}
          {partner.telefone && <span style={{ fontSize:10, color:T.textSub }}>📞 {partner.telefone}</span>}
          {partner.website && (
            <a href={partner.website} target="_blank" rel="noreferrer" style={{ fontSize:10, color:T.blue, textDecoration:'none' }}>🌐 Website</a>
          )}
        </div>

        {/* Specialties */}
        {partner.especialidades && partner.especialidades.length > 0 && (
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const, marginTop:8 }}>
            {partner.especialidades.map(e => (
              <span key={e} style={{ padding:'2px 8px', borderRadius:8, fontSize:9, fontWeight:700, background:'rgba(255,255,255,0.06)', color:T.textSub }}>
                {e}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
        {sent && (
          <div style={{ padding:'10px 14px', borderRadius:8, background:'rgba(74,222,128,0.1)', border:`1px solid rgba(74,222,128,0.2)`, marginBottom:10, fontSize:11, color:T.green, animation:'eco-fadeIn 0.2s ease' }}>
            ✅ {TIPO_SOL_ICONS[sent]} Solicitação enviada com sucesso!
          </div>
        )}

        {/* Action buttons */}
        {!solicitando && (
          <>
            <p style={{ margin:'0 0 8px 2px', fontSize:9, fontWeight:800, color:T.dim, letterSpacing:'0.08em' }}>AÇÕES</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:12 }}>
              {[
                { id:'orcamento',    icon:'💰', label:'Solicitar Orçamento', color:'#60a5fa' },
                { id:'amostra',      icon:'📦', label:'Solicitar Amostra',   color:'#34d399' },
                { id:'visita',       icon:'🤝', label:'Solicitar Visita',    color:'#fbbf24' },
                { id:'compartilhar', icon:'📤', label:'Compartilhar Projeto', color:'#a78bfa' },
              ].map(a => (
                <button
                  key={a.id}
                  onClick={() => setSolicitando(a.id)}
                  className="eco-btn"
                  style={{
                    padding:'10px 12px', borderRadius:8, border:`1px solid ${a.color}33`,
                    background:`${a.color}08`, cursor:'pointer', display:'flex', alignItems:'center', gap:8,
                  }}
                >
                  <span style={{ fontSize:16 }}>{a.icon}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:a.color }}>{a.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Solicitação form */}
        {solicitando && (
          <SolicitacaoForm
            tipo={solicitando}
            partner={partner}
            projetoId={projetoId}
            projetoTitulo={projetoTitulo}
            onCancel={() => setSolicitando(null)}
            onSend={solicitando === 'compartilhar'
              ? (msg, canal) => handleCompartilhar(msg, canal)
              : (msg, canal) => handleSolicitar(solicitando, msg, canal)
            }
          />
        )}

        {/* Observations */}
        {partner.observacoes && !solicitando && (
          <div style={{ marginTop:8, padding:'10px 12px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
            <p style={{ margin:'0 0 4px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>OBSERVAÇÕES</p>
            <p style={{ margin:0, fontSize:11, color:T.textSub, lineHeight:1.6 }}>{partner.observacoes}</p>
          </div>
        )}

        {/* Danger zone */}
        {!solicitando && (
          <div style={{ marginTop:16, paddingTop:12, borderTop:`1px solid ${T.border}` }}>
            <button onClick={onDelete} style={{ padding:'5px 12px', borderRadius:6, border:`1px solid rgba(248,113,113,0.3)`, background:'transparent', color:T.red, fontSize:10, cursor:'pointer' }}>
              🗑 Remover parceiro
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Module ──────────────────────────────────────────────────────────────
export function EcosystemModule() {
  const arqState = useArqProjectContext()
  const projetoId    = arqState?.projectId ?? undefined
  const projetoTitle = arqState?.projectMeta?.titulo ?? undefined

  const [tab,        setTab]        = useState<'parceiros'|'solicitacoes'>('parceiros')
  const [partners,   setPartners]   = useState<Partner[]>([])
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [tipoFilter, setTipoFilter] = useState('todos')
  const [selected,   setSelected]   = useState<Partner|null>(null)
  const [creating,   setCreating]   = useState(false)
  const [editing,    setEditing]    = useState<Partner|null>(null)
  const [saving,     setSaving]     = useState(false)

  const fetchPartners = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/arch/partners`, { headers: authHeaders() })
      if (res.ok) setPartners(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchSolicitacoes = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/arch/solicitacoes`, { headers: authHeaders() })
      if (res.ok) setSolicitacoes(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchPartners(); fetchSolicitacoes() }, [fetchPartners, fetchSolicitacoes])

  // Filter
  const filtered = partners.filter(p => {
    const matchSearch = !search || p.nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.cidade ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.especialidades ?? []).some(e => e.toLowerCase().includes(search.toLowerCase()))
    const matchTipo = tipoFilter === 'todos' || p.tipo === tipoFilter
    return matchSearch && matchTipo && p.ativo
  })

  async function handleSave(data: Record<string, unknown>) {
    setSaving(true)
    try {
      if (editing) {
        const res = await fetch(`${BASE}/arch/partners/${editing.id}`, { method:'PATCH', headers:authHeaders(), body:JSON.stringify(data) })
        if (res.ok) { setEditing(null); setSelected(await res.json()) }
      } else {
        const res = await fetch(`${BASE}/arch/partners`, { method:'POST', headers:authHeaders(), body:JSON.stringify(data) })
        if (res.ok) { setCreating(false); setSelected(await res.json()) }
      }
      await fetchPartners()
    } finally { setSaving(false) }
  }

  async function handleDelete(p: Partner) {
    if (!confirm(`Remover ${p.nome}?`)) return
    await fetch(`${BASE}/arch/partners/${p.id}`, { method:'DELETE', headers:authHeaders() })
    setSelected(null)
    await fetchPartners()
  }

  const tipoChips = [
    { id:'todos', label:'Todos' },
    { id:'fornecedor',    label:'Fornecedores'   },
    { id:'fabricante',    label:'Fabricantes'    },
    { id:'representante', label:'Representantes' },
    { id:'loja',          label:'Lojas'          },
  ]

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:T.bg }}>
      <style>{CSS}</style>

      {/* ── TOP BAR ── */}
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.sidebar }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div>
            <p style={{ margin:0, fontSize:15, fontWeight:900, color:'#fff' }}>🌐 Ecosystem Engine</p>
            <p style={{ margin:0, fontSize:10, color:T.dim }}>Diretório de parceiros, fornecedores e fabricantes</p>
          </div>
          <div style={{ flex:1 }}/>
          {/* Tabs */}
          {(['parceiros','solicitacoes'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding:'5px 14px', borderRadius:7, border:`1px solid ${tab===t?T.purple:T.border}`,
              background:tab===t?'rgba(124,58,237,0.18)':'transparent', color:tab===t?T.purpleL:T.dim,
              fontSize:10, fontWeight:700, cursor:'pointer',
            }}>
              {t === 'parceiros' ? `🏢 Parceiros (${partners.filter(p=>p.ativo).length})` : `📋 Solicitações (${solicitacoes.length})`}
            </button>
          ))}
          <button onClick={() => { setCreating(true); setEditing(null); setSelected(null) }} style={{
            padding:'5px 16px', borderRadius:7, border:'none', background:T.purple,
            color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer',
          }}>
            + Novo Parceiro
          </button>
        </div>
      </div>

      {/* ── BODY ── */}
      {tab === 'parceiros' && (
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

          {/* Left: list */}
          <div style={{ width:320, flexShrink:0, borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            {/* Search + filter */}
            <div style={{ padding:'10px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
              <input
                className="eco-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Buscar parceiro, cidade, categoria…"
                style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.04)', color:'#fff', fontSize:11, boxSizing:'border-box' as const }}
              />
              <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' as const }}>
                {tipoChips.map(c => (
                  <button key={c.id} onClick={() => setTipoFilter(c.id)} className={`eco-chip${tipoFilter===c.id?' active':''}`} style={{
                    padding:'2px 9px', borderRadius:8, border:`1px solid ${tipoFilter===c.id?T.purple:T.border}`,
                    background:tipoFilter===c.id?'rgba(124,58,237,0.2)':'transparent',
                    color:tipoFilter===c.id?T.purpleL:T.dim, fontSize:9, fontWeight:700, cursor:'pointer',
                  }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Partner list */}
            <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
              {loading && (
                <p style={{ padding:'20px', textAlign:'center', fontSize:11, color:T.dim }}>Carregando parceiros…</p>
              )}
              {!loading && filtered.length === 0 && (
                <div style={{ padding:'24px 16px', textAlign:'center' as const }}>
                  <p style={{ fontSize:28, margin:'0 0 8px' }}>🏢</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#fff' }}>Nenhum parceiro</p>
                  <p style={{ margin:'4px 0 0', fontSize:10, color:T.dim }}>Adicione fornecedores, fabricantes e representantes</p>
                  <button onClick={() => setCreating(true)} style={{ marginTop:12, padding:'6px 16px', borderRadius:7, border:'none', background:T.purple, color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                    + Adicionar Parceiro
                  </button>
                </div>
              )}
              {filtered.map(p => {
                const color = tipoColor(p.tipo)
                const isSel = selected?.id === p.id
                return (
                  <div
                    key={p.id}
                    className={`eco-card${isSel?' selected':''}`}
                    onClick={() => { setSelected(p); setCreating(false); setEditing(null) }}
                    style={{ padding:'10px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.03)', marginBottom:5 }}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:8, background:`${color}18`, color, border:`1px solid ${color}22` }}>
                        {TIPO_LABELS[p.tipo] ?? p.tipo}
                      </span>
                      {p.prazoDescricao && (
                        <span style={{ fontSize:8, color:T.dim }}>⏱ {p.prazoDescricao}</span>
                      )}
                    </div>
                    <p style={{ margin:0, fontSize:12, fontWeight:800, color:'#fff' }}>{p.nome}</p>
                    <div style={{ display:'flex', gap:8, marginTop:3 }}>
                      {(p.cidade || p.estado) && (
                        <span style={{ fontSize:9, color:T.dim }}>📍 {[p.cidade, p.estado].filter(Boolean).join(', ')}</span>
                      )}
                      {p.email && <span style={{ fontSize:9, color:T.blue }}>✉</span>}
                    </div>
                    {p.especialidades && p.especialidades.length > 0 && (
                      <div style={{ display:'flex', gap:3, marginTop:5, flexWrap:'wrap' as const }}>
                        {p.especialidades.slice(0,3).map(e => (
                          <span key={e} style={{ fontSize:8, padding:'1px 5px', borderRadius:6, background:'rgba(255,255,255,0.05)', color:T.dim }}>{e}</span>
                        ))}
                        {p.especialidades.length > 3 && (
                          <span style={{ fontSize:8, color:T.dim }}>+{p.especialidades.length-3}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: form or detail */}
          <div style={{ flex:1, padding:'12px', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            {(creating || editing) && (
              <PartnerForm
                initial={editing ?? undefined}
                onSave={handleSave}
                onCancel={() => { setCreating(false); setEditing(null) }}
                saving={saving}
              />
            )}
            {selected && !creating && !editing && (
              <PartnerDetail
                partner={selected}
                onClose={() => setSelected(null)}
                onEdit={() => setEditing(selected)}
                onDelete={() => handleDelete(selected)}
                projetoId={projetoId}
                projetoTitulo={projetoTitle}
              />
            )}
            {!selected && !creating && !editing && (
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
                <span style={{ fontSize:48, opacity:0.3 }}>🌐</span>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:T.dim }}>Selecione um parceiro</p>
                <p style={{ margin:0, fontSize:11, color:T.dim, textAlign:'center' as const }}>
                  Ou crie um novo clicando em <strong style={{ color:T.purpleL }}>+ Novo Parceiro</strong>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SOLICITAÇÕES TAB ── */}
      {tab === 'solicitacoes' && (
        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
          {solicitacoes.length === 0 ? (
            <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
              <span style={{ fontSize:36, opacity:0.3 }}>📋</span>
              <p style={{ margin:0, fontSize:13, fontWeight:700, color:T.dim }}>Nenhuma solicitação ainda</p>
              <p style={{ margin:0, fontSize:11, color:T.dim }}>Selecione um parceiro e clique em Solicitar Orçamento, Amostra ou Visita</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {solicitacoes.map(s => {
                const statusColor = STATUS_COLORS[s.status] ?? T.dim
                return (
                  <div key={s.id} className="eco-card" style={{ padding:'12px 14px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, cursor:'default' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:14 }}>{TIPO_SOL_ICONS[s.tipo] ?? '📋'}</span>
                      <span style={{ fontSize:10, fontWeight:800, color:'#fff' }}>
                        {s.tipo === 'orcamento' ? 'Orçamento' : s.tipo === 'amostra' ? 'Amostra' : s.tipo === 'visita' ? 'Visita' : 'Compartilhar'}
                      </span>
                      <span style={{ fontSize:8, fontWeight:700, padding:'2px 7px', borderRadius:8, background:`${statusColor}18`, color:statusColor }}>
                        {s.status}
                      </span>
                      <span style={{ fontSize:9, color:T.dim, marginLeft:'auto' }}>
                        {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div style={{ display:'flex', gap:10, fontSize:10, color:T.textSub }}>
                      {s.parceiroNome && <span>🏢 {s.parceiroNome}</span>}
                      {s.projetoTitulo && <span>📁 {s.projetoTitulo}</span>}
                      {s.canalEnvio && <span>• {s.canalEnvio}</span>}
                    </div>
                    {s.mensagem && (
                      <p style={{ margin:'5px 0 0', fontSize:10, color:T.dim, lineHeight:1.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                        {s.mensagem}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
