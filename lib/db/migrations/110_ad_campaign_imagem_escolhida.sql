-- Permite escolher uma foto REAL do próprio item (produto/veículo/
-- imóvel/landing page) como criativo de imagem do anúncio, em vez de
-- sempre gerar uma via IA. Null (padrão) mantém o comportamento antigo.
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS imagem_escolhida_url TEXT;
