import { RENDER_STUDIO_THEME as D } from "./renderStudioTheme";

export type RenderStudioSaveState = "saved" | "unsaved" | "saving" | "error";

function Sep() {
  return <span style={{ width: 1, height: 12, background: D.border }} />;
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function RenderStudioFooter({ projectTitle, ambiente, saveState, lastSavedAt, onHelp, onShortcuts }: {
  projectTitle: string | null; ambiente: string; saveState: RenderStudioSaveState; lastSavedAt: Date | null;
  onHelp: () => void; onShortcuts: () => void;
}) {
  const dotColor = saveState === "saved" ? D.green : saveState === "saving" ? D.amber : saveState === "error" ? D.red : D.amber;
  const saveLabel = saveState === "saving" ? "Salvando…" : saveState === "error" ? "Falha ao salvar" : saveState === "unsaved" ? "Alterações locais" : lastSavedAt ? `Salvo às ${lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Salvo automaticamente";
  return (
    <div style={{ height: 28, display: "flex", alignItems: "center", padding: "0 14px", background: D.bg, borderTop: `1px solid ${D.border}`, flexShrink: 0, gap: 16 }}>
      <span role="status" style={{ fontSize: 10, color: D.dim, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
        {saveLabel}
      </span>
      {ambiente && <><Sep /><span style={{ fontSize: 10, color: D.dim }}>Ambiente: {ambiente}</span></>}
      {projectTitle && <><Sep /><span style={{ fontSize: 10, color: D.dim }}>{projectTitle}</span></>}
      <div style={{ flex: 1 }} />
      <button onClick={onHelp} aria-label="Abrir ajuda" style={{ fontSize: 10, color: D.muted, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}>? Ajuda</button>
      <Sep />
      <button onClick={onShortcuts} aria-label="Atalhos de teclado" style={{ fontSize: 10, color: D.muted, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}>⌨ Atalhos</button>
    </div>
  );
}

