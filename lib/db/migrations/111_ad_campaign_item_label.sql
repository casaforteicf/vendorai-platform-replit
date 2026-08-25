-- Nome/rótulo do item no momento da criação da campanha — sem isso a
-- tela de campanhas só mostrava o TIPO do item (ex: "landing_page"),
-- não qual item específico foi escolhido, gerando confusão sobre o que
-- estava sendo anunciado de fato.
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS item_label TEXT;
