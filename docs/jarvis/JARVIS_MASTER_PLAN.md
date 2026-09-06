# JARVIS — Planejamento Mestre

## Objetivo

JARVIS é o Agente Mestre do VendorAI: uma camada única de interação por voz, texto e contexto de tela, capaz de conhecer o sistema, o negócio e o mercado do tenant; orquestrar agentes especializados; explicar decisões; executar ações autorizadas; acompanhar resultados; e manter histórico auditável.

## Princípios

- Não criar módulos paralelos quando uma função puder enriquecer telas e fluxos existentes.
- Uma única presença conversacional para o usuário; agentes especializados trabalham por trás.
- Toda inteligência relevante deve ser explicável, rastreável e vinculada a evidências.
- Isolamento estrito por tenant, usuário, papel e permissão.
- Ações sensíveis e críticas exigem confirmação conforme matriz de risco.
- Aprendizado deve usar resultado real, sem misturar tenants.

## Experiência

- Botão global JARVIS em desktop e mobile.
- Texto e voz; modo contínuo em sessão.
- Contexto da tela atual: rota, entidade aberta, filtros, tenant, usuário e permissões.
- Respostas curtas primeiro; aprofundamento sob demanda.
- Personalidade vocal: masculina, pt-BR, adulta, calma, segura, sofisticada e natural.

## Funções centrais

1. Conhecimento do VendorAI e orientação de uso.
2. Controle de navegação e filtros por linguagem natural.
3. Execução de ações no CRM, Agenda, Propostas, Marketing e demais módulos conforme permissões.
4. Orquestração de SDR, Closer, Follow-up, Marketing, Conteúdo, Financeiro, Cobrança, Agenda, Pós-venda, Dev Agent e demais agentes.
5. Substituição da experiência tradicional de suporte: JARVIS diagnostica, resolve quando possível e escala tecnicamente quando necessário.
6. Memória operacional de regras, preferências, decisões e resultados.
7. Multimodalidade: texto, voz, imagem, documento, áudio e vídeo.

## Vendor Intelligence Engine (VIE)

Fluxo-base:

Collectors → Normalizador → Entity Resolver → Change Detector → Signal Engine → AI Analyst → Scoring → Caso Vendor → JARVIS

### Radar interno

Leads, clientes, vendas, vendedores, conversão, margem, ticket, descontos, propostas, tarefas, inadimplência, campanhas, estoque, fornecedores, atendimento, churn, cross-sell e anomalias operacionais.

### Radar externo

Concorrentes, fornecedores, preços, mercado, tendências, anúncios públicos, sites, redes sociais públicas, avaliações, obras, empresas, licitações, legislação, dados públicos, regiões, oportunidades e riscos.

### Notícias & Mercado

Integrado ao Dashboard, sem criar módulo isolado. Fontes múltiplas nacionais, regionais e internacionais, incluindo feeds gerais, economia, setorial, regional e regulatório. Fontes possíveis conforme disponibilidade/licenciamento: Agência Brasil, gov.br, G1, BBC, Reuters, AP e veículos regionais relevantes ao tenant.

Fluxo: captura → classificação por tema/região/empresa/produto → cruzamento com contexto do tenant → impacto/oportunidade/risco → confiança → Caso Vendor quando relevante.

## Concorrentes

- Cadastro inicial manual + descoberta por segmento, CNAE, produtos, região, palavras-chave, público e posicionamento.
- Classificação: direto, indireto ou não concorrente.
- Monitoramento de mudanças em site, produtos, preços, promoções, serviços, regiões, anúncios públicos, redes sociais públicas, avaliações, lançamentos, unidades, vagas, notícias e posicionamento.
- Separar informação em: Confirmado, Detectado e Hipótese.

## Fornecedores

Cruzar preço, prazo, atraso, qualidade, devolução, concentração, condição de pagamento e histórico interno com sinais externos como novas tabelas, câmbio, frete, notícias, disponibilidade, substitutos e novos fornecedores.

## Caso Vendor

Objeto único e persistente para todo sinal relevante.

Tipos: oportunidade, risco, concorrência, fornecedor, cliente, vendas, marketing, financeiro, operação e sistema.

