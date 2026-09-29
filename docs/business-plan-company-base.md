# Marca e Negócio: base operacional por empresa

Disponível por padrão no Kit da Marca, em Configurações → Marca e Negócio (`tab=marketing`). O planejamento é opcional no onboarding. Identidade continua editável na aba própria.

## Fluxo

1. Administrador desenvolve fichas nos 11 blocos, manualmente ou com sugestão de IA.
2. Sugestões são revisadas antes de entrar no rascunho. Fonte e situação (informação declarada, validada ou hipótese) ficam explícitas.
3. Salvar mantém a última versão aprovada. Aprovar substitui somente o bloco escolhido; revogar retira esse bloco dos agentes.
4. Gateway OpenAI/Anthropic adiciona contexto aprovado por função para agentes mapeados e `content_generator`. Prompts individuais não são regravados. Hipóteses, finanças internas, SWOT e riscos não entram nos agentes de atendimento.
5. Marketing escolhe segmento aprovado, produto do catálogo, objetivo, canal e imagens existentes. Geração produz texto editável. Salvamento cria campanha em rascunho com capa, referências de mídias e versão do PN. Não envia mensagens ou publica anúncios.
6. PN aprovado pode ser visualizado e exportado como HTML, com hipóteses identificadas.

## Persistência e segurança

- `business_profiles.discovery_data.businessPlan`, sem nova tabela, migration ou seed obrigatório.
- Rotas sob `/tenants/:tenantId/business-plan` aplicam isolamento de tenant. Edição/planejamento completo exigem administrador. Preview de agente entrega apenas o recorte correspondente à função.
- Transação com bloqueio de linha e versão otimista evita perda por concorrência. Patch genérico do perfil preserva a chave do PN atomicamente.
- IDs de catálogo e mídias são validados contra a empresa. Campanhas guardam o contexto escolhido, não o plano financeiro completo.
- Histórico recente limitado a 20 revisões. Não é um arquivo ilimitado de auditoria.
- A mesma ação de salvar campanha usa UUID idempotente. Geração de texto usa gateway e quota existentes; não gera imagens automaticamente nem mostra custo monetário de IA.

## Cobertura e limites

A injeção cobre os agentes que usam o gateway compartilhado e as chamadas de conteúdo mapeadas. Integrações externas ou chamadas diretas a provedores fora desse gateway não recebem contexto implicitamente. O endpoint legado de copy de campanhas foi migrado para o gateway.

As demais imagens ficam no briefing; a estrutura atual da campanha possui uma capa. O fluxo não implementa carrossel automático. A seleção carrega até 500 produtos ativos e 200 imagens recentes. Não há pesquisa de mercado automática ou validação externa de alegações. Essas informações devem ser desenvolvidas e verificadas pela empresa.

## Verificação

- Testes do modelo: rascunho versus aprovação, isolamento por função, exclusão de hipóteses, revogação e mapeamento de features.
- Teste local com PostgreSQL em PGlite e consultas reais do serviço: criação, bloqueio de versão, referências de outro tenant, preservação de aprovação, capa e idempotência de campanha.
- Sintaxe dos arquivos alterados e checagem de tipos dos novos módulos com fronteiras do app substituídas por declarações locais. Build completo e verificações de integração são executados pelo CI do repositório.
