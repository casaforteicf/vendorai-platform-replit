# Modelo mestre de trabalho — Vendor.ai + Arqdor

**Versão:** 1.0 · **Data:** 13/10/2026 · **Situação:** proposta de governança, sujeita a revisão do PR.

> Documento de **organização e acompanhamento**. O protocolo técnico vinculante permanece em [PROTOCOLO-EXECUCAO-AGENTES.md](./PROTOCOLO-EXECUCAO-AGENTES.md). As regras já existentes em `AGENTS.md` e `CLAUDE.md` não são substituídas. Havendo conflito, interromper a ação afetada e reconciliar explicitamente as regras com aprovação, jamais adivinhar.

## 1. Resultado esperado

Encerrar requisitos aprovados com evidência verificável de código, teste, experiência de uso, versão implantada e aceite. Proibido equiparar plano, código escrito, PR, merge, deploy ou HTTP 200 a funcionalidade concluída. Aproveitar implementações existentes antes de criar novas.

## 2. Responsabilidades

| Papel | Responsabilidade | Limite |
|---|---|---|
| Direção | Aprovar visão, escopo, prioridades, alteração relevante, migrations e ativações que dependam de aprovação | Não precisa reaprovar execução técnica rotineira já autorizada |
| Coordenação/auditoria | Manter inventário, requisitos e dependências; confrontar evidências; priorizar bloqueios | Nunca afirmar teste/publicação sem prova |
| Desenvolvimento | Investigar código, implementar e testar em branch exclusiva, abrir PR draft | Não efetuar merge |
| Integração | Conciliar com main atual, executar gates, baseline, migrations autorizadas e merge REST com SHA | Não ativar funcionalidade não homologada |
| Homologação | Testar fluxos reais, visual, tenants, persistência e integrações | Registrar ambiente, SHA e evidências |
| Infraestrutura | Conferir releases, backup, deploy, healthcheck, logs, monitoramento e rollback | Não alterar cron/scripts sem autorização |

Um agente pode acumular papéis, mas deve registrar as evidências separadamente. **Um owner principal por lote/conjunto de arquivos; não permitir dois agentes editando o mesmo escopo sem coordenação.**

## 3. Fonte da verdade e catálogo

- Repositório: `casaforteicf/vendorai-platform-replit`; consultar `main` atual antes de cada integração.
- GitHub Issues: requisito, bugs e critérios de aceite; GitHub Projects: quadro de execução; PR: diff, gates e evidências; `docs/entregas/`: especificações e atas de lote.
- Identificador: `Fxx-Lyy-Rzz` (frente, lote, revisão), com vínculo para Issue/PR.
- Campos obrigatórios: requisito e critério observável; referência visual quando houver; dependências; prioridade; responsável; branch; PR; SHA base/head; flag; migrations; ambiente; testes; evidências; riscos; impedimentos; próxima ação; status produção.
- Uma revisão não apaga o histórico da anterior.

## 4. Frentes

| Frente | Área |
|---|---|
| F01 | Arqdor Projeto: geometria BIM central, 2D/3D, importações, documentação e revisões |
| F02 | Arqdor Render: câmeras, materiais, iluminação, IA, CPU/GPU e histórico |
| F03 | Arqdor Studio 2.0: identidade visual e usabilidade transversal |
| F04 | Arqdor Measure: cotas, fotos, comparação com projeto e proveniência |
| F05 | Mobiliário: módulos paramétricos e fabricação |
| F06 | Especificação, quantitativos, orçamento e marketplace |
| F07 | Vendor.ai: CRM, TAD, ERP, agentes IA, marketing, obras, suporte e conexões |
| F08 | Infraestrutura, segurança, offline, testes, deploy e observabilidade |

Dependência arquitetural: **Projeto BIM aprovado e versionado → Render / Measure / Especificação / Orçamento**. Nenhum consumidor deve inventar geometria divergente nem alterar projeto aprovado sem revisão e confirmação. Qualidade, segurança e estabilidade são transversais em todas as ondas, não apenas na última.

## 5. Estados e percentuais

