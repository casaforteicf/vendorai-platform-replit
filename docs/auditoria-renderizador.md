# Auditoria Completa — Módulo Arch/Render

> **Gerado em:** 02/07/2026  
> **Escopo:** Diagnóstico somente-leitura. Nenhuma alteração de código foi realizada.  
> **Autor:** Agente de diagnóstico VendorAI

---

## 1. ARQUITETURA GERAL

### 1.1 Arquivos do módulo

#### Frontend (`artifacts/frontend/src/pages/arch/`)

| Arquivo | Responsabilidade |
|---|---|
| `RenderPage.tsx` | Página principal do Renderizador; orquestra todos os sub-componentes; contém `doRender()` |
| `ImageCanvas.tsx` | Canvas interativo com zonas de drag-and-drop sobrepostas à imagem |
| `MaterialBar.tsx` | Barra inferior de seleção de materiais + filtro por categoria + importação |
| `ConfigBar.tsx` | Chips de configuração: Modo / Iluminação / Ângulo |
| `BottomBar.tsx` | Campo de texto do prompt + lista de materiais aplicados + botão "Gerar render" |
| `SuggestionsCard.tsx` | Card flutuante de sugestões de decoração (5 estilos) |
| `useRenderState.ts` | Hook React com estado global do módulo (imageUrl, config, applied, step, loading, etc.) |
| `render-types.ts` | Tipos TypeScript + array `MATERIALS` com `promptFragment` de cada material |
| `ArchDashboard.tsx` | Dashboard inicial do módulo Arch com navegação para projetos |
| `Projetos.tsx` | Listagem e criação de projetos arquitetônicos |
| `ProjetoDetalhe.tsx` | Detalhe do projeto com cenas e solicitações de render |
| `PortalCliente.tsx` | Portal público do cliente (acesso via token, sem login) |

#### Backend (`artifacts/api-server/src/`)

| Arquivo | Responsabilidade |
|---|---|
| `routes/arch.ts` | Core da API: projetos, cenas, renders IA, sugestões, superfícies |
| `routes/render.ts` | Rota alternativa de render rápido (`POST /api/render/quick`) com upload multipart |
| `services/blenderService.ts` | Integração com servidor Blender externo + fallback para `gpt-image-1` |
| `lib/ai-gateway.ts` | Camada unificada de chamada IA (BYOK + chave plataforma + billing) |
| `tools/blender-server/blender_render.py` | Script Python para renderização 3D real no servidor Blender |

### 1.2 Rotas de API

| Rota | Método | Descrição |
|---|---|---|
| `/api/arch/render` | POST | Render principal com IA + preservação estrutural |
| `/api/render/quick` | POST | Render rápido multipart (imagem como `file`, materiais como `materialImages`) |
| `/api/arch/suggestions` | POST | Geração de imagem de sugestão decorativa (5 estilos) |
| `/api/arch/cenas/:cenaId/renderizar` | POST | Envia cena ao Blender externo (fallback IA se BLENDER_SERVER_URL ausente) |
| `/api/arch/cenas/:cenaId/solicitacoes` | POST | Cria solicitação de render do cliente via portal |
| `/api/arch/surfaces/:projectId` | GET | Lista superfícies cadastradas do projeto |
| `/api/arch/surfaces/:projectId` | POST | Cria superfície com máscara |
| `/api/arch/surfaces/:surfaceId/materials` | POST | Aplica material a uma superfície |

### 1.3 Modelo 3D Real vs Imagem 2D

O sistema opera em **dois modos paralelos**:

- **Modo IA (principal):** Trabalha exclusivamente com imagens 2D. O render é gerado pelo `gpt-image-1` usando `images.edit` (img2img) com a foto de referência como base.
- **Modo Blender (opcional/externo):** Existe suporte a modelos 3D reais via `blenderService.ts` + `blender_render.py`, mas requer `BLENDER_SERVER_URL` e `BLENDER_SECRET` configurados. Se ausentes, cai em fallback para `gpt-image-1`. Em produção, esse servidor **não está configurado** (env vars não presentes).

### 1.4 Tabelas do banco

