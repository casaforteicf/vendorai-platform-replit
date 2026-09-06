# Migração de Configurações

- Empresa: `business_profiles` / tenant institucional.
- Catálogo: `produtos_catalogo` ativo é a fonte oficial de produtos, serviços e preços.
- Lista `business_profiles.produtos`: legado somente leitura; não deve alimentar novos fluxos quando o Catálogo estiver disponível.
- IA e agentes: devem consumir o resolvedor/contexto oficial do tenant.
- Marketing e propostas: devem preferir Catálogo ativo.
- Documentos: modelos de proposta/contrato ficam em Documentos; portfólio não é cadastrado ali.
- Integrações: cada conexão deve expor estado operacional, última validação e ação de correção quando aplicável.
- Governança: mudanças críticas devem respeitar permissões, rastreabilidade e fonte oficial.
