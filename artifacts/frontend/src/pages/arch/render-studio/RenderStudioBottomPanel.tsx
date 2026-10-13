import { useState, type KeyboardEvent } from "react";
import type { RenderStudioEventLogEntry as EventLogEntry, RenderStudioVersion as RenderVersion } from "./renderStudioModel";
import { normalizeRenderMediaUrl } from "./renderStudioApi";
import { RENDER_STUDIO_THEME as D, renderStudioInputStyle as inputStyle } from "./renderStudioTheme";

type Comment = { id: string; text: string; author: string; timestamp: Date };

// ─── Bottom Panel (P3-26 Storyboard, P3-27 Comments, P3-28 History, P3-29 Search) ─

export function RenderStudioBottomPanel({ versions, projectId, currentRenderId, isOpen, onToggle, onSelectVersion, eventLog, userName, onOpenMaterialLibrary }: {
  versions: RenderVersion[]; projectId: string | null; currentRenderId: string | null; isOpen: boolean; onToggle: () => void;
  onSelectVersion: (version: RenderVersion) => void;
  eventLog: EventLogEntry[]; userName: string; onOpenMaterialLibrary: () => void;
}) {
  const [tab, setTab] = useState<"versoes" | "materiais" | "storyboard" | "comentarios" | "historico">("versoes");
  const [storyboard, setStoryboard] = useState<RenderVersion[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  // Fonte única do histórico nesta tela: versões persistidas/hidratadas pelo Render Studio.
  // A galeria real continua disponível em seus módulos próprios, mas não participa
  // mais da árvore de versões do editor para evitar duplicação e estados conflitantes.
  const allVersions: RenderVersion[] = versions;
  const filteredVersions = search.trim()
    ? allVersions.filter(v => v.label.toLowerCase().includes(search.toLowerCase()))
    : allVersions;

  function addToStoryboard(v: RenderVersion) {
    if (!storyboard.find(s => s.id === v.id)) setStoryboard(prev => [...prev, v]);
  }
  function moveStoryboardItem(idx: number, dir: -1 | 1) {
    setStoryboard(prev => {
      const arr = [...prev]; const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]; return arr;
    });
  }

  function addComment(versionId: string) {
    const text = (commentDraft[versionId] ?? "").trim();
    if (!text) return;
    const c: Comment = { id: crypto.randomUUID(), text, author: userName, timestamp: new Date() };
    setComments(prev => ({ ...prev, [versionId]: [...(prev[versionId] ?? []), c] }));
    setCommentDraft(prev => ({ ...prev, [versionId]: "" }));
  }

  const TABS = ["versoes", "materiais", "storyboard", "comentarios", "historico"] as const;
  const tabLabels: Record<string, string> = { versoes: "Versões", materiais: "Materiais", storyboard: "Storyboard", comentarios: "Comentários", historico: "Histórico" };

  return (
    <div className="arqdor-legacy-bottom-panel" style={{ flexShrink: 0, borderTop: `1px solid ${D.border}`, background: D.surface, display: "flex", flexDirection: "column", overflow: "hidden", transition: "height 0.2s", height: isOpen ? 188 : 36 }}>
      <div style={{ display: "flex", alignItems: "center", borderBottom: isOpen ? `1px solid ${D.border}` : "none", padding: "0 12px", height: 36, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} aria-selected={tab === t} style={{ padding: "6px 14px", fontSize: 10, fontWeight: tab === t ? 700 : 400, color: tab === t ? D.purpleText : D.muted, background: "none", border: "none", borderBottom: tab === t ? `2px solid ${D.purple}` : "2px solid transparent", cursor: "pointer", letterSpacing: "0.03em", marginBottom: -1, whiteSpace: "nowrap" }}>
            {tabLabels[t]}
            {t === "comentarios" && Object.values(comments).flat().length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 9, background: D.purple, color: "#fff", padding: "1px 4px", borderRadius: 8 }}>{Object.values(comments).flat().length}</span>
            )}
            {t === "historico" && eventLog.length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 9, background: D.dim, color: "#fff", padding: "1px 4px", borderRadius: 8 }}>{eventLog.length}</span>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {/* P3-29: search filter */}
        {tab === "versoes" && (
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar versões…"
            aria-label="Filtrar versões" style={{ ...inputStyle, width: 130, fontSize: 10, padding: "3px 8px", marginRight: 8 }} />
        )}
        <button onClick={onToggle} aria-label={isOpen ? "Recolher" : "Expandir"} style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, background: "none", border: "none", color: D.dim, cursor: "pointer" }}>{isOpen ? "▼" : "▲"}</button>
      </div>

      {isOpen && (
        <div style={{ flex: 1, overflowX: tab !== "historico" && tab !== "comentarios" ? "auto" : "hidden", overflowY: tab === "historico" || tab === "comentarios" ? "auto" : "hidden", padding: "8px 12px" }}>

          {tab === "materiais" && (
            <section aria-label="Biblioteca de materiais" style={{ display: "flex", gap: 14, alignItems: "center", minHeight: 115, color: D.text }}>
              <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(3, 36px)", gap: 6 }}>
                {["#9d9182", "#5b6e64", "#b1b6b5", "#816957", "#66757a", "#b69b7b"].map((color, index) => (
                  <div key={index} style={{ width: 36, height: 36, borderRadius: 5, background: color, border: `1px solid ${D.border}` }} />
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <strong style={{ fontSize: 12 }}>Biblioteca de materiais do projeto</strong>
                <span style={{ color: D.muted, fontSize: 10 }}>Abra o catálogo real para buscar texturas, referências e fabricantes. As amostras ao lado são apenas indicativas.</span>
                <button type="button" onClick={onOpenMaterialLibrary} style={{ width: "fit-content", border: `1px solid ${D.purple}`, background: `${D.purple}22`, color: D.purpleText, padding: "7px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  Abrir biblioteca de materiais →
                </button>
              </div>
            </section>
          )}

          {/* P3-29: versões com search */}
          {tab === "versoes" && (
            <div style={{ display: "flex", gap: 8, height: "100%", alignItems: "center" }}>
              {filteredVersions.length === 0 && <div style={{ fontSize: 11, color: D.dim }}>{search ? "Nenhuma versão encontrada." : "Nenhuma versão ainda."}</div>}
              {filteredVersions.map((v, i) => {
                const vComments = comments[v.id] ?? [];
                return (
                  <div
                    key={v.id}
                    onClick={() => onSelectVersion(v)}
                    role="button"
                    tabIndex={0}
                    aria-current={currentRenderId === v.id ? "true" : undefined}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectVersion(v); }}
                    style={{ flexShrink: 0, width: 110, height: 138, background: D.card, border: `1px solid ${v.approvedBy ? D.green : currentRenderId === v.id ? D.purple : D.border}`, borderRadius: 8, overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column", boxShadow: currentRenderId === v.id ? `0 0 0 2px ${D.purple}22` : "none" }}
                  >
                    <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
                      <img src={normalizeRenderMediaUrl(v.url)} alt={v.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {currentRenderId === v.id && !v.approvedBy && <div style={{ position: "absolute", top: 4, right: 4, fontSize: 8, fontWeight: 800, background: D.purple, color: "#fff", padding: "2px 5px", borderRadius: 3 }}>ATUAL</div>}
                      {v.approvedBy && <div style={{ position: "absolute", top: 4, right: 4, fontSize: 8, fontWeight: 800, background: D.green, color: "#fff", padding: "2px 5px", borderRadius: 3 }}>✓</div>}
                      {v.parentVersionId && <div style={{ position: "absolute", bottom: 4, left: 4, fontSize: 7, color: D.purpleText }}>↳</div>}
                      {vComments.length > 0 && <div style={{ position: "absolute", bottom: 4, right: 4, fontSize: 8, background: D.amber, color: "#fff", padding: "1px 4px", borderRadius: 8 }}>{vComments.length}</div>}
                    </div>
                    <div style={{ padding: "4px 6px", fontSize: 9, color: D.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</div>
                    {/* P3-26: add to storyboard */}
                    <button onClick={(e) => { e.stopPropagation(); addToStoryboard(v); }} title="Adicionar ao storyboard" style={{ padding: "3px", fontSize: 9, background: "none", border: "none", color: storyboard.find(s => s.id === v.id) ? D.green : D.dim, cursor: "pointer", borderTop: `1px solid ${D.border}` }}>
                      {storyboard.find(s => s.id === v.id) ? "✓ Story" : "+ Story"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* P3-26: Storyboard funcional */}
          {tab === "storyboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
              {storyboard.length === 0 ? (
                <div style={{ fontSize: 11, color: D.dim, padding: "12px 0" }}>
                  Clique em "+ Story" nas versões para montar a sequência de apresentação.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {storyboard.map((v, i) => (
                    <div key={v.id} style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button onClick={() => moveStoryboardItem(i, -1)} disabled={i === 0} style={{ padding: "1px 5px", fontSize: 9, background: D.card, border: `1px solid ${D.border}`, borderRadius: 4, cursor: i === 0 ? "default" : "pointer", color: i === 0 ? D.dim : D.text, opacity: i === 0 ? 0.3 : 1 }}>←</button>
                        <div style={{ width: 90, height: 68, background: D.card, borderRadius: 6, overflow: "hidden", position: "relative", border: `1px solid ${D.border}` }}>
                          <img src={normalizeRenderMediaUrl(v.url)} alt={v.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <div style={{ position: "absolute", top: 3, left: 3, fontSize: 8, fontWeight: 800, background: D.purple, color: "#fff", padding: "1px 4px", borderRadius: 3 }}>{i + 1}</div>
                        </div>
                        <button onClick={() => moveStoryboardItem(i, 1)} disabled={i === storyboard.length - 1} style={{ padding: "1px 5px", fontSize: 9, background: D.card, border: `1px solid ${D.border}`, borderRadius: 4, cursor: i === storyboard.length - 1 ? "default" : "pointer", color: i === storyboard.length - 1 ? D.dim : D.text, opacity: i === storyboard.length - 1 ? 0.3 : 1 }}>→</button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 9, color: D.dim, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</span>
                        <button onClick={() => setStoryboard(prev => prev.filter(s => s.id !== v.id))} style={{ fontSize: 8, background: "none", border: "none", color: D.dim, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* P3-27: Comentários por versão */}
          {tab === "comentarios" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allVersions.length === 0 && <div style={{ fontSize: 11, color: D.dim }}>Nenhuma versão gerada.</div>}
              {allVersions.map((v) => {
                const vComments = comments[v.id] ?? [];
                return (
                  <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderRadius: 8, background: D.card, border: `1px solid ${D.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <img src={normalizeRenderMediaUrl(v.url)} alt={v.label} style={{ width: 36, height: 26, objectFit: "cover", borderRadius: 4 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: D.text, flex: 1 }}>{v.label}</span>
                      <span style={{ fontSize: 9, color: D.dim }}>{vComments.length} coment.</span>
                    </div>
                    {vComments.map(c => (
                      <div key={c.id} style={{ padding: "5px 8px", borderRadius: 6, background: D.surface, border: `1px solid ${D.border}`, fontSize: 11 }}>
                        <div style={{ color: D.text }}>{c.text}</div>
                        <div style={{ fontSize: 9, color: D.dim, marginTop: 2 }}>{c.author} · {c.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={commentDraft[v.id] ?? ""} onChange={(e) => setCommentDraft(prev => ({ ...prev, [v.id]: e.target.value }))}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") addComment(v.id); }}
                        placeholder="Adicionar comentário…" aria-label="Novo comentário" style={{ ...inputStyle, flex: 1, fontSize: 11, padding: "5px 8px" }} />
                      <button onClick={() => addComment(v.id)} disabled={!(commentDraft[v.id] ?? "").trim()} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: D.purple, color: "#fff", border: "none", cursor: "pointer", opacity: !(commentDraft[v.id] ?? "").trim() ? 0.45 : 1 }}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* P3-28: Histórico de eventos */}
          {tab === "historico" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {eventLog.length === 0 && <div style={{ fontSize: 11, color: D.dim, padding: "8px 0" }}>Nenhum evento registrado ainda.</div>}
              {[...eventLog].reverse().map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 8px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}` }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 5, background: e.type === "render_created" ? D.purple : e.type === "version_created" ? D.green : e.type === "approved" ? D.green : e.type === "spec_generated" ? D.amber : D.muted }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: D.text }}>{e.label}</div>
                    <div style={{ fontSize: 9, color: D.dim }}>{e.timestamp.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

