// ─── AICorrectionsModule — Interface Visual de Correções ─────────────────────
// P0 UX: ZERO prompts expostos. O arquiteto trabalha com objetos do projeto.
// Prompts são gerados INTERNAMENTE ao clicar "Aplicar" — nunca exibidos.

import { useState } from 'react'
import { PHX } from '../../shared/arqdor-theme'

// ─── Tipos internos (o prompt nunca sai daqui) ──────────────────────────────
interface Sugestao {
  rotulo: string       // ex: "MDF Freijó amadeirado"
  descricao: string    // ex: "Tom médio, grão vertical, satin"
  _prompt: string      // INTERNO — nunca exibir
}

interface ElementoProjeto {
  id: string
  icone: string
  nome: string
  materialAtual: string
  sugestoes: Sugestao[]
  sugestaoAtiva: number
  status: 'pendente' | 'aplicando' | 'aplicado' | 'descartado'
}

// ─── Catálogo de elementos + sugestões IA ───────────────────────────────────
// Cada sugestão tem um _prompt interno gerado para a API de render.
const ELEMENTOS_INICIAIS: ElementoProjeto[] = [
  {
    id: 'armar', icone: '🪵', nome: 'Armários',
    materialAtual: 'MDF branco liso',
    sugestaoAtiva: 0, status: 'pendente',
    sugestoes: [
      { rotulo: 'MDF Freijó amadeirado', descricao: 'Amadeirado natural, grão vertical, tom médio-quente', _prompt: 'cabinetry in Freijo wood-grain MDF, warm medium-brown natural texture, vertical grain, satin finish — NO white MDF' },
      { rotulo: 'Laca cinza grafite', descricao: 'Acabamento fosco premium, cor grafite contemporâneo', _prompt: 'cabinetry in graphite grey lacquer matte finish, contemporary color, smooth surface — NO white' },
      { rotulo: 'Carvalho europeu', descricao: 'Madeira clara com veios delicados, aspecto escandinavo', _prompt: 'cabinetry in European oak veneer, light natural wood, fine grain, Scandinavian aesthetic — NO white MDF' },
    ],
  },
  {
    id: 'banc', icone: '🏛️', nome: 'Bancadas',
    materialAtual: 'Granito branco comum',
    sugestaoAtiva: 0, status: 'pendente',
    sugestoes: [
      { rotulo: 'Silestone Calacatta Gold', descricao: 'Quartzo branco com veios dourados, polido', _prompt: 'countertop in Silestone Calacatta Gold — polished white quartz with subtle golden veining, warm undertones — NOT plain white granite' },
      { rotulo: 'Corian Snow White', descricao: 'Superfície lisa sem emendas, branco neve', _prompt: 'countertop in Corian Snow White solid surface, seamless pure white, smooth matte, thermoformed edges — NOT granite' },
      { rotulo: 'Mármore Nero Marquina', descricao: 'Preto com veios brancos, sofisticado', _prompt: 'countertop in Nero Marquina black marble with white veining, polished, dramatic contrast — NOT white granite' },
    ],
  },
  {
    id: 'pisos', icone: '⬛', nome: 'Pisos',
    materialAtual: 'Cerâmica bege 45×45',
    sugestaoAtiva: 0, status: 'pendente',
    sugestoes: [
      { rotulo: 'Porcelanato Cinza 120×60', descricao: 'Formato grande, polido, aspecto contemporâneo', _prompt: 'floor in large-format 120x60cm polished grey porcelain, seamless, contemporary — NOT beige ceramic 45x45' },
      { rotulo: 'Concreto aparente polido', descricao: 'Microcimento fosco, textura industrial suave', _prompt: 'floor in polished exposed concrete microcement, light grey matte, industrial minimal aesthetic — NOT ceramic tile' },
      { rotulo: 'Piso de madeira Tauari', descricao: 'Assoalho de madeira maciça, tom mel natural', _prompt: 'floor in Tauari solid wood planks, warm honey tone, smooth finish, classic residential — NOT ceramic tile' },
    ],
  },
  {
    id: 'pared', icone: '🧱', nome: 'Paredes',
    materialAtual: 'Tinta branca fosca',
    sugestaoAtiva: 0, status: 'pendente',
    sugestoes: [
      { rotulo: 'Microcimento cinza claro', descricao: 'Revestimento contínuo sem emendas, textura artesanal', _prompt: 'walls in light grey microcement, continuous seamless surface, artisanal texture, minimalist — NOT white paint' },
      { rotulo: 'Ripas de madeira vertical', descricao: 'Painel ripado em freijó, espaçamento 3cm', _prompt: 'walls with vertical Freijo wood slat panels, 3cm spacing, warm natural wood backdrop — NOT white paint' },
      { rotulo: 'Tinta cinza pérola', descricao: 'Tom neutro sofisticado, acabamento acetinado', _prompt: 'walls painted in pearl grey, warm neutral tone, satin finish, sophisticated — NOT white' },
    ],
  },
  {
    id: 'ilum', icone: '💡', nome: 'Iluminação',
    materialAtual: 'Plafon embutido branco',
    sugestaoAtiva: 0, status: 'pendente',
    sugestoes: [
      { rotulo: 'Trilho LED aparente preto', descricao: 'Trilho metálico preto, luz direcionável warm white', _prompt: 'lighting with black metal LED track lights on ceiling, adjustable warm white spots, modern industrial — NOT recessed white plafon' },
      { rotulo: 'Pendente Filamento vintage', descricao: 'Cúpula de vidro fumê, filamento visível', _prompt: 'pendant lights with smoked glass globe and visible filament, warm amber glow, vintage industrial — NOT white plafon' },
      { rotulo: 'Fita LED indireta em sanca', descricao: 'Iluminação difusa embutida no forro', _prompt: 'indirect LED strip light hidden in ceiling cove (sanca), warm diffused glow, cozy ambient — NOT direct plafon' },
    ],
  },
  {
    id: 'metal', icone: '🔩', nome: 'Metais e Torneiras',
    materialAtual: 'Cromado brilhante genérico',
    sugestaoAtiva: 0, status: 'pendente',
    sugestoes: [
      { rotulo: 'Inox escovado Deca', descricao: 'Monocomando, design minimalista, inox 304', _prompt: 'fixtures and faucets in brushed stainless steel (inox escovado), Deca minimalist single-lever, matte metallic — NOT chrome shiny' },
      { rotulo: 'Preto fosco', descricao: 'Acabamento matte black, aspecto premium', _prompt: 'fixtures in matte black finish, premium contemporary, all metal accents black — NOT chrome' },
      { rotulo: 'Dourado champagne', descricao: 'Tom ouro claro, sofisticado e moderno', _prompt: 'fixtures in champagne gold / brushed brass finish, warm metallic, luxury contemporary — NOT chrome' },
    ],
  },
  {
    id: 'moveis', icone: '🛋️', nome: 'Móveis',
    materialAtual: 'Padrão genérico sem definição',
    sugestaoAtiva: 0, status: 'pendente',
    sugestoes: [
      { rotulo: 'Contemporâneo minimalista', descricao: 'Linhas retas, estofado em linho, pés metálicos', _prompt: 'furniture in contemporary minimalist style, straight clean lines, linen upholstery, metal legs in black — NOT generic undefined furniture' },
      { rotulo: 'Escandinavo natural', descricao: 'Madeira clara, formas orgânicas, paleta neutra', _prompt: 'furniture in Scandinavian style, light wood, organic forms, neutral palette, hygge aesthetic — NOT generic' },
      { rotulo: 'Industrial chic', descricao: 'Couro, metal aparente, madeira rústica', _prompt: 'furniture in industrial chic style, leather, exposed metal, reclaimed wood, urban loft — NOT generic' },
    ],
  },
  {
    id: 'cort', icone: '🪟', nome: 'Cortinas e Persianas',
    materialAtual: 'Sem tratamento de janela',
    sugestaoAtiva: 0, status: 'pendente',
    sugestoes: [
      { rotulo: 'Persiana Blackout rolo', descricao: 'Tecido roller, cor off-white, blecaute total', _prompt: 'window treatment with off-white blackout roller blinds, minimalist clean, full light control — NOT bare window' },
      { rotulo: 'Cortina linho natural', descricao: 'Linho puro, caimento suave, altura piso-teto', _prompt: 'floor-to-ceiling natural linen curtains, soft drape, organic texture, airy minimalist — NOT bare window' },
      { rotulo: 'Painel japonês cinza', descricao: 'Painéis deslizantes, tecido gaze, aspecto zen', _prompt: 'Japanese panel blinds (shoji style) in light grey gauze fabric, sliding, zen minimalist — NOT bare window' },
    ],
  },
  {
    id: 'deco', icone: '🎍', nome: 'Objetos Decorativos',
    materialAtual: 'Vaso plástico simples',
    sugestaoAtiva: 0, status: 'pendente',
    sugestoes: [
      { rotulo: 'Curadoria editorial premium', descricao: 'Plantas naturais, cerâmica artesanal, livros', _prompt: 'decor with editorial curation: large leafy plant (fiddle leaf or monstera), artisan ceramic vases, coffee table books, linen cushions — NOT plastic generic vase' },
      { rotulo: 'Minimalista zen', descricao: 'Pedras, bambu, paleta neutra monocromática', _prompt: 'zen minimalist decor: smooth river stones, bamboo stems, neutral monochromatic palette, negative space — NOT plastic vase' },
      { rotulo: 'Escultural contemporâneo', descricao: 'Peças únicas, formas abstratas, materiais nobres', _prompt: 'sculptural contemporary decor: unique art pieces, abstract forms, marble / brass / matte ceramic — NOT plastic generic' },
    ],
  },
]

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes acm-in    { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
  @keyframes acm-pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
  @keyframes acm-spin  { to{transform:rotate(360deg)} }
  @keyframes acm-check { from{transform:scale(0.5);opacity:0}to{transform:scale(1);opacity:1} }

  .acm-card { transition: box-shadow 0.2s, border-color 0.2s !important; }
  .acm-card:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important; }

  .acm-btn-aplicar {
    transition: all 0.15s ease !important; cursor: pointer;
  }
  .acm-btn-aplicar:hover:not(:disabled) {
    background: ${PHX.purple} !important;
    color: #fff !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 12px rgba(124,58,237,0.25) !important;
  }

  .acm-btn-trocar {
    transition: all 0.15s ease !important; cursor: pointer;
  }
  .acm-btn-trocar:hover {
    background: rgba(124,58,237,0.08) !important;
    border-color: ${PHX.purple} !important;
    color: ${PHX.purple} !important;
  }

  .acm-btn-cancelar {
    transition: all 0.15s ease !important; cursor: pointer;
  }
  .acm-btn-cancelar:hover {
    background: rgba(220,38,38,0.06) !important;
    border-color: rgba(220,38,38,0.3) !important;
    color: ${PHX.red} !important;
  }

  .acm-sugestao-chip {
    transition: all 0.12s ease !important; cursor: pointer;
  }
  .acm-sugestao-chip:hover {
    border-color: ${PHX.purple} !important;
    background: rgba(124,58,237,0.06) !important;
    color: ${PHX.purple} !important;
  }
  .acm-sugestao-chip.active {
    border-color: ${PHX.purple} !important;
    background: rgba(124,58,237,0.08) !important;
    color: ${PHX.purple} !important;
  }

  .acm-render-btn {
    transition: all 0.15s ease !important; cursor: pointer;
  }
  .acm-render-btn:hover {
    background: ${PHX.purpleD} !important;
    box-shadow: 0 6px 20px rgba(124,58,237,0.4) !important;
    transform: translateY(-1px) !important;
  }

  .acm-desfazer-btn {
    transition: all 0.15s ease !important; cursor: pointer;
  }
  .acm-desfazer-btn:hover {
    border-color: rgba(22,163,74,0.4) !important;
    color: ${PHX.green} !important;
  }
