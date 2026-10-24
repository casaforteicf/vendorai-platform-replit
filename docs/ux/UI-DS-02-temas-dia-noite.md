# UI-DS-02 — Aparência Dia, Noite e Automático

Proposta aprovada para especificação em 2026-10-20. Sem implementação nem publicação.

- Modos: light, dark, system (prefers-color-scheme). Padrão sugerido: system.
- Preferência por usuário persistida no backend quando autenticado e aplicada em todos os dispositivos; fallback local temporário sem autorização por localStorage.
- Alternância em Perfil > Aparência e atalho acessível na barra superior.
- Design tokens semânticos para superfícies, texto, bordas, foco, primary, IA, estados, gráficos, tabelas, modais, overlays, toasts e PDFs. Nunca inverter cores apenas com filtros CSS.
- Contraste WCAG AA, foco visível e prevenção de flash de tema errado na inicialização.
- Tenants preservam logo/branding em ambos os temas. Arqdor usa tema escuro recomendado mas deve respeitar preferências onde existir variante clara.
- Portal público: escolha própria por dispositivo, sem depender de conta interna.
- Testes: todas as páginas habilitadas, desktop/mobile; login/logout, persistência, system change, modais, tabelas, gráficos, formulários, estados vazios/erros e PDFs.
- Rollout por feature flag; não remover estilos existentes antes de verificação visual e funcional.
- Integrar ao UI-DS-01, sem duplicar componentes.
