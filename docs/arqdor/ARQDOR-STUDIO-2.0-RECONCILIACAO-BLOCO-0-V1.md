# ARQDOR STUDIO 2.0 — RECONCILIAÇÃO DO BLOCO 0 (CONTRATOS) — V1.0

| Campo | Valor |
|---|---|
| Data | 2026-11-02 |
| Branch | `codex/arqdor-contracts-fix` |
| Commit de referência | `e486e3307` (contratos) + commit dos testes negativos |
| Estado | **Contratos fechados** (`validado tecnicamente` no escopo de tipos). **Código dos Blocos 1–4: ausente.** |
| Bloco 0 | **Fechado na parte de contratos. Aberto na parte de código.** |

> Este anexo é o registro que alimenta o `doc-09-reconciliacao.md` (§9.3/§9.4).
> Ele não substitui o documento do DeepSeek; fixa o que foi decidido e provado.

---

## 1. Verificação (comando e resultado)

```
node node_modules/typescript/bin/tsc -p artifacts/arqdor-studio/tsconfig.contracts.json
→ exit 0

node node_modules/typescript/bin/tsc -p artifacts/arqdor-studio/tsconfig.contracts-tests.json
→ exit 0
```

Rodado **no conteúdo publicado do branch**, em worktree limpo (não no diretório de trabalho do agente).
TypeScript 5.9.3, `--strict`, `noUnusedLocals`, `noImplicitReturns`.

---

## 2. ADRs desta etapa (decisões do dono, aplicadas)

| ADR | Decisão | Consequência no código |
|---|---|---|
| **ADR-001** | Furo de MEP é **abertura paramétrica** da parede, não booleana | `AberturaFuro` em `GeometriaParede.aberturas[]`; `OperacaoAdicionarAbertura` no BIM; `criar_furo` removido do MEP |
| **ADR-002** | Histórico **único e global** (Transaction Log), passo cross-store atômico | `Passo = PassoModelador \| PassoMEP \| PassoCrossStore`; `PassoCrossStore.ordem` explícita |
| **ADR-003** | Móvel é dono do **vínculo**, não do elemento BIM | `remover_movel` zera `modeladorSolidoId`; `ElementoBim` permanece (orçamento/render preservados) |
| **ADR-004** | Sólido B **consumido** na booleana; resultado **herda o id de A** | `depois.removidos = [antes.solidoB]`; A é substituído no lugar (referências externas intactas) |
| **ADR-005** | `mergeCoplanares` mantido (E10) | `Face.triangulada?`; `TOLERANCIA_COPLANARIDADE_GRAUS = 0.5` |
| **ADR-006** | Roteamento **2D por camada** (E12) | `OpcoesRoteamento` (passo 0,10 m, teto 250 mil células); `RoteadorTubo` |
| **ADR-007** | Auth do Studio = **Vendor.ai** (`auth.users`, `arch_clientes` centrais) | Nenhuma tabela de identidade nova no Studio |
| **ADR-008** | **Entrega v2 do DeepSeek rejeitada** (ver §4) | Branch preservado em `e486e3307` |

---

## 3. Correções aplicadas (E1–E6, E8–E18)

| ID | Correção | Prova |
|---|---|---|
| E1 | `SnapResultado` com `tipo` **correlacionado** à `referencia`; variante de interseção existe | teste negativo `r3a`–`r3c` |
| E2 | `CalcularSnap` devolve `SnapResultado \| null` | compila `() => null` |
| E3 | `InserirProdutoResultado` discriminado (`ok:true` carrega os ids) | teste negativo em `negativos.test-d.ts` |
| E4 | `ResultadoIA.passo: Passo \| null` (memorial não tem undo) | probe positivo |
| E5 | `Passo` união discriminada por `escopo` | teste negativo `r1b`–`r1d` |
| E6 | `PassoUndoMEP = OperacaoMEP[]` explícito | compila |
| E8 | móvel dono do vínculo (ADR-003) | `r1`–`r2` do lote anterior |
| E9 | B consumido, resultado herda id de A (ADR-004) | `r2d` |
| E10 | mergeCoplanares (ADR-005) | — |
| E11 | abertura paramétrica (ADR-001) | `r3` do lote anterior |
| E12 | roteamento 2D (ADR-006) | — |
| E13 | WebCodecs primário; MediaRecorder como fallback declarado | — |
| E14 | `maxFramesEmVoo` + `emVoo`/`drenar()` (modelo de memória explícito) | — |
| E15 | portal: `tokenHash` + sessão, `autorId`, aprovação com pessoa + hash da versão | — |
| E16 | `DiagnosticoMovel` derivado (nunca persistido) | — |
| E17 | `AprovacaoEstrutural` (CREA + hash do cálculo) no lugar do boolean | — |
| E18 | `porta`/`janela` preservados; `esquadria` virou categoria | — |