Fluxo: **inventariado → especificado/aprovado → em desenvolvimento → implementado → validado tecnicamente → integrado → homologado funcional/visualmente → publicado e verificado → aceito/encerrado**.

Estados alternativos: bloqueado (com motivo e evidência), substituído, cancelado, **publicado dormente** (flag off, sem efeito observável). Merge de código dormente não é ativação.

Percentuais **separados** por checklist de requisitos ponderados: especificação, implementação, validação técnica, homologação e produção ativa. Sem checklist auditável, apresentar **não apurado**. Não usar commits, quantidade de PRs nem estimativas subjetivas como percentual.

## 6. Fluxo operacional por lote

1. Mapear requisito aprovado, teste de aceite e dependências.
2. Auditar `main`, branches, PRs, código, flags, testes e módulos similares; reutilizar.
3. Atribuir um owner e reservar escopo; abrir ou reutilizar Issue e PR draft.
4. Desenvolver e testar por requisitos; isolar funcionalidades incompletas **no frontend e backend** com flag desativada.
5. Anexar no PR draft SHA, comandos executados, saídas, arquivos afetados, captura/trace quando aplicável, pendências e riscos.
6. Integrador atualiza `main`, resolve conflitos por intenção e executa gates na versão final reconciliada.
7. Comparar diagnósticos completos TypeScript entre `main` e branch **nas mesmas condições** de dependências/configuração. Interseção entre arquivos alterados e arquivos com erro é apenas triagem; não comprova ausência de regressões indiretas.
8. Testar integração, permissões, dados, isolamento por tenant e contratos afetados; migrations somente com autorização explícita, revisão e estratégia de recuperação.
9. Fazer merge pela API REST somente se todos os critérios de integração aplicáveis forem satisfeitos, usando o **HEAD SHA exato** e obedecendo às aprovações vigentes.
10. Homologar versão identificada na Contabo e navegador; comparar com mockup aprovado; registrar screenshot, resultados esperados/reais, usuário/tenant de teste, logs e SHA.
11. Ativar apenas com aceite de segurança e funcionalidade, autorização necessária e capacidade comprovada de rollback; verificar SHA realmente ativo e observar depois da liberação.
12. Encerrar apenas quando requisitos e evidências estiverem completos; manter backlog das lacunas.

## 7. Gates técnicos mínimos

Seguir o protocolo vigente. Inclui `CI=true`, pnpm 10.26.1, instalação das dependências, `typecheck:libs`, TypeScript `tsconfig.launch-ci.json` do backend, `node build.mjs` do backend, `vite build` do frontend, `scripts/audit-bundle-budget.mjs`, Vitest dos componentes e integrações afetadas, `git diff --check`, avaliação de flags/segredos/migrations e comparação de diagnósticos TypeScript com baseline.

Os erros preexistentes do frontend não devem bloquear automaticamente publicação, **mas qualquer regressão nova bloqueia**; erros em arquivos que não mudaram também podem ser regressões. Builds verdes não substituem smoke autenticado.

## 8. Homologação, testes E2E e design

E2E Playwright deve cobrir progressivamente caminhos críticos reais, sem fingir sucesso com mocks no aceite final. Coletar trace/screenshot e ambiente. Testar criação → edição → salvamento → fechamento/reabertura → revisão, papéis, tenants, concorrência e falhas de rede.

- **Projeto:** paredes, espessuras, aberturas, escadas, lajes, cobertura, 2D↔3D, persistência, export/import e revisões.
- **Render:** consumir mesmo BIM aprovado; câmera/FOV persistente, materiais/luz, geração verdadeira, versões e controles funcionais. Detectar WebGPU **não** significa renderização GPU implantada.
- **Studio:** comparar com referência visual aprovada (grafite escuro, verde com moderação, tipografia compacta, workspace protagonista, propriedades contextuais e histórico), em desktop e mobile.
- **Measure:** medir e registrar cotas verificadas, referência/proveniência, comparação e persistência.
- **Especificação:** quantitativos e materiais por revisão, recálculos, orçamento versionado, permissões e consistência por tenant.

## 9. Publicação, segurança e rollback

