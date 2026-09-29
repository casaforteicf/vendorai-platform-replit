import type { ReactNode } from "react";
import { RENDER_STUDIO_THEME as D } from "./renderStudioTheme";

export function RenderStudioButton({
  children,
  onClick,
  disabled,
  variant = "primary",
  small,
  fullWidth = true,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  small?: boolean;
  fullWidth?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: D.purple, color: "#fff", border: `1px solid ${D.purpleHov}` },
    secondary: { background: D.card, color: D.text, border: `1px solid ${D.border}` },
    ghost: { background: "transparent", color: D.muted, border: "none" },
    danger: { background: D.red, color: "#fff", border: "none" },
    success: { background: D.green, color: "#fff", border: "none" },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? "5px 12px" : "8px 18px",
        borderRadius: 8,
        fontSize: small ? 11 : 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "all 0.15s",
        letterSpacing: "0.02em",
        display: "flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        width: fullWidth ? "100%" : "auto",
        justifyContent: "center",
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export function RenderStudioSpinner({ size = 28 }: { size?: number }) {
  return (
    <>
      <div style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${D.border}`, borderTopColor: D.purple, animation: "arq-spin 0.7s linear infinite", flexShrink: 0 }} />
      <style>{`@keyframes arq-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

export function RenderStudioError({ msg }: { msg: string }) {
  return (
    <div role="status" aria-live="assertive" style={{ padding: "8px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: D.red, lineHeight: 1.5 }}>
      {msg}
    </div>
  );
}

export function RenderStudioBadge({ label, color = D.purple }: { label: string; color?: string }) {
  return <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}44`, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>;
}

export function RenderStudioPanelLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 9, fontWeight: 800, color: D.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{children}</div>;
}

export function RenderStudioInfoBox({ children }: { children: ReactNode }) {
  return <div style={{ padding: "6px 8px", borderRadius: 6, background: D.card, border: `1px solid ${D.border}`, fontSize: 11, color: D.muted }}>{children}</div>;
}
