# Vendi — transição entre releases de produção

Data: 21/10/2026. Branch: fix/vendi-release-successor-20261021.

## Problema e mudança
O operador bloqueava qualquer nova publicação quando outro lote estava PUBLISHED, inclusive quando esse registro correspondia exatamente à versão saudável em execução. Não existia transição normal entre releases.

O manifesto pode indicar PREVIOUS_LOT. A publicação exige um único predecessor publicado com SHA, tag, ID de imagem ativo e backup existentes. Outros registros publicados ou inconsistentes continuam bloqueando. A versão anterior permanece PUBLISHED durante a troca e passa a SUPERSEDED, com SUPERSEDED_BY, somente após saúde confirmada. O novo recibo inclui PREVIOUS_LOT. Rollback saudável restaura o registro anterior para PUBLISHED. Ambos os caminhos usam também o lock do deploy automático.

Não altera a imagem de aplicação homologada VENDI-3584, SHA 2c7fe971e199bb7ec0862a4d7892aa3ad474aaeb. Não aplicar migrations nem apagar registros/backups para liberar publicação.

## Validação
- Cinco cenários executados localmente usando o script real, Docker simulado e diretórios isolados: publicação seguida de rollback restaura ambos os registros; falha de saúde recupera container anterior sem modificar seu registro; predecessor errado, backup ausente e outro lote inconsistente bloqueiam.
- bash -n e git diff --check passaram.
- Teste na Contabo, instalação do operador e promoção: pendentes. A produção observada continua VENDI-3580.
- Os dois registros são gravados separadamente por rename atômico. Interrupção entre gravações exige reconciliação e deve permanecer bloqueada; não há promessa de transação atômica entre arquivos. Recuperação após SIGKILL não foi testada.

## Aplicação prevista
Extrair somente script e teste do commit aprovado em diretório isolado Contabo; executar os cinco testes e bash -n; comparar script instalado com a versão revisada; preservar cópia do operador. Somente depois instalar e definir PREVIOUS_LOT=VENDI-3580 no manifesto root da 3584. Publicar pelo operador oficial e conferir imagem, saúde, registros e backups. Não executar scripts de produção nos testes.
