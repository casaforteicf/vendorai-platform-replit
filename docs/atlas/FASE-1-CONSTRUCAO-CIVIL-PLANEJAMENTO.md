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
