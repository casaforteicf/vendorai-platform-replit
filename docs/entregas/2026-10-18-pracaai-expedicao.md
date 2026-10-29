# AppVendor — expedição de pedidos Praça.ai

Data: 2026-10-18
Estado: **implementado em branch; aguardando homologação**.

## Escopo

- Nova tela “Pedidos Praça.ai” para o lojista consultar pedidos já pagos e atualizar o estado de expedição.
- A API do AppVendor usa a sessão assinada para determinar o tenant e encaminha as operações ao Praça.ai por credencial servidor-servidor.
- O lojista informa separação, pedido pronto e saída para entrega/retirada; transportadora, código de rastreio e observação são opcionais conforme modalidade.
- Dados do comprador aparecem somente depois que a API Praça.ai confirmar o pagamento.
- A tela informa que a confirmação de entrega ainda depende do comprador e que o repasse financeiro ainda não está disponível.

## Dependências

- PR AppVendor #3564: esta tela, rotas autenticadas e menu do lojista.
- PR Praça.ai #49: endpoint interno de pedidos/expedição e acompanhamento do comprador.
- Configuração de `PRACA_AI_INTERNAL_API_URL` e `PRACA_ROUNDS_VENDOR_TOKEN` no servidor AppVendor; nenhum segredo deve ir ao navegador.

## Validação

- `git diff --check`: passou.
- AppVendor API `tsconfig.launch-ci` e build: passaram.
- AppVendor frontend build: passou.
- AppVendor frontend typecheck completo: reporta erros existentes em múltiplos arquivos. Execução filtrada não encontrou diagnóstico nos arquivos tocados.
- Health da homologação Contabo consultado: HTTP 200. Este lote ainda não está registrado no operador e, portanto, não foi compilado nem homologado na Contabo.

## Pendências e limites

- Sem merge, publicação ou alteração de produção.
- Integração precisa ser homologada em conjunto com a PR Praça.ai #49.
- O fluxo de payout/repasse Asaas, disputes, comprovante de entrega e devolução não fazem parte desta entrega.
- A alteração em `ScoutConfigPanel.tsx` apenas corrige um fechamento de função que impedia o parser/typecheck; a tela permanece como `return null` e continua sendo um item funcional separado.