---

## 4. Entrega v2 rejeitada — por quê (evidência)

A v2 compila (`exit 0`), mas **compila porque afrouxa**. Três buracos reabertos, provados:

| ID | Afrouxamento | Prova |
|---|---|---|
| **R1** | `OperacaoBIM = { tipo: string } & Record<string, unknown>` — aceita qualquer objeto | `PassoUndo = [{ tipo: 'qualquer_coisa', foo: 1 }]` compila |
| **R2** | `remover_solido { solidoId }`, `remover_faces { faceIds }` — sem snapshot | `op.solido` → `TS2551: Did you mean 'solidoId'?` (o dado não existe) |
| **R3** | `SnapResultado.tipo` e `.referencia` desacoplados | `tipo:'vertice'` + referência de interseção compila |

Arquivo de referência: `docs/arqdor/recebido-deepseek-20261102/contratos-v2-deepseek.ts` (transcrição fiel).
Também reabria `TransacaoIA.store` singular (contra ADR-002) e punha abertura dentro de `OperacaoMEP` (contra ADR-001).

---

## 5. Guardas permanentes (contra regressão futura)

`artifacts/arqdor-studio/tests/contracts/negativos.test-d.ts` — cada `@ts-expect-error` é uma assertiva:
se a linha voltar a compilar, o TS acusa **TS2578** e o build quebra.

Cobrem: **R1** (histórico não aceita lixo nem escopo inventado), **R2** (remoção exige snapshot;
`removidos` nunca `string[]`), **R3** (correlação tipo↔referência) e **Regra 6** (`GuardaAntiAny`
sobre `Passo`, `OperacaoBIM`, `OperacaoModelador`, `SnapResultado`, `Solido`, `AplicarPasso`).

Escopo da regra 6: `@ts-expect-error` é **proibido em `src/**`** (produção) e **permitido em `tests/contracts/**`**,
onde é o mecanismo da assertiva — documentado no cabeçalho do próprio arquivo.

Prova de que a guarda funciona (tipo afrouxado de propósito):

```
_prova-guarda.ts(6,1):  error TS2578: Unused '@ts-expect-error' directive.
_prova-guarda.ts(10,35): error TS2344: Type 'true' does not satisfy the constraint 'false'.
```

---

## 6. Estado do Bloco 0

| Parte | Situação |
|---|---|
| Contratos (tipos, uniões, erros) | **fechado** — `tsc` verde + testes negativos |
| Código dos Blocos 1–4 (schema, store, push-pull, gizmo) | **ausente** — perdeu-se com o Replit |
| Reconciliar spec × código (R1–R4 do doc-09) | **não iniciado** — depende do item acima |

Enquanto o código base não existir, `estado máximo = especificado` para os 14 documentos.
Contratos verdes **não** são implementação verde.
---

## 7. Defeitos descobertos ao IMPLEMENTAR (D1–D4)

Contratos que pareciam corretos na leitura e só quebraram quando o código foi escrito.
Nenhum destes seria pego por typecheck ou pela suíte negativa — os tipos aceitam as duas coisas;
o que eles não permitem é **desfazer** ou **decidir**.

| ID | Onde | Defeito | Correção aplicada no código |
|---|---|---|---|
| **D1** | `OperacaoMaterial` | `depois: MaterialFace \| undefined` — **não invertível**. Pintar N faces com materiais diferentes: a inversa precisa restaurar N valores, e o tipo só guarda um | `depois` virou `(MaterialFace \| undefined)[]`, na mesma ordem de `faceIds` |
| **D2** | `OperacaoModelador` | `criar_vertice` / `criar_aresta` / `criar_face` **não têm `solidoId`** — são operações sem contexto de sólido; o store não sabe onde aplicar | rejeitadas com `OPERACAO_FORA_DE_CONTEXTO`; se forem usadas, o contrato precisa de `solidoId` |
| **D3** | `hitTest` (implementação) | `pontoNoRaio` com fórmula invertida (`sub(scale(dir,-d), scale(origem,-1))`) | `add(origem, scale(dir, d))` |
| **D4** | `Camada` × `ModoVisualizacao` | **duas verdades de visibilidade**: `camada.visivel` e `modo.camadasVisiveis` podiam divergir sem ninguém notar | fonte única = `camada.visivel`; modo é **preset** que reescreve as flags; toggle manual desmarca o modo (`modoAtivoId = null`) |

**O que o DeepSeek precisa atualizar na documentação:**

