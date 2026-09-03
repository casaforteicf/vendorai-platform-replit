# Media Identity Foundation — VendorAI Media Engine

Status: **oficial**

## Decisão

O VendorAI Media Engine usa uma identidade audiovisual própria e multi-tenant. O caminho oficial não depende de HeyGen nem de outro provider de avatar. O provider persistido para perfis de voz nesta fundação é exclusivamente `vendorai`.

## Entidades

- `media_identities`: pessoa real ou persona autorizada usada pelo Media Engine.
- `media_voice_profiles`: perfil de voz ligado a uma identidade e a um asset de referência.
- `media_identity_consents`: autorização explícita, independente por finalidade.
- `media_identity_consent_events`: trilha histórica de concessão, revogação, expiração e bloqueio.

Assets de referência continuam na biblioteca oficial `media_assets`; não criamos uma segunda biblioteca paralela.

## Escopos de autorização

Cada finalidade é autorizada separadamente:

- `face_use`: uso de rosto/imagem da identidade;
- `voice_use`: uso de voz;
- `ai_generation`: criação ou transformação por IA;
- `organic_publish`: publicação orgânica;
- `paid_ads`: uso em mídia patrocinada.

Autorizar um escopo não autoriza automaticamente os demais.

## Regra de execução

Qualquer motor que use uma identidade deve verificar `media_identity_has_active_consent(tenant_id, identity_id, scope)` para o escopo necessário antes de executar.

A função só autoriza quando:

1. a identidade pertence ao mesmo tenant;
2. a identidade está `active`;
3. existe consentimento `active` para o escopo;
4. o consentimento não foi revogado;
5. o consentimento ainda não expirou.

Para uma operação que envolva múltiplas finalidades, todos os escopos aplicáveis devem passar. Exemplo: gerar um anúncio com rosto e voz requer `face_use`, `voice_use`, `ai_generation` e `paid_ads`.

## Revogação e compatibilidade

Revogação é forward-only: ela bloqueia novas gerações/publicações, sem destruir retrospectivamente assets, versões ou entregas já existentes. O histórico de consentimento deve permanecer auditável.

Não há migração destrutiva de dados legados. Conteúdos anteriores continuam preservados; novos fluxos de identidade devem usar esta fundação.

## Isolamento

Todas as tabelas possuem `tenant_id`, RLS e as mesmas políticas `vendorai_tenant_access` + `vendorai_tenant_guard` adotadas pelo Media Core.

## Próximas camadas

Esta fundação precede, nesta ordem:

1. API de gerenciamento de Pessoa/Persona e consentimentos;
2. Voice Profile próprio;
3. síntese/transformação de voz VendorAI;
4. lip-sync próprio;
5. vídeo com pessoa/persona;
6. composição, B-roll e música;
7. lote;
8. Autopilot audiovisual.

Nenhuma etapa futura deve reintroduzir HeyGen no caminho oficial.
