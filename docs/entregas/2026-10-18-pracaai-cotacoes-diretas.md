# Praça.ai — cotações diretas no AppVendor

Data: 2026-10-18

## Escopo preparado

A branch `feat/pracaai-cotacao-direta-appvendor` acrescenta a entrada **Cotações Praça.ai** ao menu CRM do AppVendor, uma caixa de entrada de solicitações, formulário de proposta por item, frete, prazo e condições, além do proxy autenticado para a API Praça.ai.

A integração cria o lead anônimo no CRM e envia a descrição da demanda para Conversas. Nome, telefone, e-mail e endereço completo não são mostrados antes do aceite. Quando o comprador aceita uma proposta, a identidade do comprador é liberada no lead para a loja vencedora.

## Dependência

A API correspondente está na branch `feat/pracaai-cotacao-direta-ciclo` do repositório Praça.ai. A tela AppVendor não pode ser homologada antes de a API estar disponível na homologação Contabo.

## Configuração existente da integração

A API AppVendor encaminha chamadas usando as variáveis já previstas para Praça.ai:

- `PRACA_AI_INTERNAL_API_URL`: URL interna da API Praça.ai.
- `PRACA_ROUNDS_VENDOR_TOKEN`: segredo servidor-servidor, configurado nos dois serviços e nunca exposto ao navegador.

## Validação e publicação

Status: **implementação preparada; não validada; não publicada**.

Na revisão estática de 2026-10-18, foi corrigida a normalização da URL do Praça.ai no proxy AppVendor. O servidor ainda precisa passar pela compilação e pelos gates abaixo; a revisão estática não substitui o build.

Não foi possível executar o protocolo de gates localmente porque o terminal de desenvolvimento não está conectado nesta sessão. Permanecem pendentes, antes de abrir PR ou preparar lote:

1. instalação e typecheck do pacote de bibliotecas;
2. `tsc -p tsconfig.launch-ci.json --noEmit` na API;
3. build da API e build Vite do frontend;
4. orçamento de bundle e testes direcionados;
5. homologação integrada na Contabo usando uma loja e uma conta de comprador de teste;
6. comprovar que vendedores não recebem identidade antes do aceite e que a loja vencedora recebe um lead identificado após o aceite.

Não foi feita alteração na produção. Nenhuma cobrança ou pagamento é iniciado por esta tela; o pagamento e a entrega são formalizados com a loja após o aceite.
