export interface AutomaticChangelogEntry {
  id: string;
  titulo: string;
  descricao: string;
  tipo: "novidade" | "melhoria" | "correcao";
  publicadoEm: string;
  pullRequest: number;
}

// Este arquivo é atualizado automaticamente após cada PR incorporado à main.
// A edição manual continua disponível para comunicados que não nascem de uma entrega.
export const automaticChangelogEntries: AutomaticChangelogEntry[] = [
  {
    "id": "pr-3175",
    "titulo": "impedir HTTP 500 no acompanhamento do Vendi",
    "descricao": "falha na Inteligência do Negócio não derruba mais o endpoint; falha do provedor de IA não gera mais HTTP 500; JSON inválido da IA cai em fallback seguro; o fallback usa apenas dados do CRM/etapa e não inventa condições comerciais;",
    "tipo": "correcao",
    "publicadoEm": "2026-10-06T20:20:28.000Z",
    "pullRequest": 3175
  },
  {
    "id": "pr-3164",
    "titulo": "Admin pode excluir lead em qualquer estágio sem perder histórico",
    "descricao": "restringe DELETE /leads/:id a superadmin, tenant_admin ou função administrador registra usuário/data/motivo da exclusão no metadata do lead adiciona ação reutilizável \"Excluir lead\" no workspace e nas pipelines Comercial, Aquecimento, Parceiros, Execução e Suporte mantém soft delete e restauração",
    "tipo": "novidade",
    "publicadoEm": "2026-10-06T19:32:03.000Z",
    "pullRequest": 3164
  },
  {
    "id": "pr-3160",
    "titulo": "Assistência: importar pedido antigo com itens e arquivo original",
    "descricao": "adiciona a opção de importar pedido antigo na abertura de chamados de assistência; reutiliza a extração documental para PDF, imagem e Word; exibe prévia dos dados extraídos; permite selecionar os itens/produtos afetados; preserva a estrutura importada e vincula o arquivo original ao chamado para auditoria.",
    "tipo": "melhoria",
    "publicadoEm": "2026-10-06T19:17:24.000Z",
    "pullRequest": 3160
  },
  {
    "id": "pr-1412",
    "titulo": "índice persistente de inteligência visual",
    "descricao": "adiciona **Media Intelligence Index** ao fluxo do Graphic Design Director; indexa fotos e vídeos da Biblioteca com sinais determinísticos de pixels e metadados existentes; persiste o resultado em `metadata.mediaIntelligence`, estrutura já consumida pelo `media-retrieval-director`; registra dimensões/orientação, grid de atividade, luminância, contraste, detalhe, ponto focal, espaço livre, paleta dominante, qualidade visual, crops 9:16/4:5/1:1/16:9 e tags pesquisáveis;",
    "tipo": "correcao",
    "publicadoEm": "2026-09-13T00:31:36.000Z",
    "pullRequest": 1412
  },
  {
    "id": "pr-1329",
    "titulo": "Site público: adicionar conceito visual do Prompt Hub",
    "descricao": "adiciona na home uma seção dedicada ao conceito do **Prompt Hub visual** explica o fluxo **Biblioteca de Mídias → controles simples → prompt técnico automático → geração → reutilização** mostra visualmente preservação de identidade, luz principal, contraste, rim light e fundo apresenta os destinos integrados: **site, campanhas e vídeo**",
    "tipo": "novidade",
    "publicadoEm": "2026-09-12T01:27:09.000Z",
    "pullRequest": 1329
  },
  {
    "id": "pr-1276",
    "titulo": "Corrigir de fato a simplificação de Configurações",
    "descricao": "mantém **Saúde das integrações**; mantém a aba **Empresa** focada em dados da empresa e conhecimento do negócio; substitui a lista longa de Produtos e Serviços por um **resumo compacto do Catálogo** com contagem e botão **Abrir Catálogo**; recolhe por padrão os blocos menos usados que estavam alongando a aba Empresa;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-11T20:40:10.000Z",
    "pullRequest": 1276
  },
  {
    "id": "pr-1272",
    "titulo": "Simplificar experiência de Configurações",
    "descricao": "mantém **Saúde das integrações** como visão rápida no topo; remove visualmente o bloco redundante **Configuração central do negócio**; renomeia a busca para **Buscar nas configurações**; troca **Contexto para a IA** por **Conhecimento sobre o negócio**, com texto mais claro;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-11T20:13:15.000Z",
    "pullRequest": 1272
  },
  {
    "id": "pr-1264",
    "titulo": "Transformar Campanhas na área de execução do Planejamento",
    "descricao": "quando a campanha nasce do Planejamento, a aba Campanhas abre diretamente um workspace de execução; mostra a campanha selecionada, público, oferta, mensagem, KPI e canais; traz os indicadores operacionais: ações, prontas, em produção e publicadas; move o calendário operacional para Campanhas;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-11T19:41:13.000Z",
    "pullRequest": 1264
  },
  {
    "id": "pr-1204",
    "titulo": "Configurações: abrir integração ao clicar no status",
    "descricao": "transforma os cards de **Saúde das integrações** em ações clicáveis; exibe CTA contextual: **Conectar agora**, **Revisar integração** ou **Gerenciar integração**; ao clicar, abre a aba **Integrações**, localiza a integração correspondente, rola até ela e destaca o bloco; mantém deep-link por `?tab=integracoes&integration=<provider>`;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-11T12:04:08.000Z",
    "pullRequest": 1204
  },
  {
    "id": "pr-1198",
    "titulo": "ERP gerencial completo: edição, auditoria e visão integrada",
    "descricao": "amplia o Financeiro + ERP Hub com visão geral gerencial, fluxo de caixa, bancos/conciliação, fiscal, compras, vendas, estoque, comissões e auditoria; mantém indicadores executivos em percentuais; adiciona busca e filtros operacionais em contas a pagar/receber; permite editar, duplicar, dar baixa e excluir/cancelar lançamentos;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-11T10:09:19.000Z",
    "pullRequest": 1198
  },
  {
    "id": "pr-1167",
    "titulo": "edição rápida das informações na lista",
    "descricao": "adiciona ação **Editar** (ícone de lápis) diretamente em cada lead, no desktop e no mobile abre um modal sem sair da tela de Leads permite editar nome, empresa, segmento, telefone/WhatsApp, e-mail e status do contato permite editar o responsável quando o usuário é admin",
    "tipo": "novidade",
    "publicadoEm": "2026-09-10T21:32:29.000Z",
    "pullRequest": 1167
  },
  {
    "id": "pr-1165",
    "titulo": "edição direta e cadastro visível de segmento",
    "descricao": "permite clicar diretamente na tag de Segmento ou no `—` da lista de Leads para editar salva o valor em `mercadoSegmento` e sincroniza `dadosPj.segmento` quando existir atualiza automaticamente a lista e os filtros após salvar torna o campo Segmento visível no formulário de Novo Lead, logo ao lado de Empresa",
    "tipo": "novidade",
    "publicadoEm": "2026-09-10T21:18:09.000Z",
    "pullRequest": 1165
  },
  {
    "id": "pr-1122",
    "titulo": "Melhora clareza dos sinais JARVIS no Prospector",
    "descricao": "simplifica o bloco de sinais JARVIS no Prospector e remove linguagem técnica interna troca `confiança` por `compatibilidade` e organiza sinais em `Agir agora`, `Acompanhar` e `Alertas` mostra de forma separada `Por que isso interessa` e `JARVIS recomenda` reduz de 4 para 3 sinais na primeira dobra e melhora a hierarquia dos CTAs",
    "tipo": "novidade",
    "publicadoEm": "2026-09-10T16:51:53.000Z",
    "pullRequest": 1122
  },
  {
    "id": "pr-1013",
    "titulo": "gestão 360º de tenants, demos e identidade única",
    "descricao": "cria identidade pública, única e imutável por tenant (`VAI-000001`, `VAI-000002`...); o UUID continua como chave interna faz backfill dos tenants já existentes e garante unicidade para os próximos mantém Demo como o mesmo tenant, com início/expiração e conversão para cliente sem trocar a identidade adiciona cadastro comercial/financeiro editável no detalhe do tenant",
    "tipo": "novidade",
    "publicadoEm": "2026-09-09T11:07:42.000Z",
    "pullRequest": 1013
  },
  {
    "id": "pr-543",
    "titulo": "Conectar oferta manual à estratégia do Gerador de Conteúdo",
    "descricao": "a oferta digitada manualmente passa a alimentar o estado estratégico imediatamente, sem depender do clique em `+`; o Resumo da peça passa a refletir a oferta enquanto ela é digitada, usando o fluxo existente de `productNames`; a mesma oferta já segue no contexto enviado ao gerador de IA pelo fluxo atual do Content Studio; o botão `+` passa a servir para fixar a oferta atual e permitir cadastrar outra;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T12:54:51.000Z",
    "pullRequest": 543
  },
  {
    "id": "pr-539",
    "titulo": "prévia antes de salvar e upload direto no Brand Kit",
    "descricao": "adiciona **Pré-visualizar** antes de liberar o salvamento do Brand Video Kit; mostra abertura, vídeo principal com logo/legenda/B-roll, encerramento e player da trilha usando os arquivos reais da Biblioteca; qualquer alteração após a prévia marca a visualização como desatualizada e exige atualização antes de salvar; adiciona **Upload** ao lado dos seletores de Logo, Intro, Outro e Trilha;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T12:24:35.000Z",
    "pullRequest": 539
  },
  {
    "id": "pr-507",
    "titulo": "internacionalizar Google Auth e conta suspensa",
    "descricao": "internacionaliza o retorno do Google Auth para português e espanhol conforme o locale ativo neutraliza a mensagem de conta Google sem acesso, sem expor marca dentro do fluxo internacionaliza a tela de conta suspensa usa cobrança genérica no espanhol em vez de referências brasileiras como boleto/PIX",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T03:32:22.000Z",
    "pullRequest": 507
  },
  {
    "id": "pr-498",
    "titulo": "internacionalizar primeiro acesso e convites",
    "descricao": "internacionaliza a troca obrigatória de senha para português e espanhol internacionaliza o aceite de convite, incluindo validações, estados do link, formulário e mensagens institucionais usa o locale global já existente (`pt-BR` / `es-*`)",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T03:17:42.000Z",
    "pullRequest": 498
  },
  {
    "id": "pr-497",
    "titulo": "internacionalizar equipe e usuários",
    "descricao": "internacionaliza a tela Equipe/Usuários para português e espanhol conforme o locale ativo do tenant traduz funções padrão, estados, tabela/mobile, formulários, confirmações e toasts traduz somente os rótulos visuais dos módulos de acesso via `labelEs` mantém intactas as chaves reais de permissão, funções padrão, rotas, defaults de acesso e payloads da API",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T03:15:01.000Z",
    "pullRequest": 497
  },
  {
    "id": "pr-493",
    "titulo": "internacionalizar recuperação de senha",
    "descricao": "traduz `Esqueci minha senha` e `Redefinir senha` para o locale global ativo cobre estados de envio, sucesso, erro, validações, placeholders e redirecionamento visual mantém a lógica atual de token, JWT, expiração, `/dashboard` e `/login`",
    "tipo": "correcao",
    "publicadoEm": "2026-09-04T03:05:31.000Z",
    "pullRequest": 493
  },
  {
    "id": "pr-491",
    "titulo": "internacionalizar login",
    "descricao": "usa o locale global já resolvido para exibir o login em português ou espanhol traduz validações, erros, botões, acessibilidade, demo e mensagem institucional mantém Google OAuth, autenticação por senha e demo sem mudança de fluxo",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T03:02:04.000Z",
    "pullRequest": 491
  },
  {
    "id": "pr-490",
    "titulo": "internacionalizar guia de implantação",
    "descricao": "usa o locale ativo do tenant para exibir o Guia de Implantação em português ou espanhol cobre todos os textos, instruções, botões, progresso e rótulos de acessibilidade da tela remove referências antigas visíveis a `TAD` e usa linguagem neutra da plataforma preserva rotas, progresso local por tenant e comportamento atual",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T02:58:41.000Z",
    "pullRequest": 490
  },
  {
    "id": "pr-486",
    "titulo": "respeitar locale do tenant na transcrição de áudio",
    "descricao": "remove o `language: pt` fixo do fluxo ativo de transcrição de áudio resolve o idioma pelo `tenant.defaultLocale` `es-PY`, `es-AR`, `es-UY` e `es-CL` usam `es` demais tenants mantêm `pt`",
    "tipo": "correcao",
    "publicadoEm": "2026-09-04T02:47:01.000Z",
    "pullRequest": 486
  },
  {
    "id": "pr-483",
    "titulo": "persistir e aplicar white-label do tenant",
    "descricao": "cria um componente único `TenantBrand` usando o mesmo `BusinessProfile` já consumido pelo shell remove a logo VendorAI fixa do onboarding principal e da tela de integrações normaliza `/objects/...` para `/api/storage/objects/...` ao concluir o passo 1, cria/atualiza o `BusinessProfile` existente com `nomeFantasia` e `logoUrl`",
    "tipo": "correcao",
    "publicadoEm": "2026-09-04T02:37:22.000Z",
    "pullRequest": 483
  },
  {
    "id": "pr-482",
    "titulo": "adicionar mixer de áudio profissional",
    "descricao": "ducking automático baseado no nível real do áudio original durante a renderização; ataque, retorno, sensibilidade e intensidade do ducking configuráveis; fade-in e fade-out da trilha; loop inteligente por zero-crossing para reduzir emendas perceptíveis;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T02:34:48.000Z",
    "pullRequest": 482
  },
  {
    "id": "pr-467",
    "titulo": "sincronizar cortes com batidas da música",
    "descricao": "analisa a forma de onda da trilha no navegador via Web Audio; usa BPM cadastrado no Music Hub como referência/fallback; detecta BPM e fase/offset das batidas; permite grade por cada 1, 2 ou 4 batidas;",
    "tipo": "correcao",
    "publicadoEm": "2026-09-04T01:46:36.000Z",
    "pullRequest": 467
  },
  {
    "id": "pr-461",
    "titulo": "recomendar trilhas da marca no editor",
    "descricao": "mostra até 3 trilhas recomendadas no painel `Áudio e trilha`; prioriza `Oficial da marca` e a trilha padrão do Brand Kit; cruza canal do vídeo com usos do Music Hub: Reels/Shorts, Stories, Institucional, Produto e Anúncios; usa título do projeto + textos das camadas para inferir contexto e mood;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T01:29:42.000Z",
    "pullRequest": 461
  },
  {
    "id": "pr-451",
    "titulo": "padronização global de layout e responsividade",
    "descricao": "cria um padrão global de largura máxima e recuos de página normaliza títulos principais e descrições de cabeçalho define tokens únicos para espaçamentos, raio de cards e altura de controles melhora campos nativos que ainda não usam os componentes compartilhados",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T01:13:36.000Z",
    "pullRequest": 451
  },
  {
    "id": "pr-449",
    "titulo": "configurar perfil internacional do tenant",
    "descricao": "adiciona card **Perfil internacional** na tela real de detalhes do tenant; permite configurar país, idioma padrão, fuso horário, moeda principal, moedas habilitadas e identificação fiscal; presets oficiais para Brasil, Paraguai, Argentina, Uruguai e Chile; ao trocar país, aplica locale/fuso/moeda/tipo fiscal recomendados antes de salvar;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T01:10:05.000Z",
    "pullRequest": 449
  },
  {
    "id": "pr-442",
    "titulo": "adicionar coleções e identidade sonora ao Music Hub",
    "descricao": "trilhas podem participar de múltiplas coleções/playlists; adiciona contextos de uso da marca: Institucional, Reels/Shorts, Anúncios, Produto, Stories e Apresentações; permite marcar trilhas como `Oficial da marca`; adiciona filtros por coleção e uso da marca;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T01:02:42.000Z",
    "pullRequest": 442
  },
  {
    "id": "pr-435",
    "titulo": "Content Autopilot: usar o site real do tenant como destino do blog",
    "descricao": "adiciona uma camada `Website Connector` para resolver o site oficial de cada tenant; prioriza o site cadastrado do cliente quando uma configuração antiga ainda aponta para `appvendorai.com` / `www.appvendorai.com`; reconhece site gerado pelo VendorAI somente quando existe de fato um projeto de site do tenant; expõe o status da conexão do site ao Content Autopilot;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T00:56:09.000Z",
    "pullRequest": 435
  },
  {
    "id": "pr-440",
    "titulo": "enriquecer Music Hub com metadados e filtros",
    "descricao": "adiciona metadados de música: gênero, mood, energia, BPM, duração e favorito; permite detectar a duração do áudio pelo próprio arquivo no navegador; adiciona filtros por gênero, mood e favoritas no Music Hub; inclui gênero, energia e BPM na busca;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T00:51:49.000Z",
    "pullRequest": 440
  },
  {
    "id": "pr-434",
    "titulo": "criar Music Hub e integrar trilhas ao editor",
    "descricao": "classifica áudios em música/trilha, locução, efeito sonoro, jingle, identidade sonora e outros; adiciona filtros e contadores específicos do Music Hub; permite definir o tipo já no upload sem duplicar ou mover fisicamente o arquivo; adiciona passaporte de direitos com origem, status, uso comercial, mídia paga, territórios, validade, atribuição e referência da licença;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-04T00:41:45.000Z",
    "pullRequest": 434
  },
  {
    "id": "pr-387",
    "titulo": "adicionar seletor universal da Biblioteca",
    "descricao": "novo componente compartilhado `MediaAssetPicker`; busca assets do tenant atual na Biblioteca; permite filtrar tipos, pesquisar e limitar quantidade; retorna `media_asset` oficial, sem upload nem cópia;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-03T19:06:47.000Z",
    "pullRequest": 387
  },
  {
    "id": "pr-340",
    "titulo": "Marketing: permitir várias imagens no Feed",
    "descricao": "No **Feed**, o botão de upload agora aceita **uma ou várias imagens de uma vez**. O botão passa a mostrar **Adicionar imagens** e exibe o progresso do envio. As imagens são **adicionadas ao post existente**, sem apagar automaticamente as anteriores. Limite de **10 imagens por publicação**.",
    "tipo": "novidade",
    "publicadoEm": "2026-09-03T14:48:46.000Z",
    "pullRequest": 340
  },
  {
    "id": "pr-319",
    "titulo": "adicionar atalhos externos nas configurações do site",
    "descricao": "adiciona uma área compacta de **Onde encontrar os dados para conectar** em Configurações do Site; abre em nova aba os locais corretos para Google Ads (Conversões), Meta (Gerenciador de Eventos / Pixel), Cloudflare (Registros DNS) e Google Search Console; mantém intactos os fluxos atuais de domínio, Pixel, Google Ads e Search Console.",
    "tipo": "correcao",
    "publicadoEm": "2026-09-03T12:11:58.000Z",
    "pullRequest": 319
  },
  {
    "id": "pr-311",
    "titulo": "Video: adicionar trilha sonora ao editor",
    "descricao": "acompanha o job pelo endpoint já existente; exibe preview do MP4 final; mantém o arquivo original intacto; resultado continua registrado na Biblioteca Audiovisual pelo backend do PR #310.",
    "tipo": "novidade",
    "publicadoEm": "2026-09-03T11:29:48.000Z",
    "pullRequest": 311
  },
  {
    "id": "pr-297",
    "titulo": "oficializar VendorAI Media Engine sem HeyGen",
    "descricao": "adiciona `/tenants/:tenantId/media-engine/capabilities` com provider oficial `vendorai`; declara edição, clipes e legendagem como capacidades prontas; declara composição, geração de vídeo, lote, perfis de voz/persona e lip-sync como capacidades em construção, sem fingir disponibilidade; remove as rotas HeyGen do `content_studio.ts`;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-03T02:19:53.000Z",
    "pullRequest": 297
  },
  {
    "id": "pr-294",
    "titulo": "ligar processamento de vídeo à biblioteca",
    "descricao": "cria um projeto `media_projects` para cada execução de edição, clipes ou legendagem; associa o `media_job` existente ao novo `projectId`; mantém `jobId` nas respostas e acrescenta `projectId` de forma retrocompatível; registra cada vídeo gerado em `media_assets` como output;",
    "tipo": "correcao",
    "publicadoEm": "2026-09-03T01:55:32.000Z",
    "pullRequest": 294
  },
  {
    "id": "pr-296",
    "titulo": "garantir geração efetiva do plano de mídia",
    "descricao": "falha, indisponibilidade ou payload inválido da IA deixa de virar 422 para o cliente geração passa a ter fallback determinístico baseado somente nos dados reais já persistidos do tenant fallback também é persistido em `media_plans` e retorna o mesmo contrato `{ plan }` DataForSEO continua best-effort e nunca bloqueia a geração",
    "tipo": "correcao",
    "publicadoEm": "2026-09-03T01:51:29.000Z",
    "pullRequest": 296
  },
  {
    "id": "pr-293",
    "titulo": "adicionar biblioteca audiovisual persistente",
    "descricao": "adiciona rotas tenant-scoped para listar/criar/editar projetos de mídia; adiciona biblioteca de ativos com filtros por tipo e projeto; usa o Object Storage/Supabase já existente para upload direto por URL assinada; valida o arquivo enviado antes de registrá-lo como ativo;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-03T01:42:13.000Z",
    "pullRequest": 293
  },
  {
    "id": "pr-289",
    "titulo": "persistir fundação do Media Engine",
    "descricao": "adiciona `media_projects`, `media_assets`, `media_versions` e `media_jobs`; migration 212 com índices e RLS por tenant; substitui o `Map` em memória de `video_processing.ts` por jobs persistidos no PostgreSQL; preserva as rotas e formatos atuais de edição, clipes, lote, legenda e consulta de job;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-03T01:32:09.000Z",
    "pullRequest": 289
  },
  {
    "id": "pr-288",
    "titulo": "robustecer geração do plano de mídia",
    "descricao": "corrige o exemplo inválido de JSON usado no prompt do Plano de Mídia torna o parser tolerante a fences Markdown e texto residual ao redor do objeto JSON valida a estrutura retornada pela IA antes de persistir valida prioridade e percentual de orçamento",
    "tipo": "correcao",
    "publicadoEm": "2026-09-03T01:16:12.000Z",
    "pullRequest": 288
  },
  {
    "id": "pr-286",
    "titulo": "unificar briefing e gerador de conteúdo",
    "descricao": "briefing único com **Oferta → Público → Objetivo**; contexto do anunciante aparece de forma compacta; usa a lista de produtos real de cada vertical (catálogo, varejo, supermercado ou insumos); remove da área inferior o seletor de produto que repetia a oferta já escolhida;",
    "tipo": "correcao",
    "publicadoEm": "2026-09-03T00:47:43.000Z",
    "pullRequest": 286
  },
  {
    "id": "pr-284",
    "titulo": "liberar patrocínio automático pela IA",
    "descricao": "só executa automaticamente campanhas originadas do Marketing (`contentGenerationId`); exige modo Marketing `automatic` ativo; mantém objetivo, período, orçamento diário/total, conversão e categoria especial validados; proíbe aumento automático de orçamento;",
    "tipo": "correcao",
    "publicadoEm": "2026-09-03T00:30:45.000Z",
    "pullRequest": 284
  },
  {
    "id": "pr-285",
    "titulo": "liberar criação e publicação automática pela IA",
    "descricao": "modo Automático pode consumir oportunidades descobertas além de keywords manualmente aprovadas; mantém o teto mensal do Content Autopilot; gera Feed social usando o mesmo contexto de marca, desempenho próprio e referências do Gerador de Conteúdo; centraliza publicação Instagram em um único serviço real;",
    "tipo": "correcao",
    "publicadoEm": "2026-09-03T00:21:18.000Z",
    "pullRequest": 285
  },
  {
    "id": "pr-272",
    "titulo": "Gestão ERP como add-on de R$ 299/mês",
    "descricao": "cadastra a Gestão ERP como produto `ERP-ADDON-M` por R$ 299/mês revoga o ERP por padrão para tenants atuais e futuros oculta o menu quando o add-on não está contratado bloqueia acesso direto às telas `/erp` e `/erp/captura`",
    "tipo": "novidade",
    "publicadoEm": "2026-09-02T21:05:55.000Z",
    "pullRequest": 272
  },
  {
    "id": "pr-271",
    "titulo": "remover jornada duplicada da Central de Trabalho",
    "descricao": "A Central de Trabalho passa a ter uma única Jornada de Atendimento, usando o novo bloco compacto integrado à pipeline, sem duplicidade visual.",
    "tipo": "correcao",
    "publicadoEm": "2026-09-02T20:58:55.000Z",
    "pullRequest": 271
  },
  {
    "id": "pr-269",
    "titulo": "metas globais e por vendedor no Dashboard",
    "descricao": "adiciona botão **Configurar metas** no Dashboard; permite criar metas para **Empresa inteira** ou **Vendedor**; indicadores: Leads novos, Oportunidades ativas, Vendas confirmadas, Receita vendida, Ticket médio e Conversão comercial; periodicidade semanal, mensal, trimestral, anual ou personalizada;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-02T20:49:33.000Z",
    "pullRequest": 269
  },
  {
    "id": "pr-268",
    "titulo": "melhorar Central de Trabalho com pipeline e perguntas compactas",
    "descricao": "alinha o fluxo visual da Central de Trabalho à pipeline comercial real (Novo, Qualificado, Orçamento, Negociação, Fechamento, Contrato, Pedido e Perdido) mantém as etapas configuradas pelo tenant e destaca apenas a etapa atual reduz bastante a altura do bloco de perguntas respostas ficam compactas e expandem somente durante a edição",
    "tipo": "novidade",
    "publicadoEm": "2026-09-02T20:45:53.000Z",
    "pullRequest": 268
  },
  {
    "id": "pr-252",
    "titulo": "WhatsApp: múltiplos números por tenant e responsável",
    "descricao": "permite vários números WhatsApp por tenant via Meta oficial e QR Code/Evolution vincula cada número a um usuário responsável e permite definir o número padrão registra a conexão usada na conversa e mantém as mensagens na tela Conversas e no card do lead direciona leads, negócios e conversas recebidos ao responsável do número",
    "tipo": "novidade",
    "publicadoEm": "2026-09-02T17:56:05.000Z",
    "pullRequest": 252
  },
  {
    "id": "pr-221",
    "titulo": "fechar atribuição de campanha e otimizar por receita",
    "descricao": "A PR entrega aquisição → trial → ativação → venda → cobrança → assinatura → renovação/churn com atribuição de receita, verticais oficiais, Revenue Scout e guardrails de privacidade/financeiro, preservando a mesma conta testada pelo cliente durante toda a jornada.",
    "tipo": "correcao",
    "publicadoEm": "2026-09-01T22:27:21.000Z",
    "pullRequest": 221
  },
  {
    "id": "pr-216",
    "titulo": "remover excluídos da pipeline e dashboard",
    "descricao": "Leads excluídos deixam de aparecer na pipeline e nos indicadores do dashboard.",
    "tipo": "correcao",
    "publicadoEm": "2026-08-31T16:19:51.000Z",
    "pullRequest": 216
  },
  {
    "id": "pr-214",
    "titulo": "Remove contatos Não lead da pipeline comercial",
    "descricao": "contatos classificados como **Não lead** deixam de aparecer imediatamente na pipeline a quantidade de negócios passa a considerar apenas oportunidades comerciais alertas de tempo esgotado não são mais gerados visualmente para esses contatos o histórico permanece preservado no banco e na área de Não leads",
    "tipo": "novidade",
    "publicadoEm": "2026-08-31T12:35:39.000Z",
    "pullRequest": 214
  },
  {
    "id": "pr-202",
    "titulo": "Todos os atendimentos agora têm protocolo e status",
    "descricao": "Toda conversa com o suporte fica registrada na tela de Suporte, inclusive quando o agente resolve sozinho. O cliente acompanha protocolo, status e responsável pela resolução.",
    "tipo": "melhoria",
    "publicadoEm": "2026-08-30T22:12:37.000Z",
    "pullRequest": 202
  },
  {
    "id": "pr-201",
    "titulo": "Ajuda contextual em cada módulo",
    "descricao": "A Central de Ajuda identifica a tela atual e prioriza as orientações relacionadas à tarefa do cliente, sem exigir conhecimento técnico.",
    "tipo": "melhoria",
    "publicadoEm": "2026-08-30T22:01:04.000Z",
    "pullRequest": 201
  },
  {
    "id": "pr-200",
    "titulo": "Central de Ajuda ampliada para 100 dúvidas",
    "descricao": "A FAQ agora cobre implantação, CRM, integrações, marketing, anúncios, agentes, ERP, segmentos e inteligência, com busca simples, benefícios e atalhos para cada ferramenta.",
    "tipo": "novidade",
    "publicadoEm": "2026-08-30T21:55:27.000Z",
    "pullRequest": 200
  },
  {
    "id": "pr-199",
    "titulo": "Fluxo operacional de anúncios completo",
    "descricao": "Campanhas passam a registrar atribuição de leads, histórico, alertas, recomendações e falhas de pagamento ou publicação, preservando a confirmação humana para orçamento e ativação.",
    "tipo": "melhoria",
    "publicadoEm": "2026-08-30T20:36:58.000Z",
    "pullRequest": 199
  },
  {
    "id": "pr-198",
    "titulo": "Central executiva de resultados de anúncios",
    "descricao": "A empresa acompanha investimento, gasto, leads, vendas, receita, CPL e ROAS, além de alertas e histórico auditável das campanhas.",
    "tipo": "novidade",
    "publicadoEm": "2026-08-30T20:22:56.000Z",
    "pullRequest": 198
  }
];
