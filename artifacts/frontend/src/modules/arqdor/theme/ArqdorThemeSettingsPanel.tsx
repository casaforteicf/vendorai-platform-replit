import React from "react";
import { useArqdorTheme } from "./ArqdorThemeProvider";
import { ARQDOR_ACCENT_COLORS } from "./arqdorThemeTokens";
import type { ArqdorAccent, ArqdorThemeMode } from "./arqdorThemeTypes";

export function ArqdorThemeSettingsPanel() {
  const {
    preference,
    resolvedTheme,
    setMode,
    setAccent,
    setUseDarkRenderWorkspace,
    savePreference,
    saving,
    loading,
    error,
  } = useArqdorTheme();

  const modes: Array<{ id: ArqdorThemeMode; label: string; description: string }> = [
    { id: "light",  label: "Claro",   description: "Melhor para operação, orçamento e leitura." },
    { id: "dark",   label: "Escuro",  description: "Visual premium, confortável para render e noite." },
    { id: "system", label: "Sistema", description: "Segue o tema configurado no dispositivo." },
  ];

  return (
    <section className="arq-card arq-card-lg">
      <div className="arq-section-header">
        <div>
          <p className="arq-eyebrow">Aparência</p>
          <h2 className="arq-title">Tema do usuário</h2>
          <p className="arq-subtitle">
            Escolha entre tema claro, escuro ou automático. Tema ativo agora:{" "}
            <strong>{resolvedTheme === "dark" ? "Escuro" : "Claro"}</strong>.
          </p>
        </div>
      </div>

      {error ? <div className="arq-alert arq-alert-warning">{error}</div> : null}

      <div className="arq-grid-3">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setMode(mode.id)}
            className={["arq-option-card", preference.mode === mode.id ? "is-selected" : ""].join(" ")}
          >
            <span>{mode.label}</span>
            <small>{mode.description}</small>
          </button>
        ))}
      </div>

      <div className="arq-divider" />

      <div>
        <p className="arq-eyebrow">Cor de destaque</p>
        <div className="arq-accent-grid">
          {(Object.keys(ARQDOR_ACCENT_COLORS) as ArqdorAccent[]).map((accent) => {
            const item = ARQDOR_ACCENT_COLORS[accent];

            return (
              <button
                key={accent}
                type="button"
                onClick={() => setAccent(accent)}
                className={["arq-accent-option", preference.accent === accent ? "is-selected" : ""].join(" ")}
              >
                <span style={{ backgroundColor: item.light }} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="arq-switch-row">
        <input
          type="checkbox"
          checked={preference.useDarkRenderWorkspace}
          onChange={(event) => setUseDarkRenderWorkspace(event.target.checked)}
        />
        <span>
          <strong>Render sempre em workspace escuro</strong>
          <small>Recomendado para preview de imagem, contraste e visual premium.</small>
        </span>
      </label>

      <div className="arq-actions">
        <button
          type="button"
          onClick={() => void savePreference()}
          disabled={saving || loading}
          className="arq-button arq-button-primary"
        >
          {saving ? "Salvando..." : "Salvar preferência"}
        </button>
      </div>
    </section>
  );
}
