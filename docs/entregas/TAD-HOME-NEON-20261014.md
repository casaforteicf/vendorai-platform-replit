# Registro Mestre — TAD home neon (2026-10-14)

- **Lote:** TAD-HOME-NEON-20261014
- **Versão:** v1
- **Módulo:** Frontend — tela inicial TAD (`/tad`)
- **Objetivo:** corrigir a tela inicial do TAD (logo, controles mockados, card "11 serviços autorizados", sino) e aplicar o layout neon de referência (desktop + mobile). Corrige também o build do frontend quebrado na `main`.
- **Escopo autorizado:** pedido do solicitante em 2026-10-14 ("logo alterada, botões mockados, CasaForteICF, 11 serviços autorizados, sino mockado, melhorar layout conforme modelo").
- **Branch:** `devin/1791975048-tad-home-neon`
- **PR:** [#3551](https://github.com/casaforteicf/vendorai-platform-replit/pull/3551)
- **Commits:** `e9ef3d6` (implementação), `140be32` (ajuste mobile), + atualização deste registro.

## Diagnóstico

- O auto-deploy do frontend falha desde `20261014-123001` (`last-frontend-status = FAIL`): `TadCentral.tsx:257` continha `div>` solto (resíduo do PR #3523), quebrando o `vite build`. O site continuou no release anterior, que ainda mostra o card "11 serviços autorizados".
- O header usava `/logo-full-light.svg` (texto "Vendor" escuro) sobre fundo escuro: só apareciam o símbolo e ".ai".
- Seletor de empresa: `div` com seta, sem ação. Sino: `button` sem `onClick`. Atalhos de Configurações/Suporte: `div`s decorativas. Atalho Ctrl+K exibido sem funcionar. Indicadores "+32%/+18%" fictícios.

## Itens concluídos

| Item | Implementação |
|---|---|
| Build quebrado | JSX corrigido (arquivo reescrito). |
| Logo | `/logo-full-dark.svg` (texto branco), link para `/tad`. |
| Card "11 serviços autorizados" | Removido (já ausente na `main`; passa a ser publicado quando o build voltar). |
| Seletor de empresa | `CompanySwitcher`: `GET /api/auth/switchable-tenants` + `POST /api/auth/switch-tenant` (mesmo fluxo do `StoreSwitcher`). Sem outras empresas, mostra só o nome, sem seta. |
| Sino | `NovidadesBell variant="icon"`: contador real (`/api/changelog/unread-count`), abre o painel de novidades e marca como lido. |
| Atalhos | Usuários → `/usuarios`; Equipe e permissões → `/configuracoes/equipe`; Integrações → `/configuracoes/integracoes`; Todas as configurações → `/configuracoes`; FAQ → `/faq`; Base de conhecimento → `/base-conhecimento`; Ajuda (?) → `/faq`; Ctrl+K foca a busca. |
| Dados fictícios | Removidos "+32%/+18%"; calendário mostra o mês/semana atuais. |
| Layout | Cards neon por módulo (ícone grande, borda com brilho, "Acessar"), grade 2 colunas no celular / 3 no desktop, busca no topo no mobile, menus com fechamento por clique fora/Esc. |
| Correções do Review | Lista do seletor só com empresas para as quais a troca é permitida (backend); em preview de tenant de super-admin o seletor não oferece troca e o override é limpo após a troca. |
| Autorização | Inalterada: só módulos autorizados + com rota viram link; demais ficam "Acesso em validação". |

## Arquivos alterados

- `artifacts/frontend/src/pages/TadCentral.tsx`
- `artifacts/frontend/src/pages/TadCentralRoute.tsx` (contagem de novidades passou para o `NovidadesBell`)
- `artifacts/frontend/src/components/NovidadesBell.tsx` (variante `icon`; variante padrão da sidebar inalterada)
- `docs/entregas/TAD-HOME-NEON-20261014.md`
- `artifacts/api-server/src/routes/tenant_switch.ts`: `GET /auth/switchable-tenants` passa a seguir a mesma regra do `POST /auth/switch-tenant` (só tenants da organização do tenant atual, com o usuário membro dela). Correção apontada pelo Devin Review.

## Testes / build

- `tsc --noEmit` (frontend): sem erros nos arquivos alterados. O projeto tem erros pré-existentes (TS6305 `lib/api-client-react/dist` não construído e derivados), fora do escopo.
- `pnpm run build` (frontend): **EXIT 0**, bundle-budget OK.
- **Build na Contabo** (cópia isolada `/root/devin-validate-tad-140be32`, via `git archive` do commit `140be32`, sem tocar em `/opt/vendorai/deploy-src`): `pnpm@10.26.1 install --frozen-lockfile` + `pnpm run build` do frontend → **EXIT=0** (`built in 1m 3s`, bundle-budget OK). Diretório removido após o teste.
- Backend (após correção do Review): `tsc -p tsconfig.launch-ci.json --noEmit` **EXIT 0**; `node ./build.mjs` **EXIT 0**. Frontend rebuild **EXIT 0**.
- Screenshots locais (`vite preview` + API mockada) desktop 1440px e mobile 390px: anexados ao PR.

## Estado

- **Implementado:** sim.
- **Validado tecnicamente:** sim. Build local + build na Contabo (EXIT 0).
- **Homologado:** pendente. O frontend de homologação não tem publicação separada; a validação visual foi feita com API mockada. Teste com login real ainda pendente.
- **Aprovado:** sim. O solicitante autorizou a publicação ("PUBLICA") em 2026-10-14.
- **Publicado:** merge squash do PR #3551 na `main` → auto-deploy da Contabo (frontend `deploy-frontend-auto.sh` e backend `deploy-backend.sh` homolog→prod). Resultado do deploy registrado no comentário de publicação do PR.

## Próximo passo

Revisão do PR pelo solicitante → merge autorizado → auto-deploy do frontend (`/opt/vendorai/deploy-frontend-auto.sh`) → Ctrl+Shift+R em https://app.appvendorai.com/tad.

_Atualizado em 2026-10-14._
