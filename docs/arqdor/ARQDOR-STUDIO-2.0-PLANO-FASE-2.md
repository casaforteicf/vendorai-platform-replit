# ARQDOR STUDIO 2.0 — PLANO DA FASE 2

**Objetivo:** Materiais · IA · Render · Biblioteca de Interiores
**Data:** 2026-11-03
**Status:** planejamento (nada implementado nesta fase)
**Fase 1:** concluída — `docs/entregas/ARQ-MOTOR-FASE1.md` (389 asserts)

> Regra desta fase: **a UI será refeita do zero pelo DeepSeek**. Nada aqui depende do layout atual.
> O que esta fase entrega é **motor + contrato**. A integração visual entra depois, contra os
> contratos definidos aqui.

---

## 0. Decisões herdadas (fechadas pelo dono)

### ADR-007 — Vão: paramétrico **e** cortador de malha (2026-11-03)

| | |
|---|---|
| **Decisão** | Manter os dois caminhos, com papéis distintos |
| **Fonte da verdade** | `esquadrias.abrirVao` → `GeometriaParede.aberturas[]` — alimenta **orçamento** e **planta 2D** |
| **Efeito visual 3D** | `vao-booleano.cortarVao` — só malha, não entra em quantitativo |
| **Fluxo na UI nova** | "Adicionar Porta" chama **os dois** numa única ação: registra a abertura e corta o mesh |
| **Consequência** | Divergência entre os dois é bug de integração, não escolha de projeto. Precisa de teste que compare área/posição da abertura paramétrica com o furo do mesh |

Risco registrado: duas representações do mesmo furo podem divergir silenciosamente (abertura movida
no paramétrico e mesh antigo). Mitigação obrigatória: **teste de coerência** e um `reconciliarVaos()`
que reaplica os cortes a partir de `aberturas[]`.

---

## 1. Estado de partida (o que já existe de verdade)

| Bloco | Já existe | Falta |
|---|---|---|
| **Materiais** | `ElementoBim.materialId?` (opcional, retrocompatível — addendum D6); `MaterialFace` no modelador (materialId, escala, rotação, offset) | catálogo de materiais; aplicar/editar na UI; precedência de perda; mapa material → PBR no render |
| **Orçamento** | `orcamento/quantitativos.ts` + `schema.ts`; agrupamento por material quando `materialId` existe | custo por material (hoje há referência por categoria); composição (material + mão de obra) |
| **Biblioteca** | `moveis/schema.ts`; `TipoElemento = 'mobiliario'`; quantitativo de mobiliário | catálogo de famílias; colocação paramétrica; LOD; vínculo móvel ↔ elemento BIM (ADR-003 já decidiu quem é dono) |
| **Render** | worker de render na Contabo (puppeteer) + `docs/arqdor-render-*.md` (v06, physical bridge/BVH, version contract); `viewport3d/` com three | contrato de job do Studio → worker; storage R2 assinado; estados de job na UI nova |
| **IA** | "Vendi IA" na casca (hoje só um cartão) | camada de ferramentas (tool calling) sobre os motores; contexto do documento; guardrails |

Lacuna detectada agora: **`TipoElemento` não tem `escada`**. A escada existe como sólido do modelador
(Bloco 4), mas não como elemento BIM — logo não entra em quantitativo nem em planta. Decidir na Fase 2.

---

## 2. Frente A — Materiais

**Meta:** material como dado de engenharia, não como cor. `materialId` atravessa sólido → elemento BIM →
quantitativo → render.

### Contrato proposto
```ts
interface Material {
  id: string;
  nome: string;
  categoria: 'alvenaria' | 'acabamento' | 'estrutura' | 'cobertura' | 'esquadria' | 'mobiliario';
  unidade: 'm2' | 'm3' | 'un' | 'm';
  /** Perda/fator por material — precede categoria e padrão (D6 §7.2). */
  perda?: number;
  /** Referência de preço (Praça.ai) e banda de sanidade 0,5×–3× (D6). */
  precoReferencia?: number;
  codigoPraca?: string;
  /** Aparência para o render — nunca usada pelo orçamento. */
  pbr?: { cor: string; rugosidade: number; metalico: number; texturaId?: string };
}
```

