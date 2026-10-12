# ARQDOR — Terrenos de parceiros e Pré-Projeto iniciado por anúncio — V1

## Jornada
1. Loteadora/imobiliária/corretora/condomínio registra empreendimento, quadra/lote e terreno verificado, com titularidade e autorização.
2. Catálogo de terrenos publica a ficha comercial, fotos, mapa e documentos permitidos, com status de disponibilidade e revisão técnica.
3. Site parceiro incorpora botão/link "Projete sua casa neste terreno" que aponta para uma landing do Arqdor com token de convite assinado, de curta duração, associado ao tenant parceiro, empreendimento e lote.
4. Arqdor valida token no backend, consulta o lote pelo ID e versão, verifica status/permissões e carrega perímetro, área, orientação, topografia, recuos e restrições urbanísticas disponíveis.
5. Comprador entra no wizard do Pré-Projeto já com o lote selecionado. Pode experimentar implantação e casa, preservar versões e informar contato apenas quando houver base legal e finalidade clara.
6. Ao solicitar estudo, visita, proposta ou atendimento, CRM do parceiro recebe lead/oportunidade vinculados ao lote, projeto, origem, consentimento, UTM e responsável.
7. Atualização/cancelamento/reserva do lote gera aviso sobre projetos derivados, sem substituir silenciosamente medidas ou revisões já utilizadas.
8. Cotação/construção podem seguir motores de Vendor.ai, Arqdor e fornecedores, com aprovações e permissões existentes.

## Regras de segurança e privacidade
- Tenant isolation e RBAC em toda API. O cliente final recebe sessão vinculada ao lote, não acesso administrativo.
- Link não inclui CNPJ, dados pessoais ou parâmetros editáveis de medida/preço; usa identificador opaco assinado e verificado no backend.
- Domínios permitidos, limites de uso, expiração/revogação de convites, proteção contra enumeração de lotes, auditoria.
- Disponibilidade e preço são comerciais, podem mudar; revisão técnica geométrica é imutável por versão.
- Não presumir autorização de divulgar CPF, proprietário ou levantamento topográfico privado.
- Consentimento/base legal LGPD para CRM e marketing. Não criar lead silencioso apenas por abrir link, a menos que o fluxo esteja juridicamente estruturado.
- Dados de divisas e índices urbanísticos exigem fonte, data e validação profissional; mapas são contexto, não levantamento.
- Restrições de condomínio, legislação municipal, recuos, taxa de ocupação, coeficiente de aproveitamento e gabarito por fonte/data e revisão.

## Modelo lógico
PartnerDevelopment {id,tenantId,name,location,website}
PartnerLot {id,tenantId,developmentId,block,lot,areaM2,perimeterGeometry,crs,orientation,terrainModelRef?,surveySource?,surveyRevision,restrictionsRevision,availability,priceReference?}
SiteEntryLink {id,tenantId,lotId,lotRevision,allowedOrigin,expiresAt,revokedAt,scope,signature}
PreProjectOrigin {projectId,tenantId,source:"partner-lot",lotId,lotRevision,partnerTenantId,referralCode?,utm?,createdAt}
LeadAttribution {leadId,projectId,lotId,sourcePartnerId,consentRecordId?,landingOrigin}
LotChangeEvent {lotId,revision,changeType,affectedProjectIds}

## UX
No site parceiro: card do lote -> "Projete sua casa neste terreno".
No Arqdor: "Terreno confirmado por [parceiro]" + área, confrontações, declividade quando disponíveis, recuos e versão/fonte; CTA "Começar Pré-Projeto"; permitir projeto sem login inicial com salvamento somente conforme autenticação/consentimento definidos.
No painel parceiro: lotes publicados, projetos iniciados, estudos solicitados, leads, visitas, propostas e conversão.

## Integrações
Não duplicar motor de leads, pipeline, CRM ou fornecedores. Reutilizar Vendor.ai e os portais existentes.
Caso o comprador já seja lead, deduplicar pelos mecanismos do CRM, respeitando a titularidade do lead e o tenant.
Projeto do comprador e tenant parceiro devem ter escopos de acesso separados; compartilhamento explícito por objeto e permissão.

## Entregas propostas — transversal Pré-Projeto
PT.01 Cadastro de empreendimento, quadra e lote verificado.
PT.02 Geometria de terreno e restrições urbanísticas versionadas.
PT.03 SDK/link/iframe de CTA para site parceiro (priorizar link seguro).
PT.04 Convite assinado, domínios, expiração e proteção contra uso indevido.
PT.05 Wizard Pré-Projeto contextual ao lote com implantação em 2D/3D.
PT.06 Vinculação projeto/lote/revisão e aviso de alterações.
PT.07 Atribuição e consentimento para CRM/lead sem duplicação.
PT.08 Dashboard de conversão e pedidos de atendimento do parceiro.
PT.09 Reserva/indisponibilidade/preço e sincronização comercial.
PT.10 Aceite, privacidade, autorização de dados e auditoria.

