# Infraestrutura oficial e inventário de legados — Vendor.ai / Vendi / Arqdor

**Data:** 2026-10-27  
**Estado:** diagnóstico e política de consolidação; **nenhum serviço foi excluído por este documento**.  
**Objetivo aprovado:** manter somente recursos com função atual comprovada, obrigação de recuperação ou dependência documentada. Não reintroduzir Railway/Replit no caminho de produção sem decisão explícita.

## 1. Arquitetura-alvo

| Papel | Plataforma aprovada | Condição de manutenção |
| --- | --- | --- |
| Aplicativo principal `app.appvendorai.com` (frontend CRM/Arqdor) | Contabo/nginx (conforme `CLAUDE.md`, sujeito a validação de DNS/health live) | Build Vite servido em `/var/www/vendorai-app/current`; `/api/` encaminhado ao backend :5001; preservar deploy/rollback próprios |
| Site institucional `appvendorai.com` | Worker em `artifacts/website/public/_worker.js`; publicação/origin ativos ainda não comprovados | Conferir DNS, Pages/Workers/rotas e serviço que realmente recebe tráfego antes de migrar ou retirar Railway |
| API, jobs, Vendi e Browser Agent | VPS Contabo / Docker | Containers e funções comprovados por healthcheck e dependências |
| Banco | PostgreSQL em operação oficial do ambiente correspondente | Origem e destino documentados, backup testado e isolamento por tenant |
| Objetos/arquivos | Cloudflare R2 | Buckets e referências de aplicações verificadas |
| Código e revisão | GitHub `casaforteicf/vendorai-platform-replit` | Branch + SHA + revisão; **GitHub Actions não é o mecanismo de deploy** |
| Publicação | Operador Vendi na Contabo e implantação frontend Cloudflare | Homologação, evidências, rollback e confirmação pós-publicação |

A tabela distingue as **duas superfícies web**; o guia `CLAUDE.md` atribui o frontend principal ao Nginx/Contabo, mas isto e o caminho do website público devem ser confirmados no DNS e pelos cabeçalhos/respostas reais. Nenhuma mudança de hospedagem deve ser feita com base apenas no nome de um projeto Cloudflare Pages.

## 2. Evidências verificadas em 27/10/2026

- Contabo: `prodHealth` e `homologHealth` retornaram `{"status":"ok"}` (não equivalem a testes E2E completos).
- Contabo: `/dev/sda1` 96 GB total, 83 GB usados, 14 GB livres, 86% de uso. Docker: 26 imagens, 20 ativas; 30,95 GB no total e 29,69 GB marcados como reclamáveis pelo relatório. **Reclamável não significa seguro para apagar**; imagens podem servir de rollback.
- Há 20 containers ativos; além de produção e homologação aparecem canários, MCPs antigos, bancos de replay e containers de testes. Não remover por nome, idade ou status sem mapa de dependências/backup.
- Cloudflare, pelo conector administrativo disponível: `401 Invalid API Token`. DNS, projetos Pages, rotas, regras, credenciais e destinos ativos **não foram confirmados administrativamente**.
- Railway: serviço `vendorai-website` do projeto `vendorai-website-production-v2` (ID `5b8af8bd-8f4e-4e29-870f-0d1d521adc33`) permanece cadastrado e associa o domínio `appvendorai.com`; deploy mais recente reportado como `FAILED` em 22/09/2026 e métricas CPU/memória/rede zeradas por sete dias. A verificação do domínio retornou `verified: false`. **Não excluir a associação de domínio sem confirmação independente do DNS/Cloudflare**.
- Railway: projeto `vendorai-audit-cleanup` (ID `79f3347f-ded3-452d-83fd-2c7cce7c0e16`) possui oito serviços: `audit-cleanup`, `audit-cleanup-2`, `audit-batch2` a `audit-batch6`, `frontend-bundle-split-137`. Todos sem domínios e sem volumes; últimos deploys falharam ou não existem, e medições de CPU e tráfego TX consultadas (7 dias) deram zero. **Candidatos fortes a exclusão**, após verificar agendamentos/integradores e efeito da exclusão no plano do Railway.
- Outros projetos Railway vistos: `vendorai-frontend-railway` com seis serviços de frontend/teste e último deploy falho; `vendorai-cloudflare-mcp` com treze serviços de tentativas de integração/deploy, alguns falhos e outros sem deploy; `vendorai-homologacao` com serviços e volumes de banco. **Não assumir que não servem nem apagar volumes**.
- Tentativa de exclusão direta do Railway foi **bloqueada pela política de segurança da ferramenta**. Respeitar o bloqueio; não contornar via outra ferramenta, credencial, chamada ou CLI.

## 3. Incidente que torna a consolidação urgente

