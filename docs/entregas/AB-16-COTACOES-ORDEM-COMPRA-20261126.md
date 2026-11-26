# AB-16 — cotação unificada gerando ordem de compra

Data: 2026-11-26.

## Fluxo

necessidade do planejamento → cotação → respostas de fornecedores → fornecedor
escolhido → ordem de compra `sugerida` → aprovação → entrega/recebimento.

## Entregue

- Tabelas `ab_cotacoes`, `ab_cotacao_itens`, `ab_cotacao_fornecedores`.
- `ab_ordens_compra.cotacao_id` e `fornecedor_id`.
- API:
  - criar cotação com itens e fornecedores;
  - registrar proposta (valor, prazo, condições);
  - escolher fornecedor e gerar ordem automaticamente;
- Planejamento: botão **Gerar cotação** a partir das faltas.
- Tela **Cotações** para comparar propostas, escolher fornecedor e gerar ordem.
- Compra direta permanece como exceção para compras sem cotação.
- Navegação ganhou **Cotações**.

## Validação

- `tsc -p tsconfig.launch-ci.json --noEmit`: exit 0.
- `vite build`: exit 0.
- Migração 576 aplicada e registrada no ledger.