| Tabela | Schema resumido | Arquivo |
|---|---|---|
| `arch_projetos` | `id, tenantId, clienteNome, clienteEmail, clienteTelefone, titulo, descricao, status, tipoObra, areaM2, orcamentoTotal, prazoEstimado, arquitetoResponsavel, portalToken, portalAtivo, createdAt, updatedAt` | `lib/db/src/schema/arch_projetos.ts` |
| `arch_cenas` | `id, projetoId, ambienteId, nome, sceneData (JSON), renderUrl, thumbnailUrl, status, createdAt, updatedAt` | `lib/db/src/schema/arch_cenas.ts` |
| `arch_renders` | `id, cenaId, blenderJobId, status, imageUrl, resolucao, tempoRenderMs, erroMsg, createdAt` | `lib/db/src/schema/arch_renders.ts` |
| `arch_render_versoes` | `id, cenaId, versao, imageUrl, prompt, sceneData (JSON), origem, createdAt` | `lib/db/src/schema/arch_render_versoes.ts` |
| `arch_render_solicitacoes` | `id, cenaId, clienteNome, status, itensAdicionados (JSON), texturasAlteradas (JSON), observacoes, versaoGeradaId, createdAt, processadoEm` | `lib/db/src/schema/arch_render_solicitacoes.ts` |
| `arch_suggestions` | `id, tenantId, projectId, style, imageUrl, saved, createdAt` | `lib/db/src/schema/arch_suggestions.ts` |
| `render_surfaces` | `id, projectId, category, label, maskPath, displayOrder, createdAt` | `lib/db/src/schema/arch_render_surfaces.ts` |
| `render_surface_materials` | `id, surfaceId, materialName, materialPromptFragment, appliedAt, appliedBy` | `lib/db/src/schema/arch_render_surfaces.ts` |

---

## 2. MOTOR DE GERAÇÃO DE IMAGEM

| Item | Valor |
|---|---|
| **Provider** | OpenAI (via `ai-gateway.ts`) |
| **Modelo** | `gpt-image-1` |
| **Versão** | Não numerada — é o modelo de produção atual da OpenAI Images API |
| **Modo de operação** | `images.edit` (img2img) quando `referenceImageUrl` presente; `images.generate` (text-to-image puro) quando ausente |
| **Variável de ambiente** | `OPENAI_API_KEY` (plataforma global) **ou** `tenants.openaiApiKeyEncrypted` (BYOK por tenant) |
| **Resolução** | `1536x1024` (render principal) · `1024x1024` (sugestões) |
| **Qualidade** | `"high"` (render principal) · `"medium"` (sugestões) |
| **Custo estimado** | ~$0.06–$0.12 por render (quality=high, 1536×1024 com `gpt-image-1`). Sugestões ~$0.02–$0.04 cada (quality=medium, 1024×1024). Valores aproximados baseados no pricing público da OpenAI; variam conforme tier da conta. |
| **Retorno** | `b64_json` (convertido para buffer → Object Storage → URL interna `/api/storage/objects/...`) |

---

## 3. PROMPT ATUAL — TRANSCRIÇÃO ÍNTEGRA

### 3.1 Prompt do Render Principal (`arch.ts`, linhas 1665–1711)

#### Montagem (linha 1698):

```javascript
const prompt = [
  "You are a professional architectural visualization engine.",
  `Transform this ${isExterior ? "architectural photo" : "interior photo"} into a photorealistic render.`,
  preservationRules,      // veja abaixo
  materialInstructions,   // veja abaixo
  lightingInstruction,    // veja abaixo
  angleInstruction,       // veja abaixo
  userNotes ? `Additional notes: ${userNotes}` : null,
  "Output: ultra-sharp 4K detail, high dynamic range, photorealistic, Brazilian architecture context.",
].filter(Boolean).join(" ");
```

#### `preservationRules` — Exterior (`isExterior = true`):

```
ABSOLUTE PRESERVATION RULES — NEVER BREAK:
• DO NOT add any new element (trees, cars, people, plants, decorations) not already visible in the reference.
• DO NOT remove, move, or alter any existing architectural element.
• DO NOT change viewpoint, perspective, or camera position.
• Preserve PIXEL-EXACTLY: building shape, footprint, number of floors, all window positions, all door positions, roof geometry, every structural volume.
PERMITTED CHANGES ONLY: material quality and texture on specified surfaces, lighting condition.
```

#### `preservationRules` — Interior (`isExterior = false`):

```
ABSOLUTE PRESERVATION RULES — NEVER BREAK:
• DO NOT add any object, furniture, plant, decoration, or element not already present in the reference.
• DO NOT remove, move, reposition, or replace any existing furniture or object.
• DO NOT change viewpoint, perspective, or camera angle.
• Preserve PIXEL-EXACTLY: room geometry, all wall/window/door positions, ceiling height, every piece of furniture in its exact place.
PERMITTED CHANGES ONLY: material quality and texture on specified surfaces, lighting condition.
```

#### `materialInstructions` (quando há materiais aplicados):

```
MATERIAL APPLICATIONS (apply only to each specified zone — leave ALL other surfaces unchanged):
• {zone}: {promptFragment} — photorealistic texture, correct scale and perspective
• [... repete para cada material aplicado ...]
```

Exemplo real com Carvalho na Parede:
```
• Parede: light oak wood with natural grain, warm tone, photorealistic — photorealistic texture, correct scale and perspective
```

#### `lightingInstruction` (somente se `lighting !== "auto"`):

