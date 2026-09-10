# Estabilidade pré-campanha

Este documento registra os bloqueios que precisam ser fechados antes da campanha de prospecção para clínicas odontológicas.

- controles flutuantes globais restritos ao Super Admin;
- Planejamento com rota canônica única;
- Admin Tenants diferenciando lista vazia de erro de carregamento;
- Configurações sem loop/travamento;
- smoke test Marketing → Planejamento → Produção;
- smoke test Prospector → CRM → SDR/Follow-up.

Regra: não criar módulos paralelos; corrigir e integrar os fluxos existentes.
