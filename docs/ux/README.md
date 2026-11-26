# Diagnóstico de UX — Marketing

Documentos produzidos para planejar a melhoria do módulo antes de codar.

| Documento | Conteúdo |
|---|---|
| [INVENTARIO-TELAS-ESTADOS.md](./INVENTARIO-TELAS-ESTADOS.md) | 11 superfícies, estados que exibem, ação primária, becos sem saída e matriz peça × tela |
| [MAPA-FLUXOS.md](./MAPA-FLUXOS.md) | fluxo atual, fluxos paralelos, divergências, fluxo alvo e o que fundir/retirar |
| [MAQUINA-ESTADOS.md](./MAQUINA-ESTADOS.md) | estados existentes, transições, combinações ilegais, máquina canônica e mapeamento legado |

## Método

Leitura de código (rotas, componentes, enums de status, serviços de produção e publicação)
combinada com as evidências das sessões reais de uso (prints e tentativas de tarefa).

## Limites

- Sem acesso ao tenant nesta rodada: os estados reais dos dados não foram inspecionados.
- Sem teste com usuários: as conclusões são heurísticas (Nielsen) + análise de fluxo.

## Próximos documentos (fase 0)

4. `INVENTARIO-BRIDGES.md` — o que cada bridge injeta, o que duplica e o que pode sair.
5. `CATALOGO-ERROS.md` — mensagem, causa, CTA e tela.
6. `ANALYTICS-TAXONOMY.md` — eventos do funil e motivos de falha.
7. `PLANO-MELHORIA.md` — fases, critérios de aceite e esforço.
