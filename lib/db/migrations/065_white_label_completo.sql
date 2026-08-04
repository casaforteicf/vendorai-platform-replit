-- Marca branca completa (esconde "Vendor.ai" da experiência do tenant,
-- diferente de co-branding que mostra os dois lado a lado). Programa
-- Arqdor já marcado como white-label completo.

ALTER TABLE brand_programs ADD COLUMN IF NOT EXISTS white_label_completo boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS white_label_completo boolean NOT NULL DEFAULT false;

UPDATE brand_programs SET white_label_completo = true WHERE id = 'arqdor';
UPDATE tenants SET white_label_completo = true
WHERE id IN ('3feb28ce-8086-4146-9b33-9025c280f52b', '888c2b81-796e-43c7-b329-cf90efa648be');
