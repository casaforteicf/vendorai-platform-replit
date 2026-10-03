# Benchmark de qualidade — Arquiteto IA do App Builder

O Arquiteto IA não deve ser aprovado apenas por gerar JSON válido. A referência de qualidade é um app empresarial operacional, revisável e coerente com as capacidades reais da plataforma.

## Cenários canônicos

1. **Metalúrgica B2B pré-tenant** — orçamento técnico, pedido, produção, entrega, recorrência e papéis comercial/engenharia/produção/gestão.
2. **Construtora com tenant** — leads, obras, orçamento, cronograma, financeiro, anexos, cliente e gestão.
3. **Portal de cliente** — consulta de pedido/obra, documentos, mensagens, aprovações e permissões restritas.
4. **Projeto interno** — protótipo sem tenant, editável e versionável, sem publicação operacional antes do vínculo.
5. **Auditoria de app existente** — preservar customizações, identificar gaps e sugerir correções sem reescrever o que já está correto.

## Gates obrigatórios

- Não inventar `actionKey`, data source, workflow ou componente executável fora dos registries.
- `runtime.version = 1`, IDs de página estáveis e `defaultPageId` válido.
- Modo profundo deve fazer duas passagens: projeto + revisão crítica independente.
- A revisão deve cobrir produto, UX, segurança, dados, permissões, integrações e responsividade.
- O resultado deve separar capacidade existente de gap planejado.
- A IA nunca publica diretamente; somente cria uma nova versão em rascunho após aprovação humana.
- Apps pré-tenant devem poder ser arquitetados sem liberar runtime operacional ou usuários externos.

## Score de referência

Um resultado candidato a produção deve buscar, após a segunda passagem:

- Completude >= 85
- UX >= 85
- Segurança >= 90
- Dados >= 85
- Integração >= 80 quando integrações forem necessárias

Scores não substituem os validadores determinísticos. Qualquer finding de compatibilidade de runtime ou registry continua bloqueando aplicação automática da proposta.

## Critério de evolução

Toda regressão encontrada em produção deve virar um novo caso de teste ou novo gate deste benchmark. O objetivo é aumentar a qualidade por evidência, não por prompts cada vez maiores sem validação.