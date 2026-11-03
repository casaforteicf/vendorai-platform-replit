# ARQDOR-EDITOR-SKIN — v6 (pele premium do editor)

**Identificador:** ARQDOR-EDITOR-SKIN-v6
**Data de atualização:** 2026-11-03
**Branch:** `codex/arqdor-contracts-fix`
**Commits/PR:** nenhum ainda — alterações apenas no *working tree* (nada commitado, nada publicado)

---

## 1. Objetivo

Receber o layout base entregue pelo agente de design (DeepSeek, `EditorShell.tsx` em Tailwind) e aplicar a
**pele visual** no editor do Arqdor Studio **sem tocar na lógica do motor**: canvas, ferramentas, painéis,
atalhos, autosave e conversão BIM devem permanecer exatamente como estavam.

## 2. Escopo autorizado

Autorizado pelo solicitante nesta sessão:

- traduzir o visual do desenho (sidebar escura, topbar verde, inspetor premium) para o sistema de classes
  `arq-*` existente;
- **não** introduzir Tailwind;
- manter a lógica do canvas, das ferramentas, dos painéis e do autosave intacta;
- rodar `tsc --noEmit` e conferir os 320 testes do motor.

## 3. Decisão de integração (o que foi recusado e por quê)

A entrega do design **não foi colada literalmente**. Evidências coletadas antes de qualquer alteração:

| Verificação | Resultado |
|---|---|
| `tsc -p tsconfig.json --noEmit` (baseline) | exit **0** |
| `node tests/run-all.mjs` (baseline) | **320/320** em 16 suítes |
| Colar o arquivo como veio, com o import real | `error TS2614: Module ... has no exported member 'EditorShell'` (exit **2**) |
| Tailwind no `arqdor-studio` | **inexistente**: sem dependência, sem `tailwind.config.*`/`postcss.config.*`, sem `@tailwind` no `globals.css` |
| Imports do motor no arquivo entregue | **nenhum** — maquete estática, sem props/estado, textos fixos, botões sem `onClick` |

Conclusão registrada: substituir o arquivo literalmente deixaria os 320 testes verdes (eles cobrem módulos
puros, não o componente) e **mataria a página `/modelagem`** — sem canvas, ferramentas, camadas, autosave.
Falso positivo de gate automatizado; por isso a pele foi portada, não substituída.

## 4. Itens concluídos

- [x] Tokens de superfície escura criados **aditivamente** (`--arq-ed-base`, `--arq-ed-painel`, `--arq-ed-vazio`,
      `--arq-ed-tinta`, `--arq-ed-suave`, `--arq-ed-linha`); nenhum token existente foi alterado.
- [x] Skin escopada a `.arq-content:has(.arq-editor-page)` — dashboard e orçamento continuam claros.
- [x] Abas do editor com indicador mint; rail de ferramentas escuro com rótulos mint.
- [x] Viewport em `#07120F`; inspetor em `#0F1F1A` com cabeçalho "Inspetor".
- [x] Campos, botões, primário mint, perigo, badge BIM e checkboxes reestilizados **dentro** do inspetor.
- [x] Aba Conflitos escurecida (tabela, formulário, planta, MEP) no mesmo escopo.
- [x] Botão "Salvar" da topbar como primário mint (`arq-btn-salvar`).
- [x] Barra de status escura; cor do aviso trocada de `#52605a` (ilegível no escuro) para o token suave.
- [x] Divisaória inline `#e5e7eb` trocada pela classe `arq-sep`.

## 5. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `artifacts/arqdor-studio/src/app/globals.css` | +242 linhas: bloco "SKIN PREMIUM v6" escopado ao editor |
| `artifacts/arqdor-studio/src/arqdor/editor/EditorShell.tsx` | 9 linhas: classe do botão Salvar, cabeçalho do inspetor, divisória, cor do aviso |
| `artifacts/arqdor-studio/src/arqdor/editor/painel/PainelCamadas.tsx` | 2 linhas: `accentColor` do checkbox `#176d59` → `#00c896` |

Nenhuma linha de lógica, estado, handler, store, import ou assinatura foi alterada.

## 6. Testes / checks / build

| Gate | Resultado | Evidência |
|---|---|---|
| `npx tsc -p tsconfig.json --noEmit` | **exit 0** | executado antes e depois das mudanças |
| `node tests/run-all.mjs` | **320/320 passaram, 0 falharam** (16 suítes) | executado antes e depois; contagem por suíte re-somada: 29+23+28+16+19+26+21+28+13+18+11+19+17+14+31+7 = 320 |
| Validação visual da folha de estilo | **feita em harness estático** (DOM com os mesmos `arq-*`, `globals.css` real, Chromium) | 1 defeito encontrado e corrigido: `.arq-tool` dentro do inspetor herdava `--arq-texto` escuro → rótulos "Modos"/"Revelar todos"/"+" invisíveis no fundo escuro |
| `next build` | **não executado** | não solicitado neste lote; pendente antes de publicar |
| Validação em runtime (página real, WebGL) | **não executada** | exige projeto ativo (API + banco); indisponível nesta sessão |

## 7. Estado

**Implementado · validado tecnicamente · homologado visualmente pelo solicitante · não publicado**

Atualização de 2026-11-03 (fechamento do lote):

| Gate | Resultado |
|---|---|
| `npx next build` | **exit 0** — 9 rotas geradas, `/modelagem` 175 kB (primeira tentativa falhou em `spawn EPERM` por bloqueio de sandbox, não por código; repetida com permissão ampla e passou) |
| `tsc` + `tests/run-all.mjs` | exit 0 · **320/320** |
| Homologação | declarada pelo **solicitante** (validação visual própria). O agente não validou em runtime |

Registro canônico do lote passou a ser `docs/entregas/ARQ-UX-05.md` (padrão da casa `ARQ-UX-*`).
`doc-09-reconciliacao.md` **não existe no repositório** — é apenas citado como destino no anexo
`docs/arqdor/ARQDOR-STUDIO-2.0-RECONCILIACAO-BLOCO-0-V1.md`.

Separação de estados mantida: **homologado**, **não** promovido a produção (push em `main` não executado).

## 8. Pendências e decisões em aberto

1. **Decisão de UX (dono: design/DeepSeek):** o desenho não tem rail de ferramentas nem painel de camadas;
   a integração os manteve na posição atual (rail 168px, inspetor 320px). O desenho final precisa dizer onde
   eles vivem.
2. **Decisão estética:** a aba Conflitos foi escurecida por inferência (fica dentro do editor). Se o design
   quiser a "folha" clara ali, é uma linha de CSS para reverter.
3. **Modal de inserção (`ModalInserir`)** segue claro — é diálogo sobreposto e não foi escopado.
4. **Verificação em runtime** depende de projeto ativo; sem isso não há homologação visual da página real.
5. **`next build`** antes de qualquer promoção.

## 9. Impacto e dependências

- Impacto restrito ao app `arqdor-studio`; nada em `artifacts/api-server`, storage, deploy ou banco.
- Efeitos colaterais globais (fora do editor) limitados a refinos de marca já aprovados: borda da sidebar,
  borda inferior da topbar, foco do campo de busca, gradiente do avatar e cor do botão "Conversar" da Vendi IA.
- Reversível por CSS: revertendo `globals.css` + as 11 linhas de TSX o editor volta ao estado anterior.
