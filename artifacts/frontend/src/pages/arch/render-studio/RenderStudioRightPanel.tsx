import { useState } from "react";
import type {
  RenderStudioStep as Step,
  RenderStudioSelectionRect as SelectionRect,
  RenderStudioVersion as RenderVersion,
  RenderStudioVideoMovement as VideoMovement,
  RenderStudioImprovementMode,
  RenderStudioSceneType,
  RenderStudioProfile,
  RenderStudioVisualStyle,
  RenderStudioLightingProfile,
  RenderStudioCatalogItem as CatalogItem,
  RenderStudioApprovalRecord as ApprovalRecord,
} from "./renderStudioModel";
import { normalizeRenderMediaUrl } from "./renderStudioApi";
import { RENDER_STUDIO_THEME as D, renderStudioInputStyle as inputStyle } from "./renderStudioTheme";
import {
  RenderStudioButton as DkBtn,
  RenderStudioSpinner as DkSpinner,
  RenderStudioError as DkErr,
  RenderStudioBadge as Badge,
  RenderStudioPanelLabel as PanelLabel,
  RenderStudioInfoBox as InfoBox,
} from "./RenderStudioPrimitives";
import { RenderStudioCopilot as CopilotPanel } from "./RenderStudioCopilot";

// ─── Right Panel (P2-14/15/16/17/20/21) ──────────────────────────────────────

