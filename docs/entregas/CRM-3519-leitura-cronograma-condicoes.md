# CRM-3519 — leitura do cronograma e condições v1

2026-10-15. Branch fix/proposta-layout-cronograma-condicoes-20261015. Implementação c983864704b0b225a7f45cbe420aeaaa4a2fb3eb.

Escopo: duas páginas do PDF apontadas pelo usuário nas imagens 142749 e 142805. Cronograma mensal em cartões, três meses por página, todas as etapas/fases sem truncar a lista em quatro nomes; execução física mensal/acumulada, serviços previstos, desconto da entrada, valor a pagar e saldo da entrada. Condições comerciais destacam valor total, entrada percentual/valor e saldo contratual após entrada; forma de pagamento com rótulo em português; texto cadastrado preservado e maior; imagem decorativa removida desta página para priorizar conteúdo.

Validação: dois testes do renderizador Studio aprovados, build backend aprovado (3691ms), diff check aprovado. TypeScript launch-ci em execução ao registrar, resultado final informado no PR. Não houve geração/revisão visual de novo PDF ou teste autenticado em produção.

Limites: este lote não corrige cálculos. Divergências anteriores entre datas/durações, soma financeira e avanço físico permanecem pendentes e impedem considerar o cronograma correto. Não altera valores comerciais, datas ou registro do cliente. Exige gates completos, homologação e deploy do backend; sem merge/deploy executado.
