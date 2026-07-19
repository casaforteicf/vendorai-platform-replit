-- Seed: tenant institucional (formulário do site / SDR inbound)
-- Credenciais de integração nunca devem ser armazenadas em migrations.
-- Configure Z-API/WhatsApp pelo fluxo administrativo e pelos Secrets do Replit.
INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
VALUES (
  'vendorai-institucional',
  'VendorAI Institucional',
  'vendorai-institucional',
  'active',
  NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;