### Entregas
1. `materiais/catalogo.ts` — CRUD em memória + fallback `MATERIAL_INDEFINIDO` (nunca lança).
2. `materiais/aplicar.ts` — aplicar material por **elemento** e por **face** (o modelador já tem `MaterialFace`), com regra: face > elemento > categoria.
3. Precedência de perda: material > categoria > padrão (fechada em D6).
4. Teste de propagação: mudar material de uma parede altera o quantitativo e **não** altera a geometria.

### Critérios de aceite
- `quantitativos()` agrupa por `materialId` + unidade (nunca somar m² com m³).
- Elemento sem material cai em `PRC-INDEFINIDO` e continua orçável.

---

## 3. Frente B — IA (Vendi IA)

**Meta:** assistente que **opera o motor por ferramentas**, não que "descreve" o projeto.

### Contrato proposto
```ts
interface FerramentaIA {
  nome: string;                      // 'criar_parede', 'aplicar_material', 'rotear_tubo'…
  descricao: string;                 // para o modelo
  esquema: JSONSchema;               // parâmetros
  executar: (args: unknown) => ResultadoFerramenta;  // SEMPRE contra motor puro
  reversivel: boolean;               // entra no histórico global (ADR-002)
}
```
Regras de projeto:
- Toda ferramenta chama **motor puro** já testado (`criarCaixa`, `cortarVao`, `rotearTubo`, `offsetDaFace`…).
  A IA nunca escreve estado direto no store.
- Toda ação da IA é um **passo de undo** identificado (`origem: 'ia'`), para o arquiteto desfazer em bloco.
- Sem chamada a serviço pago novo sem alinhamento (regra do repositório).
- Guardrails: limite de operações por turno, confirmação humana para remoção em lote, e recusa explícita
  quando a ferramenta não existe (nada de "achei que fiz").

### Entregas
1. `ia/ferramentas.ts` — registro de ferramentas espelhando os motores da Fase 1/2.
2. `ia/contexto.ts` — resumo do documento (contagens, cômodos, materiais) enxuto o suficiente para caber no prompt.
3. `ia/executor.ts` — aplica N operações como um passo, com rollback total se qualquer uma falhar.
4. Teste: plano com 3 operações onde a 3ª falha → **nada** muda no estado.

---

## 4. Frente C — Render

**Meta:** o Studio pede um render e recebe imagem, sem conhecer a infraestrutura.

### Contrato proposto
```ts
interface PedidoRender {
  projetoId: string;
  documentoHash: string;             // versão imutável do documento (version contract)
  camera: { posicao: Vetor3; alvo: Vetor3; fov: number };
  qualidade: 'preview' | 'final';
  resolucao: { largura: number; altura: number };
}
type EstadoRender = 'na_fila' | 'processando' | 'pronto' | 'falhou';
```

### Restrições reais do ambiente
- `GitHub Actions` está **bloqueado** (billing) — nada de pipeline por Actions.
- Deploy e homologação acontecem na Contabo; produção não é ambiente de teste.
- Arquivos vivem no **R2** (bucket privado) — URL de imagem é **presignada com TTL**, nunca pública.
- Existe worker de render legado em produção (`vendorai-prod-browser`); reutilizar antes de criar outro.

### Entregas
1. `render/pedido.ts` — monta o pedido a partir do documento (hash + câmera + qualidade).
2. `render/cliente.ts` — enfileira e consulta estado (contrato com o worker existente).
3. Teste de contrato: hash do documento muda ⇒ pedido muda (evita render de versão velha).

**Fora de escopo:** trocar o motor de render. A Fase 2 integra o que existe.

---

## 5. Frente D — Biblioteca de Interiores

**Meta:** móvel com identidade própria, sem virar elemento BIM (ADR-003: o móvel é dono do vínculo).

### Contrato proposto
```ts
interface FamiliaMovel {
  id: string;
  nome: string;
  categoria: 'assento' | 'mesa' | 'armario' | 'cama' | 'eletro' | 'decor';
  dimensoes: { largura: number; profundidade: number; altura: number };
  /** LOD: caixa para preview, malha completa só no render. */
  lod: { simples: 'caixa'; detalhado?: string /* assetId no R2 */ };
  materialPadraoId?: string;
}
```
### Entregas
1. `biblioteca/familias.ts` — catálogo + busca por categoria/dimensão.
2. `biblioteca/colocar.ts` — coloca família no ponto/sentido, gerando `Solido` (modelador) e vínculo com
   `ElementoBim` de mobiliário (ADR-003: remover o móvel zera o vínculo, o elemento permanece).
