# ARQ-UX-07 — Push/Pull mudo: evento de clique vazava como altura

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente · **validado em navegador** (dev :5183) · não promovido

## Sintoma relatado

"Push/Pull não estica em sólidos já convertidos em Parede BIM; o botão Aplicar não faz nada."
Hipótese do solicitante: a conversão paramétrica bloqueia a edição.

## Causa real (medida, não suposta)

**A conversão BIM não bloqueia nada.** Duas provas:

1. Código: `materializarSolidos` só emite `criar_elemento_bim` / `atualizar_elemento_bim` — **não muta o sólido**.
   `calcularPushPull` e o aplicador (`adicionar_vertices/arestas/faces`) não têm nenhuma regra de materialização.
2. Navegador: numa parede **recém-criada, sem converter**, o Aplicar também não fazia nada. O sintoma não era
   da conversão; a conversão só aconteceu antes na sua sessão.

O erro estava no Next dev overlay:

```
Runtime TypeError
(intermediate value)(intermediate value)(intermediate value).replace is not a function
src/arqdor/editor/EditorShell.tsx (446:57) @ aplicarPushPull
446 | const alturaNum = Number((alturaDigitada ?? altura).replace(',', '.'));
```

Causa: `onClick={props.aoAplicarPushPull}` entrega o **MouseEvent** como primeiro argumento da função, e
`aplicarPushPull(alturaDigitada?: string)` o tratava como a altura digitada → `.replace` estoura → o clique morre
em silêncio (nenhum aviso, nenhum estado alterado). Defeito pré-existente, anterior a este lote.

## Correção

| Arquivo | Mudança |
|---|---|
| `painel/PainelPropriedades.tsx` | `onClick={() => props.aoAplicarPushPull()}` — o evento não é mais repassado |
| `EditorShell.tsx` | `typeof alturaDigitada === 'string' ? alturaDigitada : altura` — defesa contra argumento não-texto |
| `modeladorcanvas/ModeladorCanvas.tsx` | duplo clique passou a ser detectado **por tempo** (2 cliques na mesma face com Push/Pull, 400 ms), não pelo evento nativo `dblclick` |
| `painel/PainelPropriedades.tsx` + `globals.css` | aviso âmbar `.arq-aviso-bim` para sólido já convertido |

### Por que troquei o evento nativo `dblclick`

O teste automatizado não conseguia validar o duplo clique: cliques sintéticos chegam com `clickCount=1` e o
Chrome não emite `dblclick`. Depender de um evento que não pode ser verificado é frágil também para mouse
rápido/touch. A detecção por tempo usa a mesma técnica já empregada na seleção por nível (1/2/3 cliques) e
passou a ser verificável.

## Aviso no painel (texto entregue)

> Este sólido já é um Elemento BIM. O Push/Pull altera a geometria do sólido; para refletir no modelo, clique
> em **Atualizar no BIM** depois. Atalho: duplo clique na face com o Push/Pull ativo abre o campo de medida.

**Não** usei o texto original ("use o Duplo Clique ou edite a altura no painel" como se o Push/Pull estivesse
bloqueado): ele ensinaria uma regra falsa. O aviso agora descreve a relação real — geometria do sólido ×
elemento do modelo — que é a perda de sincronia que o badge "BIM · Mobiliário" desatualizado expôs no teste.

## Validação em navegador (:5183)

| Passo | Resultado |
|---|---|
| Parede 4 × 2,8 × 0,15 criada | 8 vértices · 12 arestas · 6 faces |
| Push/Pull **sem** converter | "Push/Pull de 2.8 m aplicado" · 12 vértices · 20 arestas · 11 faces |
| Converter em **Parede BIM** | badge "BIM · Parede", seção Vãos |
| Push/Pull **após** converter | aviso âmbar visível · "Push/Pull de 2.8 m aplicado" |
| Duplo clique na face convertida | status "Face escolhida — digite a altura e Enter" · nível: face |
| Digitar `3,2` + Enter | "Push/Pull de 3.2 m aplicado" · 16 vértices · 28 arestas · 16 faces |

## Gates

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 329 asserts, 0 falhas
npx next build                      → exit 0
```

## Observação de ambiente

Para não tocar nos projetos do solicitante, o teste foi feito num projeto novo (**"Projeto 03/11/2026"**,
criado nesta sessão). Ele ficou no ambiente e pode ser apagado pela Lixeira. O navegador da sessão foi fechado.

## Pendências

1. Apagar o projeto de teste "Projeto 03/11/2026".
2. Promoção para produção (push em `main`) segue não executada.
