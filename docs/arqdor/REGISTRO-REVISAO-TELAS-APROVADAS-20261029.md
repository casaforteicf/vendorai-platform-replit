# Registro de continuidade — Portal Unificado e revisão das Telas 1 (29/10/2026)

## Ponto de parada
PR #3679 aberta, não mesclada. Código aditivo ainda não testado nem conectado às rotas públicas. Migration não executada. Nenhuma publicação. O login único ainda NÃO está operacional.

### Código preparado na PR
- Estrutura de identidade global, credenciais, sessões, vínculo por tenant, desafios de vinculação e confirmação de e-mail;
- funções de verificação de sessão e vinculação com transação;
- cadastro/ativação de identidade global e serviço de envio por Resend;
- testes escritos, não executados;
- pendências: proteção de abuso em rotas públicas, cadastro/login/endpoints completos, prova de titularidade e entrega de e-mail integradas, integração com Portal do Cliente/ARQDOR/Praça.ai, validação do banco e permissões.

## Decisão do responsável
**Interromper a execução do Portal Unificado neste ponto e revisar as Telas 1 aprovadas, todos os botões e suas funções, antes de seguir.**
Não confundir desenho aprovado com implementação funcional.

## Telas aprovadas
Referências imutáveis: `docs/arqdor/TELA-1-CLIENTE-PROFISSIONAL-APROVADAS.md` e `docs/arqdor/BASELINE-VISUAL-APROVADA-2026-10-29.md`, imagens originais no ZIP referido nesses documentos.

- Profissional: 7 ambientes Projetos, Modelagem 2D/3D, Materiais, Render, Especificações, Orçamento, Entrega; apenas 1 menu principal, barra superior com projeto/salvamento/histórico/tema/Vendi, painéis contextuais.
- Cliente: acesso pela **estrutura existente Portal do Cliente** (correção da antiga indicação de entrada direta no ARQDOR), com ARQDOR Cliente dentro do portal e acesso ao Praça.ai pelo mesmo login global quando implementado.
- Nenhum botão, atalho, menu ou assistente duplicado. Preservar logos originais do kit.
- Inspecionar cada botão contra imagem aprovada e código real; classificar operacional/parcial/planejado, sem alterar a tela sem aprovação.

Esta nota é registro de continuidade, não declaração de que a integração foi concluída.