```
LIGHTING CONDITION: {lightingMapArch[lighting]}
```

| Chave | String completa injetada |
|---|---|
| `manha` | `Early morning daylight (7–9 am): soft warm sunlight from low angle, gentle shadows, golden-warm color temperature.` |
| `tarde` | `Bright midday/afternoon (1–4 pm): strong overhead daylight, crisp shadows, neutral-white color temperature.` |
| `golden` | `Golden hour (5–6 pm): warm amber-orange sunlight raking across surfaces, long soft shadows, romantic golden glow.` |
| `noturno` | `Night scene (8 pm+): TURN ON all lamps, exterior fixtures, and lighting elements physically present; dark sky; warm artificial light; no daylight.` |
| `nublado` | `Overcast cloudy day: soft diffuse light with no direct sun, cool neutral tones, no hard shadows, even illumination.` |

#### `angleInstruction`:

```
CAMERA ANGLE: render from a {angleMapArch[angle]}.
```

| Chave | String completa injetada |
|---|---|
| `frontal` | `straight-on frontal camera angle` |
| `45` | `45-degree diagonal perspective angle` |
| `lateral_esq` | `side view from the left (−90° Y-axis rotation from frontal view)` |
| `lateral_dir` | `side view from the right (+90° Y-axis rotation from frontal view)` |
| `ampla` | `wide-angle lens expansive view` |
| `aerea` | `aerial top-down bird's-eye view` |

#### Exemplo de prompt completo montado (exterior, Manhã, 45°, Carvalho na Parede):

```
You are a professional architectural visualization engine. Transform this architectural photo into a photorealistic render. ABSOLUTE PRESERVATION RULES — NEVER BREAK: • DO NOT add any new element (trees, cars, people, plants, decorations) not already visible in the reference. • DO NOT remove, move, or alter any existing architectural element. • DO NOT change viewpoint, perspective, or camera position. • Preserve PIXEL-EXACTLY: building shape, footprint, number of floors, all window positions, all door positions, roof geometry, every structural volume. PERMITTED CHANGES ONLY: material quality and texture on specified surfaces, lighting condition. MATERIAL APPLICATIONS (apply only to each specified zone — leave ALL other surfaces unchanged): • Parede: light oak wood with natural grain, warm tone, photorealistic — photorealistic texture, correct scale and perspective LIGHTING CONDITION: Early morning daylight (7–9 am): soft warm sunlight from low angle, gentle shadows, golden-warm color temperature. CAMERA ANGLE: render from a 45-degree diagonal perspective angle. Output: ultra-sharp 4K detail, high dynamic range, photorealistic, Brazilian architecture context.
```

### 3.2 Prompt das Sugestões de Decoração (`arch.ts`, linhas 1789–1793)

#### Com imagem de referência (`referenceImageUrl` presente):

```
Use this room as the spatial reference and transform it into an inspiring decoration concept with {styleDesc}. You MAY freely add furniture, decorative objects, plants, art, rugs, and atmospheric lighting to fill the space. This is a decoration INSPIRATION image — creative additions are welcome and encouraged. Photorealistic render, 4K quality.
```

#### Sem imagem de referência:

```
Generate an inspiring interior decoration concept with {styleDesc}. A beautifully decorated room filled with furniture, plants, art objects, rugs, and atmospheric lighting. Photorealistic render, 4K quality, Brazilian residential context.
```

#### Mapa de estilos (`stylePromptsMap`):

| Chave | Descrição injetada |
|---|---|
| `minimalista` | `minimalist interior design: clean lines, very few elements, neutral palette (white/grey/beige), functional furniture with simple forms, open empty spaces, no clutter, soft diffuse natural lighting` |
| `atemporal` | `timeless interior design: classic discreet elements, balanced neutral palette, quality materials (solid wood, stone, linen), refined simplicity, warm ambient light, no trendy items` |
| `provencal` | `Provençal rustic French interior: aged distressed wood furniture, pastel tones (lavender, cream, sage green), wrought iron details, linen curtains, dried flower arrangements, terracotta accents, warm natural light` |
| `neoclassico` | `neoclassical interior: symmetrical layout, ivory and gold tones, ornamental columns or pilasters, high ceiling with plaster moldings, elegant curved-leg furniture, crystal chandelier lighting` |
| `moderno` | `modern contemporary interior: bold geometric forms, industrial materials (exposed concrete, glass, steel), contrasting dark/light palette, integrated technology, architectural statement lighting, abstract artwork` |

---

## 4. BOTÕES E CONTROLES DA UI — FUNÇÃO POR FUNÇÃO

### 4.1 Topbar (barra superior)