export function RenderStudioRightPanel({
  step, arq, ambiente, setAmbiente, imageFile, imageDataUrl, renderUrl, currentRenderId, versions, loading, err,
  melhoriaPrompt, setMelhoriaPrompt, melhoriaMode, setMelhoriaMode,
  approved,
  onNextStep, onStartRender, onApplyMelhoria, onApprove,
  sceneType, setSceneType, renderProfile, setRenderProfile, visualStyle, setVisualStyle, lightingProfile, setLightingProfile,
  videoMovement, setVideoMovement, videoGenerating, renderVideoUrl, onGenerateVideo5s,
  onShowCreateModal, onUpload, onOpenMediaLibrary, mediaLibraryAvailable,
  selections, selectedMaterial, onOpenMaterialLib, onClearSelection, onRemoveSelection,
  materialMaskPreviewUrl, materialMaskConfirmed, materialMaskDetecting, onDetectMaterialSurface, onConfirmMaterialSurface,
  approvalRecord, approvalNote, setApprovalNote,
  onOpenSpecification,
  onTestCopilotAction,
  isOpen, onToggle,
}: {
  step: Step; arq: any; ambiente: string; setAmbiente: (v: string) => void;
  imageFile: File | null; imageDataUrl: string | null; renderUrl: string | null; currentRenderId: string | null;
  versions: RenderVersion[]; loading: boolean; err: string | null;
  melhoriaPrompt: string; setMelhoriaPrompt: (v: string) => void;
  melhoriaMode: RenderStudioImprovementMode; setMelhoriaMode: (v: RenderStudioImprovementMode) => void;
  approved: boolean;
  onNextStep: () => void; onStartRender: () => void;
  onApplyMelhoria: () => void; onApprove: () => void;
  sceneType: RenderStudioSceneType; setSceneType: (v: RenderStudioSceneType) => void;
  renderProfile: RenderStudioProfile; setRenderProfile: (v: RenderStudioProfile) => void;
  visualStyle: RenderStudioVisualStyle; setVisualStyle: (v: RenderStudioVisualStyle) => void;
  lightingProfile: RenderStudioLightingProfile; setLightingProfile: (v: RenderStudioLightingProfile) => void;
  videoMovement: VideoMovement; setVideoMovement: (v: VideoMovement) => void;
  videoGenerating: boolean; renderVideoUrl: string | null; onGenerateVideo5s: () => void;
  onShowCreateModal: () => void; onUpload: () => void; onOpenMediaLibrary: () => void; mediaLibraryAvailable: boolean;
  selections: SelectionRect[]; selectedMaterial: CatalogItem | null;
  onOpenMaterialLib: () => void; onClearSelection: () => void; onRemoveSelection: (id: string) => void;
  materialMaskPreviewUrl: string | null; materialMaskConfirmed: boolean; materialMaskDetecting: boolean;
  onDetectMaterialSurface: () => void; onConfirmMaterialSurface: () => void;
  approvalRecord: ApprovalRecord | null; approvalNote: string; setApprovalNote: (v: string) => void;
  onOpenSpecification: () => void;
  onTestCopilotAction: (prompt: string) => void;
  isOpen: boolean; onToggle: () => void;
}) {
  const [tab, setTab] = useState<"propriedades" | "camadas">("propriedades");
  const currentVersion = versions.find((version) => version.id === currentRenderId) ?? versions[0] ?? null;
  const otherVersions = versions.filter((version) => version.id !== currentVersion?.id);

  const AMBIENTE_OPTIONS = [
    "Sala de Estar", "Quarto Master", "Cozinha", "Banheiro", "Escritório", "Hall de Entrada",
    "Varanda", "Terraço", "Área Gourmet", "Fachada", "Área Externa", "Piscina / SPA",
  ];
  const MELHORIA_MODES: { id: RenderStudioImprovementMode; label: string; hint: string; icon: string }[] = [
    { id: "improve", label: "Refinar qualidade", hint: "Texturas, luz, reflexos e definição.", icon: "✨" },
    { id: "change-material", label: "Trocar material", hint: "Altera somente a região escolhida.", icon: "🎨" },
    { id: "change-lighting", label: "Ajustar iluminação", hint: "Mantém materiais e geometria.", icon: "💡" },
  ];

  return (
    <div className="arqdor-legacy-right-panel" style={{ display: "flex", alignItems: "stretch", position: "relative" }}>
      {/* P1-12: toggle */}
      <button onClick={onToggle} aria-label={isOpen ? "Recolher painel direito" : "Expandir painel direito"} style={{ position: "absolute", left: -14, top: "50%", transform: "translateY(-50%)", zIndex: 10, width: 14, height: 32, borderRadius: "4px 0 0 4px", background: D.surface, border: `1px solid ${D.border}`, borderRight: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: D.dim, fontSize: 9 }}>{isOpen ? "›" : "‹"}</button>

      {isOpen && (
        <div style={{ width: 300, flexShrink: 0, background: D.surface, borderLeft: `1px solid ${D.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            {(["propriedades", "camadas"] as const).map((t) => (
              <button key={t} type="button" role="tab" id={`arqdor-render-tab-${t}`} aria-controls="arqdor-render-tab-content" onClick={() => setTab(t)} aria-selected={tab === t} style={{ flex: 1, padding: "10px 0", fontSize: 11, fontWeight: tab === t ? 700 : 400, color: tab === t ? "#4AC59A" : D.muted, background: "none", border: "none", borderBottom: tab === t ? "2px solid #176D59" : "2px solid transparent", cursor: "pointer", marginBottom: -1 }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div id="arqdor-render-tab-content" role="tabpanel" aria-labelledby={`arqdor-render-tab-${tab}`} className="arqdor-properties-scroll" style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

            {/* P2-15: Camadas — dados reais */}
            {tab === "camadas" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <PanelLabel>Camadas</PanelLabel>
                {/* Base */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 7, border: `1px solid ${D.border}`, background: D.card }}>
                  <span style={{ fontSize: 10, color: D.dim }}>⬜</span>
                  <span style={{ fontSize: 11, color: D.muted, flex: 1 }}>Imagem base</span>
                  <Badge label="imutável" color={D.dim} />
                </div>
                {/* Current render */}
                {renderUrl && currentVersion && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 7, border: `1px solid ${D.purple}`, background: `${D.purple}18` }}>
                    <span style={{ fontSize: 10, color: D.purple }}>✦</span>
                    <span style={{ fontSize: 11, color: D.purpleText, flex: 1 }}>{currentVersion.label}</span>
                    {currentVersion.approvedBy && <Badge label="aprovado" color={D.green} />}
                  </div>
                )}
                {/* Version history */}
                {otherVersions.map((v) => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, border: `1px solid ${D.border}`, background: D.card, opacity: 0.75 }}>
                    <span style={{ fontSize: 10, color: D.dim }}>⧉</span>
                    <span style={{ fontSize: 10, color: D.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</span>
                  </div>
                ))}
                {/* P2-15: selections/masks */}
                {selections.map((sel) => (
                  <div key={sel.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, border: `1px solid ${D.amber}44`, background: `${D.amber}08` }}>
                    <span style={{ fontSize: 10, color: D.amber }}>⬚</span>
                    <span style={{ fontSize: 10, color: D.muted, flex: 1 }}>{sel.label || "Seleção"}</span>
                    <button onClick={() => onRemoveSelection(sel.id)} aria-label={`Remover seleção ${sel.label}`} style={{ background: "none", border: "none", color: D.dim, cursor: "pointer", fontSize: 10 }}>✕</button>
                  </div>
                ))}
                {!renderUrl && (
                  <div style={{ fontSize: 11, color: D.dim, textAlign: "center", padding: "8px 0" }}>Camadas visíveis após gerar o render</div>
                )}
              </div>
            )}

            {tab === "propriedades" && (
              <>
                {/* Projeto */}
                {step === "projeto" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Selecionar Projeto</PanelLabel>
                    {arq.projectsLoading ? <div style={{ display: "flex", justifyContent: "center", padding: 16 }}><DkSpinner size={20} /></div>
                      : arq.projects.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 16 }}>
                          <p style={{ margin: "0 0 10px", fontSize: 12, color: D.muted }}>Nenhum projeto.</p>
                          <DkBtn small onClick={onShowCreateModal}>+ Criar projeto</DkBtn>
                        </div>
                      ) : arq.projects.map((p: any) => {
                        const active = p.id === arq.projectId;
                        return (
                          <button key={p.id} onClick={() => { void arq.selectProject(p.id); }} style={{ padding: "8px 10px", borderRadius: 7, textAlign: "left", border: `1px solid ${active ? D.purple : D.border}`, background: active ? `${D.purple}22` : D.card, cursor: "pointer" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: D.text }}>{p.titulo}</div>
                            {p.clienteNome && <div style={{ fontSize: 10, color: D.muted }}>Cliente: {p.clienteNome}</div>}
                          </button>
                        );
                      })
                    }
                    <DkBtn small variant="ghost" onClick={onShowCreateModal}>+ Novo projeto</DkBtn>
                  </div>
                )}

                {/* Ambiente */}
                {step === "ambiente" && (
                  <div className="arqdor-environment-picker" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <PanelLabel>Ambiente</PanelLabel>
                    {AMBIENTE_OPTIONS.map((opt) => (
                      <button key={opt} onClick={() => setAmbiente(opt)} style={{ padding: "7px 10px", borderRadius: 6, textAlign: "left", border: `1px solid ${ambiente === opt ? D.purple : D.border}`, background: ambiente === opt ? `${D.purple}22` : D.card, cursor: "pointer", fontSize: 11, fontWeight: ambiente === opt ? 700 : 400, color: ambiente === opt ? D.purpleText : D.text }}>
                        {opt}
                      </button>
                    ))}
                    <input className="arqdor-render-tech-field" value={AMBIENTE_OPTIONS.includes(ambiente) ? "" : ambiente} onChange={(e) => setAmbiente(e.target.value)} placeholder="Outro ambiente…" aria-label="Tipo de ambiente personalizado" style={inputStyle} />
                    {ambiente.trim() && <div className="arqdor-env-cta"><DkBtn onClick={onNextStep}>→ Continuar</DkBtn></div>}
                  </div>
                )}

                {/* Imagem */}
                {step === "imagem" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Imagem base</PanelLabel>
                    <InfoBox>Ambiente: <strong style={{ color: D.text }}>{ambiente}</strong></InfoBox>
                    {imageDataUrl && <div style={{ fontSize: 11, color: D.green, padding: "6px 8px", background: D.greenDim, borderRadius: 6 }}>✓ {imageFile?.name ?? "Imagem base recuperada"}</div>}
                    <DkBtn onClick={onUpload} variant={imageDataUrl ? "secondary" : "primary"}>{imageDataUrl ? "↺ Trocar imagem" : "⬜ Carregar imagem"}</DkBtn>
                    <DkBtn onClick={onOpenMediaLibrary} variant="secondary" disabled={!mediaLibraryAvailable}>▦ Biblioteca de Mídias</DkBtn>
                    {imageDataUrl && <DkBtn onClick={onNextStep}>→ Usar esta imagem</DkBtn>}
                  </div>
                )}

                {/* Render */}
                {step === "render" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Render IA</PanelLabel>
                    <InfoBox>{arq.projectMeta?.titulo && arq.projectMeta.titulo.trim().toLowerCase() !== ambiente.trim().toLowerCase() ? `${arq.projectMeta.titulo} · ${ambiente}` : ambiente || arq.projectMeta?.titulo || "Ambiente"}</InfoBox>
                    {!renderUrl && !loading && (
                      <>
                        <div style={{ padding: "7px 9px", borderRadius: 7, background: `${D.green}0D`, border: `1px solid ${D.green}22`, fontSize: 10, lineHeight: 1.5, color: D.green }}>
                          🔒 Preservação rígida ativa: cores, materiais, texturas-base, medidas, posição e proporções do mobiliário permanecem bloqueadas. O render melhora somente realismo, luz e definição.
                        </div>
                        <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5 }}>Escolha o resultado visual. As proteções técnicas são aplicadas automaticamente.</div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: D.dim, textTransform: "uppercase", letterSpacing: ".05em" }}>Tipo de cena</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }}>
                            {([
                              ["interior", "Interior"],
                              ["facade", "Fachada"],
                              ["outdoor", "Área externa"],
                              ["gourmet", "Gourmet"],
                              ["pool", "Piscina / SPA"],
                            ] as const).map(([id, label]) => (
                              <button key={id} type="button" onClick={() => setSceneType(id)}
                                style={{ padding: "7px 8px", borderRadius: 7, border: `1px solid ${sceneType === id ? D.purple : D.border}`, background: sceneType === id ? `${D.purple}12` : D.card, color: sceneType === id ? D.purpleText : D.text, fontSize: 10, fontWeight: sceneType === id ? 800 : 600, cursor: "pointer", textAlign: "left" }}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: D.dim, textTransform: "uppercase", letterSpacing: ".05em" }}>Resultado desejado</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
                            {([
                              ["technical", "Técnico fiel", "Sem decoração. Máxima fidelidade."],
                              ["premium", "Premium", "Mais realismo, sem adicionar objetos."],
                              ["decorated", "Premium decorado", "Acessórios leves, sem mover mobiliário."],
                            ] as const).map(([id, label, hint]) => (
                              <button key={id} type="button" onClick={() => setRenderProfile(id)}
                                style={{ padding: "8px 9px", borderRadius: 7, border: `1px solid ${renderProfile === id ? D.purple : D.border}`, background: renderProfile === id ? `${D.purple}10` : D.card, cursor: "pointer", textAlign: "left" }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: renderProfile === id ? D.purpleText : D.text }}>{label}</div>
                                <div style={{ marginTop: 2, fontSize: 9, color: D.muted }}>{hint}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: D.dim, textTransform: "uppercase" }}>Estilo</span>
                            <select className="arqdor-render-tech-field" value={visualStyle} onChange={(e) => setVisualStyle(e.target.value as RenderStudioVisualStyle)} style={inputStyle}>
                              <option value="original">Original</option>
                              <option value="contemporary">Contemporâneo</option>
                              <option value="minimalist">Minimalista</option>
                              <option value="provencal">Provençal</option>
                            </select>
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: D.dim, textTransform: "uppercase" }}>Iluminação</span>
                            <select className="arqdor-render-tech-field" value={lightingProfile} onChange={(e) => setLightingProfile(e.target.value as RenderStudioLightingProfile)} style={inputStyle}>
                              <option value="natural">Natural</option>
                              <option value="balanced">Equilibrada</option>
                              <option value="more_light">Mais luz</option>
                              <option value="warm">Aconchegante</option>
                              <option value="editorial">Editorial</option>
                              <option value="night">Noturna</option>
                            </select>
                            {lightingProfile === "more_light" && (
                              <div style={{ marginTop: 4, fontSize: 9, lineHeight: 1.4, color: D.muted }}>
                                “Mais luz” reforça a iluminação do teto com barra/perfil de LED e melhora a claridade geral sem alterar layout, móveis ou materiais.
                              </div>
                            )}
                          </label>
                        </div>
                        <div style={{ padding: "7px 9px", borderRadius: 7, background: `${D.purple}0D`, border: `1px solid ${D.purple}22`, fontSize: 10, lineHeight: 1.45, color: D.muted }}>
                          ✦ Geração Premium em uma única etapa: preserva projeto e mobiliário enquanto melhora texturas, materiais, iluminação, reflexos e definição.
                        </div>
                        <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5 }}>Tempo estimado: 30–90 segundos</div>
                        <DkBtn onClick={onStartRender} disabled={loading}>
                          {renderProfile === "technical" ? "✦ Gerar Render Técnico" : renderProfile === "decorated" ? "✦ Gerar Render Premium Decorado" : "✦ Gerar Render Premium"}
                        </DkBtn>
                      </>
                    )}
                    {loading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: D.muted, fontSize: 11 }}><DkSpinner size={14} /> Processando…</div>}
                    {renderUrl && !loading && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ fontSize: 11, color: D.green, padding: "6px 8px", background: D.greenDim, borderRadius: 6 }}>✓ Render gerado com sucesso</div>
                        <DkBtn variant="secondary" onClick={onStartRender} small>↺ Gerar nova versão deste ambiente</DkBtn>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "7px 8px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}` }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: D.text }}>🎬 Gerar vídeo de 5s deste render</div>
                          <select className="arqdor-render-tech-field" value={videoMovement} onChange={(e) => setVideoMovement(e.target.value as VideoMovement)} style={inputStyle}>
                            <option value="cinematic_micro_movement">Movimento cinematográfico suave</option>
                            <option value="zoom_in_soft">Zoom in suave</option>
                            <option value="zoom_out_soft">Zoom out suave</option>
                            <option value="pan_left_soft">Pan para esquerda</option>
                            <option value="pan_right_soft">Pan para direita</option>
                            <option value="tilt_up_soft">Tilt para cima</option>
                            <option value="tilt_down_soft">Tilt para baixo</option>
                            <option value="orbit_left_soft">Órbita leve esquerda</option>
                            <option value="orbit_right_soft">Órbita leve direita</option>
                            <option value="parallax_soft">Parallax suave</option>
                          </select>
                          <DkBtn variant="secondary" onClick={onGenerateVideo5s} disabled={videoGenerating} small>
                            {videoGenerating ? "Gerando vídeo…" : "▶ Gerar vídeo 5s"}
                          </DkBtn>
                          {renderVideoUrl && <a href={renderVideoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: D.green, textDecoration: "none" }}>✓ Abrir vídeo gerado</a>}
                        </div>
                        <DkBtn onClick={onNextStep}>→ Abrir Studio IA para melhorar</DkBtn>
                        <DkBtn variant="ghost" onClick={onNextStep} small>Ver versões →</DkBtn>
                      </div>
                    )}
                  </div>
                )}

                {/* Melhoria — P2-13/14/16/17 */}
                {step === "melhoria" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Genius Render — editar versão atual</PanelLabel>
                    <InfoBox>Edite o prompt e escolha exatamente o que pode mudar. Toda alteração gera uma nova versão; o render atual permanece intacto.</InfoBox>

                    {/* P2-14: objeto selecionado */}
                    {selections.length > 0 && (
                      <div style={{ padding: "8px 10px", borderRadius: 7, background: `${D.amber}12`, border: `1px solid ${D.amber}44` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: D.amber, marginBottom: 6 }}>⬚ REGIÃO AUTORIZADA PARA EDIÇÃO</div>
                        {selections.map((sel) => (
                          <div key={sel.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: D.text, flex: 1 }}>{sel.label || "Seleção sem nome"}</span>
                            <button onClick={() => onRemoveSelection(sel.id)} aria-label="Remover seleção" style={{ background: "none", border: "none", color: D.dim, cursor: "pointer", fontSize: 10 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {!renderUrl && (
                      <InfoBox>Gere o render primeiro para habilitar melhorias por região.</InfoBox>
                    )}

                    {renderUrl && (
                      <>
                        {/* P2-13: prompt to select region */}
                        {selections.length === 0 && (
                          <div style={{ padding: "8px 10px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}`, fontSize: 11, color: D.muted }}>
                            Para uma mudança localizada, clique em <strong style={{ color: D.purpleText }}>⬚ Selecionar</strong> e marque apenas uma parte da superfície. Na troca de material, o Genius Render usa essa seleção como semente para reconhecer o material/superfície conectado, sem liberar a imagem inteira para edição.
                          </div>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {MELHORIA_MODES.map((m) => (
                            <button key={m.id} onClick={() => setMelhoriaMode(m.id)} style={{ padding: "8px 10px", borderRadius: 7, textAlign: "left", border: `1px solid ${melhoriaMode === m.id ? D.purple : D.border}`, background: melhoriaMode === m.id ? `${D.purple}14` : D.card, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 7 }}>
                              <span style={{ fontSize: 13, lineHeight: 1.2 }}>{m.icon}</span>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: 11, fontWeight: 800, color: melhoriaMode === m.id ? D.purpleText : D.text }}>{m.label}</span>
                                <span style={{ display: "block", marginTop: 2, fontSize: 9, lineHeight: 1.35, color: D.muted }}>{m.hint}</span>
                              </span>
                            </button>
                          ))}
                        </div>

                        {melhoriaMode === "change-material" && selections.length > 0 && (
                          <div style={{ padding: "8px 9px", borderRadius: 7, background: `${D.amber}0D`, border: `1px solid ${D.amber}33`, fontSize: 10, lineHeight: 1.45, color: D.muted, display: "flex", flexDirection: "column", gap: 7 }}>
                            <div>◉ A seleção é apenas a semente. Ao soltar o mouse, o Arqdor detecta automaticamente os limites da peça por <strong style={{ color: D.text }}>cor + perímetro + conectividade</strong>.</div>
                            {materialMaskDetecting && (
                              <div style={{ color: D.amber, fontWeight: 700 }}>⏳ Detectando superfície automaticamente…</div>
                            )}
                            {!materialMaskDetecting && (
                              <DkBtn variant="secondary" small onClick={onDetectMaterialSurface}>
                                {materialMaskPreviewUrl ? "↺ Detectar novamente" : "◎ Tentar detecção novamente"}
                              </DkBtn>
                            )}
                            {materialMaskPreviewUrl && !materialMaskConfirmed && (
                              <>
                                <div style={{ color: D.amber }}>A área âmbar sobre o render é a máscara detectada. Confirme somente se ela corresponder à peça correta.</div>
                                <DkBtn small onClick={onConfirmMaterialSurface}>✓ Confirmar superfície</DkBtn>
                              </>
                            )}
                            {materialMaskConfirmed && (
                              <div style={{ padding: "5px 7px", borderRadius: 6, background: D.greenDim, border: `1px solid ${D.green}44`, color: D.green, fontWeight: 700 }}>
                                ✓ Superfície confirmada. Somente esta máscara poderá mudar.
                              </div>
                            )}
                            {!materialMaskConfirmed && materialMaskPreviewUrl && (
                              <div style={{ color: D.dim }}>Se estiver incorreta, mova ou redimensione a seleção. A detecção será refeita automaticamente.</div>
                            )}
                          </div>
                        )}

                        {/* P2-16: Material library */}
                        {melhoriaMode === "change-material" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <button type="button" onClick={onOpenMaterialLib} className="arqdor-render-material-picker" aria-label={selectedMaterial ? `Alterar material: ${selectedMaterial.nome}` : "Abrir biblioteca de materiais"}>
                              <span style={{ fontSize: 14 }}>▦</span>
                              {selectedMaterial ? (
                                <><span style={{ fontWeight: 700, flex: 1 }}>{selectedMaterial.nome}</span><span style={{ fontSize: 9, color: D.dim }}>{selectedMaterial.categoria}</span></>
                              ) : (
                                <span style={{ color: D.muted }}>Escolher material do catálogo →</span>
                              )}
                            </button>
                            {selectedMaterial && (
                              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 10, color: D.dim, padding: "6px 8px", borderRadius: 6, background: D.card, border: `1px solid ${D.border}` }}>
                                {selectedMaterial.imagens?.[0] ? (
                                  <img src={normalizeRenderMediaUrl(selectedMaterial.imagens[0])} alt={selectedMaterial.nome}
                                    style={{ width: 46, height: 46, borderRadius: 6, objectFit: "cover", border: `1px solid ${D.border}`, flexShrink: 0 }} />
                                ) : (
                                  <div style={{ width: 46, height: 46, borderRadius: 6, background: D.inputBg, border: `1px dashed ${D.amber}`, display: "flex", alignItems: "center", justifyContent: "center", color: D.amber, fontSize: 9, textAlign: "center", flexShrink: 0 }}>sem<br/>imagem</div>
                                )}
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  {selectedMaterial.fornecedor && <div>Fornecedor: {selectedMaterial.fornecedor}</div>}
                                  {selectedMaterial.referencia && <div>Ref: {selectedMaterial.referencia}</div>}
                                  {selectedMaterial.imagens?.[0]
                                    ? <div style={{ marginTop: 3, color: D.green, fontSize: 9 }}>✓ Esta imagem será enviada como referência visual real</div>
                                    : <div style={{ marginTop: 3, color: D.amber, fontSize: 9 }}>Defina uma imagem principal antes de aplicar</div>}
                                  <div style={{ marginTop: 2, color: D.amber, fontSize: 9 }}>Vínculo comercial registrado na versão ✓</div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <textarea className="arqdor-render-tech-field" value={melhoriaPrompt} onChange={(e: any) => setMelhoriaPrompt(e.target.value)}
                          placeholder={melhoriaMode === "change-material" ? (selectedMaterial ? `Aplicar ${selectedMaterial.nome} na região selecionada…` : "Descreva o material desejado…") : melhoriaMode === "change-lighting" ? "Ex: iluminação natural, tarde, luz suave…" : "Ex: melhorar texturas, sombras, acabamento…"}
                          rows={3} aria-label="Instrução de melhoria" style={{ ...inputStyle, resize: "vertical" }} />

                        {/* P2-17: preservation locks summary */}
                        <div style={{ padding: "6px 8px", borderRadius: 6, background: `${D.green}08`, border: `1px solid ${D.green}22`, fontSize: 10, color: D.green }}>
                          🔒 Preservação ativa: câmera · geometria · vãos · mobiliário · materiais fora da região autorizada
                        </div>

                        {melhoriaMode === "improve" && (
                          <div style={{ padding: "7px 9px", borderRadius: 7, background: `${D.purple}0D`, border: `1px solid ${D.purple}22`, fontSize: 10, lineHeight: 1.45, color: D.muted }}>
                            ✨ Refino global: não exige seleção nem descrição. O sistema melhora nitidez, materiais, iluminação e realismo preservando projeto e câmera.
                          </div>
                        )}
                        <DkBtn
                          disabled={
                            loading ||
                            !renderUrl ||
                            (melhoriaMode === "change-material" && (
                              selections.length === 0 ||
                              !materialMaskConfirmed ||
                              (selectedMaterial ? !selectedMaterial.imagens?.[0] : !melhoriaPrompt.trim())
                            )) ||
                            (melhoriaMode === "change-lighting" && !melhoriaPrompt.trim())
                          }
                          onClick={onApplyMelhoria}
                        >
                          {loading ? "Aplicando…" : melhoriaMode === "improve" ? "✦ Gerar versão refinada" : melhoriaMode === "change-material" ? "✦ Aplicar troca de material" : "✦ Aplicar nova iluminação"}
                        </DkBtn>
                        {melhoriaMode === "change-material" && selections.length === 0 && (
                          <div style={{ padding: "7px 9px", borderRadius: 7, background: `${D.amber}0D`, border: `1px solid ${D.amber}33`, color: D.amber, fontSize: 10, lineHeight: 1.4 }}>
                            1. Selecione uma parte da peça · 2. Aguarde a detecção automática · 3. Confirme a máscara · 4. Escolha o material · 5. Aplique.
                          </div>
                        )}
                        {!loading && <DkBtn variant="ghost" small onClick={onNextStep}>Ver versões →</DkBtn>}
                      </>
                    )}
                  </div>
                )}

                {/* Versão */}
                {step === "versao" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Versões ({versions.length})</PanelLabel>
                    {versions.length === 0 ? (
                      <div style={{ fontSize: 11, color: D.muted, textAlign: "center", padding: 12 }}>Nenhuma versão gerada.</div>
                    ) : versions.map((v, i) => (
                      <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 8px", borderRadius: 7, border: `1px solid ${v.approvedBy ? D.green : i === 0 ? D.purple : D.border}`, background: v.approvedBy ? `${D.green}12` : i === 0 ? `${D.purple}18` : D.card }}>
                        <img src={normalizeRenderMediaUrl(v.url)} alt={v.label} style={{ width: 52, height: 38, objectFit: "cover", borderRadius: 4 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: v.approvedBy ? D.green : i === 0 ? D.purpleText : D.muted }}>{v.label}</div>
                          {v.parentVersionId && <div style={{ fontSize: 9, color: D.dim }}>↳ versão filha</div>}
                          {v.materialName && <div style={{ fontSize: 9, color: D.dim }}>Material: {v.materialName}</div>}
                          {v.approvedBy && <div style={{ fontSize: 9, color: D.green }}>✓ {v.approvedBy}</div>}
                        </div>
                      </div>
                    ))}
                    <DkBtn onClick={onNextStep}>→ Ir para aprovação</DkBtn>
                  </div>
                )}

                {/* Aprovar — P2-20 governance */}
                {step === "aprovar" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Aprovação</PanelLabel>
                    {approvalRecord ? (
                      <>
                        <div style={{ padding: "10px", borderRadius: 8, background: D.greenDim, border: `1px solid ${D.green}44` }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: D.green, marginBottom: 6 }}>✓ Render aprovado</div>
                          <div style={{ fontSize: 11, color: D.muted }}><div>Por: <strong style={{ color: D.text }}>{approvalRecord.by}</strong></div><div>Em: {approvalRecord.at.toLocaleDateString("pt-BR")} {approvalRecord.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>{approvalRecord.note && <div>Obs: {approvalRecord.note}</div>}</div>
                        </div>
                        <div style={{ padding: "8px 10px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}`, color: D.muted, fontSize: 10, lineHeight: 1.5 }}>
                          O Render termina aqui. A especificação técnica é um módulo separado e usa esta versão aprovada como referência.
                        </div>
                        <DkBtn onClick={onOpenSpecification}>→ Abrir Especificação</DkBtn>
                      </>
                    ) : (
                      <>
                        <div style={{ padding: "8px 10px", borderRadius: 7, fontSize: 11, lineHeight: 1.5, background: D.greenDim, border: `1px solid ${D.green}44`, color: D.green }}>
                          ✓ A aprovação registra a versão final do render com autor e data. Depois, a especificação pode usar esta versão como referência.
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: D.dim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Observação (opcional)</label>
                          <textarea className="arqdor-render-tech-field" value={approvalNote} onChange={(e: any) => setApprovalNote(e.target.value)} placeholder="Ex: aprovado com ressalva de cor de piso…" rows={2} aria-label="Observação de aprovação" style={{ ...inputStyle, resize: "vertical" }} />
                        </div>
                        <DkBtn disabled={loading} onClick={onApprove} variant="success">
                          {loading ? "Aprovando…" : "✓ Aprovar este render"}
                        </DkBtn>
                      </>
                    )}
                  </div>
                )}

                {err && <DkErr msg={err} />}
              </>
            )}
          </div>
          <CopilotPanel
            projectId={arq.projectId}
            step={step}
            selections={selections}
            onTestAction={onTestCopilotAction}
          />
        </div>
      )}
    </div>
  );
}

