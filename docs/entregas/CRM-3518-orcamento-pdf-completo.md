# CRM-3518 — orçamento completo para impressão e PDF v1

Atualização: 2026-10-15.
Branch: feat/orcamento-pdf-completo-20261015.
Estado: implementado, validações locais direcionadas aprovadas; gates completos e homologação pendentes. Sem merge/deploy.

## Entrega
- Documento inclui descrição do projeto, premissas, memorial, área construída, exclusões, política de reajuste, garantias, condições detalhadas, itens e observações já salvos. Respeita opções de apresentação salvas.
- Cronograma por etapas e fases com datas e duração; dependência e defasagem explicitamente cadastradas; totais físicos/financeiros e prazo efetivo.
- Tabela mensal com etapas/fases ativas, percentual físico mensal/acumulado, bruto, amortização, líquido e saldo da entrada. Reutiliza buildProposalMonthlyMatrix e os valores salvos, sem nova chamada IA ou alteração de orçamento.
- Corrige referências locais ausentes showExecutionSchedule/showPhysicalFinancial e chamadas antigas renderProposalMonthlyMatrix com argumentos incompletos, que impediam o PDF com cronograma.
- GET /propostas/:id/print-document retorna HTML por JSON, protegido por tenant e responsabilidade; Cache-Control no-store. Mesma autorização adicionada ao PDF.
- Rota de impressão abre prévia completa em iframe sem execução de scripts, com Imprimir / Salvar como PDF e Baixar PDF completo. Prévia não depende de Chromium no backend. Erros permitem nova tentativa e não liberam impressão parcial.
- Controles operacionais da página anterior permanecem acessíveis ao fechar a prévia.

## Evidências
- 20 testes direcionados aprovados: 4 do documento/cálculos, 14 de leitura/isolamento/endpoints, 2 da interface.
- TypeScript backend tsconfig.launch-ci.json: aprovado (exit 0).
- Build backend final: aprovado (exit 0, 3262 ms).
- Build Vite: aprovado (4489 módulos, 36,93s); avisos existentes de sourcemap/chunks.
- git diff --check: aprovado.
- Auditoria de bundles reprovada em LeadWorkspace 51,32 kB / 50 kB, arquivo não alterado neste lote. Orçamentos dos demais chunks auditados aprovados.
- Dependências locais reutilizadas; instalação limpa, checagens completas das bibliotecas e TypeScript global frontend não executados neste lote. Suíte completa não aprovada: execução anterior registrou quatro falhas de mutações, fora dos testes direcionados.

## Pendências e limites
- Sem impressão visual autenticada ou geração real do PDF de produção: ambiente local não dispõe de Chromium e acesso Vendi a casaforteicf retornou tenant_not_found anteriormente.
- Operador Contabo releaseStatus CRM-3518: LOT_NOT_REGISTERED, BUILD=BLOCKED, PRODUCTION=untouched. Ferramenta disponível não oferece registro de novo lote. Integrador deve registrar SHA, executar gates completos, homologar e promover backend e frontend juntos.
- Não afirmar publicado ou PDF real validado. Sem migrations.
