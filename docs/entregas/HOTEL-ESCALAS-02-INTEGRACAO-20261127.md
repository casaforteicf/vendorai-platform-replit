# HOTEL-ESCALAS-02 — integração do AJEscala V5

Data: 2026-11-27.

## Entregue

- Rota protegida `/hotelaria/escalas` com `HotelSectorNav` e card no `HotelDashboard`.
- Persistência PostgreSQL por tenant:
  - `hotel_escala_config` (estado atual e versão);
  - `hotel_escala_versoes` (histórico imutável de cada salvamento).
- API:
  - `GET/PUT /hotelaria/escalas`;
  - `GET /hotelaria/escalas/historico`;
  - `GET /hotelaria/escalas/historico/:id`;
  - `POST /hotelaria/escalas/historico/:id/restaurar`.
- Interface preta/dourada preservando a referência:
  - escala nominal com T/F;
  - ocupação e metas por Pax;
  - colaboradores, regimes 5x2/12x36/parcial, horários e intervalo;
  - extras, contatos, tarifas por tipo de dia;
  - cobertura por horário;
  - validação de ciclos, domingos e funções críticas;
  - importação/exportação JSON e CSV.
- Importação JSON compatível com o backup do AJEscala V5; base privada não incluída.

## Validação

- `tsc -p tsconfig.launch-ci.json --noEmit`: exit 0.
- `vitest escala-ab`: 4/4.
- `vite build`: exit 0.
- Migração 577 aplicada e registrada no ledger.
