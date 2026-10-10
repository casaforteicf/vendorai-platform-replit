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
