-- Vendor Credits Rate Card V2
-- Commercial units are intentionally decoupled from provider/raw tokens.
-- This migration updates weights only; it does not enable hard blocking or auto-debit.

INSERT INTO usage_metrics
  (key, name, unit_singular, unit_plural, vendor_credits_per_unit, customer_visible, only_charge_on_success, metadata)
VALUES
('ai_assist', 'Assistência de IA', 'assistência', 'assistências', 5, true, true, '{"category":"ai_text","tier":"light"}'),
('content', 'Conteúdo gerado', 'conteúdo', 'conteúdos', 20, true, true, '{"category":"marketing","tier":"medium"}'),
('image', 'Imagem gerada', 'imagem', 'imagens', 200, true, true, '{"category":"media","tier":"premium"}'),
('image_premium', 'Imagem premium / edição com referência', 'imagem', 'imagens', 400, true, true, '{"category":"media","tier":"premium"}'),
('video', 'Vídeo curto gerado', 'vídeo', 'vídeos', 2500, true, true, '{"category":"media","tier":"ultra","dynamicByDuration":true}'),
('video_premium', 'Vídeo premium gerado', 'vídeo', 'vídeos', 5000, true, true, '{"category":"media","tier":"ultra","dynamicByDuration":true}'),
('render', 'Render Arqdor padrão', 'render', 'renders', 500, true, true, '{"category":"architecture","tier":"premium"}'),
('render_premium', 'Render Arqdor premium', 'render', 'renders', 1000, true, true, '{"category":"architecture","tier":"premium"}'),
('image_to_plan', 'Imagem para planta', 'conversão', 'conversões', 500, true, true, '{"category":"architecture","tier":"premium"}'),
('prospect', 'Prospect enriquecido', 'prospect', 'prospects', 30, true, true, '{"category":"data","tier":"medium"}'),
('prospect_deep', 'Prospect com enriquecimento completo', 'prospect', 'prospects', 75, true, true, '{"category":"data","tier":"intense"}'),
('decision_maker_search', 'Busca/análise de decisor', 'busca', 'buscas', 50, true, true, '{"category":"data","tier":"medium"}'),
('agent_interaction', 'Ação simples de agente', 'ação', 'ações', 10, true, true, '{"category":"agents","tier":"light"}'),
('agent_work_unit', 'Execução completa de agente', 'execução', 'execuções', 30, true, true, '{"category":"agents","tier":"medium"}'),
('proposal', 'Proposta/orçamento com IA', 'proposta', 'propostas', 40, true, true, '{"category":"sales","tier":"medium"}'),
('intelligence_analysis', 'Análise inteligente', 'análise', 'análises', 50, true, true, '{"category":"intelligence","tier":"medium"}'),
('intelligence_deep_analysis', 'Análise inteligente avançada', 'análise', 'análises', 200, true, true, '{"category":"intelligence","tier":"intense"}'),
('autopilot_article', 'Artigo Autopilot', 'artigo', 'artigos', 100, true, true, '{"category":"marketing","tier":"intense"}'),
('site', 'Site completo', 'site', 'sites', 1000, true, true, '{"category":"marketing","tier":"premium"}'),
('landing_page', 'Landing page', 'landing page', 'landing pages', 300, true, true, '{"category":"marketing","tier":"intense"}'),
('ads_campaign', 'Campanha/kit de Ads', 'campanha', 'campanhas', 75, true, true, '{"category":"marketing","tier":"medium"}'),
('audio_minute', 'Transcrição/processamento de áudio', 'minuto', 'minutos', 5, true, true, '{"category":"processing","tier":"light"}'),
('document', 'Documento processado', 'documento', 'documentos', 25, true, true, '{"category":"processing","tier":"medium"}'),
('knowledge_page', 'Página de conhecimento indexada', 'página', 'páginas', 5, true, true, '{"category":"processing","tier":"light"}'),
('media_interpretation', 'Arquivo de mídia analisado', 'arquivo', 'arquivos', 50, true, true, '{"category":"processing","tier":"medium"}')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  unit_singular = EXCLUDED.unit_singular,
  unit_plural = EXCLUDED.unit_plural,
  vendor_credits_per_unit = EXCLUDED.vendor_credits_per_unit,
  customer_visible = EXCLUDED.customer_visible,
  only_charge_on_success = EXCLUDED.only_charge_on_success,
  metadata = usage_metrics.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Commercial safety metadata. Enforcement stays measure-only until validation.
UPDATE usage_metrics
SET metadata = metadata || '{"rateCardVersion":"v2","currencyUnit":"vendor_credits","rawTokensCustomerVisible":false}'::jsonb,
    updated_at = now()
WHERE active = true;
