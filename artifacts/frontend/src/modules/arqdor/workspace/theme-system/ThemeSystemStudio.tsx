import React from "react";
import { ArqdorThemeProvider } from "../../theme/ArqdorThemeProvider";
import { ArqdorThemeSettingsPanel } from "../../theme/ArqdorThemeSettingsPanel";
import { ArqdorThemeToggle } from "../../theme/ArqdorThemeToggle";
import { THEME_TOKEN_GROUPS } from "../../theme/arqdorThemeTokens";
import { ARQDOR_THEME_MIGRATION_MAP, ARQDOR_THEME_APPLY_ORDER } from "../../theme/themeMigrationGuide";

type ThemeSystemStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

export default function ThemeSystemStudio({ onNavigate }: ThemeSystemStudioProps) {
  return (
    <ArqdorThemeProvider>
      <div className="arq-page">
        <div className="arq-container">
          <header className="arq-card arq-card-lg">
            <div className="arq-section-header">
              <div>
                <p className="arq-eyebrow">Sprint 036 • Theme System</p>
                <h1 className="arq-hero-title">Tema claro, escuro e automático</h1>
                <p className="arq-subtitle">
                  O usuário pode escolher fundo branco, fundo preto ou seguir o sistema.
                  O workspace de render mantém sempre o fundo escuro premium.
                </p>
              </div>

              <div className="arq-header-actions">
                <ArqdorThemeToggle />
                <button
                  type="button"
                  onClick={() => onNavigate?.("config")}
                  className="arq-button arq-button-secondary"
                >
                  Configurações
                </button>
              </div>
            </div>
          </header>

          <ArqdorThemeSettingsPanel />

          <section className="arq-card arq-card-lg">
            <div className="arq-section-header">
              <div>
                <p className="arq-eyebrow">Tokens</p>
                <h2 className="arq-title">Design system ARQDOR</h2>
                <p className="arq-subtitle">
                  As próximas telas devem usar tokens globais, não cores fixas como bg-[#f7f7f8] ou bg-white.
                </p>
              </div>
            </div>

            <div className="arq-grid-3">
              {THEME_TOKEN_GROUPS.map((group) => (
                <article key={group.name} className="arq-soft" style={{ padding: 16 }}>
                  <p className="arq-title" style={{ fontSize: 16 }}>{group.name}</p>
                  <p className="arq-subtitle">{group.description}</p>

                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    {group.tokens.map((token) => (
                      <div key={token.token} className="arq-card" style={{ padding: 12 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>{token.token}</p>
                        <p className="arq-subtitle" style={{ marginTop: 4 }}>{token.usage}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="arq-card arq-card-lg">
            <p className="arq-eyebrow">Migração</p>
            <h2 className="arq-title">Substituição das classes fixas</h2>

            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                <thead>
                  <tr style={{ color: "var(--arq-muted)", textAlign: "left", fontSize: 12, textTransform: "uppercase" }}>
                    <th style={{ padding: 12, borderBottom: "1px solid var(--arq-border)" }}>Atual</th>
                    <th style={{ padding: 12, borderBottom: "1px solid var(--arq-border)" }}>Novo</th>
                    <th style={{ padding: 12, borderBottom: "1px solid var(--arq-border)" }}>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {ARQDOR_THEME_MIGRATION_MAP.map((row) => (
                    <tr key={row.from}>
                      <td style={{ padding: 12, borderBottom: "1px solid var(--arq-border)" }}><code>{row.from}</code></td>
                      <td style={{ padding: 12, borderBottom: "1px solid var(--arq-border)" }}><code>{row.to}</code></td>
                      <td style={{ padding: 12, borderBottom: "1px solid var(--arq-border)", color: "var(--arq-muted)" }}>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="arq-card arq-card-lg">
            <p className="arq-eyebrow">Aplicação</p>
            <h2 className="arq-title">Ordem recomendada</h2>

            <ol style={{ marginTop: 18, display: "grid", gap: 10, paddingLeft: 22 }}>
              {ARQDOR_THEME_APPLY_ORDER.map((item) => (
                <li key={item} className="arq-subtitle" style={{ margin: 0 }}>{item}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </ArqdorThemeProvider>
  );
}
