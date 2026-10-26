# Atlas 360º — Planejamento aprovado | Fase 1: Construção civil, casa e imóveis

**Status:** escopo de planejamento aprovado em 26/10/2026. **Somente planejamento**; não implementar, alterar funcionalidades, cadastrar dados em produção, aplicar migrations nem publicar por efeito deste documento.

## Propósito
Mapear integralmente o ciclo de vida do terreno e imóvel: aquisição, planejamento, projeto, licenciamento, construção, instalações, acabamentos, mobiliário, decoração, paisagismo, lazer, manutenção, reformas, locação, comercialização e gestão patrimonial. Incluir B2B e B2C, profissionais, fabricantes, distribuidores, varejistas, prestadores e proprietários.

## Jornada (não necessariamente linear)
1. Terrenos e imóveis.
2. Compra, documentação e financiamento.
3. Estudos, arquitetura e engenharia.
4. Licenças e preparação.
5. Construção e estrutura.
6. Instalações e tecnologia.
7. Acabamentos.
8. Móveis e decoração.
9. Área externa e jardins.
10. Manutenção e reformas.
11. Comercialização e locação.
12. Gestão patrimonial e serviços recorrentes.

## Taxonomia inicial aprovada: 16 segmentos
| ID | Segmento | Nichos e serviços a detalhar |
|---|---|---|
| 01 | Terrenos, loteamentos e urbanização | Terrenos, loteamentos, topografia, sondagem, terraplenagem, redes, pavimentação e infraestrutura |
| 02 | Imobiliárias, incorporação e negócios imobiliários | Compra/venda, incorporação, lançamentos, corretagem, locação, condomínios, avaliações, vistorias |
| 03 | Arquitetura, engenharia e projetos | Projetos técnicos, interiores, paisagismo, luminotécnica, BIM, CAD, 3D, compatibilização e orçamento |
| 04 | Construção e sistemas construtivos | Construtoras, empreiteiras, fundações, concreto, alvenaria, ICF, steel/wood frame, modular, coberturas |
| 05 | Materiais básicos e indústria | Cimento, agregados, blocos, aço, madeira, insumos, atacado, distribuição e lojas de materiais |
| 06 | Instalações elétricas, hidráulicas e energia | Elétrica, água/esgoto, drenagem, gás, energia solar, baterias, aquecimento, eficiência |
| 07 | Climatização, automação e segurança | HVAC, automação, smart home, sensores, alarmes, câmeras, controle de acesso, redes |
| 08 | Esquadrias, fachadas e coberturas | PVC, alumínio, madeira, vidros, fachadas, guarda-corpos, ACM, telhas, pergolados |
| 09 | Revestimentos, acabamentos e pintura | Pisos, porcelanatos, pedras, gesso, drywall, forros, impermeabilização, pintura |
| 10 | Cozinhas, banheiros e ambientes funcionais | Planejados, bancadas, metais, louças, boxes, lavanderias, área gourmet, acessibilidade |
| 11 | Móveis, marcenaria e decoração | Marcenaria, móveis, estofados, cortinas, iluminação decorativa, tapeçaria, objetos e design |
| 12 | Paisagismo, jardinagem e área externa | Jardim, viveiros, irrigação, podas, decks, piscinas, spas, muros, calçadas, lazer |
| 13 | Máquinas, ferramentas e apoio à obra | Locação de equipamentos, ferramentas, EPIs/EPCs, transporte, resíduos, logística |
| 14 | Profissionais e mão de obra especializada | Pedreiros, carpinteiros, pintores, instaladores, técnicos, orçamentistas, gestores |
| 15 | Reformas, manutenção e pós-obra | Retrofit, ampliação, assistência, reparos, limpeza, manutenção de jardins e piscinas |
| 16 | Finanças, seguros e serviços complementares | Crédito, consórcios, seguros, regularização, certificações, software, marketing e tecnologia B2B |