3. Quantitativo: móvel entra como `un` (nunca m²), agrupado por família.
4. Teste: colocar 3 cadeiras e remover 1 → quantitativo = 2, elemento BIM preservado.

---

## 6. Contrato motor ↔ UI nova (o que o DeepSeek precisa saber)

1. **A UI não calcula geometria.** Ela chama funções puras e aplica o resultado como passo de undo.
2. **Toda ação é um passo** (`PassoModelador` / `PassoBIM` / `PassoCrossStore` / `PassoMEP`), com
   `origem` (`humano` | `ia`) — ADR-002.
3. **Fonte da verdade é o documento** (`DocumentoArqdor` com `VERSAO_DOCUMENTO`), não o estado da tela.
4. **Nada de número mágico na UI**: constantes de domínio (passo de grade, tolerâncias, espelho de
   escada) moram no motor.
5. **Erros são tipados** (`{ codigo, ... }`) e a UI só traduz — nunca infere causa.

---

## 7. Sequência recomendada

| Marco | Conteúdo | Depende de |
|---|---|---|
| **M1** | Materiais (catálogo + aplicação + quantitativo por material) | nada |
| **M2** | Biblioteca de Interiores (famílias + colocação + quantitativo `un`) | M1 (materialPadraoId) |
| **M3** | Render (pedido + cliente + estado) | M1 (PBR) |
| **M4** | IA (ferramentas sobre M1–M3) | M1–M3 |

Racional: a IA só é útil quando há ferramentas boas para chamar. Materiais primeiro porque orçamento e
render dependem dele.

---

## 8. Decisões que dependem do dono

1. **Escada como `TipoElemento`**: entra no BIM (quantitativo + planta) ou fica só como sólido do modelador?
2. **Preço de material**: usa Praça.ai, tabela própria, ou referência manual no MVP?
3. **Render**: reaproveitar o worker legado (`vendorai-prod-browser`) ou worker dedicado do Studio?
4. **IA**: modelo/roteamento permitido hoje (custo) e se pode executar ação destrutiva com confirmação.
5. **Biblioteca**: assets detalhados vêm de onde (glTF próprio, compra, geração)? Impacta R2 e licença.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Vão paramétrico × mesh divergirem (ADR-007) | teste de coerência + `reconciliarVaos()` |
| IA gerar lote inconsistente | `executor` atômico com rollback total |
| Render de versão velha | `documentoHash` obrigatório no pedido |
| Material sem PBR "sumir" no render | fallback visual explícito, nunca material invisível |
| Biblioteca inflar o bundle | LOD: caixa no viewport, asset só no render |

---

## 10. Decisões respondidas pelo dono (2026-11-03)

| # | Decisão |
|---|---|
| 1 | **Escada vira `TipoElemento`** — entra no quantitativo e na planta 2D |
| 2 | **Preço**: base SINAPI + tabela própria; preço **editável** na UI; fluxo de cotação (exportar lista → fornecedor → importar CSV/Excel para atualizar preços). **Praça.ai fica para a Fase 3** |
| 3 | **Render**: reutilizar o worker legado da Contabo (`vendorai-prod-browser`) |
| 4 | **IA**: modelo DeepSeek; **pode** executar ação destrutiva **com confirmação humana**, gerando **um único `PassoUndo`** (rollback total) |
| 5 | **Biblioteca**: começar com assets gratuitos (glTF) + caixas primitivas (LOD); compra de assets depois |
| 6 | **Ordem da UI**: começar consumindo o contrato de **Materiais (M1)** |
| 7 | **ADR-007 (vão)**: paramétrico é a fonte da verdade (orçamento/planta); cortador de malha é o efeito 3D; "Adicionar Porta" chama os dois |

Consequência imediata: o M1 (Materiais) foi implementado — ver `docs/entregas/ARQ-M1-MATERIAIS.md`.
Próximo item pendente por esta lista: `TipoElemento = 'escada'` (BIM Core), antes de a biblioteca
depender dele.