| Botão/Controle | O que faz ao clicar | Endpoint chamado | Payload | Status |
|---|---|---|---|---|
| **Trocar imagem** (ícone câmera) | Abre `<input type="file" accept="image/*">`, chama `rs.loadImage(file)` que converte a imagem para data URL e atualiza `rs.imageUrl` | Nenhum (local) | — | ✅ Funciona |
| **Salvar no Lead** | Atualmente `disabled` — botão renderizado mas não funcional | Nenhum | — | ❌ Não implementado |
| **✨ Sugestões** | Alterna visibilidade do `<SuggestionsCard>` com `setSuggestionsOpen(v => !v)` | `POST /api/arch/suggestions` (quando o card aciona geração) | `{ style, projectId?, referenceImageUrl? }` | ✅ Funciona |
| **Baixar HD** | Link `<a href={rs.renderResult} download>` — download direto da última imagem renderizada | Nenhum (link nativo) | — | ✅ Funciona (requer `rs.renderResult` preenchido) |

### 4.2 ConfigBar (Row 3 — chips de configuração)

#### Modo de render

| Botão/Controle | O que faz | Endpoint chamado | Status |
|---|---|---|---|
| **🛡 Original HD** | Define `rs.config.mode = 'hd'`; ao renderizar envia a imagem original sem transformação | Nenhum (altera estado) | ⚠️ Parcial — o valor `'hd'` é armazenado mas `doRender()` **não respeita** o modo: sempre chama `POST /api/arch/render` da mesma forma |
| **✨ Render completo** | Define `rs.config.mode = 'full'` | Nenhum | ⚠️ Parcial — idem acima |
| **💬 Chat** | Define `rs.config.mode = 'chat'` | Nenhum | 🚫 Não implementado — sem comportamento diferenciado |

#### Iluminação (LUZES)

| Botão | Valor enviado | Instrução injetada no prompt | Status |
|---|---|---|---|
| **🔄** (auto) | `lighting: "auto"` | Sem instrução de iluminação | ✅ Funciona |
| **🌅 Manhã** | `lighting: "manha"` | `Early morning daylight (7–9 am): soft warm sunlight from low angle, gentle shadows, golden-warm color temperature.` | ✅ Funciona |
| **☀️ Tarde** | `lighting: "tarde"` | `Bright midday/afternoon (1–4 pm): strong overhead daylight, crisp shadows, neutral-white color temperature.` | ✅ Funciona |
| **🌇 Golden** | `lighting: "golden"` | `Golden hour (5–6 pm): warm amber-orange sunlight raking across surfaces, long soft shadows, romantic golden glow.` | ✅ Funciona |
| **🌙 Noturno** | `lighting: "noturno"` | `Night scene (8 pm+): TURN ON all lamps, exterior fixtures, and lighting elements physically present; dark sky; warm artificial light; no daylight.` | ✅ Funciona |

> Nota: `nublado` existe no backend (`lightingMapArch`) mas **não há chip correspondente** na UI (`ConfigBar.tsx`).

#### Ângulos (ANGULOS)

| Botão | Valor enviado | Instrução injetada | Status |
|---|---|---|---|
| **Frontal** | `angle: "frontal"` | `straight-on frontal camera angle` | ✅ Funciona |
| **45°** | `angle: "45"` | `45-degree diagonal perspective angle` | ✅ Funciona |
| **Lat. Esq.** | `angle: "lateral_esq"` | `side view from the left (−90° Y-axis rotation from frontal view)` | ✅ Funciona |
| **Lat. Dir.** | `angle: "lateral_dir"` | `side view from the right (+90° Y-axis rotation from frontal view)` | ✅ Funciona |
| **Ampla** | `angle: "ampla"` | `wide-angle lens expansive view` | ✅ Funciona |
| **Aérea** | `angle: "aerea"` | `aerial top-down bird's-eye view` | ✅ Funciona |

### 4.3 MaterialBar (barra de materiais)

#### Filtros de categoria

| Chip | Filtro aplicado | Status |
|---|---|---|
| **Todos** | Exibe todos os materiais | ✅ Funciona |
| **Madeira** | `cat === 'madeira'` → Carvalho, Nogueira, Pinho | ✅ Funciona |
| **MDF** | `cat === 'mdf'` → MDF Branco, MDF Preto | ✅ Funciona |
| **Pedra** | `cat === 'pedra'` → Mármore, Granito | ✅ Funciona |
| **Ferro** | `cat === 'ferro'` → Aço | ✅ Funciona |
| **Cerâmica** | `cat === 'ceramica'` → Porcelana | ✅ Funciona |
| **Concreto** | `cat === 'concreto'` → Concreto | ✅ Funciona |
| **Meus** | Aparece somente quando `customMats.length > 0` | ✅ Funciona |

#### Materiais pré-definidos (`render-types.ts`)

