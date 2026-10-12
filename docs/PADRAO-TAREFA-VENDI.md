# Padrão de tarefa — Vendor.ai (fila de execução)

Referência oficial de como escrever cada item da fila de melhorias (ONDA, issue #3463).
Vale para o loop autônomo e para qualquer agente/dev que for executar uma tarefa.
Quanto mais claro o item, melhor o resultado.

## Formato de cada item

```
ID: <ID>  (ref. ONDA #3463)
O QUE: <1 frase do problema/necessidade — o que existe hoje e o que falta>
RESULTADO ESPERADO: <critério observável — "feito quando o usuário consegue ___">
ONDE: <backend / frontend / ambos> + módulo/tela
RESTRIÇÕES: respeitar isolamento multi-tenant; reaproveitar código existente;
            não quebrar fluxos atuais; storage via R2; banco Supabase
FORA DE ESCOPO: <o que NÃO fazer agora, pra não inchar a tarefa>
```

## Exemplo preenchido (nível de detalhe correto)

```
ID: CRM-22 (ref. ONDA #3463)
O QUE: a lista de leads do CRM não tem filtro nem busca; com muitos leads
       fica difícil achar um específico.
RESULTADO ESPERADO: feito quando o usuário filtra por status e busca por
       nome ou documento, e a lista atualiza na hora.
ONDE: frontend (página de leads) + backend (endpoint de listagem já existe,
       adicionar parâmetros de filtro/busca).
RESTRIÇÕES: multi-tenant (só leads do tenant logado); reaproveitar o endpoint
       atual; não mudar o layout geral; sem libs novas.
FORA DE ESCOPO: exportar lista, filtros avançados por data — ficam pra depois.
```

## Por que cada campo importa

- **RESULTADO ESPERADO** — vira o critério que fecha a tarefa (e o teste).
- **ONDE** — evita procurar no lugar errado.
- **RESTRIÇÕES** — protege o multi-tenant (crítico) e evita gambiarra.
- **FORA DE ESCOPO** — impede a tarefa de inchar e quebrar o gate.

## Definição de "pronto" (sempre a mesma, não precisa reescrever por item)

Uma tarefa só vira PR quando:

1. **Gates verdes** — de `artifacts/api-server`: `tsc -p tsconfig.launch-ci.json --noEmit`
   e `node ./build.mjs`; se tocar frontend, de `artifacts/frontend`:
   `pnpm exec vite build --config vite.config.ts`. Todos exit 0.
2. **RESULTADO ESPERADO atendido.**

Sem os dois, a tarefa fica na branch e reporta o erro — não vira PR, não vai para produção.

## Entrada da fila

Um único lugar: a issue #3463 (ou a issue-fila designada), com itens em checkbox.
O executor pega o próximo `- [ ]` não marcado, executa o ciclo e marca `- [x]` ao entregar.
Rascunhe em qualquer lugar; a versão final do item precisa estar na fila para ser vista.
