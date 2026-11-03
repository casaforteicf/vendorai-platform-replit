# ARQDOR STUDIO 2.0 — CONTRATO MOTOR ↔ UI

**Para:** DeepSeek (autor da interface nova)
**Data:** 2026-11-03
**Versão do motor:** Fase 1 concluída + Fase 2 (M1 materiais, M2 biblioteca, M3/C render, M4 IA) concluída
**Estado:** contrato fechado · motor validado com **610 asserts em 25 suítes** (`node tests/run-all.mjs`)

> Este documento é a fronteira entre o motor (pronto e testado) e a interface (a ser criada).
> Ele **não** descreve layout, cores nem componentes visuais: descreve **quem calcula o quê**.
> Se a UI respeitar as 5 regras da seção 1 e consumir as assinaturas da seção 3, ela não precisa
> conhecer nenhuma regra de geometria, orçamento ou histórico.

---

## 0. Como ler

- **Motor**: `artifacts/arqdor-studio/src/arqdor/editor/**` — funções puras (sem React, sem three).
- **Stores**: `src/arqdor/editor/stores/useModeladorStore.ts` e `useBIMStore.ts` — os **únicos** que escrevem.
- **UI**: tudo que o DeepSeek criar. Consome motor + stores, nunca o contrário.

---

## 1. As 5 regras do contrato

### Regra 1 — A UI não calcula geometria

A UI chama função pura e aplica o resultado como operação. Área, volume, normal, loop, offset,
interseção, quantitativo: **tudo vem do motor**.

```ts
// certo
const r = calcularPushPull(solido, faceId, 2.8);
if (r.ok) aplicarGeometria(r.operacoes, solido.id);

// errado — a UI não sabe o que é uma face nem como extrudar
setVertices([...meusVertices, ...calculadosNaTela]);
```

**Se violar:** o orçamento e o render divergem da cena; nenhum teste pega, porque o erro nasce na tela.

### Regra 2 — Toda ação é UM passo de histórico

Toda mutação entra no histórico como **um** `Passo` (`modelador` | `cross` | `mep`).
Ações da IA vêm de `executarPlano(...).passo` e são aplicadas por `aplicarPassoDaIA(passo)`.

> **Correção importante:** **não existe** campo `origem: 'humano' | 'ia'` no `transacao.ts`.
> A associação com a IA é feita por `TransacaoIA.passo`. Não invente esse campo na UI.

```ts
// certo
aplicarPassoDaIA(resultado.passo);   // resultado de executarPlano
// errado
for (const op of operacoes) store.aplicar([op]);  // N passos, undo quebrado
```

**Se violar:** Ctrl+Z desfaz meia ação (parede sobe e o material não volta, ou vice-versa).

### Regra 3 — A fonte da verdade é o documento

`DocumentoArqdor` (`versao` + `projeto` + `camadas` + `bim` + `modelador` + `mep`) é o que persiste
(`obterProjeto` / `salvarProjeto`). Estado de tela (seleção, câmera, painel aberto, ferramenta ativa)
**não** é documento e não deve ir para o save.

```ts
const documento: DocumentoArqdor = {
  versao: VERSAO_DOCUMENTO,
  projeto: { ...projeto, atualizadoEm: new Date().toISOString() },
  camadas: { camadas: ..., modos: ..., camadaAtivaId: ..., modoAtivoId: ... },
  bim: elementos,
  modelador: estadoModelador,
  mep,
};
```

**Se violar:** dois usuários com estados de tela diferentes geram documentos diferentes para a mesma obra.

### Regra 4 — Nenhum número mágico na UI

Passo de grade (`PASSO_GRADE = 0,05 m`), tolerâncias, espelho padrão de escada (0,18 m),
limites de render (2560 preview / 8192 final), banda de preço (0,5×–3×) e perdas padrão vivem no
motor. A UI só exibe e deixa editar.

**Se violar:** mudar a tolerância exige caçar constantes em componentes.

### Regra 5 — Erros são tipados; a UI traduz, não infere

Todo resultado de motor é união discriminada (`{ ok: true, ... } | { ok: false, erro: { codigo } }`).
A UI mapeia `codigo` → texto humano. Nunca tenta adivinhar a causa pelo texto.

