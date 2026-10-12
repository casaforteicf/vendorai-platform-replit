# MULTI-04.11 — Interface de revisão de conflitos

PR #3487, branch draft. Implementação isolada ainda não montada no ConceptPlanner.

Arquivos:
- `artifacts/frontend/src/lib/arqdorConflictCompare.ts`: comparação somente leitura entre snapshots locais e remotos, com limite de 200 diferenças.
- `artifacts/frontend/src/pages/arch/ArqdorConflictReview.tsx`: painel para visualizar caminhos divergentes, manter cópia local, cancelar ou prosseguir com versão remota apenas após reconhecimento de necessidade de backup.
- `artifacts/frontend/src/lib/arqdorConflictCompare.test.ts`: testes declarados de diferenciação, imutabilidade e limite.

### Antes de ativar
- Integrar à captura real de snapshot local e à leitura autenticada da versão remota.
- Exigir **backup comprovadamente persistido** antes de abandonar alterações locais; marcar checkbox não comprova backup.
- Criar visualização semântica de paredes, aberturas e móveis; a comparação atual é estrutural JSON, não substitui comparação 2D/3D nem resolve conflitos de arrays.
- Nunca aplicar mesclagem automática ou substituir dados remotos.
- Resolver cancelamento e revalidação de autorização após troca de tenant/projeto.
- Rodar testes e typecheck, homologar com alterações simultâneas no PostgreSQL isolado.
- Não publicar nem fazer merge. Flags existentes continuam desligadas.

Status: código criado, não executado/homologado.
