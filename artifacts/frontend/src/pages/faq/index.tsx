import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronRight, HelpCircle, Search, Sparkles, Clock3, ArrowRight, MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type RawItem = [question: string, answer: string, benefit: string, minutes: number, href?: string, action?: string, keywords?: string];
type FAQItem = { id: number; category: string; question: string; answer: string; benefit: string; minutes: number; href?: string; action?: string; keywords: string };

const RAW: Record<string, RawItem[]> = {
  "Primeiros passos": [
    ["O que é o VendorAI e por onde devo começar?", "O VendorAI reúne atendimento, vendas, marketing, gestão e agentes de IA. Comece pelo Guia de Implantação, informe os dados da empresa e siga uma etapa por vez.", "Sua empresa começa organizada e evita configurar ferramentas na ordem errada.", 3, "/guia-implantacao", "Começar implantação", "inicio onboarding configurar empresa"],
    ["Preciso entender de tecnologia para usar?", "Não. As telas usam linguagem comercial e o guia mostra somente a próxima ação necessária. Os campos avançados ficam disponíveis quando você precisar.", "A equipe consegue operar sem depender de um técnico no dia a dia.", 2, "/guia-implantacao", "Ver passos simples", "leigo fácil tecnologia"],
    ["Quais dados da empresa devo cadastrar primeiro?", "Nome, segmento, produtos ou serviços, regiões atendidas, horários, canais de contato e regras comerciais. Isso forma o contexto usado pelas ferramentas e agentes.", "A IA responde e cria materiais coerentes com a realidade da empresa.", 4, "/configuracoes", "Configurar empresa", "perfil negócio contexto"],
    ["Como escolher o segmento e o nicho correto?", "Segmento descreve sua empresa; nicho indica o público específico de uma ação. Uma farmácia pode ter segmento Farmácia e criar uma campanha para empresas de comércio oferecendo cartão fidelidade.", "As campanhas ficam mais específicas e atraem contatos com maior chance de compra.", 3, "/configuracoes", "Revisar segmento", "vertical nicho público alvo"],
    ["O que devo conectar primeiro?", "Conecte Instagram e Facebook, depois WhatsApp e Google. Se algum canal ainda não estiver disponível, continue a implantação; ele ficará marcado como pendente.", "Você começa a trabalhar com o que já possui sem bloquear toda a implantação.", 4, "/onboarding/integracoes", "Conectar canais", "instagram facebook whatsapp google"],
    ["Como cadastrar minha equipe?", "Abra Equipe, convide cada pessoa e defina função e permissão. Cadastre administradores, vendedores, suporte, financeiro e entrega conforme a operação.", "Cada colaborador vê somente o necessário e as responsabilidades ficam claras.", 4, "/usuarios", "Cadastrar equipe", "usuários vendedores permissões"],
    ["Como trazer meus clientes antigos?", "Exporte a relação do sistema anterior, use o modelo de planilha e faça o mapeamento das colunas antes da importação. O VendorAI verifica duplicidades.", "Você preserva sua base comercial e pode reativar oportunidades antigas.", 6, "/leads/import-config", "Preparar importação", "csv excel clientes antigos"],
    ["Como importar produtos e serviços?", "Abra Catálogo, baixe o modelo, informe nome, categoria, descrição, preço, imagens e demais dados relevantes. Revise a prévia antes de confirmar.", "Orçamentos, anúncios e agentes passam a usar informações reais do que você vende.", 6, "/catalogo", "Abrir catálogo", "produto serviço importar catálogo"],
    ["Posso usar o sistema antes de terminar a implantação?", "Sim. Os módulos já configurados funcionam normalmente. O guia mantém as pendências visíveis para você concluir depois.", "A empresa obtém valor desde o primeiro dia sem esperar uma implantação longa.", 2, "/guia-implantacao", "Ver pendências", "implantação parcial pendente"],
    ["Como sei se a implantação terminou?", "O Guia de Implantação mostra o progresso das conexões, equipe, leads, catálogo e configurações essenciais. Quando os itens obrigatórios estiverem concluídos, a operação básica estará pronta.", "Você tem uma referência objetiva e não depende de memória ou planilhas paralelas.", 2, "/guia-implantacao", "Conferir progresso", "checklist conclusão"]
  ],
  "CRM e vendas": [
    ["O que é um lead?", "Lead é uma pessoa ou empresa que demonstrou interesse. Ele pode chegar por anúncio, WhatsApp, Instagram, formulário, prospecção ou cadastro manual.", "Todos os interessados ficam centralizados e deixam de se perder entre canais.", 2, "/leads", "Ver leads", "cliente contato oportunidade"],
    ["Como cadastrar um lead manualmente?", "Abra Leads, escolha Novo lead e informe pelo menos nome e um canal de contato. Depois defina responsável e origem.", "Contatos recebidos fora das integrações também entram no processo comercial.", 2, "/leads", "Cadastrar lead", "novo contato manual"],
    ["Como o sistema evita leads duplicados?", "Na entrada e importação, o VendorAI compara telefone, documento e nomes semelhantes. Quando encontra possível duplicidade, pede revisão antes de criar outro registro.", "A equipe evita contatos repetidos e mantém um histórico comercial confiável.", 2, "/leads", "Revisar base", "duplicado deduplicação"],
    ["O que é o funil de Negócios?", "É a visão das oportunidades por etapa, como aquecimento, qualificação, proposta, negociação, ganho ou perdido. Arraste ou atualize conforme o avanço real.", "O gestor enxerga gargalos e sabe quanto pode vender.", 3, "/deals", "Abrir funil", "kanban pipeline etapas"],
    ["Como distribuir leads entre vendedores?", "Use a distribuição automática ou atribua manualmente. O rodízio considera vendedores ativos e registra quem ficou responsável.", "O atendimento fica equilibrado e os leads recebem responsável rapidamente.", 3, "/usuarios", "Configurar equipe", "round robin responsável"],
    ["Como acompanhar tarefas e próximos passos?", "A Central de Trabalho reúne atividades, pendências, prazos e ações recomendadas. Cada vendedor pode priorizar o que exige atenção.", "A equipe reduz esquecimentos e melhora a velocidade de resposta.", 2, "/trabalho", "Abrir central", "tarefas atividades prazos"],
    ["Como criar e enviar uma proposta?", "Abra Orçamentos, selecione o cliente e os itens do catálogo, ajuste condições e gere a proposta. O histórico permanece ligado ao negócio.", "A empresa responde mais rápido e mantém padrão comercial.", 4, "/propostas", "Criar proposta", "orçamento preço pdf"],
    ["Como registrar uma venda ganha?", "No negócio, altere a etapa para Ganho e informe o valor. A venda passa a compor relatórios, comissões e atribuição da campanha.", "O resultado real alimenta decisões e mostra quais ações geram receita.", 2, "/deals", "Atualizar negócio", "ganho receita conversão"],
    ["Onde registro contatos que não são clientes?", "Use Não-Leads para fornecedores, parceiros e outros contatos sem oportunidade comercial. Eles ficam separados do funil.", "O CRM permanece limpo sem perder relacionamentos importantes.", 2, "/contacts-nonleads", "Abrir contatos", "fornecedor parceiro não lead"],
    ["Como descubro por que estou perdendo vendas?", "Registre o motivo ao marcar um negócio como perdido e consulte relatórios de dores e perdas. Compare motivos por produto, equipe e período.", "A empresa transforma perdas em melhorias de preço, oferta e processo.", 4, "/analytics", "Analisar resultados", "motivo perda relatório"]
  ],
  "Integrações e atendimento": [
    ["Como conectar o Instagram profissional?", "Use Integrações e autorize uma conta profissional vinculada a uma Página do Facebook. O sistema mostra o estado da conexão.", "Conteúdo e contatos sociais ficam integrados ao trabalho comercial.", 4, "/onboarding/integracoes", "Conectar Instagram", "meta página profissional"],
    ["Como conectar Facebook e Meta Ads?", "Autorize sua conta Meta, selecione a Página e a conta de anúncios corretas. Confirme as permissões solicitadas.", "A empresa publica, acompanha e atribui campanhas no mesmo ambiente.", 5, "/onboarding/integracoes", "Conectar Meta", "facebook ads business"],
    ["Como conectar o WhatsApp oficial?", "Na etapa de integrações, escolha WhatsApp oficial e conclua o cadastro do número na Meta. O número não pode permanecer preso a uma configuração incompatível.", "Conversas, leads e automações passam a trabalhar juntos com histórico.", 6, "/onboarding/integracoes", "Conectar WhatsApp", "cloud api número coexistência"],
    ["Posso usar o WhatsApp Business com coexistência?", "Quando a Meta disponibilizar coexistência para sua conta e região, o mesmo número pode continuar no aplicativo e também operar pela API. A disponibilidade depende da Meta.", "A equipe mantém a rotina do aplicativo enquanto ganha automação e integração.", 3, "/onboarding/integracoes", "Ver situação", "business app coexistence"],
    ["Como conectar o Google Calendar?", "Abra Agenda, crie ou selecione uma agenda e use Conectar Google. Autorize a conta correta e volte ao VendorAI.", "Compromissos e reuniões ficam sincronizados, reduzindo conflitos de horário.", 4, "/agenda", "Conectar agenda", "calendar eventos"],
    ["Como conectar serviços do Google?", "Use a implantação de integrações para autorizar a conta Google. Google Calendar e Google Ads podem exigir permissões e configurações diferentes.", "A empresa centraliza agenda, publicidade e mensuração.", 5, "/onboarding/integracoes", "Conectar Google", "ads calendar oauth"],
    ["Onde vejo todas as conversas?", "Abra Conversas para acompanhar mensagens vinculadas aos contatos. Use filtros e responsável para organizar o atendimento.", "O histórico fica acessível à equipe autorizada e não depende de um aparelho.", 2, "/conversations", "Abrir conversas", "omnichannel mensagens"],
    ["O que acontece se uma integração cair?", "A conexão aparece como pendente ou com erro. Reconecte a conta e revise permissões; os demais módulos continuam funcionando.", "Uma falha de canal não paralisa toda a operação.", 3, "/onboarding/integracoes", "Revisar conexões", "token expirado reconectar"],
    ["Como atender mais rápido sem perder qualidade?", "Use respostas sugeridas, Base de Conhecimento e o Agente de Suporte. Revise informações sensíveis antes do envio.", "A equipe reduz tempo de resposta mantendo o padrão da empresa.", 3, "/base-conhecimento", "Organizar respostas", "atendimento rápido respostas"],
    ["O cliente sabe quando está falando com IA?", "Defina a apresentação e as regras do agente. O ideal é comunicar com clareza quando houver automação e permitir encaminhamento humano.", "Transparência aumenta confiança e reduz experiências frustrantes.", 3, "/agents/config", "Configurar agentes", "transparência humano"]
  ],
  "Marketing e conteúdo": [
    ["Como criar conteúdo para Instagram?", "Abra Conteúdo, escolha nicho, produtos ou serviços e formato. A IA usa o contexto da marca para criar texto e material.", "A empresa produz com mais frequência sem começar toda publicação do zero.", 4, "/content", "Criar conteúdo", "feed stories reels"],
    ["Por que escolher nicho e produto antes de gerar?", "O nicho define para quem a comunicação será feita e o produto define o que será oferecido. Eles podem ser diferentes do segmento principal da empresa.", "A mensagem fica específica e comercialmente relevante.", 2, "/content", "Escolher contexto", "público oferta"],
    ["O gerador usa meus produtos e serviços reais?", "Sim, quando estão cadastrados no catálogo e selecionados. Revise descrição, imagens e preço para melhorar o resultado.", "O material divulga o que a empresa realmente vende e reduz correções manuais.", 3, "/catalogo", "Revisar catálogo", "dados reais produto"],
    ["Como criar Stories e roteiros de Reels?", "Escolha o formato no gerador, informe objetivo, público e produtos. O VendorAI adapta estrutura e chamada para cada formato.", "A marca diversifica conteúdo e aumenta as formas de alcançar o público.", 4, "/content", "Gerar material", "story reel roteiro"],
    ["O que é o Content Autopilot?", "É a ferramenta que organiza e prepara uma sequência recorrente de conteúdos com base em temas, marca e objetivos definidos.", "A empresa mantém presença digital consistente com menos trabalho repetitivo.", 4, "/content-autopilot", "Configurar piloto", "calendário automático"],
    ["Como criar vídeos no VendorAI?", "Abra Vídeos e escolha avatar, produto, edição, legenda, clipes ou lote conforme o objetivo. Forneça materiais e revise a prévia.", "A empresa transforma ofertas e conteúdos em formatos de maior alcance.", 6, "/content-studio/video", "Abrir vídeos", "avatar legenda clipes"],
    ["Como criar uma landing page?", "Use Sites e Landing Pages, selecione objetivo, público e oferta. Revise formulário, contatos, política e destino dos leads antes de publicar.", "A campanha ganha uma página focada em conversão e atribuição.", 7, "/content-studio", "Criar página", "site formulário conversão"],
    ["Como criar um site para minha empresa?", "Informe marca, apresentação, benefícios, serviços, contatos e imagens. O gerador prepara a estrutura para sua revisão.", "A empresa conquista presença digital profissional mais rapidamente.", 8, "/content-studio", "Criar site", "website página institucional"],
    ["Como salvar materiais para usar depois?", "Use a Biblioteca de Conteúdo para guardar variações, imagens e textos aprovados. Organize por tema e formato.", "A equipe reaproveita ativos e mantém consistência de marca.", 3, "/content", "Abrir biblioteca", "salvar material"],
    ["Como medir se o conteúdo está funcionando?", "Acompanhe publicações, interações, leads e vendas atribuídas. Compare temas e ofertas, não apenas curtidas.", "O marketing passa a ser avaliado pelo impacto comercial.", 4, "/analytics", "Ver métricas", "resultado engajamento"]
  ],
  "Anúncios": [
    ["Como criar uma campanha do início ao fim?", "Escolha plataforma, objetivo, nicho, oferta, destino, público, período e orçamento. Gere o criativo, revise e publique.", "A empresa transforma planejamento, criação e acompanhamento em um único fluxo.", 8, "/ads", "Criar campanha", "google meta patrocinar"],
    ["A campanha pode ser enviada ativa?", "Sim. Ao publicar e ativar, ela segue para análise da plataforma. A entrega começa somente quando Google ou Meta aprovarem.", "A empresa reduz etapas sem ignorar as regras obrigatórias das plataformas.", 3, "/ads", "Ver campanhas", "ativa aprovação"],
    ["O que acontece se o anúncio for reprovado?", "O VendorAI registra o motivo, mostra orientações e prepara uma nova versão em rascunho. Revise antes de reenviar.", "A correção fica guiada e o histórico da versão anterior é preservado.", 4, "/ads", "Corrigir anúncio", "política rejeitado"],
    ["Quem cobra o valor gasto em anúncios?", "Google ou Meta cobram a mídia diretamente na conta de anúncios. O VendorAI organiza orçamento, status e resultados, mas não recebe esse gasto.", "A empresa separa claramente licença do sistema e investimento publicitário.", 2, "/ads", "Conferir orçamento", "cartão cobrança mídia"],
    ["Como sei se há problema de pagamento?", "A Central de Resultados registra falhas de cartão, saldo ou faturamento informadas pela plataforma e cria um alerta.", "O responsável age antes que a campanha fique parada por muito tempo.", 2, "/ads", "Ver alertas", "billing pagamento erro"],
    ["Como o VendorAI identifica o lead do anúncio?", "Cada campanha recebe um código vai_... usado em WhatsApp, formulários e landing pages. O lead entra vinculado à campanha.", "Você descobre quais campanhas geram contatos e vendas reais.", 3, "/ads", "Ver atribuição", "utm código lead"],
    ["O que significam CPL e ROAS?", "CPL é o custo por lead. ROAS compara a receita atribuída com o gasto em mídia. Analise também qualidade e vendas.", "A empresa decide com base em retorno, não apenas cliques.", 3, "/ads", "Abrir resultados", "custo lead retorno"],
    ["O VendorAI pode pausar campanha sem resultado?", "Quando a proteção estiver ativada, a campanha pode ser pausada ao atingir o limite de gasto sem resultado configurado.", "A empresa reduz desperdício sem entregar controle financeiro irrestrito à IA.", 3, "/ads", "Configurar proteção", "waste guard limite"],
    ["A IA pode aumentar meu orçamento sozinha?", "Não. Ela pode recomendar aumento ou extensão, mas prepara um rascunho e exige sua confirmação antes de qualquer novo gasto.", "O gestor mantém controle financeiro e ainda recebe apoio analítico.", 2, "/ads", "Ver recomendações", "aprovação orçamento"],
    ["Como patrocinar uma publicação existente?", "Escolha Meta, selecione a publicação disponível, configure público, destino, orçamento e período. Depois publique a campanha.", "A empresa aproveita conteúdo já aprovado e adiciona acompanhamento comercial.", 5, "/ads", "Patrocinar conteúdo", "instagram post existente"]
  ],
  "Agentes de IA": [
    ["O que faz o Agente SDR?", "Atende o primeiro contato, coleta informações, identifica necessidade e qualifica o lead segundo as regras da empresa.", "Vendedores recebem oportunidades mais organizadas e gastam menos tempo com triagem.", 3, "/agents/config", "Configurar SDR", "qualificação primeiro contato"],
    ["O que faz o Agente Closer?", "Apoia a etapa de decisão, responde objeções com base nas regras aprovadas e sinaliza quando o vendedor deve assumir.", "A empresa aumenta consistência nas negociações sem retirar o controle humano.", 3, "/agents/config", "Configurar Closer", "fechamento objeção"],
    ["O que faz o Agente de Follow-up?", "Programa e executa acompanhamentos conforme prazo, etapa e comportamento, respeitando limites e preferências do cliente.", "Oportunidades deixam de ser esquecidas e o relacionamento continua no momento certo.", 3, "/agents/config", "Configurar follow-up", "retorno lembrete"],
    ["O que faz o Agente Financeiro?", "Ajuda a consultar situações financeiras, organizar informações e orientar fluxos autorizados. Ações sensíveis seguem permissões.", "A equipe reduz buscas manuais e responde questões financeiras com mais rapidez.", 3, "/agents/config", "Configurar Financeiro", "fatura pagamento"],
    ["O que faz o Agente de Cobrança?", "Organiza lembretes e contatos de cobrança com linguagem e frequência definidas pela empresa.", "A empresa melhora recuperação de valores mantendo um padrão respeitoso.", 3, "/agents/config", "Configurar Cobrança", "inadimplência lembrete"],
    ["O que faz o Agente de Suporte?", "Responde dúvidas usando a Base de Conhecimento, coleta detalhes do problema e encaminha para uma pessoa quando necessário.", "O cliente recebe resposta inicial mais rápida e o suporte ganha contexto.", 3, "/agents/config", "Configurar Suporte", "ajuda chamado"],
    ["O que faz o Agente de Agendamento?", "Consulta disponibilidade, sugere horários e registra compromissos nas agendas configuradas.", "A empresa reduz troca de mensagens e conflitos de agenda.", 3, "/agents/config", "Configurar Agendamento", "marcar horário"],
    ["O que faz o Agente de Pós-venda?", "Acompanha o cliente depois da compra, verifica satisfação e identifica novas necessidades.", "A empresa aumenta retenção, indicação e oportunidades de recompra.", 3, "/agents/config", "Configurar Pós-venda", "satisfação recompra"],
    ["Os agentes podem agir sem limites?", "Não. Cada agente possui objetivo, ferramentas, regras, horários, permissões e situações de transferência para humanos.", "A automação cresce com governança e menor risco operacional.", 3, "/agents/config", "Revisar limites", "permissão governança"],
    ["Como os agentes aprendem sobre minha empresa?", "Eles usam perfil do negócio, catálogo, processos e Base de Conhecimento. Atualize essas fontes quando algo mudar.", "As respostas ficam alinhadas à operação e não dependem de instruções repetidas.", 4, "/base-conhecimento", "Atualizar conhecimento", "treinar contexto documentos"]
  ],
  "Gestão, ERP e equipe": [
    ["O que é a Gestão ERP?", "É a área para organizar documentos, movimentações e rotinas administrativas integradas ao contexto comercial.", "A empresa reduz sistemas desconectados e retrabalho de digitação.", 3, "/erp", "Abrir ERP", "financeiro gestão"],
    ["Como capturar uma nota ou documento com IA?", "Em Gestão ERP, use Capturar documento, envie foto ou PDF e revise todos os dados sugeridos antes de confirmar.", "A equipe economiza digitação sem abrir mão da conferência humana.", 4, "/erp/captura", "Capturar documento", "ocr nota pdf"],
    ["Como controlar usuários e permissões?", "Em Equipe, defina função e nível de acesso de cada pessoa. Revise acessos quando alguém muda de função ou sai.", "Dados e ações ficam disponíveis apenas para quem precisa.", 4, "/usuarios", "Gerenciar equipe", "acesso segurança"],
    ["Onde acompanho comissões?", "A área de Comissões mostra regras e resultados vinculados às vendas registradas. Mantenha valores e responsáveis atualizados.", "Vendedores e gestores ganham transparência sobre remuneração variável.", 3, "/comissoes", "Ver comissões", "vendedor percentual"],
    ["Como organizar produtos em categorias?", "Use Catálogo e Categorias para estruturar produtos ou serviços. Informe dados comerciais e imagens úteis.", "Busca, propostas, campanhas e agentes encontram a oferta correta mais rapidamente.", 4, "/catalogo", "Organizar catálogo", "categoria item"],
    ["O que são Pacotes?", "Pacotes reúnem produtos ou serviços em uma oferta combinada, com condições e apresentação próprias.", "A empresa aumenta ticket médio e facilita ofertas completas.", 3, "/pacotes", "Criar pacote", "combo oferta"],
    ["Como acompanhar indicadores da empresa?", "Use Dashboard, Métricas de IA e relatórios comerciais. Escolha o período e compare atividade, conversão e receita.", "O gestor identifica desvios e oportunidades antes de decidir.", 4, "/analytics", "Ver indicadores", "dashboard kpi"],
    ["Como gerenciar várias unidades ou empresas?", "O Painel da Rede organiza a visão permitida das unidades e operações vinculadas. A configuração depende do modelo contratado.", "A direção acompanha a rede sem misturar indevidamente os dados de cada empresa.", 4, "/organizacao", "Abrir painel", "multiempresa franquia"],
    ["Como registrar atividades da equipe?", "Vincule ligações, reuniões, tarefas e observações ao lead ou negócio. Use a Central de Trabalho para acompanhar pendências.", "O histórico não fica preso à memória de uma única pessoa.", 3, "/trabalho", "Registrar atividade", "timeline tarefa"],
    ["Posso definir regras diferentes por segmento?", "Sim. O VendorAI utiliza módulos e processos adequados ao segmento, mantendo o núcleo de CRM, marketing e inteligência.", "A empresa recebe profundidade operacional sem perder uma base integrada.", 3, "/configuracoes", "Revisar segmento", "indústria vertical"]
  ],
  "Inteligência e oportunidades": [
    ["O que é o Revenue Scout?", "É o motor que procura oportunidades na base a partir de regras, sinais e histórico, como recompra, renovação ou interesse não concluído.", "A empresa gera receita também com clientes e dados que já possui.", 4, "/scout", "Abrir Revenue Scout", "oportunidade receita"],
    ["Como funcionam as regras do Revenue Scout?", "Defina condições, prioridades, prazos e ações. Comece com regras simples e acompanhe os resultados antes de ampliar.", "A prospecção interna fica previsível e alinhada à estratégia.", 4, "/scout/regras", "Configurar regras", "gatilho condição"],
    ["Onde vejo oportunidades encontradas?", "Abra Oportunidades para consultar motivo, cliente, prioridade e ação sugerida. O gestor pode liberar e encaminhar.", "A equipe recebe uma fila qualificada em vez de procurar manualmente.", 3, "/scout/oportunidades", "Ver oportunidades", "fila scout"],
    ["O que é o Pipeline Scout?", "É a visão das oportunidades identificadas pelo Revenue Scout durante o processo até seu resultado.", "O gestor mede quanto o motor inteligente realmente acrescenta ao faturamento.", 3, "/scout/pipeline", "Abrir pipeline", "kanban oportunidade"],
    ["O que é o Vendor Brain?", "É a camada que organiza sinais e contexto para apoiar decisões, recomendações e prioridades dentro do VendorAI.", "A empresa transforma dados dispersos em orientação prática.", 4, "/brain", "Abrir Vendor Brain", "cérebro inteligência"],
    ["O que é o Knowledge Graph?", "É o mapa de relações entre clientes, produtos, empresas, interações e oportunidades, respeitando os dados disponíveis.", "A empresa entende conexões que seriam difíceis de encontrar em listas separadas.", 4, "/vkg", "Explorar relações", "grafo conhecimento"],
    ["O que é o Opportunity Engine?", "É o mecanismo que combina sinais do ecossistema e regras para identificar oportunidades compatíveis.", "A empresa encontra novas possibilidades comerciais com critérios claros.", 4, "/poe", "Abrir oportunidades", "engine poe"],
    ["O que é o Partner Hub?", "É a área para organizar parceiros, relacionamento, indicações e oportunidades conjuntas.", "A empresa transforma parcerias informais em um canal comercial administrável.", 4, "/partner-hub", "Gerenciar parceiros", "indicação comissão"],
    ["O que é o Ecosystem Hub?", "É a visão das empresas e relações do ecossistema conectado, conforme permissões e participação.", "A empresa identifica complementaridades, fornecedores e potenciais negócios.", 4, "/ecosystem-hub", "Explorar ecossistema", "rede empresas"],
    ["O que é a Vendor Certified Network?", "É a rede de participantes certificados e suas relações dentro do ecossistema VendorAI.", "A empresa aumenta confiança ao buscar conexões e oportunidades qualificadas.", 3, "/vendor-certified-network", "Ver rede certificada", "vcn confiança"]
  ],
  "Ferramentas por segmento": [
    ["Como o VendorAI ajuda construtoras?", "Integra leads, propostas, obras, insumos, composições, atendimento e marketing no mesmo contexto.", "A construtora acompanha da captação ao relacionamento durante a obra.", 4, "/obras", "Abrir Obras", "construção reforma"],
    ["O que o Arqdor oferece para arquitetura?", "Organiza projetos, renderização, catálogo, portal do cliente e marketplace conforme os módulos disponíveis.", "O escritório reduz fragmentação entre apresentação, especificação e relacionamento.", 5, "/arch", "Abrir Arqdor", "arquitetura render"],
    ["Como funciona a operação para varejo?", "Produtos, coleções, fornecedores, compras, fidelidade e combos trabalham junto ao CRM e marketing.", "A loja conecta estoque, relacionamento e campanhas para aumentar recorrência.", 4, "/varejo/produtos", "Abrir varejo", "loja roupas decoração"],
    ["Como ajuda supermercados?", "Reúne produtos, pedidos, campanhas e configurações específicas, além das funções comerciais gerais.", "O supermercado organiza promoção e relacionamento com visão integrada.", 4, "/supermercado", "Abrir operação", "mercado pedido"],
    ["Como ajuda salões, barbearias e pet shops?", "Organiza agenda, serviços, profissionais, clientes, campanhas e acompanhamento.", "A empresa melhora ocupação da agenda e incentiva retorno dos clientes.", 4, "/beauty", "Abrir agenda", "beleza banho tosa"],
    ["Como ajuda clínicas?", "Reúne agenda, profissionais e fluxos operacionais do segmento com CRM e comunicação.", "A clínica reduz falhas de acompanhamento e organiza a jornada do paciente.", 4, "/clinic", "Abrir clínica", "saúde médico"],
    ["Como ajuda farmácias?", "Oferece central operacional, produtos, bulas, pedidos e receitas conforme permissões, além de CRM e campanhas.", "A farmácia organiza atendimento e relacionamento sem misturar funções sensíveis.", 4, "/farmacia", "Abrir farmácia", "medicamento pedido"],
    ["Como ajuda imobiliárias?", "Organiza propriedades, visitas, leads, propostas, campanhas e atribuição de contatos.", "A imobiliária acompanha interesse e agenda sem perder o vínculo com o imóvel divulgado.", 4, "/imoveis/propriedades", "Abrir imóveis", "casa apartamento visita"],
    ["Como ajuda empresas de frete?", "Gerencia cargas, frota, motoristas e entregas junto ao relacionamento comercial.", "A transportadora conecta venda e execução sem planilhas isoladas.", 4, "/fretes/cargas", "Abrir cargas", "logística transporte"],
    ["Como ajuda lojas e concessionárias de veículos?", "Reúne estoque, test-drives, leads, campanhas e reserva de item único durante a negociação.", "A empresa reduz anúncio de veículo indisponível e acompanha a oportunidade até a venda.", 4, "/veiculos/estoque", "Abrir estoque", "carro concessionária"]
  ],
  "Conta, segurança e suporte": [
    ["Como funciona a licença de uso?", "A licença libera os módulos previstos e pode seguir o período e as condições comerciais contratadas. Consulte a área financeira para situação atual.", "A empresa entende claramente acesso ao sistema e investimento em mídia ou serviços externos.", 3, "/configuracoes", "Ver conta", "plano crédito mensalidade"],
    ["O que acontece quando o período de acesso termina?", "O sistema informa a situação da licença. Conforme a regra contratada, consultas podem permanecer disponíveis enquanto ações geradoras ficam bloqueadas até renovação.", "A empresa preserva o histórico e sabe exatamente como reativar.", 3, "/configuracoes", "Consultar licença", "cinco dias renovar"],
    ["Meus dados ficam misturados com os de outra empresa?", "Não devem ficar. O VendorAI usa separação por empresa e permissões. Se visualizar algo indevido, interrompa o uso daquela tela e avise o suporte imediatamente.", "A operação mantém isolamento e resposta rápida a qualquer anomalia.", 2, "/configuracoes", "Revisar acesso", "tenant isolamento"],
    ["Como recuperar minha senha?", "Na tela de entrada, escolha Esqueci minha senha e siga o link recebido. Se não receber, confira spam e endereço cadastrado.", "O usuário recupera acesso sem compartilhar senha com terceiros.", 3, "/esqueci-senha", "Recuperar senha", "login acesso"],
    ["Como alterar dados ou senha de um usuário?", "Administradores podem gerenciar a equipe; cada usuário deve proteger sua própria credencial. Revogue acesso de pessoas desligadas.", "A empresa reduz risco de acessos antigos ou compartilhados.", 3, "/usuarios", "Gerenciar usuários", "senha desligamento"],
    ["Quem pode ver informações financeiras?", "Somente funções autorizadas conforme permissões da empresa. Revise os papéis de financeiro e administrador.", "Informações sensíveis ficam restritas às responsabilidades corretas.", 3, "/usuarios", "Revisar permissões", "financeiro privacidade"],
    ["O VendorAI toma decisões financeiras sozinho?", "Não. Recomendações podem ser automáticas, mas gastos, aumentos de orçamento e ações críticas exigem confirmação e permissões.", "A empresa aproveita inteligência mantendo governança.", 2, "/configuracoes", "Ver regras", "aprovação humana"],
    ["Como falar com o suporte?", "Use o botão de suporte no canto da tela. Explique o que tentou, qual tela estava usando e o resultado esperado.", "O suporte recebe contexto suficiente e resolve com menos idas e voltas.", 2, undefined, "Abrir suporte", "atendimento ajuda"],
    ["Como relatar um erro?", "No suporte, descreva os passos, horário, mensagem exibida e, se possível, envie imagem. O atendimento gera um protocolo quando necessário.", "A equipe técnica consegue reproduzir e corrigir o problema com mais rapidez.", 3, undefined, "Relatar problema", "bug protocolo"],
    ["O que fazer quando a FAQ não resolve?", "Abra o suporte pelo botão desta página. A pergunta consultada será enviada como contexto inicial para você complementar.", "Você não precisa repetir tudo e o atendimento começa do ponto correto.", 2, undefined, "Pedir ajuda", "não resolveu humano"]
  ]
};

