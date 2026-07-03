import { useState } from 'react'
import { ComponentsPanel } from './ComponentsPanel'
import { T } from '../../shared/arqdor-theme'


const MATERIALS = [
  { id:'m1', name:'MDF Carvalho Freijó 15mm', cat:'Madeira',    mfr:'Duratex',    code:'DRX-KF15', color:'#9B6C3C', finish:'Amadeirado' },
  { id:'m2', name:'Silestone Calacatta Gold', cat:'Pedra',      mfr:'Cosentino',  code:'SIL-CG20', color:'#E8E0D5', finish:'Polido'     },
  { id:'m3', name:'Porcelanato Carvalho 60×60',cat:'Piso',      mfr:'Durafloor',  code:'DFL-CK60', color:'#C8A87A', finish:'Mate'       },
  { id:'m4', name:'Inox Escovado 304',        cat:'Metal',      mfr:'Aço Premium',code:'INX-304EB',color:'#C0C0C0', finish:'Escovado'   },
  { id:'m5', name:'Veludo Verde Musgo',        cat:'Tecido',     mfr:'Teciflex',   code:'VPM-VM',   color:'#4A7856', finish:'Veludo'     },
  { id:'m6', name:'Tinta Branco Gelo',         cat:'Tinta',      mfr:'Suvinil',    code:'SUV-WG01', color:'#F5F0EB', finish:'Fosco'      },
  { id:'m7', name:'Vidro Laminado 6mm',        cat:'Vidro',      mfr:'Saint-Gobain',code:'SG-L6',   color:'#A8D0E0', finish:'Transparente'},
  { id:'m8', name:'Puxador Botão Inox ø32',   cat:'Ferragem',   mfr:'Häfele',     code:'HF-3200',  color:'#B8B8B8', finish:'Escovado'   },
]

const OBJECTS = [
  { id:'o1', cat:'Puxadores',   name:'Cava Fresada 10mm',      icon:'🔩' },
  { id:'o2', cat:'Puxadores',   name:'Puxador Barra Inox 128', icon:'🔩' },
  { id:'o3', cat:'Iluminação',  name:'Trilho Linear 4000K',    icon:'💡' },
  { id:'o4', cat:'Iluminação',  name:'Pendente Esférico ø20',  icon:'💡' },
  { id:'o5', cat:'Esquadrias',  name:'Janela Maxim-Ar Slim',   icon:'🪟' },
  { id:'o6', cat:'Esquadrias',  name:'Porta de Vidro Pivô',    icon:'🚪' },
  { id:'o7', cat:'Bancadas',    name:'Bancada L Inox 1.8m',    icon:'🔲' },
  { id:'o8', cat:'Painéis',     name:'Painel Ripado Vertical', icon:'🪵' },
]

const STYLES = [
  { id:'s1', name:'Contemporâneo',  palette:['#E8E0D5','#C8A87A','#2D2D2D'] },
  { id:'s2', name:'Minimalista',    palette:['#FFFFFF','#F0F0F0','#1A1A1A'] },
  { id:'s3', name:'Japandi',        palette:['#E8DDD0','#8B7355','#4A4A4A'] },
  { id:'s4', name:'Industrial',     palette:['#6B6B6B','#3D2B1F','#C0C0C0'] },
  { id:'s5', name:'Escandinavo',    palette:['#FAFAFA','#D4C5B5','#5B7B7A'] },
  { id:'s6', name:'Boho',           palette:['#D4A76A','#8B5A2B','#6B8E6B'] },
  { id:'s7', name:'Luxo',           palette:['#1A1A2E','#C9A227','#E8E0D5'] },
  { id:'s8', name:'Clássico',       palette:['#F5E6D3','#8B6914','#2C1810'] },
]

const MAT_CATS = ['Todos','Madeira','Pedra','Piso','Metal','Tecido','Tinta','Vidro','Ferragem']
const OBJ_CATS = ['Todos','Puxadores','Iluminação','Esquadrias','Bancadas','Painéis']

