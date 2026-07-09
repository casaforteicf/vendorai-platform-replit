import React from "react";
import { useArqdorTheme } from "./ArqdorThemeProvider";

export function ArqdorThemeToggle({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { preference, resolvedTheme, setMode, toggleTheme } = useArqdorTheme();

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="arq-button arq-button-secondary"
        title={`Tema atual: ${resolvedTheme}`}
        style={{ fontSize: 16, padding: "6px 10px", lineHeight: 1 }}
      >
        {resolvedTheme === "dark" ? "🌙" : "☀️"}
      </button>
    );
  }

  return (
    <div className="arq-theme-toggle">
      <button
        type="button"
        onClick={() => setMode("light")}
        className={preference.mode === "light" ? "is-active" : ""}
      >
        Claro
      </button>
      <button
        type="button"
        onClick={() => setMode("dark")}
        className={preference.mode === "dark" ? "is-active" : ""}
      >
        Escuro
      </button>
      <button
        type="button"
        onClick={() => setMode("system")}
        className={preference.mode === "system" ? "is-active" : ""}
      >
        Sistema
      </button>
    </div>
  );
}