- O site público `https://appvendorai.com/api/site/behavior-event` apresentou POST 404 com `Application not found` e `x-railway-fallback: true`.
- O POST de JSON inválido `{}` diretamente em `https://api.appvendorai.com/api/site/behavior-event`, acompanhado dos cabeçalhos institucionais, retornou HTTP 400 `Evento comportamental inválido`: a rota existe e seu validador funciona nesse caminho.
- No GitHub, `artifacts/website/public/_worker.js` define `RAILWAY_ORIGIN = "https://api.appvendorai.com"` e encaminha `/api/*`; `artifacts/api-server/src/routes/site.ts` implementa a rota.
- A resposta 404 do site público evidencia divergência de infraestrutura/roteamento; **não confirma qual regra/DNS/origin ativo a produz**. Não trocar hostname nem remover o Worker só por ter nome legado.
- Corrigir e comprovar o caminho Cloudflare -> API Contabo em homologação, com testes de POST, corpo/status, sem redirecionamento e sem alterar semântica de consentimento ou segurança; só então publicar com rollback disponível.

## 4. Classes de retenção

**Manter — protegido contra limpeza:** API/DB de produção; módulos e dados de clientes; volumes; frontend real; R2; Vendi e MCP efetivamente usados; homologação indispensável; backup e ao menos uma versão anterior para rollback; credenciais e registros exigidos pela operação.

**Quarentena — não desligar antes de provar:** hostname/domínio Railway ainda associado; containers canary/DB replay/MCP antigos; projetos de deploy Cloudflare via Railway; bancos do projeto Railway de homologação; integrações que possam ser chamadas por cron, webhook, DNS, proxy ou outros serviços.

**Candidato à remoção — após confirmação final:** oito serviços sem volume, domínio ou atividade no projeto Railway `vendorai-audit-cleanup`; instâncias de teste com deploy falho e sem dependências; imagens Docker órfãs após preservar hashes/referências de rollback.

## 5. Gates obrigatórios antes de qualquer remoção

1. Identificar proprietário, função, ambiente, custos, último uso, dependências, agendamentos, DNS, webhooks e dados persistentes.
2. Provar que o recurso não recebe tráfego, não realiza jobs, não possui volume necessário, não é dependência de outro serviço e não é parte do rollback.
3. Registrar cópia/exportação dos parâmetros relevantes e retenção de logs/evidências, quando cabível.
4. Retirar tráfego/credenciais/agenda em sequência segura; testar site, CRM, APIs, login, banco, integração e Vendi após cada etapa.
5. Somente após observação e validação executar exclusão por ferramenta autorizada; **nunca** usar `docker system prune -a --volumes` indiscriminadamente.
6. Registrar data, operador, recursos exatos, rollback, saúde antes/depois e espaço realmente recuperado.
7. Se a ferramenta de exclusão retornar bloqueio de segurança, parar e registrar a pendência. Sem bypass.

## 6. Ordem de execução

- **P0 — desbloquear Cloudflare para o site público:** substituir token de forma segura no conector, com escopo mínimo para consulta; não registrar tokens em GitHub. Confirmar zone, Pages, DNS, rotas e origin do `appvendorai.com`; corrigir o POST 404 primeiro.
- **P1 — limpar Railway sem dados:** remover os oito serviços do `vendorai-audit-cleanup`, somente após liberação de exclusão e confirmação final de ausência de consumidores; checar resultado.
- **P2 — encerrar legados web:** documentar DNS e dependências para retirar Railway do tráfego, depois desativar/remover domínios e serviços legados um por vez.
- **P3 — consolidar Contabo:** mapear nomes->imagem/sha->volume/rede->porta->função->rollback. Preservar prod/homolog e limpeza seletiva dos canários sem uso, só com autorização do operador e backup comprovado.
- **P4 — impedir regressão:** inventário mensal e auditoria semanal somente leitura de recursos, domínio, deploy, armazenamento, expiração e drift; novos serviços temporários com ticket, responsável e data de expiração.

## 7. Estado de execução desta entrega

Inventário e critérios formalizados. Não foi realizado delete, parada de containers, edição de DNS, mutação de Cloudflare, migração, merge ou deploy. A própria política de segurança bloqueou exclusão direta no Railway, e o token Cloudflare impede comprovar a topologia real. Produção preservada.

## 8. Evidência complementar — Cloudflare (27/10/2026)