const FAQS: FAQItem[] = Object.entries(RAW).flatMap(([category, items]) =>
  items.map((item, index) => ({
    id: Object.values(RAW).slice(0, Object.keys(RAW).indexOf(category)).reduce((sum, group) => sum + group.length, 0) + index + 1,
    category,
    question: item[0],
    answer: item[1],
    benefit: item[2],
    minutes: item[3],
    href: item[4],
    action: item[5],
    keywords: item[6] ?? "",
  }))
);

const CATEGORIES = ["Todas", ...Object.keys(RAW)];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function helpContext() {
  const path = sessionStorage.getItem("vendorai_help_from") ?? "";
  const mappings: Array<[string[], string, string]> = [
    [["/ads", "/marketing/plano"], "Anúncios", "campanhas e resultados"],
    [["/content", "/content-studio", "/campanhas"], "Marketing e conteúdo", "conteúdo e marketing"],
    [["/agents", "/base-conhecimento"], "Agentes de IA", "agentes e conhecimento"],
    [["/leads", "/deals", "/negocios", "/propostas", "/trabalho", "/comissoes"], "CRM e vendas", "clientes e vendas"],
    [["/conversations", "/agenda", "/onboarding/integracoes"], "Integrações e atendimento", "integrações e atendimento"],
    [["/erp", "/catalogo", "/pacotes", "/usuarios", "/organizacao", "/analytics"], "Gestão, ERP e equipe", "gestão da empresa"],
    [["/scout", "/brain", "/vkg", "/partner-hub", "/ecosystem-hub", "/vendor-certified-network", "/poe"], "Inteligência e oportunidades", "inteligência e oportunidades"],
    [["/arch", "/obras", "/varejo", "/supermercado", "/beauty", "/clinic", "/farmacia", "/imoveis", "/fretes", "/veiculos"], "Ferramentas por segmento", "ferramentas do seu segmento"],
    [["/configuracoes", "/trocar-senha"], "Conta, segurança e suporte", "conta e segurança"],
    [["/guia-implantacao", "/onboarding"], "Primeiros passos", "implantação"],
  ];
  const match = mappings.find(([prefixes]) => prefixes.some((prefix) => path.startsWith(prefix)));
  return { category: match?.[1] ?? "Todas", label: match?.[2] ?? "" };
}

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(1);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(context.category);

  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    return FAQS.filter((item) => {
      if (category !== "Todas" && item.category !== category) return false;
      if (!term) return true;
      return normalize([item.question, item.answer, item.benefit, item.category, item.keywords].join(" ")).includes(term);
    });
  }, [query, category]);

  const requestSupport = (question: string) => {
    window.dispatchEvent(new CustomEvent("vendorai:open-support", { detail: { question } }));
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 md:p-8">
        <div className="max-w-3xl">
          <Badge variant="secondary" className="mb-3"><Sparkles className="h-3.5 w-3.5 mr-1" />100 respostas práticas</Badge>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2"><HelpCircle className="h-7 w-7 text-primary" />Central de Ajuda VendorAI</h1>
          <p className="text-muted-foreground mt-2">Encontre o que fazer, onde acessar e qual benefício cada ferramenta ou agente proporciona para sua empresa.</p>
          <div className="relative mt-5">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Ex.: "Como importar meus clientes?" ou "O que faz o agente SDR?"'
              className="w-full h-10 rounded-lg border bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      </section>

      {context.category !== "Todas" && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Ajuda desta tela</p>
            <p className="text-sm text-muted-foreground">Mostrando primeiro as respostas sobre {context.label}.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCategory("Todas")}>Ver todas as 100 dúvidas</Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((item) => (
          <Button key={item} size="sm" variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)}>
            {item}{item !== "Todas" && <span className="ml-1 opacity-70">10</span>}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{filtered.length} resposta{filtered.length === 1 ? "" : "s"} encontrada{filtered.length === 1 ? "" : "s"}</p>
        {(query || category !== "Todas") && <Button size="sm" variant="ghost" onClick={() => { setQuery(""); setCategory("Todas"); }}>Limpar filtros</Button>}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <MessageCircleQuestion className="h-8 w-8 mx-auto text-muted-foreground" />
          <h2 className="font-semibold mt-3">Não encontramos essa dúvida</h2>
          <p className="text-sm text-muted-foreground mt-1">Abra o suporte e conte o que você precisa fazer.</p>
          <Button className="mt-4" onClick={() => requestSupport(query || "Não encontrei minha dúvida na Central de Ajuda")}>Falar com o suporte</Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y overflow-hidden">
          {filtered.map((item) => (
            <article key={item.id}>
              <button type="button" onClick={() => setOpen(open === item.id ? null : item.id)} className="w-full p-4 flex items-start justify-between gap-4 text-left hover:bg-muted/40">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline" className="font-normal">{item.category}</Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock3 className="h-3 w-3" />{item.minutes} min</span>
                  </div>
                  <span className="font-medium">{item.id}. {item.question}</span>
                </div>
                {open === item.id ? <ChevronDown className="h-4 w-4 shrink-0 mt-2" /> : <ChevronRight className="h-4 w-4 shrink-0 mt-2" />}
              </button>
              {open === item.id && (
                <div className="px-4 pb-5 md:px-6 space-y-4">
                  <p className="text-sm leading-relaxed">{item.answer}</p>
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <p className="text-xs font-semibold text-green-800">Benefício para sua empresa</p>
                    <p className="text-sm text-green-800 mt-1">{item.benefit}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.href && item.action && (
                      <Link href={item.href}>
                        <Button size="sm">{item.action}<ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
                      </Link>
                    )}
                    <Button size="sm" variant="outline" onClick={() => requestSupport(item.question)}>
                      <MessageCircleQuestion className="h-3.5 w-3.5 mr-1" />Não resolveu? Pedir ajuda
                    </Button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
