# MKT — gate de idempotência de publicação orgânica

## Evidência no código (20/10/2026)
- `artifacts/api-server/src/routes/social-integrations.ts`: `POST /tenants/:tenantId/social-publications/:provider` verifica titularidade de `calendarItemId`, cria publicação e só depois associa `calendarItemId` em metadata. Não foi encontrada, neste handler, checagem explícita de duplicidade antes da criação.
- `artifacts/frontend/src/components/marketing/OrganicCalendarPublisher.tsx`: proteção adicional contra segundo envio no estado atual da interface, sem garantia para abas, sessões concorrentes, outros clientes ou retries após timeout.
- Status `202` significa aceito na fila, **não** publicação confirmada.

## Gate obrigatório antes de ativar produção
1. Conferir constraints e implementação de `createInstagramOrganicPublication`, `createFacebookOrganicPublication` e `createSocialPublication` para detectar deduplicação existente; não assumir ausência global.
2. Definir chave idempotente por tenant + provedor + item de calendário (+ versão aprovada) e contrato de replay para requisições equivalentes, incluindo índice transacional ou reserva atômica.
3. Provar comportamento concorrente com duas requisições simultâneas e repetição após timeout; não disparar dois posts externos.
4. Provar preservação dos estados `queued`, `publishing`, `published`, `scheduled`, `failed`, com retry permitido somente segundo transições oficiais.
5. Testar a reconciliação real após publicação, falha parcial da API, webhook/processador e histórico persistido em banco.
6. Somente após testes isolados, homologação e aprovação, considerar merge/publicação.

**Não classificar como resolvido em backend.** Este PR contém mitigação de interface e este registro técnico, mas não assegura idempotência distribuída.

## Revisão do esquema e janela segura — 20/10/2026
- Esquema `lib/db/src/schema/social_publications.ts`: `metadata` é JSONB; não há coluna relacional exclusiva de item de calendário no modelo examinado.
- Handler cria a publicação antes de atualizar o JSONB com `calendarItemId`. Um índice único apenas sobre a expressão JSONB precisaria avaliar registros legados e tratamento do segundo update, podendo deixar registro órfão.
- **Nenhuma migration foi criada ou executada** nesta etapa. É necessário primeiro auditar duplicatas existentes no banco, confirmar todos os produtores da tabela e definir reserva atômica antes da criação.
- A interface agora apresenta o status `scheduled` como **Agendada**, nunca como botão de publicação livre.
