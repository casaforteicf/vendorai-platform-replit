# MULTI-03.3 — Recuperação portátil de rascunhos

Implementado na branch `audit/multi-pwa-install-gates-20261011`, PR #3487.

## Entrega
- `arqdorRecoveryPackage.ts`: exportação e importação de rascunhos com senha de recuperação.
- PBKDF2-SHA256 com 310.000 iterações, salt único de 16 bytes e AES-256-GCM com IV único de 12 bytes e cabeçalho autenticado.
- A exportação contém somente texto cifrado. Senha e chave derivada não são armazenadas e não são enviadas.
- Na restauração, exige mesmo usuário/tenant/projeto/contexto e rejeita formato inválido, senha incorreta e adulteração.
- `arqdorRecoveryPackage.test.ts`: testes declarados de ida/volta, escopo, senha, alteração do pacote e versão.

## Limites obrigatórios
1. **Não há botão de exportar/abrir no Arqdor nem salvamento automático**: utilitário de domínio, não entregue ao usuário final.
2. **Não recupera sem o pacote e a senha**: não existe escrow de chave ou restauro em nuvem. Orientar o usuário antes do uso.
3. O backup é um retrato: deve ser confrontado com a versão remota antes de aplicar; nunca sobrescrever silenciosamente.
4. Importação só é permitida após autenticação e autorização remotas; o escopo em memória é uma salvaguarda adicional, não RBAC.
5. Limite de tamanho, backup durável, gestão de quotas, malware/schema validation e UX de senha precisam de implementação antes do rollout.
6. Avaliar em homologação WebCrypto real, compatibilidade iOS, arquivo grande, sessão revogada e cenários com versões conflitantes.
7. **Testes ainda não executados; sem merge e sem produção.**

## Próximo sublote
Integrar fluxo explícito de exportação/recuperação na UI do Arqdor atrás de feature flag, com permissão backend, comparação de revisão, confirmação do usuário e backup anterior à mutação. Não ativar offline por padrão.