A taxonomia é **comercial**, não reprodução oficial da CNAE. Os futuros vínculos CNAE devem ser confirmados; uma empresa pode atuar em vários nichos sem duplicar seu cadastro.

## Dados a planejar para cada nicho
- Hierarquia mercado > segmento > nicho > subnicho > atividade.
- Oferta: produtos, serviços, pacotes, insumos, recorrência e jornada.
- Perfis de compradores, vendedores, fabricantes, distribuidores, profissionais, proprietários e investidores.
- ICP, necessidades, dores, decisores, geografia, sazonalidade, concorrentes, diferenciais.
- Conexões previstas: Vendor.ai (CRM/ERP/Marketing), Arqdor (projeto/quantitativos), Praça.ai (cotação/marketplace), Vendi (agentes).
- Modelos de receita e custos; indicadores, viabilidade, fontes e grau de confiança.
- Estratégias de marketing por nicho: posicionamento, oferta, conteúdo, SEO, busca paga, redes sociais, parcerias, prospecção permitida, funil, orçamento, metas, CAC, LTV e conversão.
- Estágio de maturidade de cada funcionalidade: ideia, decisão aprovada, código, homologado, produção; evidência e atualização.

## Sequência macro de execução futura — não iniciada
1. **Catalogação:** detalhar os 16 segmentos em nichos, subnichos, categorias e perfis.
2. **Inteligência comercial:** ICP, demanda, necessidades, concorrência, priorização e oportunidades.
3. **Conexões do ecossistema:** vincular nichos a funções efetivamente disponíveis e às oportunidades de integração.
4. **Marketing estratégico:** plano e campanhas específicas por nicho; conectar resultados a CRM, financeiro e comercial.
5. **Radar de mercados:** pesquisa contínua, regiões, tendências, canais, metas e validação das hipóteses.

## Modelo de dados planejado para o Atlas

Manter como dimensões independentes: **mercado → segmento → nicho → subnicho → atividade**, **etapa da jornada do imóvel**, **tipo de ator**, **produto ou serviço**, **território**, **estratégia comercial**, **sistema relacionado**. Um negócio pode atender vários nichos e várias etapas, sem duplicação.

Cada registro deverá prever código estável, nome e sinônimos, descrição, relações, tipo B2B/B2C, municípios/regiões, fontes, data de verificação, responsável e estado (hipótese, validado, arquivado). O vínculo com CNAE só será registrado depois de confrontar a classificação oficial; CNAE não substituirá a taxonomia comercial.

Tipos de atores: proprietário/comprador, investidor, corretor, incorporador, construtora, projetista, arquiteto, engenheiro, profissional autônomo, prestador, fabricante, distribuidor, atacadista, varejista, locador, administradora, gestor de condomínio e seguradora/financiador.

Tipos de ofertas: terreno/imóvel, projeto, material, componente, equipamento, locação, instalação, obra, reforma, serviço técnico, decoração, paisagismo, manutenção recorrente, crédito/seguro e software.

## Estratégias de marketing por segmento e nicho — planejamento obrigatório

