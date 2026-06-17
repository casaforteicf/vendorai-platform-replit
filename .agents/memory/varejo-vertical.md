---
name: Varejo vertical pattern
description: Lições do módulo Varejo de Roupas & Acessórios — gating, enum selects, grade UI
---

## Gating pattern (vertical modules)
- `SidebarLayout`: adicionar `isVarejo = user?.tenantVertical === "Varejo de Roupas & Acessórios"` e filtrar `item.section !== "varejo" || isVarejo`.
- `App.tsx`: `VarejoRoute` idêntico ao `ConstrucaoRoute` — checa `user.tenantVertical !== "Varejo de Roupas & Acessórios"` e redireciona para `/`.
- Seção no sidebar usa `<Shirt className="h-3 w-3" />` como ícone de cabeçalho.

## Enum selects no TypeScript
Selects com `onChange={(e) => setForm(f => ({ ...f, campo: e.target.value }))}` falham quando o estado tipado usa um enum gerado (ex: `VarejoColecaoTemporada`).
**Fix:** `e.target.value as typeof f.campo` — cast para o tipo do campo atual, compatível sem redefinir o enum.

**Why:** O Orval gera tipos literais de string (e.g. `"verao" | "inverno" | ...`); `e.target.value` é sempre `string`. O cast `as typeof f.campo` é seguro aqui porque as opções do select são fixas.

## Grade UI (tamanho × cor)
- Construída com `Set` para extrair tamanhos e cores únicos das grades.
- Map `${tamanho}||${cor}` → grade para lookup O(1) na célula.
- Cores semânticas: verde = estoque OK, amarelo = abaixo do mínimo, vermelho = zerado.
- Hover na célula mostra botões flutuantes de editar/remover (absolute positioned).

## Seed template
- Adicionado em `EXTRA_TEMPLATES` (não em `TEMPLATES`) — já tem lógica de skip se existente.
- Inclui 7 prompts (`sdr`, `closer`, `followup`, `reactivation`, `service`, `onboarding`, `scheduler`), `funilPadrao` e `categoriasProdutoSugeridas`.
