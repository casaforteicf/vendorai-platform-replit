# ARQ-UX-04 — Ajustes finos: modal sob demanda, lixeira no topo, campos numéricos

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** implementado e validado tecnicamente (não homologado)

## Itens
| # | Pedido | Situação real | Ação |
|---|---|---|---|
| 1 | modal não deve abrir ao escolher Linha/Retângulo/Círculo/Arco | **já não abria** (só o botão "Inserir medidas" abre — verificado no navegador) | reforço defensivo: escolher ferramenta **fecha** o modal; um só caminho de abertura |
| 2 | não achava o botão Excluir | com POSIÇÃO + ESCALA + BIM + Vãos + Camadas o painel ficou longo e o botão saía da vista | botão **"Excluir sólido"** (vermelho, lixeira) movido para **logo abaixo das contagens**, acima de POSIÇÃO — sempre no primeiro bloco |
| 3 | posição/escala editáveis com `type="number"` | eram `text` com `inputMode` | agora `type="number" step="0.01"`, **select-on-focus** (digitar substitui o valor) e commit em `Enter`/blur |

## Detalhe de usabilidade
As setinhas nativas do `type="number"` causavam mudança acidental de valor (um clique na borda
do campo alterava de 0 para 0,013). Foram escondidas por CSS (`appearance: textfield`), mantendo
o tipo numérico e a digitação como caminho principal.

## Validação
```
tsc (4 gates) → exit 0
tests/run-all.mjs → 251 asserts, 0 falhas
```
Navegador: "Inserir medidas" → preset Parede → **Inserir** (4 × 2,8 × 0,15 em 0,0,0);
lixeira visível no topo do painel; campo X recebeu **3** por digitação (select-on-focus
substituiu o valor) e a parede se moveu ao sair do campo.