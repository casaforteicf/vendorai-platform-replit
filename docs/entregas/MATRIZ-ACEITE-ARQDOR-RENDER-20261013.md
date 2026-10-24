# Matriz executável de aceite — Arqdor Render

Data: 13/10/2026. Fonte: estados e descrições GitHub dos PRs [#3504](https://github.com/casaforteicf/vendorai-platform-replit/pull/3504), [#3510](https://github.com/casaforteicf/vendorai-platform-replit/pull/3510) e integração [#3507](https://github.com/casaforteicf/vendorai-platform-replit/pull/3507). **Inventário documental**, não constitui validação de build, GPU real, homologação ou produção.

## Convenções

`CÓDIGO DOCUMENTADO`: PR declara implementação; `PARCIAL`: existe componente inicial, mas aceite completo não evidenciado; `NÃO COMPROVADO`: nenhum resultado verificável na evidência consultada. Owner operacional: **a atribuir**. Prioridade P1: uso real, integridade ou contrato visual aprovado; P2: aprimoramento que não bloqueia o núcleo. Reapurar no código/testes antes de declarar qualquer requisito pronto.

| ID | Requisito | Evidência atual | Teste de aceite objetivo | PR | Prioridade |
|---|---|---|---|---|---|
| F02-L01-R01 | Identidade Studio 2.0 e layout de editor | PARCIAL | Comparação com visual aprovado; viewport protagonista, menus, dock e responsividade | #3504/#3507 | P1 |
| F02-L01-R02 | Navegação contextual Projeto / Modelos / Imagem / Materiais / Luz / Versões / Especificação | CÓDIGO DOCUMENTADO | Todas as ações mudam modo e dados reais; sem controles decorativos | #3504 | P1 |
| F02-L01-R03 | Galeria e histórico de versões persistente | PARCIAL | Criar versões distintas, recarregar, selecionar e recuperar sem sobrescrever | #3504/#3507 | P1 |
| F02-L01-R04 | Prévia GLB com câmera FOV e altura | CÓDIGO DOCUMENTADO | Modificar FOV 20–100 e altura; viewport corresponde à câmera usada no resultado | #3504 | P1 |
| F02-L01-R05 | Persistência de FOV, posição e orientação no backend | NÃO COMPROVADO | Salvar câmera; reabrir e recuperar exatamente enquadramento/FOV com schema versionado | #3504 | P1 |
| F02-L01-R06 | Materiais vinculados à biblioteca e ao elemento BIM | PARCIAL | Aplicar material, salvar, reabrir e renderizar sem perder vínculo | #3504 | P1 |
| F02-L01-R07 | Iluminação natural e artificial com parâmetros persistentes | PARCIAL | Alterar luz; prévia/render refletem mudança e recuperam parâmetros | #3504 | P1 |
| F02-L02-R01 | Invalidação de prévia CPU ao alterar parâmetros | CÓDIGO DOCUMENTADO | Mudar cena/câmera/luz; impedir reuso de render desatualizado | #3510 | P1 |
| F02-L02-R02 | Controle de concorrência e cancelamento de tentativas antigas | CÓDIGO DOCUMENTADO | Dois renders simultâneos não sobrescrevem a versão mais recente; falhas recuperáveis | #3510 | P1 |
| F02-L02-R03 | Seleção CPU/WebGPU baseada em capacidade real | CÓDIGO DOCUMENTADO | Com/sem GPU e contexto seguro, registrar backend real usado; fallback correto | #3510 | P1 |
| F02-L02-R04 | Prévia experimental WebGPU com kernel WGSL | PARCIAL | Executar shader em GPU compatível com geometria/câmera reais; comparar CPU; confirmar limites atuais 512 triângulos/262144 pixels | #3510 | P1 |
| F02-L02-R05 | Cleanup de WebGPU e prevenção de vazamentos | CÓDIGO DOCUMENTADO | API incompleta, perda de dispositivo e erros liberam recursos, sem travamento | #3510 | P1 |
| F02-L03-R01 | Render de produção GPU no servidor, com fallback | NÃO COMPROVADO | Job real, disponibilidade, limites/custos, render resultante e fallback seguro | #3510 | P2 |
| F02-L03-R02 | Renderização física avançada (PBR, GI/path tracing) | NÃO COMPROVADO | Cenas de referência para reflexos, transparências, materiais e iluminação | #3510 | P2 |
| F02-L03-R03 | Cenas arquitetônicas grandes e desempenho | NÃO COMPROVADO | Benchmark por complexidade, memória, latência, degradação graciosa | #3510 | P2 |
| F02-L04-R01 | Geometria compartilhada com BIM Projeto | NÃO COMPROVADO | Abrir revisão BIM aprovada; câmera/material sem alterar paredes/aberturas e com proveniência | #3504/#3503 | P1 |
| F02-L04-R02 | Geração IA real e rastreamento de request/versionamento | NÃO COMPROVADO NESTA AUDITORIA | Gerar imagem com parâmetros reais; registrar request, status, custo/acesso, histórico e falha | #3504 | P1 |
| F02-L04-R03 | Exportação sem perder revisão/fidelidade arquitetônica | NÃO COMPROVADO | Resultado vinculado a revisão BIM/câmera e exportação com metadados corretos | #3504 | P1 |
| F02-L05-R01 | Gates TypeScript, Vitest, Vite, backend e bundle | NÃO EXECUTADOS NESTA AUDITORIA | Logs com SHA reconciliado, baseline integral e testes do render | #3504/#3510 | P1 |
| F02-L05-R02 | E2E navegador com/sem WebGPU | NÃO EXECUTADOS NESTA AUDITORIA | Trace, screenshots, dispositivo, seleção/fallback, persistência e acesso | #3510 | P1 |
| F02-L05-R03 | Homologação visual/funcional e publicação segura | NÃO EXECUTADOS NESTA AUDITORIA | Comparar mockup, controlar flags, confirmar release/rollback e SHA efetivo | #3504/#3510 | P1 |

## Nota crítica sobre estágio de GPU

O PR #3510 **evoluiu**: a descrição atual afirma kernel WGSL experimental e testes escritos, além da detecção de capacidade; isso **não** equivale a GPU operacional homologada. A prévia declara limites de triângulos/pixels. Não marcar GPU de servidor, GI, path tracing ou produção como concluídos. Exigir execução comprovada e testes em hardware compatível.

## Sequência e dependências

1. Comparar alterações em `RenderStudio*` e estilos entre #3504, #3510 e #3507; reconciliar `main` antes de integrar qualquer código.
2. Concluir persistência de câmera, materiais e versões; eliminar controles apenas decorativos.
3. Conectar Render à revisão BIM única do Projeto e registrar provenance/request.
4. Testar CPU e WebGPU de forma isolada e no navegador; manter experimental atrás de flag off até homologação.
5. Somente depois avaliar GPU de servidor e pipeline físico avançado. Planejar custo sem comprar GPU/serviço sem aprovação.

**21 requisitos catalogados; 0 homologados por esta auditoria documental.** Percentuais de código, integração, homologação e produção: **não apurados**. Não atribuir owner sem confirmação.
