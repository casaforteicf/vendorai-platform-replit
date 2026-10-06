-- GA4 + GTM por tenant na Central de Conexões
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ga4_measurement_id varchar(40),
  ADD COLUMN IF NOT EXISTS gtm_container_id varchar(40);
