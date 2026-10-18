# Entrega — PRACA-RODADAS-2026-10-18

- **Lote / versão:** PRACA-RODADAS-2026-10-18 · v1.0
- **Objetivo:** implementar rodadas coletivas com propostas decrescentes e anonimato até o comprador aceitar a oferta vencedora.
- **Escopo autorizado:** marketplace continua independente; cadastro/entrada em lote pelo Praça.ai; integração do lado lojista pelo AppVendor.ai; lead sem identidade no CRM durante a disputa; revelação após aceite.
- **Praça.ai branch:** `feat/pracaai-rodadas-api`
- **Praça.ai commits:** schema `f3dc82047d2a3159422badceb0f69ee1afa89e53`; API + CRM + fechamento `05ee2e40db3413a3ae8d1d58cbb321005e603513`; tela compradora `bfa56b30e5b074f7d76b6fd265004ed6848a22f6`.
- **AppVendor branch:** `feat/pracaai-rodadas-integracao`
- **AppVendor commits:** proxy backend `1e94bef214fd5a09fd1269b4f96fabe035e145b9`; tela `8f3002ffbe0dd073f250cd41b280a0851633228b`; menu/rota e montagem API `f7885e7aa3c595b376f0ec0fb262fd24c56f85ca`.
- **PRs:** nenhum aberto para esta versão. O PR anterior #46 já foi mesclado; este trabalho está em branches novos.

## Implementado

- Praça.ai: cria demandas padronizadas, agrega participantes compatíveis por material, especificação, região e data de necessidade, e lista apenas lotes reais abertos.
- Praça.ai: encerra lotes no prazo, escolhe a menor oferta efetiva (preço unitário + frete rateado), cria uma proposta individual por comprador e permite aceitar ou recusar.
- AppVendor.ai: menu e tela “Rodadas Praça.ai”; lojas habilitadas veem demanda, região, prazo e melhor preço anônimo, e registram lances.
- AppVendor.ai: proxy exige sessão autenticada e deriva tenant da sessão; o token servidor-servidor não vai para o browser.
- CRM: primeiro lance cria lead anônimo e uma conversa na caixa do lojista; aceite do comprador atualiza o lead com identidade e contato.
- Dados de compradores, nomes de lojas e histórico nominal de ofertas não aparecem na listagem da rodada.
- Registro de propostas anteriores é mantido para auditoria.
- A cotação direta permanece independente da rodada.

## Configuração necessária

Configurar o mesmo segredo aleatório de pelo menos 32 caracteres, apenas no backend dos dois serviços:

- Praça.ai API: `PRACA_ROUNDS_VENDOR_TOKEN`
- AppVendor.ai API: `PRACA_ROUNDS_VENDOR_TOKEN`
- AppVendor.ai API: `PRACA_AI_INTERNAL_API_URL` apontando para a URL interna/HTTPS da API Praça.ai, incluindo o prefixo de API exigido pela implantação.

Não gravar valores de segredo em GitHub, frontend, logs ou este registro. A conta lojista precisa estar habilitada para vender no Praça.ai.

## Estado e pendências

- **Estado:** implementado sem validação.
- **Testes / typecheck / build:** não executados nesta sessão; não houve checkout local do monorepo nem acesso ao ambiente isolado da Contabo para registrar evidência.
- **Homologação:** pendente na Contabo, incluindo teste com duas contas compradoras e duas lojas para verificar sigilo, disputa de lances, encerramento e CRM.
- **Pagamento:** o aceite cria o pedido individual, revela a loja e aciona o CRM; a cobrança não está integrada a um checkout da rodada nesta entrega. O comprador e a loja ainda precisam formalizar pagamento e entrega.
- **Banco:** DDL aditivo e idempotente foi preparado no bootstrap do Praça.ai, mas nenhuma migração foi aplicada nesta execução.
- **Merge / deploy / produção:** não realizados.
- **Próximo passo:** validar na Contabo com as variáveis de ambiente configuradas; corrigir eventuais falhas de build; então abrir PR de AppVendor e atualizar PR de Praça.ai para revisão.

Data de atualização: 2026-10-18.