| ID | Nome | Categoria | `promptFragment` |
|---|---|---|---|
| `carvalho` | Carvalho | madeira | `light oak wood with natural grain, warm tone, photorealistic` |
| `nogueira` | Nogueira | madeira | `dark walnut wood with rich grain, photorealistic` |
| `pinho` | Pinho | madeira | `pine wood light yellow grain, photorealistic` |
| `mdf-branco` | MDF Branco | mdf | `white matte MDF panel, smooth surface, photorealistic` |
| `mdf-preto` | MDF Preto | mdf | `black matte MDF panel, photorealistic` |
| `marmore` | Mármore | pedra | `white Carrara marble grey veining, polished, photorealistic` |
| `granito` | Granito | pedra | `dark grey granite crystal flecks, polished, photorealistic` |
| `aco` | Aço | ferro | `brushed stainless steel metallic finish, photorealistic` |
| `porcelana` | Porcelana | cerâmica | `white matte porcelain tile, photorealistic` |
| `concreto` | Concreto | concreto | `exposed concrete raw finish, photorealistic` |

#### Controle de importação

| Ação | O que acontece | Status |
|---|---|---|
| **Importar** (ícone `+`) | Abre `<input type="file">` múltiplo; para cada arquivo lê a cor média via canvas 1×1px (`readAvgColor`); chama `onImport(file, name, color)` que adiciona ao `customMats` com `imageUrl` criado via `URL.createObjectURL` | ✅ Funciona |

### 4.4 BottomBar

| Controle | O que faz | Endpoint chamado | Payload | Status |
|---|---|---|---|---|
| **Campo de texto (prompt)** | Atualiza `rs.config.prompt` em tempo real; injetado como `userNotes` no prompt | Nenhum (estado local) | — | ✅ Funciona |
| **Gerar render** (botão principal) | Chama `doRender()` — veja fluxo completo na seção 8 | `POST /api/arch/render` | `{ referenceImageUrl, lighting, angle, roomType, materials[], userNotes }` | ✅ Funciona |
| **✕ (remover material)** | Chama `rs.removeMaterial(zone)` — remove o material da zona específica do estado `applied` | Nenhum | — | ✅ Funciona |

### 4.5 ImageCanvas — Drag & Drop de materiais

| Ação | O que acontece tecnicamente | Status |
|---|---|---|
| **Arrastar material** | `onMouseDown` no chip de material registra o material em `draggingMat` (estado global); cursor muda para `grabbing` | ✅ Funciona |
| **Soltar sobre zona** | `onMouseUp` detecta qual zona (`ZONES`) recebeu o drop via `onMouseUpZone(zone.name)` em `ImageCanvas`; chama `rs.applyMaterial(zone, draggingMat)` que atualiza `applied` | ✅ Funciona |
| **Feedback visual** | Overlay `rgba(c1, 0.35)` (cor do material) é renderizado sobre a zona afetada; badge exibe `{zona} · {material}` | ✅ Funciona |

---

## 5. SISTEMA DE MATERIAIS/TEXTURAS

### 5.1 Método de aplicação atual

**Injeção de prompt (text-to-image com instrução de superfície)**

O material **não** é aplicado via máscara de imagem real (inpainting segmentado). O fluxo é:
1. Usuário arrasta material sobre uma zona da UI (overlay visual)
2. O par `(zona, promptFragment)` é adicionado ao estado `applied`
3. No render, `materialInstructions` concatena todos os pares no prompt de texto
4. O `gpt-image-1` interpreta as instruções e tenta aplicar o material descrito à zona mencionada

**Limitação crítica:** a correspondência entre o nome da zona (`"Parede"`, `"Piso"`) e a área real da imagem depende inteiramente da interpretação do modelo de linguagem — não há máscara de segmentação real.

### 5.2 Zonas de drop definidas (hardcoded em `ImageCanvas.tsx`)

| Zona | Top | Left | Largura | Altura |
|---|---|---|---|---|
| Parede | 0% | 0% | 60% | 38% |
| Armários sup. | 10% | 0% | 55% | 28% |
| Bancada | 53% | 0% | 55% | 6% |
| Armários inf. | 58% | 0% | 55% | 22% |
| Piso | 80% | 0% | 100% | 20% |

> As zonas são retângulos percentuais fixos sobre a imagem. **Não há segmentação por superfície real** — as coordenadas assumem layout de cozinha/ambiente específico.

### 5.3 Tabelas `render_surfaces` e `render_surface_materials`

**Existem** em `lib/db/src/schema/arch_render_surfaces.ts`. As rotas de API correspondentes também existem (`GET/POST /api/arch/surfaces/:projectId`, `POST /api/arch/surfaces/:surfaceId/materials`). Porém:

