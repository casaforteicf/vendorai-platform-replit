import { useState } from 'react'
import { T } from '../../shared/arqdor-theme'
import { PromptPlaygroundModule as ArchitecturePromptHub } from './PromptPlaygroundLegacy'
import { PortraitLightingTab } from './PortraitLightingTab'

export { VariationCard } from './PromptPlaygroundLegacy'

type HubMode = 'architecture' | 'portrait'

export function PromptPlaygroundModule() {
  const [mode, setMode] = useState<HubMode>('architecture')

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:T.bg }}>
      <div style={{
        flexShrink:0, display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
        borderBottom:`1px solid ${T.border}`, background:'rgba(255,255,255,0.015)',
      }}>
        <span style={{ fontSize:10, fontWeight:800, color:T.dim, marginRight:4 }}>PROMPT HUB</span>
        {([
          { id:'architecture' as HubMode, label:'🏗️ Projeto / Arquitetura', desc:'AIE Playwright e Playground arquitetônico' },
          { id:'portrait' as HubMode, label:'💡 Retrato / Iluminação', desc:'Identidade, luz, sombra, rim light e fundo' },
        ]).map(item => {
          const active = mode === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              title={item.desc}
              style={{
                padding:'6px 11px', borderRadius:7, cursor:'pointer',
                border: active ? '1px solid rgba(124,58,237,.5)' : `1px solid ${T.border}`,
                background: active ? 'rgba(124,58,237,.14)' : 'rgba(255,255,255,.025)',
                color: active ? '#c4b5fd' : T.dim, fontSize:10, fontWeight:active ? 800 : 600,
              }}>
              {item.label}
            </button>
          )
        })}
        <span style={{ marginLeft:'auto', fontSize:9, color:T.dim }}>
          {mode === 'portrait' ? 'Biblioteca de Mídias + geração integrada' : 'Motor arquitetônico preservado'}
        </span>
      </div>

      <div style={{ flex:1, minHeight:0, overflow:'hidden' }}>
        {mode === 'portrait' ? <PortraitLightingTab /> : <ArchitecturePromptHub />}
      </div>
    </div>
  )
}