| Código | Texto sugerido |
|---|---|
| `FACE_NAO_ENCONTRADA`, `FACE_DEGENERADA` | "Selecione uma face válida." |
| `OFFSET_COLAPSOU` | "Offset grande demais: encolheu até sumir." |
| `ALTURA_NULA` | "Informe uma altura diferente de zero." |
| `VAO_FORA_DA_PAREDE` | "O vão ultrapassa a parede." |
| `OPERACAO_NAO_SUPORTADA` | "A IA tentou uma ação que não existe." |
| `PROMPT_INSEGURO` | "Esta ação precisa da sua confirmação." |
| `LIMITE_TOKENS` | "Contexto grande demais para este modelo." |
| `API_INDISPONIVEL` | "Assistente indisponível agora." |

---

## 2. O que é documento, o que é estado de tela, o que é catálogo

| Dado | Onde vive | Persiste? | Quem escreve |
|---|---|---|---|
| geometria, materiais por elemento, camadas, MEP | `DocumentoArqdor` | sim | stores + `aplicarPassoDaIA` |
| seleção, ferramenta ativa, gizmo, câmera, painel aberto, aba | estado de UI (React) | **não** | a própria UI |
| catálogo de materiais (preço, PBR) | `materiais/catalogo.ts` | sim (fora do documento) | `adicionarMaterial`, `atualizarPrecoUnitario` |
| biblioteca de famílias | `biblioteca/familias.ts` | catálogo estático | ninguém em runtime |
| histórico (undo/redo) | memória (`Historico`) | não (D8) | stores |

> Preço de catálogo **não** tem `Passo` — é por isso que `definir_preco_material` exige confirmação
> humana e não é desfazível por Ctrl+Z. Se o dono quiser histórico de preço, é preciso um escopo
> `catalogo` no histórico (decisão de contrato).

---

## 3. Superfície do motor (o que a UI pode chamar)

### 3.1 Modelador — `modelador/`
| Export | Assinatura resumida | Uso na UI |
|---|---|---|
| `criarCaixa` | `({id, nome, posicao, dimensoes}) → {ok, solido}` | inserção por medidas |
| `interpretarMedida` | `(texto) → {tipo:'escalar'\|'dimensoes'\|'dimensoes3'\|'vazio'\|'invalido'}` | barra de medidas (`4;2,8;2` = largura; profundidade; altura) |
| `formatarMedida` | `(n) → "2,80 m"` | readouts |
| `calcularPushPull` | `(solido, faceId, altura) → {ok, operacoes}` | push/pull e grip |
| `offsetDaFace` | `(solido, faceId, distancia) → {ok, vertices, arestas}` | offset em qualquer face |
| `centroNormalDaFace` | `(solido, faceId) → {posicao, normal}\|null` | posicionar o grip |
| `resolverNivel` | `({solido, faceId, arestaId, altKey, shiftKey}) → {nivel, arestas, ids}` | 1 clique=face · Alt=loop · Alt+Shift=sólido |
| `loopDaFace` / `loopDeAresta` | `(solido, id) → string[]` | (usado por `resolverNivel`) |
| `criarTelhadoDuasAguas` | `({id, posicao, larguraX, profundidadeZ, altura, beiral?}) → {ok, solido}` | inserção |
| `criarEscadaReta` | `({id, posicao, largura, alturaTotal, profundidadeDegrau, numeroDegraus?}) → {ok, solido}` | inserção |
| `cortarVao` | `(parede, {offset, largura, altura, peitoril}) → {ok, solido}` | **efeito visual 3D** do vão (ADR-007) |

### 3.2 BIM — `bim/`
| Export | Assinatura | Uso |
|---|---|---|
| `classificarSolido` | `(solido, {projetoId, camadaId}) → {ok, classificacao}` | prévia "vai virar Parede/Laje/Telhado/Mobiliário" |
| `materializarSolidos` | `(solidos, {projetoId, camadaId}, existentes) → {ok, operacoes}` | converter sólido em elemento BIM |
| `abrirVao` | `(parede, 'porta'\|'janela', medidas, opcoes) → {ok, elemento}` | **fonte da verdade** do vão (orçamento/planta) |
| `derivar2d` | `(elementos) → Linha2D[]` | aba Planta 2D, incluindo `escada` |
| `objetoVisivel` | `(camadas, elemento) → boolean` | painel de camadas |
| `aplicarMaterialEmElemento` | `(elementos, elementoId, materialId) → {ok, elementos}` | tela de materiais |
| `aplicarMaterialEmFace` / `aplicarMaterialEmSolido` | `(solido, ...) → {ok, solido}` — módulo `materiais/aplicar.ts` | material por face |

> **ADR-007:** "Adicionar Porta" chama **os dois**: `abrirVao` (paramétrico, entra no orçamento e na
> planta) **e** `cortarVao` (malha 3D, só visual). Divergência entre eles é bug.

