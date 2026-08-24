-- WhatsApp via QR Code (Evolution API, self-hosted) — terceira via de
-- conexão de WhatsApp, ao lado da API oficial da Meta e do Z-API. Cada
-- tenant tem 1 instância própria na Evolution API (self-hosted no
-- Railway), identificada por evolution_instance_name (determinístico:
-- "vendorai-{tenantId}"). evolution_connected reflete o último estado
-- reportado pelo webhook connection.update — false até o QR ser
-- escaneado com sucesso.
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS evolution_instance_name TEXT;
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS evolution_connected BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS evolution_phone TEXT;