- A UI (`RenderPage.tsx`) **não consome** essas rotas — usa as zonas hardcoded do `ImageCanvas.tsx`
- `render_surfaces.maskPath` existe mas **nunca é populada** pela UI atual
- As tabelas estão implementadas no backend mas **desconectadas** do fluxo de render principal

### 5.4 Drag & Drop de textura importada

Funcional. O fluxo técnico completo:
1. Usuário importa arquivo de imagem → `readAvgColor()` extrai cor média via canvas 1×1
2. Material customizado é adicionado com `imageUrl = URL.createObjectURL(file)` e `cat = 'usuario'`
3. O `promptFragment` do material importado é **genérico** (não gerado por IA a partir da imagem): usa apenas o nome do arquivo como descrição
4. O material pode ser arrastado para zonas normalmente
5. **Limitação:** a imagem da textura importada nunca é enviada ao `gpt-image-1` — apenas o nome do arquivo vira parte do prompt

---

## 6. ERROS CONHECIDOS

### 6.1 Erro 500 em `/api/arch/render` — análise

O erro 500 histórico foi corrigido pela implementação de `safeStatus` + `getOpenAIForTenant`. O `try/catch` atual (`arch.ts`, linhas ~1709–1757):

```javascript
try {
  const openai  = await getOpenAIForTenant(tid);  // pode lançar se sem chave válida
  const storage = new ObjectStorageService();
  // ... chamada OpenAI ...
  if (!b64) throw new Error("gpt-image-1 não retornou imagem");
  // ... save storage ...
  return res.json({ success: true, imageUrl, prompt });
} catch (err: any) {
  req.log.error({ err, tenantId: tid }, "arch/render: erro");
  const httpStatus = (err?.status ?? err?.statusCode ?? 500) as number;
  const safeStatus = httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500;
  return res.status(safeStatus).json({ success: false, error: err?.message ?? "Erro ao gerar render" });
}
```

**Causas atuais de falha que ainda podem ocorrer:**

| Causa | HTTP retornado | Mensagem |
|---|---|---|
| Tenant sem chave OpenAI (sem BYOK, sem créditos, plano plataforma) | 402 ou 500 | `"Quota OpenAI esgotada"` ou similar |
| `referenceImageUrl` não é data URL base64 válido | 400 | `"referenceImageUrl deve ser um data URL base64 válido..."` |
| `gpt-image-1` não retornou `b64_json` | 500 | `"gpt-image-1 não retornou imagem"` |
| Falha no Object Storage (disco cheio, permissão) | 500 | Erro de I/O |
| `referenceImageUrl` ausente + nenhum prompt (geração sem referência) | 200 mas resultado ruim | Imagem genérica sem preservação |

### 6.2 Todos os try/catch do módulo

| Arquivo | Localização | O que captura | Tratamento |
|---|---|---|---|
| `arch.ts` | render route (~linha 1709) | Qualquer erro na chamada OpenAI/Storage | Loga + retorna 4xx/5xx com mensagem |
| `arch.ts` | suggestions route (~linha 1837) | Falha ao inserir no DB `arch_suggestions` | **Engole silenciosamente** (`req.log.warn`) — API retorna 200 mesmo sem persistir |
| `arch.ts` | suggestions route (~linha 1845) | Qualquer erro OpenAI/Storage | Loga + retorna 500 |
| `render.ts` | linha 49 | `JSON.parse(materialPins)` | **Engole** com `/* ignore parse errors */` — `materialPins` vira `[]` |
| `blenderService.ts` | linha ~396 | Disparo em background do render Blender | `.catch(() => undefined)` — **silencioso** |
| `blenderService.ts` | linha ~407–445 | Falha de conexão com o servidor Blender | Loga + marca render como `status: "erro"` no DB |
| `blenderService.ts` | linha ~235–242 | Falha no fallback `gpt-image-1` | Loga + marca render como `status: "erro"` |

---

## 7. ESTADO DOS BRIEFINGS ANTERIORES (cmd-7 e cmd-8)