1. `OperacaoMaterial.depois` passa a ser array (Bloco 7).
2. `criar_vertice`/`criar_aresta`/`criar_face` ganham `solidoId` **ou** são declaradas como operações internas de construção (nunca aplicadas direto no estado).
3. Doc de camadas (Bloco 4) precisa dizer que o modo é preset e que o toggle manual sai do preset.
4. `Removidos` da booleana continua `Solido[]` (snapshot) — divergência com a v3 **mantida de propósito**.
### 7.1 Addendum — D5 (mobiliário sem posição) e instrução D4 para a doc

| ID | Onde | Defeito | Correção |
|---|---|---|---|
| **D5** | `GeometriaMobiliario` | só tinha `dimensiones`; **sem `posicao` nem rotação** não há como desenhar o móvel em planta — o `derivar2d` não saberia onde | adicionados `posicao?: [number, number]` e `rotacaoGraus?: number` (opcionais, retrocompatível). Sem `posicao`, o móvel **não é derivado** (declarado, não silencioso) |

**Instrução específica para o DeepSeek (D4):** o documento de camadas precisa trocar o tipo
`modoAtivoId: string` por `modoAtivoId: string | null` e explicar que:

1. `camada.visivel` é a **fonte única** de visibilidade;
2. `ModoVisualizacao` é **preset**: aplicar reescreve as flags de todas as camadas;
3. alternar um checkbox manualmente seta `modoAtivoId = null` (a UI mostra "custom").

Sem isso, a UI vai reintroduzir o estado inconsistente que o D4 fechou.
### 7.2 Addendum — D6 (material do elemento) e o que o orçamento exige

| ID | Onde | Defeito | Correção |
|---|---|---|---|
| **D6** | `ElementoBim` | não tinha `materialId`. O Pilar 4 precisa **agrupar por material**, e o material não existia em lugar nenhum do BIM Core (só nas geometrias do rascunho v3) | `materialId?: string` no `ElementoBim` (opcional, retrocompatível). Sem ele, `quantitativos()` agrupa por categoria — e o orçamento perde a distinção entre dois revestimentos |

**Instrução para o DeepSeek (Pilar 4):** o documento de quantitativos precisa declarar que

1. a unidade (`m2`, `m3`, `un`) faz parte da **chave de agrupamento** — 10 m² e 3 m³ do mesmo material nunca somam;
2. o coeficiente de perda tem três níveis de precedência: **material > categoria > padrão**;
3. o código Praça.ai é resolvido por **materialId quando existir**, senão por categoria, e cai em `PRC-INDEFINIDO` quando não há mapeamento (nunca lança);
4. a banda de sanidade do preço cotado é **0,5× a 3×** a referência, com motivo tipado (`ABAIXO_DO_PISO`/`ACIMA_DO_TETO`).
### 7.3 Addendum — D7 (nível sem altura) na compatibilização

| ID | Onde | Defeito | Correção / decisão |
|---|---|---|---|
| **D7** | `ElementoBim.nivel` | é um **inteiro sem cota**. Para detectar choque vertical (tubo × laje do pavimento superior) é preciso saber a altura do nível — que não existe no contrato | no MVP a cota é **estimada** (`nivel × alturaNivelPadraoM`, padrão 3,00 m), parâmetro explícito em `OpcoesColisao`. Documentado como limitação no próprio memorial (seção 5) |

**Instrução para o DeepSeek (compatibilização):** o documento do Bloco 17 precisa declarar

1. que a cota do nível é **estimada** até existir `alturaNivel` no BIM Core (evita prometer precisão vertical);
2. que o contato intencional (tomada/interruptor ancorado na própria parede) é **ignorado com motivo**, não descartado em silêncio;
3. que a margem padrão é **5 cm** e que o resultado vem **ordenado por volume de interseção** (o pedreiro resolve o maior primeiro);
4. que AABB é aproximação do MVP e o SAT entra quando houver falso positivo confirmado (D11).
### 7.4 Addendum — D8 (arco de 3 pontos perdia o terceiro clique)

| ID | Onde | Defeito | Correção |
|---|---|---|---|
| **D8** | `desenho.ts` | a máquina tinha fases fixas (`ocioso`/`um_ponto`/`dois_pontos`). No arco, o **terceiro clique sobrescrevia o segundo** e o ponto C nunca chegava ao `criarArco` — o arco por 3 pontos era inalcançável pela UI | `EstadoDesenho` passou a guardar `pontos: Vetor3[]`; a quantidade vem de `cliquesNecessarios(ferramenta)`. O teste de `desenho` que faltava é o que teria pego isso |

Lição registrada: o defeito sobreviveu a 141 asserções porque **nenhuma delas exercitava o fluxo de cliques** —
só a função `criarArco` isolada. Ligar a UI foi o teste que faltava.