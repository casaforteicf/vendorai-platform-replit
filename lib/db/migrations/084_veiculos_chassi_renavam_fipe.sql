-- Campos de identificação do veículo (chassi, RENAVAM, versão) — hoje só
-- preenchidos manualmente; ficam prontos pra um provedor de busca por
-- placa/chassi/RENAVAM auto-preencher no futuro, sem precisar de nova
-- migration.
--
-- Campos de cache do valor FIPE (código, valor, mês de referência, data da
-- última atualização) — preenchidos via BrasilAPI (gratuita, sem chave),
-- buscando pelo marca+modelo+ano já cadastrados do veículo.
ALTER TABLE veiculos_estoque
  ADD COLUMN IF NOT EXISTS chassi text,
  ADD COLUMN IF NOT EXISTS renavam text,
  ADD COLUMN IF NOT EXISTS versao text,
  ADD COLUMN IF NOT EXISTS fipe_codigo text,
  ADD COLUMN IF NOT EXISTS fipe_valor numeric(12, 2),
  ADD COLUMN IF NOT EXISTS fipe_mes_referencia text,
  ADD COLUMN IF NOT EXISTS fipe_atualizado_em timestamp;
