-- ARQDOR complete site diary
-- Keeps existing diary fields and adds structured operational records.

ALTER TABLE public.obra_diario
  ADD COLUMN IF NOT EXISTS servicos_executados jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS materiais_recebidos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ocorrencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS equipe_detalhes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS equipamentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS videos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS condicao_canteiro text;

COMMENT ON COLUMN public.obra_diario.servicos_executados IS 'Serviços executados no dia, estruturados para relatório e IA.';
COMMENT ON COLUMN public.obra_diario.materiais_recebidos IS 'Materiais recebidos no canteiro com quantidade, unidade, fornecedor e conferência.';
COMMENT ON COLUMN public.obra_diario.ocorrencias IS 'Ocorrências, impedimentos, segurança, retrabalho e decisões do dia.';
COMMENT ON COLUMN public.obra_diario.equipe_detalhes IS 'Equipes e profissionais presentes no dia.';
COMMENT ON COLUMN public.obra_diario.equipamentos IS 'Equipamentos utilizados ou parados no dia.';
COMMENT ON COLUMN public.obra_diario.videos IS 'Vídeos vinculados ao diário.';
COMMENT ON COLUMN public.obra_diario.anexos IS 'Documentos e demais anexos vinculados ao diário.';
