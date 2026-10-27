# Infraestrutura oficial e inventário de legados — Vendor.ai / Vendi / Arqdor

**Data:** 2026-10-27  
**Estado:** diagnóstico e política de consolidação; **nenhum serviço foi excluído por este documento**.  
**Objetivo aprovado:** manter somente recursos com função atual comprovada, obrigação de recuperação ou dependência documentada. Não reintroduzir Railway/Replit no caminho de produção sem decisão explícita.

## 1. Arquitetura-alvo

| Papel | Plataforma aprovada | Condição de manutenção |
| --- | --- | --- |
| Website e frontend | Cloudflare Pages | Projeto de produção confirmado, DNS/route verificados, deploy rastreável |
| API, jobs, Vendi e Browser Agent | VPS Contabo / Docker | Containers e funções comprovados por healthcheck e dependências |
| Banco | PostgreSQL em operação oficial do ambiente correspondente | Origem e destino documentados, backup testado e isolamento por tenant |
| Objetos/arquivos | Cloudflare R2 | Buckets e referências de aplicações verificadas |
| Código e revisão | GitHub `casaforteicf/vendorai-platform-replit` | Branch + SHA + revisão; **GitHub Actions não é o mecanismo de deploy** |
| Publicação | Operador Vendi na Contabo e implantação frontend Cloudflare | Homologação, evidências, rollback e confirmação pós-publicação |

A tabela acima representa a **arquitetura desejada**, não certificação de que o DNS e todos os ambientes atuais já correspondem a ela.

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

- **P0 — desbloquear Cloudflare:** substituir token de forma segura no conector, com escopo mínimo para consulta; não registrar tokens em GitHub. Confirmar zone, Pages, DNS, rotas e origin do `appvendorai.com`; corrigir o POST 404 primeiro.
- **P1 — limpar Railway sem dados:** remover os oito serviços do `vendorai-audit-cleanup`, somente após liberação de exclusão e confirmação final de ausência de consumidores; checar resultado.
- **P2 — encerrar legados web:** documentar DNS e dependências para retirar Railway do tráfego, depois desativar/remover domínios e serviços legados um por vez.
- **P3 — consolidar Contabo:** mapear nomes->imagem/sha->volume/rede->porta->função->rollback. Preservar prod/homolog e limpeza seletiva dos canários sem uso, só com autorização do operador e backup comprovado.
- **P4 — impedir regressão:** inventário mensal e auditoria semanal somente leitura de recursos, domínio, deploy, armazenamento, expiração e drift; novos serviços temporários com ticket, responsável e data de expiração.

## 7. Estado de execução desta entrega

Inventário e critérios formalizados. Não foi realizado delete, parada de containers, edição de DNS, mutação de Cloudflare, migração, merge ou deploy. A própria política de segurança bloqueou exclusão direta no Railway, e o token Cloudflare impede comprovar a topologia real. Produção preservada.