A ficha de cada nicho deverá conter:
1. **Análise de mercado:** tamanho e localização da demanda quando houver evidências, concorrência, sazonalidade, tendências, oportunidades, ameaças e fontes verificáveis.
2. **ICP e público:** B2B/B2C, porte, região, decisor, necessidades, dores, orçamento típico apenas quando validado e momentos de compra.
3. **Posicionamento:** promessa demonstrável, proposta de valor, diferenciais, provas disponíveis, objeções e limitações da oferta.
4. **Mix e canais:** marketing de conteúdo, SEO e SEO local, pesquisa paga, redes sociais, parcerias, eventos, indicação, representantes, portais e prospecção com conformidade e consentimento.
5. **Funil:** descoberta → atração → lead → qualificação → diagnóstico/projeto → cotação/proposta → negociação → venda → execução → pós-venda → indicação/recorrência.
6. **Campanhas:** segmento, objetivo, criativos, peças e mensagens por público, orçamento, período, landing page, CTA, atribuição e responsável; não lançar campanha automaticamente.
7. **Metas e métricas:** alcance útil, contatos, CPL, MQL/SQL, reuniões, propostas, conversão, CAC, receita atribuída, margem, retenção, recompra e LTV quando calculáveis.
8. **Aprendizado:** experimentos, hipóteses, resultados, revisões e decisões de manter, otimizar ou suspender.
9. **Integração:** ligação planejada com Marketing e CRM Vendor.ai, projetos Arqdor, oportunidades Praça.ai, análises e tarefas Vendi; discriminar planejado versus disponível.
10. **Prioridade:** nota de demanda, aderência, ticket/margem potencial, maturidade da oferta, facilidade de aquisição e sinergia. Nunca classificar uma projeção como resultado efetivo.

## Exemplos de encadeamento comercial a representar

- **Terreno adquirido → topografia/sondagem → projeto → licenças → orçamento → materiais → execução → decoração → jardim → manutenção.**
- **Apartamento usado → vistoria → reforma → móveis sob medida → decoração → gestão patrimonial.**
- **Piscina → projeto → equipamento → instalação → tratamento de água → manutenção recorrente.**
- **Esquadrias PVC → fabricante → distribuidor/representante → instalador → construtora/proprietário → assistência.**

Os fluxos representam oportunidades de negócio, não integrações em produção já verificadas.

## Entregas futuras e critérios de aceite

| Etapa | Entrega planejada | Critério para aceitar |
|---|---|---|
| 1. Catálogo | 16 segmentos e subnichos, profissões, insumos, ofertas e jornadas | Estrutura navegável, identificadores únicos, vínculos múltiplos, sem duplicação |
| 2. Inteligência de mercado | ICP, concorrentes, regiões e prioridades | Fonte, confiança, data e justificativa para cada afirmação material |
| 3. Produtos e integrações | Matriz nicho × Vendor.ai/Arqdor/Praça.ai/Vendi | Estado real de cada função: ideia, especificação, código, homologação ou produção |
| 4. Marketing | Estratégia por nicho, funis, campanhas propostas e orçamento | Objetivo, responsável, hipótese, custo estimado, métricas e critérios de aprovação |
| 5. Radar | Acompanhamento das mudanças e oportunidades | Atualização identificada, evidência, análise e aprovação de ações sensíveis |

## Limites da Fase 1

- Foco exclusivo em construção civil, terrenos, casa, interiores, jardins e mercado imobiliário. Outros setores permanecem em fases futuras.
- Contemplar construção nova e imóvel existente, imóveis residenciais, comerciais, condomínios e infraestrutura relacionada ao imóvel.
- Não presumir que todos os subnichos possuem produto ativo ou integração técnica existente.
- Separar fornecedores/profissionais dos compradores e distinguir marketing B2B de B2C.
- Estratégias são propostas: execução, investimento publicitário, campanhas e alterações comerciais dependem de autorização e disponibilidade técnica.

## Critérios de governança
- Não confundir planejamento com execução; projeções não são faturamento.
- Revisão humana de decisões financeiras, comerciais e publicações.
- Evidências de origem, responsável, data, versão e histórico de mudanças.
- Respeito ao isolamento de tenants e privacidade.
- Cobrir também reforma, revenda, decoração, manutenção e administração do imóvel, além da construção nova.

**Limite do pedido aprovado:** registrar apenas o planejamento da Fase 1; não modificar aplicação, APIs, migrations, banco nem deploy.


---

# Aprofundamento estratégico da Fase 1 — plano de atuação

**Natureza:** plano proposto, complementar aos 16 segmentos aprovados; não implica início de campanhas, desenvolvimento ou publicação. A prioridade deve ser validada por dados do CRM, demanda regional e custos de aquisição.

