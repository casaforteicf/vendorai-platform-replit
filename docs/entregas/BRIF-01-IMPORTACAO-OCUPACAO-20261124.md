# BRIF-01 — Importação de briffing/ocupação e uso na tela de Briffing

Atualização: 2026-11-24. Branch: `feat/briffing-import`.
Base: `ef44f3c77`.

## Objetivo

O Briffing era só cálculo de tela e a ocupação precisava ser digitada. Agora a
ocupação oficial por **data + serviço** pode ser importada de planilha/documento
e a tela de Briffing usa essa previsão.

## Modelo

Tabela `ab_briffing_previsoes` (migration `570`):

| Campo | Regra |
|---|---|
| `data` | date |
| `servico` | `cafe_manha`, `almoco`, `jantar`, `outro` |
| `ocupacao` | inteiro >= 0 (pax/hóspedes) |
| `evento` | opcional |
| `observacoes` | opcional |

Uma previsão por `(tenant, data, serviço)`; reimportar atualiza.

## Importação

Novo tipo **Briffing / ocupação** na central de importação
(`/hotelaria/restaurante/importar`), com preview editável e confirmação.

Modelo CSV:

```csv
data;servico;ocupacao;evento;observacoes
25/11/2026;almoco;150;Almoço executivo;Grupo de 150
```

Aceita também TXT/PDF/DOCX/JSON. Exemplos de texto:

- `Data: 25/11/2026 | Serviço: almoço | Ocupação: 150 | Evento: ...`
- Bloco:
  ```
  Data: 26/11/2026
  Serviço: jantar
  Ocupação: 80
  Evento: Confraternização
  ```

Datas `dd/mm/aaaa` são normalizadas. O confirmar retorna `criados`,
`atualizados` e `erros` parciais.

## API

- `GET /tenants/:t/ab/briffing/previsoes?data=&servico=`
- `PUT /tenants/:t/ab/briffing/previsoes`
- Importação: `POST .../restaurante/importacoes/preview|confirmar` com
  `tipo=briffing`.

Tudo tenant-safe (`withTenantTx` + RLS) e escrita restrita a admin.

## Tela de Briffing

Ao abrir, a tela consulta a previsão da data/serviço do cardápio (ou hoje/
almoço sem cardápio) e mostra:

> Previsão importada: 150 hóspedes · 25/11/2026 · Almoço · Evento: ...

com o botão **Usar ocupação**. O cálculo continua sendo feito pelo usuário; a
previsão não altera o resultado sozinha.

## Migration

`570_ab_briffing_previsoes.sql` aplicada em produção como owner, com ledger e
checksum `1734c14ab45093f559525272912d3873ab49982fc3c125c01db1dbaeb50d2487`.
Tabela com RLS e grant para `vendorai_app_login`.

## Validação

- `vitest src/lib/restaurante-importacao.test.ts`: **10/10** (inclui CSV,
  texto de uma linha e bloco de linhas de briffing).
- Integração com banco de produção (tenant CasaForteICF): preview → confirmação
  `1 criado` → `GET` → `PUT` 160 → `GET` 160; registro de teste removido.
- `tsc` API: exit 0; `build.mjs`: exit 0; `vite build`: exit 0.

## Limite

Importa-se a **ocupação/previsão**, não o resultado pronto do briffing. O
resultado continua sendo cálculo de tela (cardápio × ocupação × gramatura),
como antes.

## Estado

Implementado, migration aplicada e validado tecnicamente. Sem merge/deploy
automático.