| Feature | Status | Evidência |
|---|---|---|
| ✅ Correção do erro 500 | **IMPLEMENTADO** | `safeStatus` + `getOpenAIForTenant` em `arch.ts` |
| ✅ img2img com `gpt-image-1` | **IMPLEMENTADO** | `openai.images.edit` com `referenceImageUrl` convertido para `toFile` |
| ✅ Prompt de preservação estrutural | **IMPLEMENTADO** | Seção `ABSOLUTE PRESERVATION RULES` injetada no prompt |
| ⚠️ Máscaras por superfície individual | **PARCIAL** | Tabelas `render_surfaces`/`render_surface_materials` existem mas UI usa zonas hardcoded e `maskPath` nunca é populado |
| ⚠️ Múltiplos materiais em superfícies da mesma categoria | **PARCIAL** | Arquitetura suporta N materiais via `render_surface_materials`, mas UI permite apenas 1 material por zona de drop |
| ✅ Rotação lateral (Esq./Dir.) | **IMPLEMENTADO** | Chips `Lat. Esq.` (`lateral_esq`) e `Lat. Dir.` (`lateral_dir`) em `ConfigBar.tsx`; backend mapeia corretamente |
| ✅ Card de Sugestões de Decoração | **IMPLEMENTADO** | `SuggestionsCard.tsx` + rota `POST /api/arch/suggestions` com 5 estilos |
| ✅ Tabela `arch_suggestions` | **IMPLEMENTADA** | `lib/db/src/schema/arch_suggestions.ts`; populada pelo endpoint de sugestões |
| 🚫 Botão "Salvar no Lead" | **NÃO IMPLEMENTADO** | Botão existe com `disabled`; nenhum endpoint chamado |
| 🚫 Modos HD/Full/Chat distintos | **NÃO IMPLEMENTADO** | Estado armazenado mas `doRender()` não diferencia comportamento por modo |
| 🚫 Textura importada enviada ao modelo | **NÃO IMPLEMENTADO** | Imagem da textura local nunca é enviada; apenas o nome vira texto no prompt |
| 🚫 Zonas dinâmicas por tipo de ambiente | **NÃO IMPLEMENTADO** | Zones hardcoded para layout de cozinha independente do `roomType` |

---

## 8. FLUXO COMPLETO DE UM RENDER (passo a passo técnico)

```
Usuário clica "Gerar render" (BottomBar.tsx)
│
├─ 1. FRONTEND — doRender() inicia (RenderPage.tsx, linha ~99)
│     rs.setLoading(true) + rs.setStep(3)
│     Coleta payload:
│       referenceImageUrl = rs.imageUrl (data URL base64 da imagem atual)
│       lighting          = rs.config.light  ("manha"/"tarde"/"golden"/"noturno"/"auto")
│       angle             = rs.config.angle  ("frontal"/"45"/"lateral_esq"/...)
│       roomType          = "fachada externa" (hardcoded — nunca varia)
│       materials         = Object.entries(rs.applied).map(...)
│       userNotes         = rs.config.prompt || undefined
│
├─ 2. REDE — fetch POST /api/arch/render
│     Headers: Content-Type: application/json + Authorization: Bearer {token}
│     Body: JSON do payload acima
│
├─ 3. BACKEND — arch.ts: POST /api/arch/render
│     a) Verifica tenantId (req.user?.tenantId)
│     b) Valida payload com archRenderBodySchema (Zod)
│     c) Determina isExterior (roomType === "fachada externa")
│     d) Monta preservationRules (string literal baseada em isExterior)
│     e) Monta materialInstructions (join de zone:promptFragment)
│     f) Mapeia lighting → lightingMapArch[lighting]
│     g) Mapeia angle → angleMapArch[angle]
│     h) Concatena prompt final com .filter(Boolean).join(" ")
│
├─ 4. BACKEND — getOpenAIForTenant(tid) (ai-gateway.ts)
│     Verifica BYOK do tenant → se sim, decripta e usa chave do tenant
│     Verifica créditos/plano → se plataforma subsidiada, usa OPENAI_API_KEY global
│     Retorna instância OpenAI configurada
│
├─ 5. BACKEND — Chamada OpenAI
│     SE referenceImageUrl presente:
│       Parse data URL → Buffer → toFile(buffer, "reference.{ext}", {type: mimeType})
│       openai.images.edit({ model: "gpt-image-1", image: refFile, prompt, n:1, size:"1536x1024", quality:"high" })
│     SE ausente:
│       openai.images.generate({ model: "gpt-image-1", prompt, n:1, size:"1536x1024", quality:"high" })
│     Retorna { data: [{ b64_json: "..." }] }
│
├─ 6. BACKEND — Processamento da resposta
│     Extrai b64_json → Buffer.from(b64, "base64")
│     ObjectStorageService.savePrivateBuffer(buf, "image/png", "arch-render-{tid}-{ts}.png")
│     Gera URL: /api/storage/objects/{servePath}
│
├─ 7. BACKEND — Resposta HTTP 200
│     { success: true, imageUrl: "/api/storage/objects/...", prompt: "..." }
│
└─ 8. FRONTEND — Atualização da UI
      rs.setRenderResult(data.imageUrl) → ImageCanvas exibe nova imagem
      rs.setStep(4) → stepper avança para "Resultado"
      rs.setLoading(false)
```

### O que pode falhar em cada etapa