## Critérios de aceite
- Clique em lote do parceiro abre lote certo, na versão certa, sob tenant autorizado.
- Terreno não é reconstruído a partir de screenshot de mapa; geometrias vêm do cadastro autorizado.
- Usuário consegue abrir Pré-Projeto e posicionar proposta arquitetônica no perímetro.
- Outro tenant não consegue consultar geometria privada ou leads.
- Mudanças de lote não alteram projetos antigos sem aviso e aceite.
- Atribuição do parceiro, campanha e consentimento são rastreáveis.
- Link expirado/revogado é rejeitado.
- Testes unitários, integração e E2E executados antes de homologação.

## Status
Documento funcional. Não implementa endpoints, página, tokens, banco ou fluxo público. Sem merge ou deploy.


# ADENDO V1.1 — MATRIZ DE INTEGRACOES PONTA A PONTA

## Premissa de entrega
Nenhum dos pontos abaixo deve ser marcado pronto somente por haver tipos, docs ou uma tela simulada. Exigir contratos implementados, migracoes controladas, testes, observabilidade e homologacao. Priorizar servicos existentes do Vendor.ai/Arqdor, sem criar CRM/cotacao/arquivos duplicados.

## Matriz obrigatoria
| ID | Integracao | Entrada / Saida | Contrato e validacao | Falha / reconciliacao |
|---|---|---|---|---|
| INT-01 | Site externo do parceiro | CTA link HTTPS universal + UTM e origem; widget opcional | dominio allowlist, token opaco assinado e nonce, CORS/CSP quando embutido | URL expirou -> nova emissao; jamais expor credenciais |
| INT-02 | Cadastro parceiro/tenant | empreendimento/quadra/lote / permissao | tenantId, partnerId, developmentId, lotId, roles | bloquear cruzamento de tenants |
| INT-03 | Cadastro geoespacial/lote | poligono, limites, coordenadas, area e fonte | GeoJSON/PostGIS se existente; CRS, unidade, area calculada versus informada e revisao | bloquear geometria invalida, marcar medida nao conferida |
| INT-04 | Levantamento profissional | DXF/DWG/IFC, topografia, imagens, memoriais | adaptador verificado, SHA256, storage privado, precisao e licenca | preservar original e avisar conversao parcial |
| INT-05 | Mapas e geocodificacao | endereco / coordenadas e imagem de contexto | provedor autorizado, quotas, attribution, termos de cache; mapa nao valida divisa | fallback para selecao manual por coordenadas |
| INT-06 | Regras urbanisticas/condominio | recuos, ocupacao, coeficiente, altura, servidao | municipio/condominio, fonte, data, validade e validacao profissional | status indefinido impede afirmacao de conformidade |
| INT-07 | Link de entrada e sessao | site externo -> Arqdor | emissao/verificacao server-side, expiracao, revogacao, escopo minimo | rejeitar tokens invalidos sem revelar lote privado |
| INT-08 | Wizard do Pre-Projeto | lotId + lotRevision -> project origin | dados reais/versao, unidade, orientacao, perimetro; nao sobrescrever projeto anterior | lote indisponivel -> preservar estudo e avisar |
| INT-09 | Arqdor modelagem/implantacao | terreno + construcoes -> cena 2D/3D | geometria referencia + objects semanticos, escala e elevacao | conflito de revisao -> reconciliar explicitamente |
| INT-10 | Usuarios e portal cliente | visitante -> usuario autorizado / projeto | login apropriado, consentimento, isolamento, acesso compartilhado granular | recuperar sessao sem abrir dados de outros |
| INT-11 | CRM Vendor.ai | solicitacao qualificada -> lead/deal/atividade | dedup, responsavel obrigatorio, tenant correto, atribucao parceiro/campanha/lote | fila/retry idempotente, nao criar leads duplicados |
| INT-12 | Omnichannel | agendamento/contato -> WhatsApp, email, telefone | templates aprovados, canal permitido, preferencias LGPD, historico CRM | erro de envio registrado; sem disparo nao autorizado |
| INT-13 | Agenda | pedido de visita/reuniao -> agenda | responsavel, data/hora, fuso, local/lote | remarcacao e aviso sem duplicacao |
| INT-14 | Orcamento e proposta | projeto -> composicoes e orcamento | revisionId + itens, regras de precificacao; proposta R1… | alteracao de projeto gera nova proposta, nao muda aprovada |
| INT-15 | Fornecedores e cotacao | materiais/servicos -> RFQ e comparacao | por item/especialidade/fornecedor, autonomia desligada exige aprovacao | retries idempotentes, prazo e substituicao controlada |
| INT-16 | Disponibilidade comercial | vendido/reservado/bloqueado -> site e Pre-Projeto | event sourcing ou outbox, atualizado em lote, timestamps e cache TTL | estado desconhecido nao e anunciado como disponivel |
| INT-17 | Execucao/obras | contrato -> lote de execucao | selecionar itens/fases/quantidades; ordem rastreavel | cancelar lote nao apaga origem |
| INT-18 | Assinatura e documentos | aceite, termo, contrato, anexos -> lead/projeto | armazenamento privado, checksum, revisao, dono, validade | link assinado revogavel e auditoria |
| INT-19 | BI e conversao | clique -> projeto -> solicitacao -> negocio -> venda | IDs de campanha, consentimento, funil, eventos deduplicados | anonimizar eventos sem identificacao, controlar retencao |
| INT-20 | Vendi/agente | oportunidades e gargalos -> proxima acao | autonomia tenant + aprovacao conforme politica; auditar prompts/acoes | nao publicar automaticamente dados sem autorizacao |
| INT-21 | Segurança e observabilidade | servicos -> logs/metrica/alertas | audit event, requestId, traceId, LGPD, protecao de secrets | alarmes para falhas, backoff, DLQ ou status manual |
| INT-22 | Webhooks e API para parceiros | mudancas controladas -> site parceiro | assinatura HMAC, idempotency-key, versao de schema, retry e rate limit | reconciliacao periodica, eventos reprocessaveis |

