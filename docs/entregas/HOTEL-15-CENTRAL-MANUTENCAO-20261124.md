# HOTEL-15 — Central de Manutenção da Hotelaria

Atualização: 2026-11-24. Branch: `feat/manutencao-modulo-20261124`.
Base: `7ec7f5372`.

## 1. O que entrou

A tela **Hotelaria → Manutenção** deixou de ser apenas o mapa de quartos e passou
a ser uma central operacional. A aba **Quartos e limpeza** preserva a operação
anterior (disponibilidade, manutenção do quarto, governança e histórico) e as
demais áreas cobrem a operação de manutenção propriamente dita:

- **Visão geral** — chamados abertos/atrasados, preventivas dos próximos 7 dias,
  checklists do dia, equipamentos, medidores e documentos vencendo.
- **Chamados** — abertura, prioridade, prazo, responsável, local, andamento
  (aberto / em andamento / aguardando) e conclusão com observação.
- **Preventiva** — plano por equipamento, intervalo em dias, última e próxima
  execução, ativação/desativação e baixa que gera a OS concluída e recalcula a
  próxima data.
- **Checklist** — modelos diário/semanal/mensal, itens com “exige observação”,
  início da ronda por dia, marcação OK/Problema e abertura automática de chamado
  quando o item é marcado como problema.
- **Equipamentos** — cadastro com código, categoria, UH/área, marca, modelo,
  série, situação e observações; base para preventiva e chamados.
- **Medidores** — água, gás, energia e temperatura; leituras por data com
  consumo calculado em relação à leitura anterior.
- **Documentos** — alvarás, laudos, certidões e contratos com validade, link do
  arquivo, renovação e destaque de vencidos/vencendo em 30 dias.

## 2. Banco

Migration `571_hotel_manutencao_central.sql` (8 tabelas, RLS por tenant):

- `hotel_maintenance_assets`
- `hotel_maintenance_plans`
- `hotel_maintenance_work_orders`
- `hotel_maintenance_checklist_templates`
- `hotel_maintenance_checklist_runs`
- `hotel_maintenance_meters`
- `hotel_maintenance_meter_readings`
- `hotel_maintenance_documents`

Checklists usam JSONB para o snapshot dos itens da ronda, preservando o que foi
executado mesmo se o modelo for editado depois.

## 3. API

Novo router `hotel_maintenance.ts`, registrado em `routes/index.ts`:

- `GET /resumo`
- CRUD `/equipamentos`
- CRUD `/planos` + `POST /planos/:id/executar`
- CRUD `/chamados` (com filtro `?status=`)
- CRUD `/checklists`, `POST /checklists/:id/gerar`,
  `PATCH /checklists/execucoes/:runId/itens/:itemId`
- CRUD `/medidores`, leituras `GET/POST /medidores/:id/leituras`
- CRUD `/documentos`

Leitura e escrita liberadas para usuários humanos do próprio tenant; escritas
externas, agentes de IA e outros tenants ficam bloqueados.

## 4. Validação

- Migration aplicada em banco descartável com schema mínimo (`tenants` +
  `hotel_rooms`): **8 tabelas criadas**, sem erro.
- Dados de amostra inseridos e consultas críticas executadas: resumo de
  chamados, equipamentos com planos, medidores com consumo e checklist.
- `tsc` da API e do frontend sem erros nos arquivos novos.
- `build.mjs` da API: exit 0.
- `vite build` do frontend: exit 0; bundle budget OK.
- Chunk `Manutencao-local-*.js` gerado com a central.

## 5. Limites desta entrega

- A escala da equipe e os relatórios analíticos do WeGov não foram trazidos
  nesta rodada; a central cobre a operação diária e os registros que alimentam
  esses relatórios.
- O checklist não bloqueia a conclusão quando um item “exige observação” fica
  sem texto; a observação é solicitada no fluxo de problema e pode ser
  endurecida em uma próxima rodada.
- Não há upload de arquivo próprio: o documento guarda o link do arquivo.

## Estado

Implementado e validado tecnicamente. Sem merge/deploy automático.