| Etapa | Falha possível | Sintoma no usuário |
|---|---|---|
| 1 | `rs.imageUrl` é null (sem imagem carregada) | Payload `referenceImageUrl: undefined` → render textual genérico |
| 2 | Token JWT expirado | HTTP 401 → toast "Erro 401" |
| 3b | `roomType` inválido (não mapeado no schema) | HTTP 400 |
| 4 | Tenant sem chave OpenAI válida + sem créditos | HTTP 402/500 |
| 5 | Timeout da API OpenAI (imagens grandes levam 20-60s) | Timeout no fetch → toast de erro |
| 5 | `gpt-image-1` não retorna `b64_json` | HTTP 500 "gpt-image-1 não retornou imagem" |
| 6 | Object Storage cheio ou erro de I/O | HTTP 500 |
| 8 | URL inacessível (storage expirado) | Imagem quebrada na UI |

---

## RESUMO DE STATUS

| Feature | Status |
|---|---|
| Rota `/api/arch/render` funcional | ✅ Funciona |
| img2img com imagem de referência | ✅ Funciona |
| Preservação estrutural no prompt | ✅ Funciona |
| Iluminação (Manhã/Tarde/Golden/Noturno) | ✅ Funciona |
| Ângulos (Frontal/45°/Lateral Esq./Lateral Dir./Ampla/Aérea) | ✅ Funciona |
| Materiais (Madeira/MDF/Pedra/Ferro/Cerâmica/Concreto/Aço) | ✅ Funciona |
| Drag & drop de material sobre zona | ✅ Funciona |
| Importar textura customizada | ✅ Funciona (imagem local — sem envio ao modelo) |
| Card de Sugestões de Decoração (5 estilos) | ✅ Funciona |
| Tabela `arch_suggestions` | ✅ Implementada e populada |
| Tabelas `render_surfaces` / `render_surface_materials` | ✅ Existem no DB e backend |
| Rota quick render (`/api/render/quick`) | ✅ Funciona |
| Botão "Salvar no Lead" | ❌ Não implementado (disabled) |
| Modo "Original HD" (sem transformação) | ⚠️ Parcial — estado armazenado, comportamento não diferenciado |
| Modo "Chat" | 🚫 Não implementado |
| Superfícies por máscara real (segmentação) | ⚠️ Parcial — tabelas existem, UI não consome |
| Múltiplos materiais por superfície | ⚠️ Parcial — DB suporta, UI limita a 1 por zona |
| Textura importada enviada ao modelo (img2img real) | 🚫 Não implementado |
| Zonas dinâmicas por tipo de ambiente | 🚫 Não implementado — hardcoded para cozinha |
| Modo "Nublado" na UI | 🚫 Não implementado na UI (existe no backend) |
| Blender 3D real (BLENDER_SERVER_URL) | 🚫 Não configurado em produção |

---

## RECOMENDAÇÕES PRIORIZADAS

> Nenhuma alteração foi realizada. Lista para decisão e execução futura.

### 🔴 Alta prioridade

1. **Botão "Salvar no Lead"** — Conectar ao endpoint de activities ou deals para salvar a URL do render como anexo ou activity do lead associado ao projeto.

2. **Zonas dinâmicas por tipo de ambiente** — As 5 zonas hardcoded assumem layout de cozinha. Para ambientes externos (fachadas), sala, banheiro, o mapeamento está errado. Solução: criar mapas de zonas por `roomType` ou migrar para as superfícies dinâmicas da tabela `render_surfaces`.

3. **Modo "Original HD"** — Implementar comportamento real: quando `mode = 'hd'`, retornar a imagem original sem chamar a OpenAI (salvar bandwidth e custo).

### 🟡 Média prioridade

4. **Textura importada → img2img** — Quando o usuário importa uma imagem de textura real e a arrasta para uma zona, enviar a imagem ao `gpt-image-1` como referência secundária (ou embutir no prompt como `style reference`) em vez de usar apenas o nome do arquivo.

5. **Chip "Nublado" na UI** — O mapeamento já existe no backend (`lightingMapArch.nublado`). Basta adicionar o chip `{ value: 'nublado', label: '☁️ Nublado' }` ao `ConfigBar.tsx`.

6. **Superfícies por máscara** — Conectar `render_surfaces` ao fluxo real: quando o projeto tem superfícies cadastradas com `maskPath`, usar as zonas do banco em vez das hardcoded do `ImageCanvas`.

### 🟢 Baixa prioridade

7. **Modo "Chat"** — Definir comportamento: conversa iterativa com o agente sobre ajustes do render sem gerar nova imagem em cada mensagem.

8. **Múltiplos materiais por zona** — Atualmente uma zona aceita apenas 1 material. A estrutura do DB permite N. Poderia permitir que o usuário aplique materiais em sub-superfícies (ex: "Armário sup. — portas: MDF Branco, puxadores: Aço").

9. **Validação de `roomType`** — O valor `"fachada externa"` está hardcoded em `doRender()`. Expor um selector de tipo de ambiente na UI para que o prompt use `isExterior = false` em ambientes internos.