Campos essenciais:
- o que aconteceu;
- quando;
- fonte e evidência;
- justificativa;
- impacto;
- confiança;
- recomendação;
- ações executadas;
- responsável;
- conversa associada;
- status;
- resultado posterior.

O mesmo Caso Vendor pode aparecer no Dashboard, CRM, Prospector, Fornecedores ou Marketing, sempre apontando para a mesma origem.

## Dashboard

Adicionar sem criar nova tela principal:
- Prioridades do JARVIS;
- Histórico do JARVIS;
- O que o JARVIS encontrou;
- Notícias & Mercado;
- oportunidades e riscos;
- valor gerado pelo JARVIS;
- Cobertura do JARVIS.

Cada sinal clicável abre drawer/modal do Caso Vendor com justificativa, evidências, confiança, recomendação, ações e conversa persistente.

## Prospector

Incorporar Radar Externo com oportunidades comerciais, empresas, obras, regiões, concorrentes e sinais de mercado. Não criar tela separada de inteligência externa.

## Capacidades adicionais

- Agenda de Inteligência.
- Watchlists por empresa, concorrente, fornecedor, produto, cidade ou tema.
- Mapa de relações.
- Comparador inteligente.
- Cenários e previsões.
- Heatmap de oportunidades e riscos.
- Radar de reputação.
- Monitoramento de pessoas-chave em fontes públicas permitidas.
- Monitor de contratos e documentos.
- Biblioteca de decisões.
- Score de confiabilidade de fontes.
- Detecção de conflito entre fontes.
- Modo “o que mudou?”.
- Modo “o que eu não estou vendo?”.
- Priorização por impacto financeiro estimado.
- Playbooks automáticos aprovados.
- Feedback rápido de relevância.
- Modo diretoria.
- Modo auditor.
- Níveis configuráveis de autonomia por área.
- Fila única de aprovações do JARVIS.
- Aprendizado por tenant e vertical.

## Matriz de risco de ações

- Nível 1 — Livre: consultar, pesquisar, analisar, abrir tela, filtrar.
- Nível 2 — Operacional: criar tarefa, registrar informação, preparar conteúdo, criar rascunho.
- Nível 3 — Sensível: enviar mensagem, publicar campanha, alterar orçamento, editar dados importantes.
- Nível 4 — Crítico: excluir dados, pagamentos, usuários, permissões, autenticação e configurações estruturais.

Confirmação aumenta conforme o nível.

## Proatividade

- Informativo: histórico.
- Importante: Dashboard.
- Urgente: alerta.
- Crítico: interrupção controlada e solicitação de decisão.

## Modos de uso

- Modo Executivo.
- Modo Manhã.
- Modo Final do Dia.
- Modo Reunião.
- Modo Vendedor em Campo.
- Modo Treinamento.
- Modo Demonstração.
- Acompanhamento contínuo por watchlist.

## Valor gerado

Medir oportunidades encontradas, leads criados, propostas, vendas, receita, riscos evitados, economia estimada e margem recuperada.

## Fases de implementação

### Fase 1 — Fundação
- presença global;
- identidade JARVIS;
- voz e texto;
- contexto básico de tela;
- permissões;
- reaproveitamento do chat/suporte existente;
- histórico de conversa.

### Fase 2 — Execução
- navegação;
- comandos;
- CRM;
- agenda;
- propostas;
- marketing;
- automações.

### Fase 3 — Casos Vendor
- persistência;
- evidências;
- justificativas;
- conversa;
- resultado.

### Fase 4 — Inteligência Interna
- sinais;
- score;
- prioridade;
- alertas;
- recomendações.

### Fase 5 — Radar Externo e Notícias
- concorrentes;
- fornecedores;
- mercado;
- notícias;
- oportunidades;
- riscos.

### Fase 6 — Proatividade e automações naturais

### Fase 7 — Aprendizado por resultado

### Fase 8 — Voz avançada, reunião, campo e multimodalidade completa

## Decisão arquitetural atual

O primeiro passo deve evoluir o `SupportChatWidget` global existente para a presença do JARVIS, preservando a infraestrutura de streaming e escalonamento técnico já existente. A implementação deve ocorrer em PRs pequenos, reversíveis e testáveis, sem alteração direta da `main`.
