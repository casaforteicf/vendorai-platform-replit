-- Segmentos/linha de produto atendidos por vendedor (ex: loja de peças com
-- vendedor especializado em "Óleos & Lubrificantes" x outro em "Peças de Motor").
-- Mesmo padrão de lead_assignment_cities/lead_assignment_regions (999):
-- array de strings, comparado contra leads.mercado_segmento; vazio = sem
-- restrição de segmento, participa normalmente da distribuição por território.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lead_assignment_segments jsonb NOT NULL DEFAULT '[]'::jsonb;
