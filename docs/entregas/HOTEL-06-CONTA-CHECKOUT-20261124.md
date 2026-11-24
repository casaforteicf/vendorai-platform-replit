# HOTEL-06 — conta, pagamentos e check-out da Hotelaria

Atualização: 2026-11-24. Branch: `feat/hotel-completo-20261124`.
Base: `262ea9097` (`deploy-main` / produção).

## Objetivo e escopo autorizado

Fechar o sistema de Hotelaria de ponta a ponta: a reserva passa a usar uma
tarifa (ou valor manual), gera uma conta com as diárias, recebe extras,
descontos, impostos e pagamentos, e o check-out só é concluído com a conta
quitada. Também entram categoria de apartamento, tarifa por categoria e o
painel de conta na recepção.

Fora do escopo desta entrega: integração com contas a receber/financeiro,
emissão de nota/recibo, impostos configuráveis por tenant, divisão de conta
por hóspede e permissões operacionais específicas de recepção. O módulo
continua opt-in no catálogo do tenant.

## Diagnóstico do que faltava

O módulo já tinha quartos, hóspedes, reservas, check-in/check-out, governança,
receitas, planejamento de refeições, compras e tarifas. Porém:

- a reserva não guardava tarifa nem preço; o total não existia;
- a cotação de tarifas era um cálculo isolado, sem vínculo com a reserva;
- não havia conta (folio), lançamentos, pagamentos nem fechamento;
- o check-out não verificava saldo;
- a tarifa não distinguia categoria de apartamento;
- a recepção não mostrava total nem conta da hospedagem.

## Implementação

### Banco — `lib/db/migrations/540_hotel_06_folio_checkout.sql`

- `hotel_rooms.category` (default `standard`);
- `hotel_rate_plans.room_category` (nulo = todas as categorias);
- `hotel_reservations`: `rate_plan_id`, `quotation_id`, `nightly_prices`
  (snapshot), `total_amount`, `currency`;
- `hotel_folios` (uma por reserva), `hotel_folio_items` (room/extra/discount/tax)
  e `hotel_folio_payments` (cash/pix/cartões/transferência/outro), com RLS por
  `app.tenant_id`, índices e checks de sinal/valor;
- FKs compostas por tenant, `DROP CONSTRAINT/POLICY IF EXISTS` para a migration
  poder ser reaplicada sem erro.

### Backend

- `lib/hotel-rate-engine.ts`: motor único, em centavos, para cotação e reserva
  (base, adicional por hóspede, período, dia da semana, precedência e
  categoria). Também concentra totais de conta e a tolerância de quitação.
- `lib/hotel-folio.ts`: criação idempotente da conta, recálculo de
  lançamentos/pagamentos/saldo e leitura detalhada.
- `lib/hotel-http.ts`: autorização e transação com `app.tenant_id` comuns.
- `routes/hotel_hospitality.ts`:
  - quartos com categoria e PATCH de categoria/nome/capacidade;
  - reserva aceita `ratePlanId` ou `nightlyAmount`, grava snapshot, cria a
    cotação imutável e a conta com uma diária por noite;
  - disponibilidade filtra por categoria;
  - check-out recalcula a conta, recusa saldo devedor (`409 FOLIO_OPEN`) e só
    fecha a conta quando quitada; mantém a baixa de governança (quarto sujo);
  - cancelamento fecha a conta existente.
- `routes/hotel_folios.ts` (novo):
  - `GET /contas` (contas abertas);
  - `GET /reservas/:id/conta` (cria a conta para reservas legadas ativas);
  - `POST/DELETE /conta/itens` (extra/desconto/imposto; diárias não podem ser
    removidas);
  - `POST/DELETE /conta/pagamentos`;
  - `POST /conta/fechar` (exige saldo quitado).
- `routes/hotel_rates.ts`: reutiliza o motor e a autorização comum, aceita
  categoria no plano e na cotação e devolve o mesmo formato de noites.

### Frontend

- `HotelRecepcao.tsx`: categoria no cadastro de quarto, seleção de tarifa
  compatível com a categoria, valor manual quando não há tarifa, total da
  reserva, painel de conta com lançamentos, pagamentos, saldo, fechamento e
  check-out; botão “Conta” no mapa e na lista de reservas.
- `HotelTarifas.tsx`: categoria do plano, edição da categoria e exibição.

## Evidência de execução

Todas as validações ocorreram no worktree isolado
`.worktrees/hotel-completo`, sem tocar em containers de produção/homologação,
deploy ou banco real.

### Migration em Postgres real (temporário)

Container `postgres:16-alpine` descartável, removido ao final. Pré-requisitos
mínimos (`tenants`, `users`), depois:

- `20261030_hotel_04_hospitality_operations.sql` — aplicada;
- `20261030_hotel_05_variable_rates.sql` — aplicada;
- `540_hotel_06_folio_checkout.sql` — aplicada **duas vezes** com
  `ON_ERROR_STOP=1`, sem erro (reaplicação idempotente);
- dados de teste: quarto `standard`, plano `standard`, reserva de 2 noites
  (R$ 500), conta, diária, desconto, pagamento; somas conferidas
  (lançamentos R$ 200, pagamentos R$ 200);
- falhas esperadas confirmadas: segunda conta para a mesma reserva (unique),
  desconto positivo (check), pagamento zero (check), plano inexistente (FK) e
  categoria com 41 caracteres (check).

Logs e comandos ficaram no diretório isolado; o container temporário foi
removido.

### Código

- `vitest` dos libs de Hotelaria: **27 testes passaram**, incluindo 8 novos do
  motor de tarifas/conta.
- `tsc -p tsconfig.json --noEmit` (API completa): exit 0.
- `node ./build.mjs`: exit 0.
- `vite build`: exit 0.
- `git diff --check`: executado antes do commit.

## Estado e limites

Implementado e validado tecnicamente. **Sem merge, publicação ou alteração de
produção.** Homologação funcional com a API/banco reais e aprovação de release
pendentes. Próximo passo: revisar o PR, habilitar o módulo no tenant piloto,
aplicar a migration via boot e homologar o fluxo tarifa → reserva → conta →
pagamento → check-out.

Limitações conhecidas: escritas continuam restritas a administrador do tenant;
não há integração financeira/recibo; impostos são lançamentos manuais; o
cancelamento fecha a conta com o saldo que existir (sem estorno automático).
