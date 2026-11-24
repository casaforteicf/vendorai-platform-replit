# HOTEL-12 — Separação Restaurante e novo dashboard da Hotelaria

Atualização: 2026-11-24. Branch: `feat/hotel-restaurante-20261124`.
Base: `3dddf6b78`.

## Objetivo

Separar o **Restaurante** dos demais setores da Hotelaria e dar à operação um
dashboard próprio com quatro setores: **Hospedagem**, **Diárias**, **Restaurante**
e **Manutenção**. Todas as abas de A&B passam a viver dentro do Restaurante.
Entra também a central de importação com preview/edição para receitas,
ingredientes e cardápios.

## Navegação e dashboards

- `/hotelaria` — novo **Painel da Hotelaria** com os quatro setores, resumo de
  contas abertas/saldo, quartos para limpeza e ações rápidas.
- `HotelSectorNav` — Hospedagem, Diárias, Restaurante, Manutenção (e visão geral).
- `/hotelaria/restaurante` — **Painel do Restaurante**, com receitas,
  ingredientes, cardápios, briffing, importar, compras, estoque e CMV.
- `RestaurantModulesNav` — todas as abas de A&B/restaurante, com link de volta
  para a Hotelaria.
- `HotelModulesNav` agora escolhe o menu pelo caminho: setores da Hotelaria ou
  abas do Restaurante. As páginas antigas (`/hotelaria/ab/*`,
  `/hotelaria/receitas`, `/hotelaria/planejamento`) continuam funcionando e já
  aparecem com a navegação do Restaurante.
- `adaptiveModuleLauncher`: o atalho Hotelaria passa a abrir `/hotelaria`.

### Novas rotas

| Rota | Conteúdo |
|---|---|
| `/hotelaria` | Painel da Hotelaria |
| `/hotelaria/hospedagem` | Recepção/reservas |
| `/hotelaria/diarias` | Tarifas |
| `/hotelaria/manutencao` | Manutenção e governança |
| `/hotelaria/restaurante` | Painel do Restaurante |
| `/hotelaria/restaurante/receitas` | Fichas técnicas |
| `/hotelaria/restaurante/ingredientes` | Cadastro de ingredientes |
| `/hotelaria/restaurante/cardapios` | Cardápios |
| `/hotelaria/restaurante/briffing` | Briffing |
| `/hotelaria/restaurante/importar` | Central de importação |
| `/hotelaria/restaurante/compras` | Ordens de compra |
| `/hotelaria/restaurante/recebimento` | Recebimento/estoque |
| `/hotelaria/restaurante/requisicao` | Requisição |
| `/hotelaria/restaurante/cmv` | CMV |
| `/hotelaria/restaurante/mapeamento` | Produto → insumo |
| `/hotelaria/restaurante/cargos` | Cargos/setores |
| `/hotelaria/restaurante/planejamento` | Planejamento de refeições |
| `/hotelaria/restaurante/custos` | Fichas HOTEL-02/custos |

## Manutenção

Nova tela `Manutencao.tsx`: quartos ativos/em manutenção, governança
(sujo/limpeza/inspeção/limpo), liberação de manutenção e histórico auditável por
quarto, usando a API existente de operação/histórico.

## Ingredientes

- Nova API `restaurante_ingredientes.ts` (CRUD tenant-safe sobre `insumos`):
  nome, unidade base (g/ml/un), preço, categoria, código e descrição.
- Página `Ingredientes.tsx` com busca, criação, edição e exclusão; ingrediente
  em uso por ficha/cardápio é recusado com 409.
- As fichas técnicas e o motor preditivo continuam usando o mesmo catálogo.

## Central de importação

API `restaurante_importacao.ts`:

- `POST /tenants/:t/restaurante/importacoes/preview`
- `POST /tenants/:t/restaurante/importacoes/confirmar`

Formatos aceitos: **CSV/TSV, TXT, JSON, PDF e DOCX**. XLSX é recusado com
instrução para exportar em CSV (evita interpretar binário sem controle).

- Receitas: `receita; rendimento; ingrediente; quantidade; unidade; fator_correcao`.
- Cardápios: `cardapio; data; servico; receita; porcoes_por_pax`.
- Ingredientes: `nome; unidade; preco; categoria`.

O preview devolve itens normalizados (datas `dd/mm/aaaa` viram ISO, kg/l viram
g/ml, decimal com vírgula é aceito), com avisos. A tela permite editar/adicionar/
remover linhas antes de confirmar. O confirmar grava por item e devolve
`criados`, `atualizados` e `erros` parciais.

Receitas existentes com o mesmo nome são atualizadas (insumos substituídos);
cardápios com mesma data/serviço/nome também. Ingredientes são atualizados por
nome case-insensitive.

## Validação

- `vitest src/lib/restaurante-importacao.test.ts`: **7/7** (números pt-BR,
  datas, receitas CSV/texto, cardápios CSV/texto, ingredientes e recusa de kg/l).
- `tsc -p artifacts/api-server/tsconfig.json --noEmit`: exit 0.
- `node artifacts/api-server/build.mjs`: exit 0.
- `vite build`: exit 0.
- `tsc` do frontend: zero erros nos arquivos novos/alterados.
- Teste de integração controlado no tenant **Demo** (API local montando só os
  routers novos, banco de produção): ingrediente criado (201), preview e
  confirmação de receita (1 criada), preview e confirmação de cardápio (1
  criado); linhas conferidas no banco e **removidas ao final** (0 resíduos).

## Limites e próximo passo

Sem importação XLSX nativa; sem OCR de PDF sem texto; a confirmação é parcial
(itens com erro não derrubam os válidos). Não houve homologação em navegador
nem deploy. **Sem merge/deploy automático.**

Próximo passo: revisar/mergear, aplicar no tenant piloto e homologar o fluxo
dashboard → restaurante → importar → revisar → confirmar → briffing.