### 3.3 Orçamento e materiais — `orcamento/`, `materiais/`
| Export | Assinatura | Uso |
|---|---|---|
| `quantitativos` | `(elementos, opcoes?) → {itens, grupos, totalPorUnidade}` | agrupa por materialId + unidade; perda **não** se aplica a `un` |
| `custoDoQuantitativo` | `(grupos, catalogo) → {linhas, total, linhasSemPreco}` | tela de custo |
| `catalogoPadrao` / `obterMaterial` | `() → Catalogo` / `(catalogo, id) → Material` | tela de materiais |
| `atualizarPrecoUnitario` | `(catalogo, id, preco, fonte) → {ok, catalogo}` | edição de preço (imutável) |
| `itensDeCotacao` / `exportarParaCotacao` | `(grupos, catalogo) → ItemCotacao[]` / `(itens) → {csv, json}` | "Enviar para cotação" |
| `importarCotacao` | `(conteudo, catalogo) → {catalogo, atualizados, ignorados}` | upload da resposta do fornecedor |

### 3.4 Biblioteca — `biblioteca/`
| Export | Assinatura | Uso |
|---|---|---|
| `FAMILIAS_PADRAO` / `buscarFamilias` | `(familias, filtro) → FamiliaMovel[]` | tela de biblioteca |
| `colocarFamilia` | `({familia, posicao:[x,z], rotacaoGraus?, projetoId, camadaId, idSolido}) → {ok, solido, elemento}` | colocar móvel |
| `quantitativoMoveis` | `(elementos, familias) → GrupoFamilia[]` | lista de compras (sempre `un`) |
| `desvincularSolido` / `vincularSolido` | `(elemento) → elemento` | ADR-003 (vínculo opcional) |

### 3.5 Render — `render/`
| Export | Assinatura | Uso |
|---|---|---|
| `criarPedidoRender` | `({projetoId, documento, camera, qualidade, resolucao}) → {ok, pedido}` | montar pedido |
| `fingerprintDocumento` | `(documento) → string` | carimbo de versão |
| `criarClienteRender` | `(transporte, opcoes?) → {enfileirar, consultar, aguardar}` | fila com timeout |
| `TransporteRender` | interface `{enviar, consultar}` | adaptador do worker legado (Contabo) |

### 3.6 IA — `ia/`
| Export | Assinatura | Uso |
|---|---|---|
| `resumirDocumento` | `({modelador, elementos, catalogo, familias}) → {texto, contagens, materiais}` | contexto do prompt (≤600 chars) |
| `montarMensagens` | `({contexto, pergunta, instrucoes?}) → MensagemModelo[]` | chat |
| `conversarComModelo` | `(config, mensagens) → {texto, toolCalls, uso}` | chamada DeepSeek (fetch injetado) |
| `definicoesFerramentas` | `() → DefinicaoToolModelo[]` | tool calling (6 ferramentas) |
| `executarPlano` | `(plano, estadoIa, {confirmado?, maxOperacoes?}) → {passo, estado, efeitos}` | valida e monta UM passo |
| `aplicarPassoDaIA` | `(passo) → {ok, aplicado}` | **única** escrita da IA |

### 3.7 MEP — `mep/`
| Export | Assinatura | Uso |
|---|---|---|
| `rotearTubo` | `({de, para, diametroMm, camada, opcoes, obstaculos?}) → {caminho, celulasVisitadas} \| null` | rota de tubo (A* 2D por camada) — sem tela nesta fase |

> O escopo `mep` ainda não tem aplicador na ponte da IA: nenhuma tela deve tentar aplicar um passo de
> IA que toque MEP (`ESCOPO_NAO_SUPORTADO`).

---

## 4. Componentes que o DeepSeek deve criar

Para cada um: responsabilidade, o que consome, o que **não** pode fazer e critério de aceite.

### 4.1 `EditorShell` — layout imersivo
- **Responsável:** moldura da tela de modelagem, ciclo de vida do documento (carregar, autosave, aviso de estado).
- **Consome:** `obterProjeto`, `salvarProjeto`, `DocumentoArqdor`, `VERSAO_DOCUMENTO`, `useModeladorStore`, `useBIMStore`.
- **Não pode:** guardar geometria em state React; salvar estado de tela no documento; calcular área.
- **Aceite:** abrir projeto, editar, recarregar e reencontrar o mesmo documento; autosave com debounce; sidebar ausente no editor (modo imersão) com retorno ao dashboard.