## A. Quatro eixos de negócios (diferenciar público de tipo de oferta)

1. **Criar/construir:** terrenos, incorporadores, construtoras, arquitetos, engenheiros, empreiteiros e fornecedores de insumos.
2. **Equipar/habitar:** instaladores, esquadrias, marcenaria, móveis, decoração, eletrodomésticos, automação, piscinas, jardinagem e paisagismo.
3. **Conservar/transformar:** reformas, retrofit, manutenção preventiva, assistência técnica, limpeza técnica, conservação e modernização.
4. **Transacionar/gerir:** imobiliárias, corretores, locações, condomínios, administração patrimonial, vistoria, seguros, crédito e investidores.

Os eixos atravessam os 16 segmentos; não devem gerar empresas duplicadas. Imóvel residencial, comercial, institucional, condomínio e empreendimento são filtros independentes.

## B. Cadeias de valor e oportunidades acionáveis para estudo

| Cadeia | Evento de entrada | Compradores potenciais | Fornecedores/prestadores | Oportunidade integrada a validar |
|---|---|---|---|---|
| Terreno até casa pronta | Compra de lote | Proprietário, investidor, incorporador | Topógrafo, sondador, arquiteto, engenheiro, construtora, lojas, decoradores | CRM para jornada e propostas; Arqdor para projeto/quantitativos; Praça.ai para cotações; Vendi para acompanhamento |
| Reforma completa | Compra de imóvel usado / necessidade de reforma | Proprietário, condomínio, empresa | Projetistas, reformistas, instaladores, lojas, marcenarias | Diagnóstico, projeto, escopo, orçamento, compras, execução e pós-obra |
| Fachadas/esquadrias | Obra ou troca de aberturas | Construtora, proprietário, síndico | Fabricantes PVC/alumínio, vidraçarias, distribuidores, instaladores | Dimensionamento, proposta, fabricação/entrega, instalação e assistência |
| Área externa/lazer | Nova casa ou revitalização | Proprietário, condomínio, hotel | Piscineiro, paisagista, jardineiro, irrigação, móveis outdoor | Pacotes de projeto, instalação, insumos e manutenção recorrente |
| Cozinha e interiores | Mudança ou reforma | Proprietário, incorporadora | Designer, marcenaria, pedras, eletrodomésticos, iluminação, decorador | Ambiente projetado, catálogo, orçamento, venda e instalação |
| Condomínio e patrimônio | Gestão de ativos | Síndico, administradora, investidor | Empresas de manutenção, segurança, limpeza, reforma, seguros | Contratos recorrentes, chamados, cotações, ordens de serviço e indicadores |
| Construção industrializada | Novo empreendimento | Construtora, incorporadora | ICF, steel frame, drywall, pré-moldados, instaladores | Especificação técnica, quantitativo e compras B2B |

## C. ICP, problemas, posicionamento e canal de entrada — primeira matriz