## Contratos HTTP sugeridos (nomes propostos; nao sao rotas existentes)
- POST /partner-developments/:id/lots (admin autorizado)
- PATCH /partner-lots/:id (controle de revisao / If-Match)
- POST /partner-lots/:id/project-links (expedicao autenticada)
- GET /public/lot-entry/:opaqueToken (consulta limitada server-side)
- POST /preprojects/from-partner-lot (idempotency key, tenant, lot revision)
- POST /preprojects/:id/request-contact (consentimento + CRM)
- POST /partner-webhooks (assinatura, idempotencia e versao)
- GET /partner-lots/:id/integrations/health (sem dados pessoais)

## Eventos de integracao
- partner.lot.created/verified/revised/reserved/sold/unavailable
- partner.entry.opened / preproject.created / preproject.revision.changed
- preproject.contact.requested / crm.lead.linked / quote.requested / quote.received
- proposal.approved / execution.lot.created / partner.integration.failed
Cada evento: eventId, schemaVersion, tenantId, correlationId, aggregateId, aggregateRevision, occurredAt, initiator, idempotencyKey, payload minimo.

## Seguranca e consistencia
- Token de entrada nao substitui autenticar comprador/partner. Assinar, expirar, rotacionar segredo e revogar.
- Nao permitir alteracao de tenantId/lotId/revision pela URL do cliente; backend resolve do token e verifica acesso.
- Nunca confiar em metadados declarados pelo navegador para area, recuos ou topografia.
- Dados cadastrais, de compradores e de projetos sao privados; exportacao/publicacao exige autorizacao.
- Provedor de mapa: respeitar termos e licenca; nao extrair terreno topografico de imagem nao autorizada.
- Outbox transacional/idempotencia para sincronizacao CRM/site/eventos se infraestrutura suportar; na ausencia, reconciliacao com log.
- Separar estado comercial mutavel (disponibilidade e preco) de revisao tecnica imutavel do lote.

## Teste E2E de homologacao obrigatorio
1. Tenant A cria empreendimento e lote com perimetro correto (SRID/CRS, area e fonte).
2. Publica CTA autorizado no seu site.
3. Usuario anonimo acessa, ve lote certo, inicia projeto e posiciona volume da casa.
4. Usuario pede contato com consentimento; lead e negocio associados ao tenant/lot e responsavel correto.
5. Parcela de follow-up: CRM agenda visita, envia informacao somente com autorizacao.
6. Lote muda para reservado/vendido: projeto antigo preservado, oferta e disponibilidade atualizadas, alerta ao interessado.
7. Links falsificados, expirados, de outro tenant e acesso de operador nao autorizado sao rejeitados.
8. Repeticao de evento ou timeout nao duplica lead/projeto/cotacao.
9. Integracao com CRM ou parceiro fora do ar possui alerta, retry e reconciliacao.
10. Verificar metricas, trilhas e isolamento em staging antes da promocao controlada.

## Sequencia de entrega
Fase A: auditoria de endpoints/modelos existentes + dados de lote + limites tenant.
Fase B: link firmado + landing contextual + nova origem de Pré-Projeto.
Fase C: salvamento e versoes + medicao/implantacao + CRM idempotente e consentimento.
Fase D: sincronizacao comercial, portais, agenda, omnichannel e integracoes fornecedor.
Fase E: BI, observabilidade, reconciliacao e E2E total.

## Situacao
Matriz de integracoes especificada. Nao afirmar endpoints, banco, CTA, CRM ou site parceiro ja operacionais. Producao permanece imutavel.