- `cloudflare_list_zones` retornou `appvendorai.com` como zona **active** com nameservers Cloudflare. Este resultado foi acessível embora `cloudflare_status` ainda responda `401 Invalid API Token`; os métodos parecem ter credenciais/escopos distintos. Evitar dizer que toda a Cloudflare é inacessível.
- `cloudflare_get_pages_project("vendorai-website")` retornou projeto Pages com domínio customizado `appvendorai.com` e `www.appvendorai.com`, `uses_functions: true`, e último deploy em produção marcado como sucesso em **07/10/2026** (ad_hoc, sem SHA Git fornecido). **Este projeto não deve ser excluído.** É candidato operacional para o site institucional, mas roteamento efetivo ainda precisa ser verificado.
- `cloudflare_get_pages_project("vendorai")` retornou projeto distinto, apenas com `vendorai.pages.dev`, produção desativada para publicação GitHub, deploy canônico **09/10/2026**; não há evidência de domínio customizado do aplicativo principal. O guia `CLAUDE.md` mantém `app.appvendorai.com` diretamente na Contabo/Nginx.
- `cloudflare_list_dns_records` retornou **403 Authentication error**; consulta de DNS está bloqueada no conector atual mesmo após o usuário validar e salvar, em arquivo separado na VPS, token novo de diagnóstico. Arquivo privado não altera as credenciais de containers/conectores automaticamente. É necessário testar o token diretamente, somente leitura, antes de concluir qualquer intervenção.
- A associação nominal de domínio à Pages **não demonstra que o tráfego esteja realmente chegando nela**; requer DNS e teste HTTP público.

## 9. DNS e Workers confirmados por consulta do operador na VPS (27/10/2026)

Leitura direta de API Cloudflare com o novo token de diagnóstico, resposta `DNS_STATUS=OK` e `WORKERS_STATUS=OK`:

| Host | Tipo | Valor | Proxy |
| --- | --- | --- | --- |
| `appvendorai.com` | CNAME | `vendorai-website.pages.dev` | true |
| `www.appvendorai.com` | CNAME | `vendorai-website.pages.dev` | true |
| `app.appvendorai.com` | A | `31.220.96.205` (Contabo) | false |
| `api.appvendorai.com` | A | `31.220.96.205` (Contabo) | false |

Rotas Workers consultadas: `mcp.appvendorai.com/*` sem script atribuído; `app.appvendorai.com/*` sem script atribuído; `*.appvendorai.com/*` atribuído a `vendorai-subdomain-proxy`. A rota wildcard não corresponde ao domínio raiz `appvendorai.com`, mas pode afetar subdomínios proxied. Não remover sem confirmação de dependências.

**Conclusão atualizada:** DNS de produção não encaminha `appvendorai.com` para Railway: aponta para o projeto Cloudflare Pages `vendorai-website`. A resposta pública `x-railway-fallback` deve ser investigada como possível proxy/artefato antigo no deploy Pages de **07/10/2026** ou outra regra de borda; ainda não está provada a origem precisa. O arquivo fonte atual `artifacts/website/public/_worker.js` encaminha `/api/*` a `https://api.appvendorai.com`, apesar do nome legado `RAILWAY_ORIGIN`. Não alterar DNS, Worker wildcard nem eliminar serviço Railway ainda.

## 10. Teste comparativo HTTP do proxy do website — confirmado na VPS

Em 27/10/2026, usando POST de JSON inválido `{}`, headers `Content-Type: application/json`, `Origin: https://appvendorai.com` e `X-Forwarded-Host: appvendorai.com`:

| URL | HTTP | Resposta/headers |
| --- | --- | --- |
| `https://appvendorai.com/api/site/behavior-event` | 404 | `x-railway-fallback: true`, `Application not found` |
| `https://vendorai-website.pages.dev/api/site/behavior-event` | 404 | Mesmo fallback Railway |
| `https://api.appvendorai.com/api/site/behavior-event` | 400 | `Evento comportamental inválido`, resposta do Nginx/API |

**Diagnóstico:** API de destino recebe o POST e valida; fallback ocorre também no subdomínio Pages, isolando problema no deploy/encaminhamento do próprio site (não no registro DNS do domínio customizado). O projeto `vendorai-website` teve última publicação em 07/10/2026 e o código `main` atualmente usa `https://api.appvendorai.com` como origin. **Hipótese forte: Worker/artefato publicado antigo** — conferir o script Cloudflare Pages ativo antes de promover novo build; não afirmar que a URL Railway está presente no script sem inspecioná-lo.

Para correção: identificar conteúdo do Worker `pages-worker--19232173-production` por API somente leitura (se token permitir), construir o website a partir de SHA reproduzível, verificar `dist/public/_worker.js` e integridade dos assets/SEO, implantar prévia isolada, repetir o POST e navegabilidade, assegurar caminho de rollback para deploy anterior, promover com credencial de publicação autorizada, repetir testes no domínio de produção. **Não chamar redeploy sem garantir artefatos atualizados.**