| Prioridade inicial **hipotética** | Nicho | ICP/decisor | Dor a investigar | Proposta de valor a testar | Canais de teste |
|---|---|---|---|---|---|
| P1 | Construtoras e empresas de reformas | Dono, diretor comercial, orçamentista, gestor de obras | Orçamentos lentos, leads perdidos, compras e execução desconectadas | Jornada comercial e de obra integrada | Indicações, busca local, demonstração com caso real, parceiros |
| P1 | Esquadrias e vidraçarias | Fabricante, instalador, gerente comercial | Medição, revisão de proposta e pós-venda | CRM + orçamentos + acompanhamento | Busca por especialidade, parcerias com arquitetos, prospecção B2B consentida |
| P1 | Lojas de materiais e distribuidores | Proprietário, gerente de vendas, comprador | Cotação fragmentada e baixa recompra | Gestão de clientes, propostas e oportunidades de compra | Parcerias, vendedores/representantes e campanhas regionais |
| P1 | Arquitetos e projetistas | Escritório, autônomo, coordenador de projetos | Retrabalho de especificação e apresentação | Projeto → especificação → proposta | Conteúdo técnico, demonstrações e comunidades profissionais |
| P2 | Piscinas, lazer e paisagismo | Instalador, loja, proprietário de serviço recorrente | Venda sazonal, agendamento, compra de peças e assistência | Venda de projeto e serviço + carteira recorrente | Pesquisa local, conteúdo visual, indicações |
| P2 | Marcenarias e planejados | Proprietário, projetista, comercial | Revisões de orçamento e execução dispersa | Projeto, proposta e processo de entrega | Parceiros de interiores, pesquisa local e portfólio |
| P2 | Imobiliárias/incorporadoras | Diretor, gestor comercial, corretor líder | Captação, qualificação e follow-up | CRM + agentes e jornada do imóvel | Parcerias, conteúdo regional, pesquisa paga com validação |
| P2 | Gestão condominial e manutenção | Síndico, administradora, prestador recorrente | Chamados e contratos distribuídos | Gestão de demandas, cotações e recorrência | Parcerias setoriais, visitas, conteúdo educativo |
| P3 | Fabricantes de materiais/equipamentos | Diretor comercial, canal e representação | Rede de distribuidores e pedidos complexos | Pipeline B2B e canais comerciais | ABM, representantes, feiras e relacionamento |
| P3 | Crédito, seguros e serviços documentais | Gestor de operação/comercial | Fluxos manuais e originação | Atendimento e gestão comercial especializados | Parcerias reguladas e conteúdo de confiança |

**P1/P2/P3 são hipóteses de ordem de descoberta, não ranking calculado nem decisão de lançamento.** Não aplicar mensagem única a todos.

## D. Estratégias de marketing vinculadas às jornadas

### D1. Captação por intenção
- Busca local/Google: quem procura “construtora em [cidade]”, “instalação de esquadrias”, “reforma”, “projeto arquitetônico”, “piscina”, “marcenaria”.
- Conteúdo por etapa de compra: guia para escolher terreno, checklist de reforma, orçamento, tipos construtivos, custo total e manutenção.
- Direcionar cada demanda à oferta/empresa elegível; consentimento, atribuição de origem e rastreabilidade no CRM.

### D2. Parcerias comerciais e influência técnica
- Arquitetos, engenheiros, corretores e construtoras como parceiros de indicações.
- Catálogo de parceiros com especialidade, área de atendimento, portfólio validado, prazo, qualidade e situação contratual.
- Ofertas combinadas apenas quando responsabilidades, preços e comissões estiverem aprovados.

### D3. Marketing de relacionamento e recorrência
- Pós-obra: lembretes de manutenção, jardinagem, piscina, filtros, impermeabilização e revisões periódicas.
- Conteúdos e campanhas por evento: conclusão de projeto, entrega de imóvel, mudança de estação, vencimento de garantia, reforma.
- Evitar contato não solicitado; respeitar consentimento, LGPD e políticas dos canais.

### D4. Marketplace e demanda qualificada
- Cotações e rodadas B2B; categorizar fornecedores pelo produto e região.
- Não prometer disponibilidade, entrega, preço, desconto ou percentual de comissão que não esteja vigente/contratado.
- Medir pedidos de cotação, propostas recebidas, taxa de fechamento e margem real, quando instrumentado.

### D5. Conteúdo de prova e demonstração
- Antes/depois autorizado, render vs. executado, especificação validada, depoimento consentido, estudo de caso técnico.
- Landing pages e campanhas separadas para proprietário, profissional e empresa.
- Não exibir funcionalidades não publicadas como disponíveis.

## E. Dados mínimos de cada empresa e nicho

