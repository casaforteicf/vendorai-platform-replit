ALTER TABLE arch_projetos
  ADD COLUMN IF NOT EXISTS escopo_orcamento jsonb;

COMMENT ON COLUMN arch_projetos.escopo_orcamento IS
  'Escopo contratado para geração do orçamento Arqdor: tipos selecionados, observações do cliente e regra para itens existentes.';
