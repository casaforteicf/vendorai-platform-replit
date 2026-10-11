# Onda 04 — ECO-ATR-03: ajustes auditáveis

Estado: implementado localmente; NÃO homologado, NÃO publicado, requisito NÃO concluído.

Ajustes agora abrem transação e bloqueiam a alocação antes de consultar o histórico e gravar. Retry idêntico devolve o registro original; retry com valor ou justificativa diferente falha. O saldo acumulado usa BigInt, inclui ajustes anteriores e impede saldo negativo. Referências vazias, valores inválidos e estornos positivos são rejeitados antes de abrir transação. Não altera migrations nem realiza pagamento.

Validação em checkout completo:
- 19 testes ATR, três arquivos: EXIT 0.
- TypeScript launch-ci: EXIT 0.
- TypeScript adicional dos serviços e rotas modificados: EXIT 0.
- node build.mjs: EXIT 0.

Limites: mocks não demonstram concorrência PostgreSQL real; falta teste integrado, atualização contra main remota, gates no SHA final, homologação Contabo, confirmação de backup recuperável, monitoramento e rollback. Executor retorna LOT_NOT_REGISTERED para ONDA-04. Git CLI sem credencial de envio; conector de commits não expõe autor/committer exigidos. Autorização do usuário vigente, mas não substitui esses gates. Nenhum merge/deploy deste patch.