**Empresa:** tenantId/ID canônico, tipo (fabricante/distribuidor/varejo/prestador/projetista/construtora/etc.), atuação territorial, carteira de produtos/serviços, perfis atendidos, canais e autorização para divulgação.

**Nicho:** ID, hierarquia dos 16 segmentos, termos sinônimos, ocupações relacionadas, CNAE validada quando existir, filtros geográficos, estágio da jornada, oferta, necessidade, evidências, última atualização, owner e hipóteses abertas.

**Oportunidade:** evento de origem, persona, segmento, fase da jornada, necessidade, projeto (se houver), solução recomendada, fornecedores elegíveis, status de qualificação e próxima ação.

**Métricas:** leads válidos, origem atribuída, agendamentos, propostas, vendas confirmadas, pedidos, receita e custos quando disponíveis; itens sem fonte devem aparecer como indisponíveis, não zero.

## F. Método de priorização verificável

Avaliar cada nicho com pontuação 0–5 para:
- Aderência ao que já existe no produto (peso 25%);
- Intensidade da dor e disposição para pagar confirmada (20%);
- Acesso a canais e parceiros (15%);
- Receita/margem potencial sustentada por evidência (15%);
- Sinergia Arqdor–Praça.ai–Vendor.ai–Vendi (15%);
- Complexidade de implantação e risco operacional invertidos (10%).

Resultado é **score exploratório**, com notas, fonte e responsável; dados ausentes = "não avaliado" e não um zero disfarçado. Testar hipóteses em pilotos antes de ampliar investimento.

## G. Roadmap de planejamento e validação (sem datas fictícias)

1. **Inventariar:** detalhar 16 segmentos e revisar lacunas com especialistas em obra, materiais, imóveis, decoração e jardinagem.
2. **Relacionar:** ligar cada nicho a atores, produtos, atividades, necessidades e momentos de compra.
3. **Qualificar:** pesquisar amostras reais de clientes/fornecedores e validar dores, linguagem de busca, demanda e ticket.
4. **Projetar campanhas:** elaborar 2–3 hipóteses por nicho prioritário, com ofertas, CTA, canais, criativos e custo teto proposto.
5. **Testar pilotos:** executar apenas após aprovação, definir região, período, orçamento e critérios de encerramento.
6. **Medir:** separar funil e coortes B2B/B2C; avaliar proposta, venda, receita, margem, recorrência e aquisição.
7. **Expandir:** priorizar nichos com evidências de resultado e operação suportada; ampliar gradualmente territórios.

## H. Questões a responder antes de executar qualquer campanha
- Quais são os produtos efetivamente ativos e quais permanecem em desenvolvimento?
- Qual região de entrada, equipes disponíveis e capacidade de atendimento/implantação?
- Qual modelo de receita e margem por nicho, incluindo custo real de IA, vendas, suporte e integração?
- Quem entrega produtos, instalação, obra e garantia? Quais SLAs são comprováveis?
- Qual jornada do cliente ficará no Vendor.ai, no Arqdor e no Praça.ai? Onde existe integração comprovada?
- Que públicos forneceram consentimento e quais canais de prospecção estão aprovados?
- Como medir atribuição sem duplicar leads, pedidos, empresas e receitas?

## I. Fontes metodológicas para pesquisa futura
- IBGE/CONCLA CNAE (https://cnae.ibge.gov.br/) para vinculação oficial de atividades.
- CBIC Hub de Dados (https://cbic.org.br/hubdedados/pib-investimento/) para séries macro setoriais.
- Pesquisa primária: clientes, fornecedores, parceiros e dados canônicos do CRM; verificar data e qualidade.
- Estudos de cadeia da construção: material, comércio, serviços técnicos, equipamentos e obras — sem reduzir o universo de casa/imóveis apenas à seção F da CNAE.

**Condição de conclusão deste aprofundamento:** taxonomia e plano documentados; pesquisas de campo, scoring real, execução de campanha, integração operacional e publicação permanecem pendentes.
