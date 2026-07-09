export const ARQDOR_THEME_MIGRATION_MAP = [
  {
    from: "bg-[#f7f7f8]",
    to: "arq-page",
    note: "Usar no container principal da página.",
  },
  {
    from: "bg-white",
    to: "arq-card",
    note: "Usar em cards e painéis. Se precisar padding grande, combinar com arq-card-lg.",
  },
  {
    from: "text-slate-950",
    to: "color: var(--arq-foreground)",
    note: "Preferir classe arq-title/arq-hero-title quando for título.",
  },
  {
    from: "text-slate-500",
    to: "arq-subtitle",
    note: "Para textos auxiliares.",
  },
  {
    from: "border-slate-100",
    to: "border: 1px solid var(--arq-border)",
    note: "Usar arq-card ou arq-soft.",
  },
  {
    from: "bg-violet-600",
    to: "arq-button arq-button-primary",
    note: "Botões principais seguem a cor de destaque escolhida pelo usuário.",
  },
];

export const ARQDOR_THEME_APPLY_ORDER = [
  "Importar arqdor-theme.css no entrypoint do app ou no módulo ARQDOR.",
  "Envolver ARQDOR com <ArqdorThemeProvider>.",
  "Adicionar ArqdorThemeToggle no header/sidebar.",
  "Adicionar ArqdorThemeSettingsPanel em Configurações → Aparência.",
  "Substituir gradualmente classes fixas por arq-page, arq-card, arq-soft e arq-button.",
  "Manter Render/Preview com ArqdorRenderShell quando useDarkRenderWorkspace=true.",
];
