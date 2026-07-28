-- Facebook Messenger — novo canal de mensagem, mesma família de API do
-- Instagram (Meta Graph API), token de página próprio.
ALTER TYPE message_canal ADD VALUE IF NOT EXISTS 'messenger';

ALTER TABLE agent_configs
  ADD COLUMN IF NOT EXISTS messenger_page_access_token text,
  ADD COLUMN IF NOT EXISTS messenger_page_id text;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS messenger_scoped_id text;