### 4.2 Barra de Ferramentas (rail)
- **Responsável:** 11 ferramentas (Selecionar, Linha, Retângulo, Círculo, Arco, Push/Pull, Mover, Rotacionar, Escalar, Offset, Excluir) + undo/redo.
- **Consome:** `FerramentaModelador`, `resolverAtalho` (Espaço/L/R/C/A/P/M/Q/S/F/E/Ctrl+Z), `setFerramenta`, `setGizmo`, `desfazer`, `refazer`.
- **Não pode:** implementar atalho próprio (duplicaria regra); habilitar desenho sem sólido quando a ferramenta exige.
- **Aceite:** tecla troca a ferramenta e o estado ativo acompanha; undo/redo habilitado só quando há histórico.

### 4.3 Painel de Propriedades
- **Responsável:** nome, posição/escala, prévia BIM, push/pull, offset, booleanas, vãos.
- **Consome:** `classificarSolido` (prévia), `materializarSolidos`, `calcularPushPull`, `offsetDaFace`, `gerarOpMover/Rotacionar/Escalar`, e `aplicar(operacoes)` do `useModeladorStore` (a validação prévia com `aplicarPasso` é opcional).
- **Não pode:** converter sólido sem `projetoId`/`camadaId`; mostrar "conversível" sem a classificação do motor.
- **Aceite:** prévia idêntica à classificação real; conversão gera **um** passo; sólido já BIM mostra "Atualizar no BIM".

### 4.4 Barra de Medidas
- **Responsável:** input flutuante que substitui o mouse (`2,8` · `3x4` · `4;2,8;2`).
- **Consome:** `interpretarMedida`, `formatarMedida`; aplica via push/pull, retângulo ou criação de caixa (3 valores).
- **Não pode:** interpretar o texto por conta própria; focar o campo quando o usuário aperta Espaço (rouba os atalhos).
- **Aceite:** `R` + `4;2,8;2` cria caixa 4×2,8×2; medida inválida mostra erro do motor sem criar nada.

### 4.5 Painel de Camadas
- **Responsável:** modos, visibilidade por camada, criar/remover camada, revelar todos.
- **Consome:** `EstadoCamadas`, `objetoVisivel`, ações do `useBIMStore`.
- **Não pode:** filtrar elemento por conta própria (visibilidade é do motor).
- **Aceite:** desligar camada esconde no 3D **e** na planta 2D; camada padrão não pode ser removida.

### 4.6 Tela de Materiais (M1)
- **Responsável:** catálogo, preço editável, fonte do preço (SINAPI/PROPRIO/COTACAO), aplicar material, cotação.
- **Consome:** `catalogoPadrao`, `atualizarPrecoUnitario`, `aplicarMaterialEmElemento`, `custoDoQuantitativo`, `itensDeCotacao`, `exportarParaCotacao`, `importarCotacao`.
- **Não pode:** mutar o catálogo em memória; recalcular custo na tela; importar planilha sem mostrar `ignorados`.
- **Aceite:** editar preço grava com fonte correta; CSV de cotação abre no Excel pt-BR; importação aplica preço e lista linhas ignoradas com motivo.

### 4.7 Tela de Biblioteca (M2)
- **Responsável:** navegar famílias, filtrar, colocar móvel no projeto.
- **Consome:** `FAMILIAS_PADRAO`, `buscarFamilias`, `colocarFamilia`, `quantitativoMoveis`.
- **Não pode:** criar o sólido à mão; criar FK rígida com `ElementoBim` (ADR-003).
- **Aceite:** colocar 3 cadeiras e 1 mesa → quantitativo "3 un / 1 un"; remover o sólido mantém o elemento com dimensões.

### 4.8 Tela de Render (C)
- **Responsável:** escolher câmera/qualidade/resolução, enfileirar, acompanhar estado, abrir imagem.
- **Consome:** `criarPedidoRender` (com fingerprint), `criarClienteRender`, `TransporteRender`.
- **Não pode:** chamar `fetch` direto do worker; renderizar sem `documentoHash`; tratar "pronto sem URL" como sucesso.
- **Aceite:** mudar a parede invalida o pedido anterior (hash muda); timeout e falha têm mensagem própria; URL de imagem é presignada (R2).

### 4.9 Tela de Chat IA (M4)
- **Responsável:** pergunta → contexto → modelo → ferramentas → passo → confirmação → aplicação.
- **Consome:** `resumirDocumento`, `montarMensagens`, `conversarComModelo`, `executarPlano`, `aplicarPassoDaIA`, `definicoesFerramentas`.
- **Não pode:** aplicar `ToolCall` sem passar pelo `executarPlano`; executar ferramenta não reversível sem `confirmado: true`; escrever no store fora de `aplicarPassoDaIA`.
- **Aceite:** pedido que falha na 2ª ferramenta **não altera nada**; ação não reversível pede confirmação; toda ação da IA vira **um** Ctrl+Z.