Infra operacional descrita no `CLAUDE.md` vigente: **frontend Vite estático na Contabo/nginx** (Cloudflare Pages com domínio inativo) e backend Docker Contabo; cron existente coordena deploy/healthchecks (homologação API `:5000`, produção `:5001`) e rollback. Registrar SHA efetivo, release frontend/backend, verificações de acesso real, logs e backup recuperável. Não presumir que `main`, branch ou PR coincide com versão em produção; verificar na VPS.

Não usar Replit, TinyFish, Desktop Commander, GraphQL para GitHub nem GitHub Actions como mecanismo obrigatório. Não revelar segredos. Commits com e-mail do proprietário conforme protocolo. Não aplicar migrations em produção sem autorização. Evitar qualquer mudança de infraestrutura ou produção não autorizada.

## 10. Prioridade e ondas

- **P0:** segurança, perda de dados, parada/regressão crítica; corrigir com owner isolado.
- **P1:** bloqueio de uso real ou divergência grave com o aprovado.
- **P2:** integração parcial, testes, documentação e qualidade.
- **P3:** otimizações e melhorias não bloqueantes.

**Onda A:** inventário verificável, baseline, owners e conflitos. **Onda B:** BIM/Projeto, Render integrado e Studio. **Onda C:** Measure, Mobiliário, MEP, Especificação e Orçamento. **Onda D:** aceite ponta a ponta e estabilização. F07 mantém correções críticas independentes em paralelo.

## 11. Modelo de relatório de entrega

Para cada `Fxx-Lyy-Rzz`: requisito; aceite esperado; situação; evidência e link; owner; PR/branch; SHA de referência e testado; comandos e resultados reais; ambientes e usuários/tenants de teste; screenshots/traces; feature flag; migrations; bloqueios/riscos; próxima ação; estado de produção; data do aceite.

Vocabulário obrigatório: **implementado** = código comprovado; **testado** = resultado/registro; **homologado** = fluxo real verificado; **publicado** = versão efetiva verificada; **concluído** = critérios de aceite satisfeitos. Não inferir um estado a partir de outro.

## 12. Fotografia inicial (13/10/2026, não é prova de produção)

- #3511: protocolo integrado na `main`.
- #3507: integração Studio/SmartSpec mergeada; homologação funcional ainda requer evidência própria.
- #3503: Projeto com implementação parcial; cinco lotes não concluídos.
- #3504: Render Studio inicial, com pendências de persistência de FOV e homologação.
- #3510: WebGPU detectado/fallback CPU experimental; **GPU real não comprovada**.
- #3506: navegação ainda em PR draft.
 
Esses estados mudam; reconsultar GitHub e Contabo antes de afirmar conclusão ou porcentagem.

## 13. Divergências entre documentos — decisão segura

- `AGENTS.md` determina validação técnica/compilação também em **ambiente isolado na Contabo**; o protocolo novo aceita gates no sandbox Linux. Adotar os gates do sandbox **e** comprovação pertinente na Contabo/homologação; nunca usar o resultado do sandbox como prova do deploy.
- `AGENTS.md` diz não fazer merge/deploy automaticamente por push na main, enquanto `CLAUDE.md` descreve o cron já ativo que publica após merge. **Consequência:** tratar o merge na main como gatilho potencial de publicação. Integrador só deve mergear com autorização e isolamento comprovado, ou após homologação e aceite da release; nunca presumir que um merge docs-only não aciona o pipeline.
- `docs/PROTOCOLO-EXECUCAO-AGENTES.md` declara erroneamente que interseção vazia de arquivos alterados e arquivos com erro prova zero regressão. A comparação correta é **diagnóstico completo antes/depois**, incluindo arquivos não tocados, com mesmas dependências e configuração, mais testes dirigidos/de integração.
- O plano e o PR não modificam diretamente esses arquivos normativos; registrar uma tarefa separada de correção e validação com os agentes responsáveis.

## 14. Critério final

**Aceite = requisitos observáveis + evidência técnica + evidência funcional/visual + versão efetiva/flag correspondente + segurança/rollback.** Qualquer item ausente aparece como pendência. Se uma frente estiver bloqueada, explicar a causa real e seguir com frentes independentes.
