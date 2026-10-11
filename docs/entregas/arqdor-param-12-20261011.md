# ARQ-PARAM-12 — preservação em salvamento legado

Versão: 2026.10.11.12
Código: 4ab9bcc4f2b539ff4c9e74305377a09d43c92ead
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
PATCH do Concept preserva configuration.architecturalModel existente quando a configuração recebida omite o campo. Permite substituir por snapshot explícito, inclusive vazio para remover todos os elementos. Função pura integrada após a preservação existente de tokens do tour, planta de referência e arquivos. A consulta mantém os filtros existentes de tenant e proprietário. Não altera banco nem migrações.

## Arquivos
- artifacts/api-server/src/lib/arch-concept-configuration.ts
- artifacts/api-server/src/lib/arch-concept-configuration.test.ts
- artifacts/api-server/src/routes/arch.ts

## Verificação
3 testes novos locais aprovados para o helper: omissão legada/roundtrip JSON, snapshot vazio explícito, edição explícita e projeto legado sem modelo. TypeScript do helper aprovado. Inspeção do caminho PATCH e do schema JSONB. Suite completa das rotas Express não executada; testes não usam HTTP nem banco e não comprovam o ciclo real salvar/reabrir. Os 51 testes do lote anterior não foram repetidos neste lote, que não altera frontend.

## Pendências
Homologação/publicação Contabo adiadas pelo usuário. Sem merge/main/deploy. Ainda pendentes ciclo HTTP/banco, interface/desfazer-refazer e mobile. Sem prevenção de conflito entre dois snapshots completos concorrentes; a correção cobre omissão do campo. Validação do conteúdo do snapshot na API e tipagem explícita no contrato do banco ainda precisam de alinhamento com o modelo central.
