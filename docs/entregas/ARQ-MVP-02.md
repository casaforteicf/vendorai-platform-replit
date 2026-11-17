# ARQ-MVP-02 — Esquadrias (D13) e tela de conflitos

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** implementado e validado tecnicamente (não homologado)

## 1. Esquadrias — porta e janela como vão contábil
`src/arqdor/editor/bim/esquadrias.ts` (puro):

| Regra | Validação |
|---|---|
| cabe na parede | `0 ≤ offset` e `offset + largura ≤ comprimento` → `VAO_NAO_CABE` |
| altura | `peitoril + altura ≤ altura da parede` → `ALTURA_EXCEDE_PAREDE` |
| medida | largura/altura/offset/peitoril > 0 → `MEDIDA_INVALIDA` |
| tipo | só elemento `parede` → `NAO_E_PAREDE` |
| id | `vao_<parede>_<tipo>_<offset*1000>` — determinístico |

UI: com o sólido **convertido em Parede**, o painel de Propriedades mostra a seção **Vãos**
(offset, largura, altura, peitoril) e os botões **Porta** / **Janela**. O vão entra no BIM via
`criar_elemento_bim`, aparece na planta 2D (batentes) e **desconta área** de alvenaria no orçamento.

## 2. Conflitos (compatibilização)
Aba **Conflitos** no editor (ocupa a largura toda, sem rail/inspetor):
formulário de tubo (camada, altura, diâmetro, dois pontos em planta) → `detectarConflitos`
do motor AABB → tabela de conflitos com volume + marcador na planta + lista de tubulação.
MEP é **entrada do usuário** (não há desenho de tubulação ainda); os contatos intencionais
(tomada ancorada na própria parede) aparecem como ignorados.

## Bugs corrigidos neste lote
| Defeito | Correção |
|---|---|
| `mep` não estava nas dependências do autosave — tubo adicionado não seria salvo | `mep` incluído nas deps |
| painel de conflitos espremido na coluna do canvas | aba ocupa a largura do editor (rail e inspetor ocultos) |
| `ElementoMEPTipo` não tem `tubo` | mapa camada → tipo do contrato (`tubo_agua_fria`, `conduite`, …) |

## Validação
```
tsc (4 gates) → exit 0
node tests/run-all.mjs → 232 asserts, 0 falhas
   + esquadrias 18 · conflitos 11
```
Navegador: porta criada pela UI e **persistida no servidor** (`vao_el_solido_4_porta_300`),
planta com batentes, conflito real exibido (`parede-exemplo × mep_cruza`, 0,0034 m³).

## Limites declarados
- O vão é **paramétrico/contábil**: o sólido 3D **não é cortado** (sem booleana). Planta, orçamento
  e memorial enxergam o vão; o mesh continua fechado.
- MEP é criado por formulário; traçar tubo no canvas é Fase 2.
- Registro do incidente: o repositório foi trocado de branch por outro fluxo durante o lote
  (arquivos do app apagados e restaurados); o diff do outro agente foi salvo em `.tmp-arqdor/`.