# Diagnóstico de UX — Marketing

Documentos produzidos para planejar a melhoria do módulo antes de codar.

| Documento | Conteúdo |
|---|---|
| [INVENTARIO-TELAS-ESTADOS.md](./INVENTARIO-TELAS-ESTADOS.md) | 11 superfícies, estados que exibem, ação primária, becos sem saída e matriz peça × tela |
| [MAPA-FLUXOS.md](./MAPA-FLUXOS.md) | fluxo atual, fluxos paralelos, divergências, fluxo alvo e o que fundir/retirar |
| [MAQUINA-ESTADOS.md](./MAQUINA-ESTADOS.md) | estados existentes, transições, combinações ilegais, máquina canônica e mapeamento legado |
| [INVENTARIO-BRIDGES.md](./INVENTARIO-BRIDGES.md) | 22 bridges, estratégia (DOM/portal/fetch), duplicidade, risco e ordem de remoção |
| [CATALOGO-ERROS.md](./CATALOGO-ERROS.md) | 22 erros com causa, recuperação, CTA e padrões a corrigir |
| [ANALYTICS-TAXONOMY.md](./ANALYTICS-TAXONOMY.md) | eventos do funil, propriedades e reason codes fechados |
| [PLANO-MELHORIA.md](./PLANO-MELHORIA.md) | fases, quick wins, backlog priorizado, riscos e critérios de aceite |

## Método

Leitura de código (rotas, componentes, enums de status, serviços de produção e publicação)
combinada com as evidências das sessões reais de uso (prints e tentativas de tarefa).

## Limites

- Sem acesso ao tenant nesta rodada: os estados reais dos dados não foram inspecionados.
- Sem teste com usuários: as conclusões são heurísticas (Nielsen) + análise de fluxo.

## Fase 0 — situação

Concluída a parte que não depende de acesso: inventário, fluxos, estados, bridges, erros,
taxonomia e plano. Pendente: estado real do tenant e teste com usuários.

## Próximo passo

Fase 1 do `PLANO-MELHORIA.md` — quick wins (editor, prévia de vídeo, checklist, erros com CTA).