---

## 5. Fluxos que a UI precisa fechar (com a ordem exata das chamadas)

**Criar parede por coordenadas**
`interpretarMedida("4;2,8;0,15")` → `criarCaixa` → `aplicar([{tipo:'criar_solido', solido}])`.

**Push/Pull com medida digitada**
`calcularPushPull(solido, faceId, 2,8)` → `aplicar(operacoes)` → se o sólido já é BIM: `materializarSolidos`
+ `aplicarBim` (a UI atual faz isso em `aplicarGeometria`).

**Adicionar porta (ADR-007 — os dois)**
`abrirVao(parede, 'porta', medidas, {projetoId, camadaId})` → `aplicarBim([{tipo:'criar_elemento_bim', ...}])`
**e** `cortarVao(solidoDaParede, medidas)` → aplicar como geometria do sólido.
Orçamento/planta leem o primeiro; a cena 3D mostra o segundo.

**Aplicar material**
`aplicarMaterialEmElemento(elementos, id, materialId)` → `aplicarBim([{tipo:'atualizar_elemento_bim', antes, depois}])`.

**Colocar móvel**
`colocarFamilia({...})` → `aplicar` do sólido **e** `aplicarBim` do elemento — ou `executarPlano` com
`colocar_movel`, que monta um passo cross na ordem correta.

**Cotação**
`quantitativos(elementos)` → `itensDeCotacao(grupos, catalogo)` → `exportarParaCotacao(itens)` →
download do CSV. Importação: `importarCotacao(csv, catalogo)` → novo catálogo + `ignorados` na tela.

**Render**
`criarPedidoRender({documento, camera, ...})` → `cliente.enfileirar(pedido)` → `cliente.aguardar(jobId)` →
exibir `url`.

**Chat IA**
`resumirDocumento(...)` → `montarMensagens` → `conversarComModelo` → se `toolCalls.length > 0`:
`executarPlano(plano, estadoIa)` → se houver ferramenta não reversível, pedir confirmação e repetir com
`confirmado: true` → `aplicarPassoDaIA(passo)`.

---

## 6. Checklist de aceite da UI

- [ ] nenhum cálculo de área/volume/normal/quantitativo no código de UI;
- [ ] toda mutação passa por **um** passo (verificável com Ctrl+Z);
- [ ] documento salvo não contém seleção/câmera/painel;
- [ ] constantes de domínio importadas do motor;
- [ ] todo `erro.codigo` tem tradução; nenhuma mensagem inventada a partir do texto;
- [ ] porta chama `abrirVao` **e** `cortarVao`;
- [ ] chat aplica somente via `aplicarPassoDaIA` e pede confirmação no que não é reversível;
- [ ] tela de materiais mostra `ignorados` da importação;
- [ ] render usa `documentoHash` e trata `SEM_URL`/`TIMEOUT`/`FALHOU`.

---

## 7. Anti-padrões (já custaram defeito neste repositório)

1. **Guardar geometria em state React** — a cena e o documento divergem.
2. **Undo por operação** — Ctrl+Z desfaz metade da ação.
3. **Duplicar atalhos na UI** — duas fontes de verdade para tecla (já causou Espaço roubando foco da barra de medidas).
4. **Recalcular custo na tela** — `quantidade × preço` é do motor (`custoDoQuantitativo`), inclusive a flag `semPreco`.
5. **Confiar no primeiro teste verde** — o runner importa `.check-out` compilado; testar sem recompilar valida código velho.
6. **Rodar `next build` com `next dev` ativo** — corrompe `.next` (aconteceu duas vezes).

---

## 8. Pendências conhecidas (o que a UI deve contornar)

| Pendência | Efeito na UI |
|---|---|
| escopos `mep` e `moveis` sem aplicador na ponte | passo da IA com MEP → `ESCOPO_NAO_SUPORTADO` (mostrar erro, não tentar aplicar) |
| preço de catálogo sem histórico | avisar "não desfazível" antes de confirmar |
| transporte de render sem endpoint configurado | tela precisa tratar `API_INDISPONIVEL`/`FALHA_ENVIO` |
| materialização sólido→BIM não reconhece escada por classificação | escada entra no BIM pelos parâmetros (`GeometriaEscada`), não por "converter sólido" |