`

// ─── Componente principal ────────────────────────────────────────────────────
export function AICorrectionsModule() {
  const [elementos, setElementos] = useState<ElementoProjeto[]>(ELEMENTOS_INICIAIS)
  const [trocandoId, setTrocandoId] = useState<string | null>(null)

  // ── Ações ──────────────────────────────────────────────────────────────────
  function aplicar(id: string) {
    // Marca como "aplicando" para mostrar feedback visual
    setElementos(prev => prev.map(e => e.id === id ? { ...e, status: 'aplicando' as const } : e))
    // Simula geração do prompt internamente (nunca exibido)
    setTimeout(() => {
      setElementos(prev => prev.map(e => e.id === id ? { ...e, status: 'aplicado' as const } : e))
    }, 1000)
  }

  function desfazer(id: string) {
    setElementos(prev => prev.map(e => e.id === id ? { ...e, status: 'pendente' as const } : e))
  }

  function descartar(id: string) {
    setElementos(prev => prev.map(e => e.id === id ? { ...e, status: 'descartado' as const } : e))
  }

  function toggleTrocar(id: string) {
    setTrocandoId(prev => prev === id ? null : id)
  }

  function selecionarSugestao(elementoId: string, sugestaoIdx: number) {
    setElementos(prev => prev.map(e =>
      e.id === elementoId ? { ...e, sugestaoAtiva: sugestaoIdx, status: 'pendente' as const } : e
    ))
    setTrocandoId(null)
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const aplicados   = elementos.filter(e => e.status === 'aplicado').length
  const pendentes   = elementos.filter(e => e.status === 'pendente').length
  const descartados = elementos.filter(e => e.status === 'descartado').length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: PHX.bg, overflow: 'hidden' }}>
      <style>{CSS}</style>

      {/* ── Header ── */}
      <div style={{
        padding: '16px 20px 14px',
        borderBottom: `1px solid ${PHX.border}`,
        background: PHX.surface,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 900, color: PHX.text }}>
              🔄 Melhorias do Projeto
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: PHX.textSub }}>
              Selecione os elementos que deseja alterar e clique em Aplicar
            </p>
          </div>
        </div>

        {/* Counters */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: aplicados > 0 ? 'rgba(22,163,74,0.08)' : PHX.muted,
            border: `1px solid ${aplicados > 0 ? 'rgba(22,163,74,0.2)' : PHX.border}`,
          }}>
            <span style={{ fontSize: 12 }}>✓</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: aplicados > 0 ? PHX.green : PHX.dim }}>
              {aplicados} aplicado{aplicados !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: PHX.muted,
            border: `1px solid ${PHX.border}`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: PHX.textSub }}>
              {pendentes} pendente{pendentes !== 1 ? 's' : ''}
            </span>
          </div>
          {descartados > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 20,
              background: PHX.muted, border: `1px solid ${PHX.border}`,
            }}>
              <span style={{ fontSize: 11, color: PHX.dim }}>{descartados} descartado{descartados !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Cards grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12,
        }}>
          {elementos.filter(e => e.status !== 'descartado').map((el, i) => {
            const sugestao = el.sugestoes[el.sugestaoAtiva]
            const isAplicado   = el.status === 'aplicado'
            const isAplicando  = el.status === 'aplicando'
            const isTrocando   = trocandoId === el.id

            return (
              <div
                key={el.id}
                className="acm-card"
                style={{
                  borderRadius: 14,
                  border: `1.5px solid ${isAplicado ? 'rgba(22,163,74,0.25)' : PHX.border}`,
                  background: isAplicado ? 'rgba(22,163,74,0.03)' : PHX.surface,
                  overflow: 'hidden',
                  animation: `acm-in 0.35s ease ${i * 0.04}s both`,
                  boxShadow: PHX.shadow,
                }}
              >
                {/* Card header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px 10px',
                  borderBottom: `1px solid ${PHX.border}`,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: isAplicado ? 'rgba(22,163,74,0.1)' : 'rgba(124,58,237,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, flexShrink: 0,
                  }}>
                    {isAplicado ? '✅' : el.icone}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontSize: 14, fontWeight: 800,
                      color: isAplicado ? PHX.green : PHX.text,
                    }}>
                      {el.nome}
                    </p>
                    {isAplicado && (
                      <p style={{ margin: 0, fontSize: 11, color: PHX.green, fontWeight: 600 }}>
                        Alteração aplicada
                      </p>
                    )}
                  </div>
                  {isAplicado && (
                    <button
                      className="acm-desfazer-btn"
                      onClick={() => desfazer(el.id)}
                      style={{
                        padding: '4px 10px', borderRadius: 8,
                        border: `1px solid rgba(22,163,74,0.2)`,
                        background: 'transparent',
                        color: PHX.textSub, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Desfazer
                    </button>
                  )}
                </div>

                {/* Card body — só se não aplicado */}
                {!isAplicado && (
                  <div style={{ padding: '12px 14px' }}>

                    {/* Material atual vs Sugestão IA */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>

                      {/* Atual */}
                      <div style={{
                        padding: '8px 12px', borderRadius: 8,
                        background: PHX.muted, border: `1px solid ${PHX.border}`,
                      }}>
                        <p style={{ margin: '0 0 2px', fontSize: 9, fontWeight: 800, color: PHX.dim, letterSpacing: '.07em' }}>
                          MATERIAL ATUAL
                        </p>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: PHX.textSub }}>
                          {el.materialAtual}
                        </p>
                      </div>

                      {/* Seta */}
                      <div style={{ textAlign: 'center', color: PHX.purple, fontSize: 14 }}>↓</div>

                      {/* Sugestão IA */}
                      <div style={{
                        padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(124,58,237,0.05)',
                        border: `1.5px solid rgba(124,58,237,0.18)`,
                      }}>
                        <p style={{ margin: '0 0 2px', fontSize: 9, fontWeight: 800, color: PHX.purple, letterSpacing: '.07em' }}>
                          SUGESTÃO IA ✨
                        </p>
                        <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: PHX.text }}>
                          {sugestao.rotulo}
                        </p>
                        <p style={{ margin: 0, fontSize: 11, color: PHX.textSub }}>
                          {sugestao.descricao}
                        </p>
                      </div>
                    </div>

                    {/* Alternativas — só quando "Trocar" está aberto */}
                    {isTrocando && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: PHX.dim, letterSpacing: '.06em' }}>
                          ESCOLHA UMA ALTERNATIVA
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {el.sugestoes.map((s, si) => (
                            <button
                              key={si}
                              className={`acm-sugestao-chip${si === el.sugestaoAtiva ? ' active' : ''}`}
                              onClick={() => selecionarSugestao(el.id, si)}
                              style={{
                                width: '100%', textAlign: 'left',
                                padding: '8px 12px', borderRadius: 8,
                                border: `1.5px solid ${si === el.sugestaoAtiva ? PHX.purple : PHX.border}`,
                                background: si === el.sugestaoAtiva ? 'rgba(124,58,237,0.06)' : PHX.muted,
                                color: si === el.sugestaoAtiva ? PHX.purple : PHX.text,
                                cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', gap: 2,
                              }}
                            >
                              <span style={{ fontSize: 12, fontWeight: 700 }}>
                                {si === el.sugestaoAtiva && '✓ '}{s.rotulo}
                              </span>
                              <span style={{ fontSize: 10, color: si === el.sugestaoAtiva ? PHX.purpleL : PHX.textSub }}>
                                {s.descricao}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ações */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {/* Aplicar */}
                      <button
                        className="acm-btn-aplicar"
                        onClick={() => aplicar(el.id)}
                        disabled={isAplicando}
                        style={{
                          flex: 1, padding: '9px 0', borderRadius: 9,
                          border: `1.5px solid ${PHX.purple}`,
                          background: isAplicando ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.06)',
                          color: isAplicando ? PHX.purpleL : PHX.purple,
                          fontSize: 12, fontWeight: 800, cursor: isAplicando ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        {isAplicando ? (
                          <>
                            <div style={{ width: 11, height: 11, border: `2px solid ${PHX.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'acm-spin 0.7s linear infinite' }} />
                            Aplicando…
                          </>
                        ) : 'Aplicar'}
                      </button>

                      {/* Trocar */}
                      <button
                        className="acm-btn-trocar"
                        onClick={() => toggleTrocar(el.id)}
                        style={{
                          padding: '9px 14px', borderRadius: 9,
                          border: `1.5px solid ${isTrocando ? PHX.purple : PHX.border}`,
                          background: isTrocando ? 'rgba(124,58,237,0.06)' : PHX.surface,
                          color: isTrocando ? PHX.purple : PHX.textSub,
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {isTrocando ? '▲ Fechar' : '🔄 Trocar'}
                      </button>

                      {/* Cancelar */}
                      <button
                        className="acm-btn-cancelar"
                        onClick={() => descartar(el.id)}
                        style={{
                          padding: '9px 12px', borderRadius: 9,
                          border: `1.5px solid ${PHX.border}`,
                          background: PHX.surface,
                          color: PHX.dim,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                        title="Ignorar esta sugestão"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Empty state (todos descartados) */}
        {elementos.filter(e => e.status !== 'descartado').length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: PHX.text }}>
              Projeto concluído
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: PHX.textSub }}>
              Todas as sugestões foram descartadas.
            </p>
            <button
              onClick={() => setElementos(ELEMENTOS_INICIAIS)}
              style={{
                padding: '9px 20px', borderRadius: 9,
                border: `1.5px solid ${PHX.border}`,
                background: PHX.surface, color: PHX.textSub,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              🔄 Recomeçar
            </button>
          </div>
        )}
      </div>

      {/* ── Sticky bottom bar — Re-renderizar ── */}
      {aplicados > 0 && (
        <div style={{
          position: 'sticky' as const, bottom: 0,
          background: PHX.surface,
          borderTop: `1px solid ${PHX.border}`,
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: PHX.text }}>
              {aplicados} alteraç{aplicados === 1 ? 'ão' : 'ões'} selecionada{aplicados !== 1 ? 's' : ''}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: PHX.textSub }}>
              Gere um novo render para ver o resultado final
            </p>
          </div>
          <button
            className="acm-render-btn"
            onClick={() => {
              // Navega para o módulo home para gerar novo render
              window.dispatchEvent(new CustomEvent('arqdor:navigate', { detail: { module: 'home' } }))
            }}
            style={{
              padding: '11px 22px', borderRadius: 11,
              border: 'none',
              background: `linear-gradient(135deg, ${PHX.purple}, ${PHX.purpleD})`,
              color: '#fff',
              fontSize: 13, fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
            }}
          >
            <span style={{ fontSize: 14 }}>✨</span>
            Gerar novo render
          </button>
        </div>
      )}
    </div>
  )
}