export function LibraryModule() {
  const [tab, setTab]   = useState<'materiais'|'objetos'|'estilos'|'componentes'>('materiais')
  const [q, setQ]       = useState('')
  const [matCat, setMatCat] = useState('Todos')
  const [objCat, setObjCat] = useState('Todos')

  const filtMat = MATERIALS.filter(m =>
    (matCat==='Todos' || m.cat===matCat) &&
    (!q || m.name.toLowerCase().includes(q.toLowerCase()))
  )
  const filtObj = OBJECTS.filter(o =>
    (objCat==='Todos' || o.cat===objCat) &&
    (!q || o.name.toLowerCase().includes(q.toLowerCase()))
  )

  const card = { background:T.card, border:`1px solid ${T.border}`, borderRadius:8 } as const

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      {/* Header */}
      <div style={{ padding:'14px 20px 0', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <h2 style={{ margin:'0 0 12px', fontSize:16, fontWeight:800, color:'#fff' }}>📚 Biblioteca</h2>
        <div style={{ display:'flex', gap:4, marginBottom:12 }}>
          {(['materiais','objetos','estilos','componentes'] as const).map(t => (
            <button key={t} onClick={()=>{ setTab(t); setQ('') }} style={{
              padding:'5px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, textTransform:'capitalize' as const,
              background: tab===t ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.05)',
              color: tab===t ? T.purpleL : T.dim,
            }}>{t==='componentes' ? '🧩 Componentes' : t}</button>
          ))}
          <div style={{ flex:1 }}/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…"
            style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6,
              color:T.text, fontSize:12, padding:'5px 10px', outline:'none', width:180 }}/>
        </div>
        {/* Category filter */}
        {tab==='materiais' && (
          <div style={{ display:'flex', gap:4, paddingBottom:10, overflowX:'auto' as const }}>
            {MAT_CATS.map(c => (
              <button key={c} onClick={()=>setMatCat(c)} style={{
                padding:'3px 10px', borderRadius:12, border:`1px solid ${matCat===c ? T.purple : T.border}`,
                background: matCat===c ? 'rgba(124,58,237,0.15)' : 'transparent',
                color: matCat===c ? T.purpleL : T.dim, fontSize:11, cursor:'pointer', whiteSpace:'nowrap' as const,
              }}>{c}</button>
            ))}
          </div>
        )}
        {tab==='objetos' && (
          <div style={{ display:'flex', gap:4, paddingBottom:10, overflowX:'auto' as const }}>
            {OBJ_CATS.map(c => (
              <button key={c} onClick={()=>setObjCat(c)} style={{
                padding:'3px 10px', borderRadius:12, border:`1px solid ${objCat===c ? T.purple : T.border}`,
                background: objCat===c ? 'rgba(124,58,237,0.15)' : 'transparent',
                color: objCat===c ? T.purpleL : T.dim, fontSize:11, cursor:'pointer', whiteSpace:'nowrap' as const,
              }}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px' }}>
        {tab==='materiais' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
            {filtMat.map(m => (
              <div key={m.id} style={{ ...card, padding:'12px', cursor:'pointer', transition:'border-color 0.15s' }}>
                <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:10 }}>
                  <div style={{ width:36, height:36, borderRadius:6, background:m.color, flexShrink:0, border:`1px solid ${T.border}` }}/>
                  <div>
                    <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{m.name}</p>
                    <p style={{ margin:0, fontSize:10, color:T.dim }}>{m.cat}</p>
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:T.dim }}>
                  <span>{m.mfr}</span>
                  <span style={{ fontFamily:'ui-monospace,monospace' }}>{m.code}</span>
                </div>
                <div style={{ marginTop:8, display:'flex', gap:4 }}>
                  <span style={{ padding:'2px 7px', borderRadius:10, fontSize:9, background:'rgba(255,255,255,0.06)', color:T.dim }}>{m.finish}</span>
                </div>
              </div>
            ))}
            {filtMat.length===0 && <p style={{ color:T.dim, fontSize:12 }}>Nenhum material encontrado.</p>}
          </div>
        )}
        {tab==='objetos' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10 }}>
            {filtObj.map(o => (
              <div key={o.id} style={{ ...card, padding:'12px', display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <span style={{ fontSize:22 }}>{o.icon}</span>
                <div>
                  <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#fff' }}>{o.name}</p>
                  <p style={{ margin:0, fontSize:10, color:T.dim }}>{o.cat}</p>
                </div>
              </div>
            ))}
            {filtObj.length===0 && <p style={{ color:T.dim, fontSize:12 }}>Nenhum objeto encontrado.</p>}
          </div>
        )}
        {tab==='estilos' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
            {STYLES.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase())).map(s => (
              <div key={s.id} style={{ ...card, padding:'14px', cursor:'pointer' }}>
                <div style={{ display:'flex', gap:4, marginBottom:10 }}>
                  {s.palette.map((c,i) => <div key={i} style={{ flex:1, height:28, borderRadius:4, background:c }}/>)}
                </div>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#fff' }}>{s.name}</p>
                <p style={{ margin:'4px 0 0', fontSize:10, color:T.dim }}>Clique para aplicar ao projeto</p>
              </div>
            ))}
          </div>
        )}
        {tab==='componentes' && (
          <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' as const }}>
            <ComponentsPanel/>
          </div>
        )}
      </div>
    </div>
  )
}
