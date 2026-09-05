# VendorAI Platform Foundation

Este documento registra a fundação da evolução do VendorAI para uma plataforma multi-vertical orientada por módulos, agentes, skills, canais e intelligence layers.

## Princípios

- Não criar módulos paralelos.
- Reaproveitar CRM, campanhas, Revenue Scout, mídia, site/LP e publicação existentes.
- Centralizar capacidades em registries tipados.
- Aplicar herança Platform → Vertical → Tenant → User.
- Tratar Campaign como entidade central de Marketing.
- Tratar agentes como orquestradores das ferramentas oficiais.
- Tratar skills como capacidades especializadas, não agentes duplicados.
- Tratar canais com linguagem, formatos, métricas e políticas próprias.
- Separar Creative/Design Layer da lógica estratégica de Marketing.

## Fundação técnica

A primeira etapa inclui:

- Module Registry
- Vertical Registry
- Agent Registry
- Skill Registry
- Channel Registry
- Vertical Blueprint schema
- Marketing Agent blueprint
- Creative/Design capability catalog
- Channel Intelligence catalog

A implementação inicial é deliberadamente aditiva e sem alteração destrutiva de fluxos existentes. A migração dos módulos atuais para consumo desses registries deve ocorrer incrementalmente.
