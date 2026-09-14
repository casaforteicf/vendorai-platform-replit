# Windsor.ai como padrão de dados de Marketing no VendorAI

## Decisão de arquitetura

Windsor.ai passa a ser a camada padrão de ingestão e normalização de dados de marketing do VendorAI. As integrações nativas já existentes continuam ativas e devem ser preservadas para autenticação, publicação e outras ações específicas que dependam de acesso direto ao provedor.

### Regra principal

`Fontes externas -> Windsor.ai -> modelo normalizado VendorAI -> Marketing Intelligence -> Tad -> recomendação/ação -> medição`

O Windsor não substitui o CRM, o Marketing Agent, o Marketing Runtime, o Visitor Intelligence nem as integrações diretas existentes. Ele alimenta essas camadas com dados multicanal consistentes.

## Escopo inicial

Prioridade de conectores:

1. Instagram
2. Meta Ads
3. Google Analytics 4
4. Google Ads
5. Google Search Console
6. TikTok / TikTok Ads

Outros conectores podem ser adicionados usando o mesmo contrato.

## Instagram: objetivo principal é crescimento

Para Instagram, o Windsor é a camada analítica principal do canal. A meta padrão permanente é crescer audiência qualificada antes de otimizar conversão comercial.

Ordem oficial de otimização:

`Alcance em descoberta -> Retenção -> Engajamento -> Conversão em seguidores -> Conversão comercial`

O sistema deve analisar o perfil antes de criar qualquer planejamento e gerar um `Instagram Growth Intelligence` com:

- seguidores atuais quando disponíveis
- novos seguidores no período
- alcance e visualizações
- retenção/skip rate
- taxa de interação
- visitas ao perfil e cliques
- conversão estimada de alcance em seguidores
- consistência de publicação
- score de crescimento de 0 a 100
- ações prioritárias SCALE, REPEAT, IMPROVE, REPLACE ou PAUSE

O Planejador deve consumir essas decisões. Ele não deve gerar um calendário genérico sem considerar o histórico e os resultados do perfil.

## Contrato normalizado

Todos os conectores devem mapear, quando disponíveis, para os seguintes grupos:

- account: tenant_id, connector, account_id, account_name
- content: content_id, content_type, permalink, caption, published_at
- delivery: reach, impressions, views, frequency
- engagement: likes, comments, saves, shares, reposts, replies, interactions
- acquisition: clicks, profile_visits, website_taps, sessions, leads
- commerce: opportunities, conversions, revenue, ticket, roas
- creative: media_type, creative_id, hook, format, campaign_id
- audience: country, region, city, age, gender
- quality: watch_time, avg_watch_time, skip_rate, engagement_rate
- provenance: source_connector, source_account_id, fetched_at

Campos ausentes em determinado provedor devem permanecer nulos; nunca devem ser preenchidos artificialmente.

## Uso pelo Tad

O Tad deve consumir o modelo normalizado e gerar no máximo 3 a 5 prioridades por ciclo, com:

- detecção
- evidência
- impacto provável
- ação recomendada
- nível de confiança
- necessidade ou não de aprovação humana

Exemplo:

`Reel com 111 views e skip rate de 96,2% -> abertura fraca -> recomendar novo hook e nova versão do criativo.`

No Instagram, o Tad deve preservar a prioridade de crescimento definida pelo Windsor e transformar as recomendações em tarefas do Planejador, Conteúdo e Campanhas.

## Estados de automação

Toda decisão de marketing deve respeitar o estado configurado pelo tenant:

1. OBSERVE: apenas mede e registra
2. RECOMMEND: recomenda sem executar
3. APPROVE: prepara ação e aguarda aprovação
4. EXECUTE: executa ações previamente autorizadas

Ações que alteram orçamento, pausam campanhas ou publicam conteúdo não devem ser executadas sem regra explícita do tenant.

## UX padrão

Marketing deve evitar múltiplas telas redundantes. Estrutura recomendada:

- Visão Geral
- Conteúdo
- Campanhas
- SEO
- Audiência
- Inteligência Tad
- Integrações

A Visão Geral deve priorizar a cadeia:

`Investimento -> Alcance -> Tráfego -> Leads -> Oportunidades -> Vendas -> Receita`

Para Instagram, deve haver ainda um bloco destacado de crescimento com score, seguidores, alcance, retenção, conversão em seguidores e `O que o Windsor recomenda hoje`.

E exibir abaixo `O que o Tad encontrou hoje` com poucas decisões prioritárias.

## Regras multi-tenant

- Toda consulta deve ser isolada por tenant.
- Credenciais e account_ids nunca podem vazar entre tenants.
- Cada tenant pode conectar uma ou mais contas por canal.
- O mesmo conector pode existir em vários tenants com configurações diferentes.
- Cache e dados derivados devem incluir tenant_id no escopo/chave.

## Fallback e ações

- Windsor.ai é a fonte padrão de leitura multicanal.
- Integrações nativas existentes permanecem como fallback de leitura quando necessário.
- Para write actions, usar a integração que oferecer o caminho mais seguro e estável.
- Nunca duplicar uma publicação/ação em duas integrações.

## Tenant piloto

O tenant VendorAI deve ser o primeiro piloto. A conta Instagram já conectada deve servir como teste inicial de leitura, análise de conteúdo, retenção, crescimento e recomendações do Tad. Após validação, repetir o padrão nos demais conectores e então liberar a configuração aos outros tenants.

## Critérios de pronto

- Windsor configurável por tenant.
- Conectores mapeados para contrato único.
- Marketing Agent/Tad consome o contrato normalizado.
- Instagram gera inteligência de crescimento antes do planejamento.
- Planejador consome prioridades de crescimento do Instagram.
- Dashboard não precisa conhecer campos específicos de cada provedor.
- Integrações nativas continuam funcionando.
- Nenhum dado cruza tenants.
- Há rastreabilidade da fonte de cada métrica.
- Ações de escrita respeitam os quatro níveis de automação.
