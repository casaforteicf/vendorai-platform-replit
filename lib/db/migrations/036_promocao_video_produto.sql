-- Promoções configuráveis + vídeo de produto (Complemento Praça.ai/Vendor.ai).
ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS preco_promocional numeric(12,2),
  ADD COLUMN IF NOT EXISTS promocao_ativa_ate timestamp,
  ADD COLUMN IF NOT EXISTS video_url text;
