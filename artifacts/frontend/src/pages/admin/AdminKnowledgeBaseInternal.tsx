import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen,
  Building2,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";

type ScopeModule = {
  id: string;
  group: string;
  title: string;
  summary: string;
  bullets: string[];
  angle: string;
};

const construtoraModules: ScopeModule[] = [
  {
    id: "pre-projeto-arqdor",
    group: "Aquisição",
    title: "Pré-Projeto Arqdor.ai",
    summary: "Transforma a experiência de projeto em ferramenta de captação e qualificação de leads.",
    bullets: [
      "Lead cria pré-ideia de casa, fachada ou ambiente antes do contato comercial.",
      "Coleta terreno, metragem, estilo, necessidades, orçamento e preferências.",
      "Aceita referências, fotos, plantas e croquis.",
      "Entrega ao comercial um lead enriquecido com contexto e intenção.",
    ],
    angle: "Use o Pré-Projeto como principal diferencial para captar leads mais preparados e aumentar o envolvimento emocional antes da reunião.",
  },
  {
    id: "landing-pages",
    group: "Aquisição",
    title: "Landing Pages por objetivo",
    summary: "Cria páginas específicas para converter campanhas, modelos, regiões e ofertas em leads rastreáveis.",
    bullets: [
      "LP de Pré-Projeto.",
      "LP por modelo de casa, estilo, cidade, região ou empreendimento.",
      "LP por faixa de investimento, campanha ou simulação.",
      "Origem, campanha e interesse chegam ao CRM.",
    ],
    angle: "Destaque a possibilidade de criar uma LP específica para cada oferta e conectar o tráfego diretamente ao CRM.",
  },
  {
    id: "marketing-ativo",
    group: "Marketing",
    title: "Marketing Ativo",
    summary: "Transforma o sistema em motor de geração de demanda e não apenas em organizador de contatos.",
    bullets: [
      "Planejamento de conteúdo por objetivo.",
      "Campanhas por público, região, ticket, modelo construtivo ou empreendimento.",
      "Nutrição e remarketing.",
      "Marketing conectado à origem, lead, oportunidade e venda.",
    ],
    angle: "Venda o marketing como uma máquina contínua de geração, nutrição e recuperação de demanda.",
  },
  {
    id: "conteudo-reels-video",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Ajuda a produzir material comercial e institucional continuamente a partir das atividades reais da construtora.",
    bullets: [
      "Posts, legendas, CTAs e variações.",
      "Roteiros para Reels, vídeos, bastidores e antes/depois.",
      "Conteúdo técnico e comercial.",
      "Reaproveitamento de fotos, marcos e diário de obra.",
    ],
    angle: "Mostre como a operação real da construtora pode virar conteúdo e prova social sem depender de produção manual diária.",
  },
  {
    id: "campanhas",
    group: "Marketing",
    title: "Campanhas",
    summary: "Organiza campanhas completas com público, mensagem, canais, criativos, LP, nutrição e indicadores.",
    bullets: [
      "Campanhas por tipo de obra e perfil de cliente.",
      "Campanhas por território ou faixa de investimento.",
      "Integração com conteúdo, anúncios e Landing Pages.",
      "Rastreamento até a oportunidade comercial.",
    ],
    angle: "Destaque o fluxo campanha → lead → oportunidade → venda, evitando campanhas desconectadas do resultado comercial.",
  },
  {
    id: "planejamento-gerado",
    group: "Inteligência",
    title: "Planejamento Gerado",
    summary: "Transforma objetivos em planos comerciais, de prospecção, marketing, lead, obra e relacionamento.",
    bullets: [
      "Plano comercial com metas, públicos, produtos e prioridades.",
      "Plano de prospecção com perfis, regiões, sinais e cadência.",
      "Plano de marketing com calendário, temas, canais e CTAs.",
      "Plano por lead, obra e relacionamento.",
    ],
    angle: "Venda o planejamento como a ponte entre estratégia e execução: o sistema não só analisa, ele organiza o que deve ser feito.",
  },
  {
    id: "prospector",
    group: "Comercial",
    title: "Prospector",
    summary: "Busca e organiza oportunidades com base em perfis e sinais observáveis antes da abordagem.",
    bullets: [
      "Pesquisa por perfil de cliente e região.",
      "Uso de sinais de oportunidade.",
      "Fila de prospecção.",
      "Pré-qualificação antes do SDR.",
    ],
    angle: "Mostre que a construtora deixa de depender somente de indicação e demanda espontânea para encontrar oportunidades.",
  },
  {
    id: "crm-cliente-360",
    group: "Comercial",
    title: "CRM e Cliente 360",
    summary: "Centraliza toda a memória comercial e o contexto do cliente em um único lugar.",
    bullets: [
      "Dados, origem, briefing e preferências.",
      "Histórico de conversas, documentos e atividades.",
      "Oportunidades, propostas e próximos passos.",
      "Relacionamentos e decisores.",
    ],
    angle: "Destaque que o conhecimento do cliente deixa de ficar preso no celular do vendedor.",
  },
  {
    id: "pipeline",
    group: "Comercial",
    title: "Pipeline de Vendas",
    summary: "Mostra onde estão as oportunidades, quanto valem e qual é o próximo passo de cada uma.",
    bullets: [
      "Etapas configuráveis.",
      "Valor, probabilidade e responsável.",
      "Motivos de perda.",
      "Próxima ação obrigatória.",
    ],
    angle: "Material ideal para falar de previsibilidade comercial, gestão de carteira e redução de propostas esquecidas.",
  },
  {
    id: "omnichannel",
    group: "Comercial",
    title: "Conversas Omnichannel",
    summary: "Mantém atendimento e mensagens ligados ao cliente e à oportunidade, em vez de espalhados por canais isolados.",
    bullets: [
      "WhatsApp, Instagram e demais canais no contexto do cliente.",
      "Transferência preservando histórico.",
      "Registro de decisões e tarefas.",
      "IA assistindo respostas e continuidade.",
    ],
    angle: "Mostre como o WhatsApp deixa de ser uma ilha e passa a fazer parte do processo comercial.",
  },
  {
    id: "agentes-ia",
    group: "IA",
    title: "Agentes de IA",
    summary: "SDR, Closer, Follow-up e Suporte atuam em etapas diferentes da jornada comercial e de relacionamento.",
    bullets: [
      "SDR qualifica e entende necessidade.",
      "Closer trabalha negociação e objeções.",
      "Follow-up reduz oportunidades esquecidas.",
      "Suporte acompanha atendimento até a avaliação final.",
    ],
    angle: "Crie materiais separados para cada agente ou um material mostrando o time de IA funcionando em sequência.",
  },
  {
    id: "agenda-visitas",
    group: "Comercial",
    title: "Agenda e Visitas",
    summary: "Organiza reuniões, visitas técnicas, medições e compromissos conectados ao contexto do cliente.",
    bullets: [
      "Reuniões e visitas.",
      "Lembretes e responsáveis.",
      "Agenda por equipe.",
      "Contexto do lead e da obra no compromisso.",
    ],
    angle: "Destaque a redução de faltas, esquecimentos e visitas sem informação suficiente.",
  },
  {
    id: "orcamento-composicoes",
    group: "Engenharia Comercial",
    title: "Orçamento e Composições",
    summary: "Transforma o orçamento vendido na base econômica da futura obra.",
    bullets: [
      "Etapas, composições e insumos.",
      "Mão de obra por m², hora, dia, mês ou unidade.",
      "Margem, frete, comissão e custos adicionais.",
      "Versões e revisões.",
    ],
    angle: "Mostre o ganho de sair de planilhas isoladas para um orçamento estruturado e conectado à execução.",
  },
  {
    id: "propostas-contratos",
    group: "Engenharia Comercial",
    title: "Propostas e Contratos",
    summary: "Mantém orçamento, proposta, aceite e contrato dentro da mesma linha comercial.",
    bullets: [
      "Proposta profissional.",
      "Versões e histórico.",
      "Aceite e documentação.",
      "Transição para contrato e obra.",
    ],
    angle: "Destaque continuidade: o que foi vendido permanece ligado ao que será executado.",
  },
  {
    id: "arqdor-projeto-render",
    group: "Arqdor.ai",
    title: "Projeto, Fachadas, Ambientes e Render",
    summary: "Ajuda a apresentar, aprofundar e visualizar o projeto para acelerar entendimento e decisão.",
    bullets: [
      "Modelagem e estudo de ambientes.",
      "Fachadas e ambientações.",
      "Materiais e referências.",
      "Render e apresentação ao cliente.",
    ],
    angle: "Ideal para material visual mostrando como o cliente deixa de imaginar e passa a visualizar o que está comprando.",
  },
  {
    id: "planejamento-obra",
    group: "Obra",
    title: "Planejamento da Obra",
    summary: "Transforma o contrato fechado em sequência executável de etapas, atividades, responsáveis e prazos.",
    bullets: [
      "Etapas e dependências.",
      "Responsáveis e metas.",
      "Cronograma e marcos.",
      "Necessidades de compra e replanejamento.",
    ],
    angle: "Destaque o planejamento como guia vivo da execução, e não como cronograma estático.",
  },
  {
    id: "gestao-obras",
    group: "Obra",
    title: "Gestão de Obras",
    summary: "Cada obra se torna uma unidade de operação com informação comercial, técnica e financeira conectada.",
    bullets: [
      "Cliente, endereço, responsáveis e contrato.",
      "Progresso, equipe e documentos.",
      "Pendências e ocorrências.",
      "Integração com orçamento e custos.",
    ],
    angle: "Material focado em centralização: uma obra, uma visão operacional completa.",
  },
  {
    id: "diario-acessos",
    group: "Obra",
    title: "Diário de Obras e Acessos por Perfil",
    summary: "Registra o que aconteceu no campo e entrega acesso adequado para cada participante da obra.",
    bullets: [
      "Atividades, equipe, clima, materiais e equipamentos.",
      "Fotos, ocorrências e evidências.",
      "Acessos diferentes para mestre, engenheiro, arquiteto, eletricista, pedreiro e outros.",
      "Metas e responsabilidades por executor.",
    ],
    angle: "Destaque rastreabilidade, evidência e organização do campo sem depender de grupos de WhatsApp.",
  },
  {
    id: "insumos",
    group: "Obra",
    title: "Insumos e Materiais",
    summary: "Liga materiais às etapas e composições para antecipar necessidade, consumo e disponibilidade.",
    bullets: [
      "Cadastro padronizado.",
      "Vínculo com etapa e composição.",
      "Necessidade x disponível.",
      "Entrada, saída, fornecedor e preço.",
    ],
    angle: "Material exclusivo sobre redução de falta, excesso e compra emergencial de material.",
  },
  {
    id: "compras-cotacoes",
    group: "Suprimentos",
    title: "Compras e Cotações",
    summary: "Organiza a tomada de preços desde a solicitação até o pedido e a entrega.",
    bullets: [
      "Solicitação de compra.",
      "Importação de orçamentos de fornecedores.",
      "Mapa comparativo de preço, prazo, frete e condição.",
      "Aprovação, pedido e acompanhamento.",
    ],
    angle: "Destaque economia, governança e rastreabilidade na compra de materiais e serviços.",
  },
  {
    id: "custos-margem",
    group: "Financeiro",
    title: "Custos, Previsto x Real e Margem",
    summary: "Permite acompanhar se a obra está consumindo a margem enquanto ainda há tempo para corrigir.",
    bullets: [
      "Orçado x comprometido x realizado.",
      "Custo por etapa.",
      "Despesas e comprovantes.",
      "Margem projetada e resultado por obra.",
    ],
    angle: "Material forte para direção e financeiro: descobrir o desvio antes do fim da obra.",
  },
  {
    id: "portal-app",
    group: "Cliente",
    title: "App e Portal do Cliente",
    summary: "Entrega uma experiência digital contínua desde o Pré-Projeto até o pós-venda.",
    bullets: [
      "Projeto, renders e aprovações.",
      "Propostas, documentos e informações liberadas.",
      "Andamento, fotos e marcos da obra.",
      "Comunicação, acabamentos e assistência técnica.",
    ],
    angle: "Destaque experiência, transparência e diferenciação comercial da construtora.",
  },
  {
    id: "revenue-scout",
    group: "Inteligência",
    title: "Revenue Scout",
    summary: "Encontra novas oportunidades dentro da própria base de contatos e clientes.",
    bullets: [
      "Reativação de contatos.",
      "Indicações e novas obras.",
      "Cross-sell e novas necessidades.",
      "Priorização de oportunidades futuras.",
    ],
    angle: "Material focado em receita escondida: vender mais antes de comprar mais leads.",
  },
  {
    id: "pos-venda",
    group: "Cliente",
    title: "Pós-venda e Assistência",
    summary: "Organiza atendimento depois da entrega e transforma assistência em experiência e relacionamento.",
    bullets: [
      "Chamados com fotos e descrição.",
      "Responsável e prazo.",
      "Follow-up até solução.",
      "Avaliação, indicação e novas oportunidades.",
    ],
    angle: "Destaque proteção da marca, organização da assistência e geração de indicação.",
  },
];

const arquiteturaDesignModules: ScopeModule[] = [
  {
    id: "pre-projeto-experiencia",
    group: "Aquisição",
    title: "Pré-Projeto como Experiência de Captação",
    summary: "Permite ao potencial cliente experimentar uma ideia de espaço antes da primeira reunião e chegar ao escritório com intenção mais clara.",
    bullets: [
      "Lead cria uma primeira ideia de ambiente, fachada ou espaço.",
      "Coleta estilo, referências, necessidades, medidas iniciais e faixa de investimento.",
      "Pode entrar por LP, site, anúncio, QR Code, WhatsApp ou app.",
      "Entrega ao escritório um lead enriquecido, com contexto visual e briefing inicial.",
    ],
    angle: "Mostre o escritório oferecendo valor antes da reunião: o cliente não preenche apenas um formulário, ele começa a construir a visão do projeto.",
  },
  {
    id: "briefing-inteligente",
    group: "Aquisição",
    title: "Briefing Inteligente",
    summary: "Estrutura o levantamento inicial do cliente e reduz retrabalho na descoberta de necessidades.",
    bullets: [
      "Rotina, prioridades, dores, estilo e referências.",
      "Ambientes, usuários, restrições, orçamento e prazo.",
      "Anexos de fotos, plantas, croquis e inspirações.",
      "Resumo automático para reunião e proposta.",
    ],
    angle: "Material focado em reduzir reuniões improdutivas e transformar preferência subjetiva em informação organizada.",
  },
  {
    id: "landing-pages-arq",
    group: "Aquisição",
    title: "Landing Pages para Serviços de Arquitetura e Design",
    summary: "Cria páginas por serviço, nicho, estilo, região ou campanha para captar leads com mensagem específica.",
    bullets: [
      "LP para interiores, arquitetura residencial, comercial, reforma ou consultoria.",
      "LP por estilo, ambiente, cidade ou perfil de cliente.",
      "Oferta com Pré-Projeto, diagnóstico ou briefing inicial.",
      "Origem e interesse registrados no CRM.",
    ],
    angle: "Destaque a capacidade de criar ofertas específicas para cada serviço sem depender de uma única página institucional.",
  },
  {
    id: "portfolio-conversao",
    group: "Aquisição",
    title: "Portfólio que Gera Conversão",
    summary: "Transforma projetos e renders em ativos de captação conectados a CTA, origem e CRM.",
    bullets: [
      "Projetos organizados por estilo, ambiente, tipologia e serviço.",
      "CTA para briefing, reunião ou Pré-Projeto.",
      "Uso de antes/depois, conceito e resultado.",
      "Rastreamento do interesse gerado pelo portfólio.",
    ],
    angle: "Mostre que portfólio deixa de ser apenas vitrine e passa a ser parte do funil comercial.",
  },
  {
    id: "marketing-arq",
    group: "Marketing",
    title: "Marketing Ativo para Arquitetura e Design",
    summary: "Organiza geração contínua de demanda usando projetos, bastidores, conceitos e autoridade profissional.",
    bullets: [
      "Planejamento por serviço, público e objetivo.",
      "Campanhas para residencial, interiores, comercial, reforma e consultoria.",
      "Nutrição de leads que ainda não estão prontos para contratar.",
      "Remarketing de visitantes, propostas e contatos antigos.",
    ],
    angle: "Venda o marketing como uma rotina conectada ao pipeline, não como publicação isolada em rede social.",
  },
  {
    id: "conteudo-arq",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos de Projeto",
    summary: "Transforma o processo criativo e os projetos em conteúdo comercial, educativo e de autoridade.",
    bullets: [
      "Roteiros de Reels, vídeos e apresentações.",
      "Antes/depois, conceito, materiais e soluções.",
      "Conteúdo sobre erros comuns, tendências e decisões de projeto.",
      "Reaproveitamento de renders, fotos e etapas do trabalho.",
    ],
    angle: "Ideal para destacar o valor intelectual do projeto e mostrar o raciocínio por trás das escolhas.",
  },
  {
    id: "campanhas-arq",
    group: "Marketing",
    title: "Campanhas por Serviço e Perfil",
    summary: "Cria campanhas completas para serviços específicos e públicos distintos.",
    bullets: [
      "Público, promessa, criativos, LP, CTA e nutrição.",
      "Campanhas por ambiente, tipo de projeto, cidade ou ticket.",
      "Integração com conteúdo e anúncios.",
      "Rastreamento até reunião, proposta e fechamento.",
    ],
    angle: "Mostre como cada serviço do escritório pode ter seu próprio funil de aquisição.",
  },
  {
    id: "prospector-arq",
    group: "Comercial",
    title: "Prospector de Oportunidades",
    summary: "Ajuda o escritório a encontrar oportunidades fora da demanda espontânea.",
    bullets: [
      "Perfis de clientes, empresas, empreendimentos e regiões.",
      "Sinais de expansão, reforma, abertura, mudança ou investimento.",
      "Fila priorizada de oportunidades.",
      "Encaminhamento para SDR com contexto.",
    ],
    angle: "Material focado em reduzir dependência de indicação e Instagram para gerar novos projetos.",
  },
  {
    id: "crm-arq",
    group: "Comercial",
    title: "CRM e Cliente 360",
    summary: "Centraliza informações comerciais, criativas e relacionais de cada cliente e projeto.",
    bullets: [
      "Origem, briefing, estilo e referências.",
      "Histórico de conversas, documentos e reuniões.",
      "Propostas, oportunidades e próximos passos.",
      "Projetos anteriores, relacionamento e indicações.",
    ],
    angle: "Destaque a memória do escritório organizada em um só lugar, sem depender da pessoa que atendeu.",
  },
  {
    id: "pipeline-arq",
    group: "Comercial",
    title: "Pipeline de Projetos",
    summary: "Organiza oportunidades desde o primeiro contato até contrato, projeto e acompanhamento.",
    bullets: [
      "Etapas comerciais configuráveis.",
      "Valor, probabilidade, responsável e próxima ação.",
      "Motivos de perda e reativação.",
      "Visão por serviço, região e profissional.",
    ],
    angle: "Ideal para mostrar previsibilidade de carteira e acompanhamento de propostas de projeto.",
  },
  {
    id: "agentes-arq",
    group: "IA",
    title: "Agentes de IA para Atendimento e Vendas",
    summary: "Distribui o trabalho de qualificação, negociação, follow-up e suporte ao longo da jornada.",
    bullets: [
      "SDR entende necessidade e qualifica o lead.",
      "Closer acompanha proposta, valor e objeções.",
      "Follow-up mantém oportunidades aquecidas.",
      "Suporte acompanha dúvidas, entregas e pós-projeto.",
    ],
    angle: "Mostre um time digital atuando sem substituir a relação autoral do arquiteto ou designer.",
  },
  {
    id: "agenda-arq",
    group: "Comercial",
    title: "Agenda, Reuniões e Visitas",
    summary: "Organiza reuniões, levantamentos, medições, apresentações e visitas ligadas ao cliente e ao projeto.",
    bullets: [
      "Reunião de briefing.",
      "Levantamento e medição.",
      "Apresentação de conceito e revisões.",
      "Visitas técnicas e acompanhamento.",
    ],
    angle: "Destaque contexto e preparação: cada compromisso já nasce ligado ao cliente, projeto e etapa.",
  },
  {
    id: "arqdor-modelagem",
    group: "Arqdor.ai",
    title: "Modelagem e Estudo de Layout",
    summary: "Ajuda a desenvolver alternativas de distribuição espacial e organização do projeto.",
    bullets: [
      "Estudo de planta e layout.",
      "Ambientes e fluxos.",
      "Famílias e componentes.",
      "Comparação de alternativas.",
    ],
    angle: "Material focado em velocidade de estudo sem abrir mão da decisão profissional.",
  },
  {
    id: "conceito-moodboard",
    group: "Arqdor.ai",
    title: "Conceito, Moodboard e Direção Visual",
    summary: "Organiza referências e traduz preferências do cliente em uma direção visual coerente.",
    bullets: [
      "Estilo, paleta, materiais e referências.",
      "Moodboard por ambiente ou projeto.",
      "Conceito central e justificativas.",
      "Registro das escolhas aprovadas.",
    ],
    angle: "Destaque a redução da subjetividade e o alinhamento visual antes de aprofundar o projeto.",
  },
  {
    id: "biblioteca-materiais",
    group: "Arqdor.ai",
    title: "Biblioteca de Materiais e Acabamentos",
    summary: "Centraliza materiais reais, texturas, especificações e aplicações para projeto e apresentação.",
    bullets: [
      "Pisos, revestimentos, pedras, tintas, metais, iluminação e demais acabamentos.",
      "Amostra e aplicação em ambiente.",
      "Fabricante, linha, código e observações.",
      "Substituição progressiva por parceiros locais.",
    ],
    angle: "Material ideal para mostrar precisão, padronização e uso de materiais reais nas decisões de projeto.",
  },
  {
    id: "componentes-mobiliario",
    group: "Arqdor.ai",
    title: "Biblioteca de Componentes, Mobiliário e Equipamentos",
    summary: "Permite utilizar peças reais ou equivalentes no desenvolvimento e na apresentação do projeto.",
    bullets: [
      "Mobiliário, marcenaria, eletros, iluminação e objetos.",
      "Famílias por fabricante e categoria.",
      "Dimensões e aplicações.",
      "Troca por parceiros e fornecedores locais.",
    ],
    angle: "Destaque a aproximação entre imagem apresentada, especificação e aquilo que poderá ser comprado.",
  },
  {
    id: "render-arq",
    group: "Arqdor.ai",
    title: "Render e Visualização de Alta Fidelidade",
    summary: "Transforma o projeto em imagens de apresentação com foco em entendimento, aprovação e venda.",
    bullets: [
      "Render de interiores e arquitetura.",
      "Preservação do projeto e materiais definidos.",
      "Variações controladas de acabamento e atmosfera.",
      "Imagens de alta resolução para cliente e marketing.",
    ],
    angle: "Ideal para mostrar ao cliente o projeto antes da execução e reduzir decisões baseadas apenas em planta técnica.",
  },
  {
    id: "ai-review-correcoes",
    group: "Arqdor.ai",
    title: "AI Review, Correções e Revisões",
    summary: "Ajuda a registrar, organizar e revisar alterações solicitadas durante o desenvolvimento.",
    bullets: [
      "Comentários por ambiente ou elemento.",
      "Histórico de revisões.",
      "Comparação entre versões.",
      "Checklist de pendências e aprovações.",
    ],
    angle: "Destaque controle de revisão e redução de mensagens soltas que geram retrabalho.",
  },
  {
    id: "portal-aprovacoes",
    group: "Cliente",
    title: "Portal do Cliente e Aprovações",
    summary: "Cria um ambiente organizado para o cliente acompanhar o projeto e aprovar decisões.",
    bullets: [
      "Projetos, renders, documentos e versões.",
      "Aprovação ou solicitação de ajuste.",
      "Histórico de decisões.",
      "Somente informações liberadas pelo escritório.",
    ],
    angle: "Material focado em experiência premium, transparência e menos aprovação perdida em conversas.",
  },
  {
    id: "planejamento-projeto",
    group: "Gestão de Projeto",
    title: "Planejamento e Cronograma do Projeto",
    summary: "Organiza o trabalho do escritório por fases, entregas, dependências, responsáveis e prazos.",
    bullets: [
      "Briefing, levantamento, estudo, anteprojeto, executivo e detalhamentos.",
      "Dependências e marcos.",
      "Responsáveis e prazos.",
      "Replanejamento e acompanhamento.",
    ],
    angle: "Destaque gestão semelhante a um projeto profissional, com visão clara do que vem antes, depois e por quem.",
  },
  {
    id: "tarefas-equipe",
    group: "Gestão de Projeto",
    title: "Tarefas, Equipe e Responsabilidades",
    summary: "Distribui atividades entre arquitetos, designers, detalhistas, renderistas e demais envolvidos.",
    bullets: [
      "Tarefas por etapa e projeto.",
      "Responsável, prazo e prioridade.",
      "Pendências e bloqueios.",
      "Visão de carga e andamento.",
    ],
    angle: "Material para escritórios que cresceram e precisam sair da gestão por mensagem e memória.",
  },
  {
    id: "honorarios-propostas",
    group: "Financeiro",
    title: "Honorários, Propostas e Contratos",
    summary: "Estrutura a venda do serviço profissional desde escopo e honorários até aceite e contrato.",
    bullets: [
      "Escopo de serviço e entregáveis.",
      "Honorários por etapa, pacote ou modalidade.",
      "Versões e negociações.",
      "Aceite, contrato e condições comerciais.",
    ],
    angle: "Destaque clareza de escopo e redução de conflitos sobre o que está ou não incluído no serviço.",
  },
  {
    id: "especificacoes-caderno",
    group: "Documentação",
    title: "Especificações e Caderno de Materiais",
    summary: "Consolida as decisões de projeto em documentação organizada para cliente, fornecedor e execução.",
    bullets: [
      "Material, fabricante, linha, código e aplicação.",
      "Ambiente e quantitativo quando aplicável.",
      "Imagens e observações.",
      "Atualização conforme revisão do projeto.",
    ],
    angle: "Mostre a passagem do conceito para uma documentação clara e utilizável.",
  },
  {
    id: "fornecedores-cotacoes-arq",
    group: "Fornecedores",
    title: "Fornecedores, Orçamentos e Cotações",
    summary: "Organiza parceiros e tomada de preços vinculados ao projeto.",
    bullets: [
      "Fornecedores por categoria e região.",
      "Solicitação de orçamento.",
      "Comparação de preço, prazo e condição.",
      "Histórico por cliente e projeto.",
    ],
    angle: "Destaque menos planilhas e mensagens dispersas na fase de especificação e compra.",
  },
  {
    id: "acompanhamento-implantacao",
    group: "Execução",
    title: "Acompanhamento de Implantação e Obra",
    summary: "Permite registrar visitas, ocorrências e compatibilizações durante a execução do projeto.",
    bullets: [
      "Visitas técnicas e registros fotográficos.",
      "Pendências e decisões.",
      "Compatibilizações e correções.",
      "Comunicação organizada com cliente e executores.",
    ],
    angle: "Material focado em proteger a intenção do projeto durante a execução e manter histórico técnico.",
  },
  {
    id: "financeiro-projetos",
    group: "Financeiro",
    title: "Financeiro por Projeto",
    summary: "Ajuda a acompanhar receita, recebimentos, custos internos e rentabilidade do serviço.",
    bullets: [
      "Honorários contratados.",
      "Parcelas e recebimentos.",
      "Horas, custos e despesas vinculadas.",
      "Resultado por projeto e serviço.",
    ],
    angle: "Destaque gestão de rentabilidade do escritório, não apenas faturamento.",
  },
  {
    id: "revenue-scout-arq",
    group: "Inteligência",
    title: "Revenue Scout para Escritórios",
    summary: "Identifica novas oportunidades na base de clientes, leads e projetos anteriores.",
    bullets: [
      "Reforma de novos ambientes.",
      "Novos imóveis e expansões.",
      "Indicações.",
      "Reativação de propostas e contatos antigos.",
    ],
    angle: "Material focado em gerar nova receita a partir da carteira que o escritório já construiu.",
  },
  {
    id: "pos-projeto",
    group: "Cliente",
    title: "Pós-Projeto e Relacionamento",
    summary: "Mantém o relacionamento depois da entrega e abre espaço para avaliação, indicação e novos serviços.",
    bullets: [
      "Acompanhamento pós-entrega.",
      "Dúvidas e ajustes.",
      "Avaliação do cliente.",
      "Indicações e novas oportunidades.",
    ],
    angle: "Destaque que o relacionamento não termina na entrega do arquivo final.",
  },
];

const farmaciaModules: ScopeModule[] = [
  {
    id: "captacao-local-farmacia",
    group: "Aquisição",
    title: "Captação Local e Presença Digital",
    summary: "Transforma a farmácia em uma operação ativa de aquisição, conectando campanhas locais, busca, redes sociais, WhatsApp e CRM.",
    bullets: [
      "Campanhas por bairro, cidade, raio de atendimento e perfil de público.",
      "Landing Pages para serviços, conveniência, dermocosméticos e categorias.",
      "Origem da campanha registrada no CRM.",
      "Rastreamento do primeiro contato até recompra e fidelização.",
    ],
    angle: "Mostre como a farmácia deixa de depender apenas do fluxo de balcão e passa a gerar demanda local de forma mensurável.",
  },
  {
    id: "busca-produtos-farmacia",
    group: "Atendimento",
    title: "Busca Inteligente de Produtos",
    summary: "Ajuda a equipe e o cliente a localizar produtos do catálogo com rapidez por nome, categoria, marca, princípio ativo cadastrado ou finalidade de uso não clínica.",
    bullets: [
      "Busca por produto, marca, categoria e características cadastradas.",
      "Consulta de disponibilidade por loja ou canal.",
      "Sugestão de alternativas comerciais equivalentes somente quando previamente cadastradas e permitidas pela operação.",
      "Sem diagnóstico, prescrição ou substituição clínica automática.",
    ],
    angle: "Material focado em velocidade de atendimento e redução da perda de venda por dificuldade de localizar o item certo no catálogo.",
  },
  {
    id: "atendimento-whatsapp-farmacia",
    group: "Atendimento",
    title: "WhatsApp e Atendimento Omnichannel",
    summary: "Centraliza conversas de clientes e liga cada atendimento ao histórico, pedidos e relacionamento.",
    bullets: [
      "WhatsApp, Instagram e demais canais no contexto do cliente.",
      "Transferência entre atendentes preservando histórico.",
      "Registro de pedidos, dúvidas, tarefas e próximos contatos.",
      "IA auxilia respostas operacionais e comerciais dentro das regras definidas pela farmácia.",
    ],
    angle: "Mostre como o WhatsApp deixa de ser uma caixa isolada e passa a fazer parte do relacionamento e da venda.",
  },
  {
    id: "crm-farmacia",
    group: "CRM",
    title: "CRM e Cliente 360",
    summary: "Organiza o histórico comercial e de relacionamento do cliente sem transformar o CRM em prontuário clínico.",
    bullets: [
      "Dados de contato, origem, preferências comerciais e consentimentos.",
      "Histórico de compras quando permitido e integrado.",
      "Campanhas, cupons, atendimentos e interações.",
      "Segmentação por comportamento de compra e relacionamento, respeitando regras de privacidade.",
    ],
    angle: "Destaque fidelização e atendimento contextual sem depender da memória do balconista.",
  },
  {
    id: "fidelidade-farmacia",
    group: "Relacionamento",
    title: "Programa de Fidelidade",
    summary: "Cria recorrência com benefícios, pontos, cupons e regras de relacionamento configuráveis.",
    bullets: [
      "Pontos, cashback ou benefícios conforme política da farmácia.",
      "Cupons por campanha, categoria ou perfil comercial.",
      "Comunicação de saldo e benefícios.",
      "Medição de frequência, recompra e retenção.",
    ],
    angle: "Material focado em transformar compra pontual em relacionamento recorrente.",
  },
  {
    id: "convenios-empresas",
    group: "Relacionamento",
    title: "Convênios e Parcerias com Empresas",
    summary: "Permite estruturar programas comerciais para empresas, associações e grupos de clientes.",
    bullets: [
      "Cadastro de empresas e regras de benefício.",
      "Cartão ou identificação do cliente vinculado ao convênio.",
      "Condições comerciais específicas por parceria.",
      "Acompanhamento de adesão, uso e resultado da parceria.",
    ],
    angle: "Destaque aquisição B2B2C: a farmácia cria canais recorrentes de clientes por meio de empresas parceiras.",
  },
  {
    id: "cartao-cliente-especial",
    group: "Relacionamento",
    title: "Cartão Cliente Especial",
    summary: "Organiza um programa próprio de vantagens para clientes vinculados a campanhas, empresas ou perfis comerciais.",
    bullets: [
      "Identificação do cliente e vínculo com benefício.",
      "Regras por campanha, empresa ou grupo.",
      "Cupons e vantagens comerciais.",
      "Histórico de utilização e resultado.",
    ],
    angle: "Use este escopo para materiais focados em fidelização e parcerias locais.",
  },
  {
    id: "marketing-farmacia",
    group: "Marketing",
    title: "Marketing Ativo para Farmácias",
    summary: "Planeja campanhas e conteúdo com foco em categorias, sazonalidade, conveniência, serviços e relacionamento.",
    bullets: [
      "Calendário de conteúdo por categoria e objetivo.",
      "Campanhas sazonais e institucionais.",
      "Conteúdo de serviços, conveniência, beleza, cuidados pessoais e categorias permitidas.",
      "Remarketing e reativação de clientes inativos.",
    ],
    angle: "Venda o marketing como operação contínua de relacionamento e geração de demanda, não apenas postagens esporádicas.",
  },
  {
    id: "campanhas-farmacia",
    group: "Marketing",
    title: "Campanhas por Categoria, Público e Região",
    summary: "Cria campanhas completas ligadas ao estoque, catálogo, público, localidade e objetivos comerciais.",
    bullets: [
      "Público, região, mensagem, criativos, CTA e canais.",
      "Campanhas por categoria, marca, serviço ou benefício.",
      "Landing Page, WhatsApp e cupom como pontos de conversão.",
      "Medição até atendimento, pedido e recompra quando houver integração.",
    ],
    angle: "Destaque campanhas conectadas ao resultado comercial e à disponibilidade real da operação.",
  },
  {
    id: "conteudo-farmacia",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Ajuda a produzir conteúdo comercial, institucional e educativo dentro de regras definidas pela farmácia.",
    bullets: [
      "Posts, legendas, Reels, vídeos e CTAs.",
      "Conteúdo sobre serviços, categorias, conveniência e bastidores.",
      "Campanhas de fidelidade, benefícios e parceiros.",
      "Revisão humana para conteúdos regulados ou sensíveis.",
    ],
    angle: "Mostre consistência de comunicação com governança para evitar promessas ou orientações indevidas.",
  },
  {
    id: "catalogo-farmacia",
    group: "Catálogo",
    title: "Catálogo de Produtos",
    summary: "Centraliza produtos, categorias, marcas, variações, preços, imagens e informações operacionais.",
    bullets: [
      "Categoria, subcategoria, marca, linha e produto.",
      "Preço, promoção, imagem e descrição comercial.",
      "Status de disponibilidade e canais de venda.",
      "Campos específicos para produtos sujeitos a regras adicionais.",
    ],
    angle: "Destaque catálogo único alimentando atendimento, marketing, campanhas e canais digitais.",
  },
  {
    id: "estoque-farmacia",
    group: "Operação",
    title: "Estoque e Disponibilidade",
    summary: "Conecta atendimento e campanhas à disponibilidade real, reduzindo promessa de item indisponível.",
    bullets: [
      "Consulta por loja, depósito ou canal.",
      "Alertas de baixo estoque e ruptura.",
      "Produtos parados e excesso.",
      "Integração com catálogo e compras.",
    ],
    angle: "Material focado em vender o que existe, reduzir ruptura e melhorar giro.",
  },
  {
    id: "validade-lotes",
    group: "Operação",
    title: "Lotes e Validades",
    summary: "Organiza informações de lote e validade quando disponíveis nas integrações operacionais.",
    bullets: [
      "Acompanhamento por lote.",
      "Alertas de validade próxima.",
      "Priorização operacional conforme políticas internas.",
      "Histórico e rastreabilidade.",
    ],
    angle: "Destaque redução de perda e maior controle operacional.",
  },
  {
    id: "compras-reposicao-farmacia",
    group: "Compras",
    title: "Compras e Reposição",
    summary: "Transforma sinais de estoque, giro e demanda em apoio para decisão de compra.",
    bullets: [
      "Necessidade de reposição.",
      "Fornecedores e condições.",
      "Cotações e comparação.",
      "Pedido e acompanhamento.",
    ],
    angle: "Mostre uma compra mais orientada por necessidade real e menos por percepção isolada.",
  },
  {
    id: "fornecedores-farmacia",
    group: "Compras",
    title: "Fornecedores e Cotações",
    summary: "Organiza fornecedores, preços, prazos e condições para facilitar tomada de decisão.",
    bullets: [
      "Cadastro por categoria e linha.",
      "Solicitação de cotação.",
      "Comparação de preço, prazo e condição.",
      "Histórico comercial por fornecedor.",
    ],
    angle: "Material para destacar eficiência de compras e histórico de negociação.",
  },
  {
    id: "delivery-farmacia",
    group: "Operação",
    title: "Pedidos e Delivery",
    summary: "Organiza a jornada do pedido desde o atendimento até separação, entrega e confirmação.",
    bullets: [
      "Pedido ligado ao cliente.",
      "Separação e status.",
      "Endereço, rota e responsável pela entrega.",
      "Confirmação e acompanhamento.",
    ],
    angle: "Destaque experiência de compra rápida e rastreável fora do balcão físico.",
  },
  {
    id: "pedidos-recorrentes",
    group: "Relacionamento",
    title: "Recorrência e Lembretes de Compra",
    summary: "Ajuda a lembrar o cliente de compras recorrentes com base em regras comerciais autorizadas e preferências de contato.",
    bullets: [
      "Cadências configuráveis.",
      "Lembretes de recompra de itens recorrentes.",
      "Opt-in e canal preferido.",
      "Sem alterar tratamento, dose ou orientação clínica.",
    ],
    angle: "Material focado em conveniência e fidelização, mantendo o cliente no controle.",
  },
  {
    id: "agentes-ia-farmacia",
    group: "IA",
    title: "Agentes de IA para Atendimento e Relacionamento",
    summary: "Distribui tarefas de atendimento, follow-up, cobrança, suporte e relacionamento, com limites claros para temas de saúde.",
    bullets: [
      "Atendimento comercial e operacional.",
      "Follow-up de pedidos e contatos.",
      "Suporte sobre status, benefícios e serviços.",
      "Encaminhamento para farmacêutico quando houver questão clínica ou regulatória.",
    ],
    angle: "Mostre automação de tarefas repetitivas preservando a responsabilidade profissional em assuntos clínicos.",
  },
  {
    id: "triagem-farmacista",
    group: "Atendimento",
    title: "Encaminhamento ao Farmacêutico",
    summary: "Reconhece quando uma conversa precisa sair do fluxo comercial e ser encaminhada a um profissional habilitado.",
    bullets: [
      "Sinais de dúvida clínica ou uso de medicamento.",
      "Solicitação de orientação sobre dose, interação ou substituição.",
      "Questões envolvendo receita ou restrições.",
      "Registro do encaminhamento sem gerar diagnóstico automático.",
    ],
    angle: "Material focado em segurança e qualidade de atendimento: IA sabe quando não deve responder sozinha.",
  },
  {
    id: "receitas-regulados",
    group: "Compliance",
    title: "Receitas e Produtos Regulados",
    summary: "Mantém fluxos específicos para itens sujeitos a prescrição, retenção de receita ou outras exigências.",
    bullets: [
      "Validação humana e regras configuradas pela operação.",
      "Registro de status documental quando aplicável.",
      "Bloqueio de fluxos incompatíveis com as regras internas.",
      "Sem recomendação automática de medicamentos controlados ou substituição clínica.",
    ],
    angle: "Destaque governança e separação entre automação comercial e decisão profissional regulada.",
  },
  {
    id: "privacidade-farmacia",
    group: "Compliance",
    title: "Privacidade e Consentimento",
    summary: "Organiza consentimentos e regras de uso de dados em campanhas, relacionamento e atendimento.",
    bullets: [
      "Preferência de canal.",
      "Opt-in e opt-out.",
      "Finalidade de uso dos dados.",
      "Separação entre informação comercial e dados sensíveis.",
    ],
    angle: "Material para destacar relacionamento responsável e governança de dados.",
  },
  {
    id: "dashboard-farmacia",
    group: "Inteligência",
    title: "Dashboard Comercial e Operacional",
    summary: "Consolida indicadores de vendas, clientes, campanhas, estoque e relacionamento.",
    bullets: [
      "Vendas e ticket por período.",
      "Clientes novos, recorrentes e inativos.",
      "Campanhas e canais.",
      "Categorias, produtos e indicadores operacionais disponíveis.",
    ],
    angle: "Destaque decisões baseadas em dados da operação, não apenas no fechamento diário.",
  },
  {
    id: "revenue-scout-farmacia",
    group: "Inteligência",
    title: "Revenue Scout para Farmácias",
    summary: "Procura oportunidades comerciais na própria base de clientes e produtos.",
    bullets: [
      "Clientes inativos.",
      "Campanhas de recompra e fidelidade.",
      "Cross-sell entre categorias permitidas e previamente configuradas.",
      "Oportunidades de convênios e parcerias.",
    ],
    angle: "Material focado em gerar receita a partir da base existente antes de aumentar investimento em aquisição.",
  },
  {
    id: "pos-venda-farmacia",
    group: "Relacionamento",
    title: "Pós-venda e Suporte",
    summary: "Acompanha pedidos, entregas, dúvidas operacionais, avaliações e recuperação de experiência.",
    bullets: [
      "Status e confirmação de entrega.",
      "Tratamento de ocorrências.",
      "Follow-up até solução.",
      "Avaliação e recuperação de cliente.",
    ],
    angle: "Destaque experiência e retenção depois que a venda já aconteceu.",
  },
  {
    id: "financeiro-farmacia",
    group: "Financeiro",
    title: "Financeiro e Cobrança",
    summary: "Organiza informações financeiras e rotinas de cobrança ligadas à operação comercial.",
    bullets: [
      "Recebimentos e pendências.",
      "Cobrança e follow-up.",
      "Indicadores por canal ou parceria.",
      "Integrações financeiras quando disponíveis.",
    ],
    angle: "Material focado em reduzir trabalho manual e dar visibilidade às pendências financeiras.",
  },
];

const segurosModules: ScopeModule[] = [
  {
    id: "captacao-seguros",
    group: "Aquisição",
    title: "Captação de Leads para Seguros",
    summary: "Organiza a aquisição por produto, perfil, região e momento de vida, conectando campanhas, LPs, WhatsApp e CRM.",
    bullets: [
      "Campanhas por ramo: auto, residencial, empresarial, vida, saúde, viagem e outros produtos disponíveis.",
      "Landing Pages por público, produto, renovação ou oportunidade.",
      "Origem da campanha e interesse registrados no CRM.",
      "Triagem inicial antes da cotação.",
    ],
    angle: "Mostre como a corretora deixa de depender apenas de indicação e carteira antiga para gerar oportunidades novas de forma previsível.",
  },
  {
    id: "landing-pages-seguros",
    group: "Aquisição",
    title: "Landing Pages por Produto e Perfil",
    summary: "Cria páginas específicas para captar leads de seguros com mensagem e formulário adequados a cada contexto.",
    bullets: [
      "LP por produto, campanha, região ou perfil de cliente.",
      "Formulários com dados necessários para pré-qualificação comercial.",
      "CTA para WhatsApp, cotação ou contato consultivo.",
      "Integração da origem e do interesse com o CRM.",
    ],
    angle: "Destaque a possibilidade de vender cada ramo com uma proposta de valor própria, em vez de usar uma única página genérica.",
  },
  {
    id: "perfil-necessidades-seguros",
    group: "Comercial",
    title: "Perfil e Necessidades do Cliente",
    summary: "Estrutura o entendimento das necessidades antes da apresentação das opções disponíveis.",
    bullets: [
      "Momento de vida ou contexto empresarial.",
      "Bens, pessoas, responsabilidades e riscos declarados.",
      "Prioridades, faixa de investimento e coberturas desejadas.",
      "Registro estruturado para apoiar atendimento e cotação.",
    ],
    angle: "Material focado em venda consultiva: entender a necessidade antes de falar de preço.",
  },
  {
    id: "cotacao-seguros",
    group: "Comercial",
    title: "Cotação e Comparação de Opções",
    summary: "Organiza propostas de seguradoras e facilita a comparação comercial para o cliente.",
    bullets: [
      "Registro de seguradora, produto, coberturas, franquias, prêmio e condições.",
      "Comparação lado a lado de opções recebidas.",
      "Histórico de versões e negociações.",
      "Apresentação clara sem ocultar diferenças relevantes.",
    ],
    angle: "Destaque clareza e agilidade na comparação, reduzindo planilhas e mensagens dispersas.",
  },
  {
    id: "crm-seguros",
    group: "CRM",
    title: "CRM e Cliente 360",
    summary: "Centraliza relacionamento, produtos contratados, oportunidades, documentos e histórico comercial.",
    bullets: [
      "Dados de contato e origem.",
      "Apólices, propostas, renovações e oportunidades.",
      "Conversas, documentos e atividades.",
      "Preferências de contato e histórico de relacionamento.",
    ],
    angle: "Mostre a carteira organizada em um só lugar, sem depender da memória do corretor.",
  },
  {
    id: "pipeline-seguros",
    group: "Comercial",
    title: "Pipeline de Cotações e Vendas",
    summary: "Acompanha oportunidades desde o primeiro contato até proposta, fechamento e emissão.",
    bullets: [
      "Etapas configuráveis por produto.",
      "Valor estimado, probabilidade, responsável e próxima ação.",
      "Motivos de perda.",
      "Visão por corretor, produto, canal e região.",
    ],
    angle: "Material ideal para destacar previsibilidade comercial e gestão ativa da carteira de oportunidades.",
  },
  {
    id: "renovacoes-seguros",
    group: "Relacionamento",
    title: "Renovações Automáticas e Antecipadas",
    summary: "Organiza a carteira de vencimentos e cria cadências para iniciar a renovação antes da última hora.",
    bullets: [
      "Alertas de vencimento.",
      "Cadências por prazo e produto.",
      "Contato antecipado e registro das respostas.",
      "Nova cotação e acompanhamento até renovação ou perda.",
    ],
    angle: "Destaque redução de perda de carteira por esquecimento ou contato tardio.",
  },
  {
    id: "cross-sell-seguros",
    group: "Inteligência",
    title: "Cross-sell de Produtos",
    summary: "Identifica oportunidades complementares na própria carteira com base em produtos contratados e necessidades declaradas.",
    bullets: [
      "Clientes com um produto e potencial para outros ramos.",
      "Campanhas de oportunidade configuráveis.",
      "Priorização por perfil e relacionamento.",
      "Abordagem consultiva, sem venda automática indevida.",
    ],
    angle: "Material focado em aumentar receita por cliente antes de aumentar investimento em aquisição.",
  },
  {
    id: "revenue-scout-seguros",
    group: "Inteligência",
    title: "Revenue Scout para Seguros",
    summary: "Encontra receita escondida na carteira de clientes, leads e propostas antigas.",
    bullets: [
      "Renovações próximas.",
      "Propostas não fechadas.",
      "Clientes inativos.",
      "Oportunidades de cross-sell e indicação.",
    ],
    angle: "Destaque uma rotina contínua de recuperação e expansão da carteira.",
  },
  {
    id: "marketing-seguros",
    group: "Marketing",
    title: "Marketing Ativo para Seguros",
    summary: "Planeja conteúdo e campanhas por produto, público, momento de vida e objetivo comercial.",
    bullets: [
      "Calendário de conteúdo por ramo.",
      "Campanhas de aquisição, renovação e educação.",
      "Nutrição de leads ainda não prontos.",
      "Remarketing de visitantes, propostas e contatos antigos.",
    ],
    angle: "Venda o marketing como parte do funil comercial, não apenas como presença institucional.",
  },
  {
    id: "conteudo-seguros",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Ajuda a transformar dúvidas frequentes e temas de proteção em conteúdo comercial e educativo.",
    bullets: [
      "Posts, legendas, Reels, vídeos e CTAs.",
      "Conteúdo sobre coberturas, situações de uso e prevenção.",
      "Materiais por ramo e perfil de público.",
      "Revisão humana para afirmações reguladas ou sensíveis.",
    ],
    angle: "Mostre autoridade consultiva sem prometer cobertura, indenização ou resultado que dependa das condições contratuais.",
  },
  {
    id: "whatsapp-seguros",
    group: "Atendimento",
    title: "WhatsApp e Omnichannel",
    summary: "Centraliza atendimento e histórico comercial em torno do cliente e da oportunidade.",
    bullets: [
      "WhatsApp, Instagram, e-mail e outros canais conectados.",
      "Transferência entre corretores preservando histórico.",
      "Registro de documentos, tarefas e próximos passos.",
      "IA auxilia respostas operacionais e comerciais dentro das regras da corretora.",
    ],
    angle: "Mostre como conversas deixam de ficar dispersas em celulares individuais.",
  },
  {
    id: "agentes-ia-seguros",
    group: "IA",
    title: "Agentes de IA para Seguros",
    summary: "Distribui qualificação, negociação, follow-up, atendimento e relacionamento ao longo da jornada.",
    bullets: [
      "SDR qualifica e coleta contexto inicial.",
      "Closer acompanha proposta e objeções.",
      "Follow-up trabalha cotações, pendências e renovações.",
      "Suporte acompanha dúvidas operacionais e pós-venda.",
    ],
    angle: "Destaque automação de tarefas repetitivas sem substituir a responsabilidade do corretor em recomendações reguladas.",
  },
  {
    id: "documentos-seguros",
    group: "Operação",
    title: "Documentos e Pendências",
    summary: "Organiza documentos necessários para cotação, contratação, endosso, renovação e sinistro.",
    bullets: [
      "Checklist por produto e etapa.",
      "Solicitação e recebimento de documentos.",
      "Pendências e responsáveis.",
      "Histórico vinculado ao cliente e à apólice.",
    ],
    angle: "Material focado em reduzir retrabalho e perda de tempo com documentação espalhada.",
  },
  {
    id: "apolices-seguros",
    group: "Operação",
    title: "Apólices e Carteira",
    summary: "Centraliza apólices, vigências, seguradoras, produtos, coberturas registradas e status da carteira.",
    bullets: [
      "Apólice, produto, seguradora e vigência.",
      "Prêmio, parcelas e condições comerciais quando disponíveis.",
      "Responsável e cliente vinculado.",
      "Alertas operacionais e de renovação.",
    ],
    angle: "Destaque visão única da carteira e facilidade para localizar informações rapidamente.",
  },
  {
    id: "sinistros-seguros",
    group: "Pós-venda",
    title: "Acompanhamento de Sinistros",
    summary: "Organiza o atendimento ao cliente durante o sinistro sem prometer decisão ou indenização da seguradora.",
    bullets: [
      "Abertura e registro da ocorrência.",
      "Documentos e pendências.",
      "Status e contatos.",
      "Follow-up com cliente e seguradora até encerramento.",
    ],
    angle: "Mostre o valor do corretor no momento mais sensível da relação: acompanhar, informar e organizar.",
  },
  {
    id: "endossos-seguros",
    group: "Operação",
    title: "Endossos e Alterações de Apólice",
    summary: "Controla solicitações de alteração durante a vigência da apólice.",
    bullets: [
      "Solicitação do cliente.",
      "Documentos necessários.",
      "Envio à seguradora e acompanhamento.",
      "Registro da alteração concluída.",
    ],
    angle: "Material focado em organização do pós-venda e redução de solicitações esquecidas.",
  },
  {
    id: "comissoes-seguros",
    group: "Financeiro",
    title: "Comissões e Produção",
    summary: "Organiza receitas de comissão e produção comercial por corretor, seguradora e produto.",
    bullets: [
      "Comissão prevista e recebida.",
      "Produção por período.",
      "Visão por corretor, produto e seguradora.",
      "Pendências de conciliação quando houver integração.",
    ],
    angle: "Destaque visibilidade financeira da carteira e produtividade comercial.",
  },
  {
    id: "cobranca-seguros",
    group: "Financeiro",
    title: "Cobrança e Pendências Financeiras",
    summary: "Acompanha pendências comerciais e financeiras relacionadas à carteira quando a integração permitir.",
    bullets: [
      "Parcelas ou pendências registradas.",
      "Follow-up e alertas.",
      "Histórico de contato.",
      "Encaminhamento para responsável financeiro quando necessário.",
    ],
    angle: "Material focado em reduzir falhas operacionais sem transformar o sistema em instituição financeira.",
  },
  {
    id: "parcerias-seguros",
    group: "Aquisição",
    title: "Parcerias e Canais de Indicação",
    summary: "Estrutura canais de aquisição com parceiros como imobiliárias, concessionárias, contadores, empresas e associações.",
    bullets: [
      "Cadastro de parceiro e origem.",
      "Campanhas ou ofertas específicas.",
      "Leads indicados e conversão.",
      "Comissões ou regras comerciais quando aplicável.",
    ],
    angle: "Destaque crescimento por ecossistema e canais de indicação mensuráveis.",
  },
  {
    id: "empresarial-beneficios",
    group: "B2B",
    title: "Seguros Empresariais e Benefícios",
    summary: "Organiza oportunidades B2B com múltiplos produtos, decisores, documentos e ciclos de renovação.",
    bullets: [
      "Empresas, responsáveis e decisores.",
      "Produtos, coberturas e necessidades declaradas.",
      "Propostas e renovações.",
      "Relacionamento por conta e oportunidade.",
    ],
    angle: "Material focado em gestão de contas empresariais mais complexas.",
  },
  {
    id: "compliance-seguros",
    group: "Compliance",
    title: "Compliance, Consentimento e Governança",
    summary: "Mantém regras para comunicação, documentação, consentimento e recomendações comerciais.",
    bullets: [
      "Registro de opt-in, opt-out e preferências de contato.",
      "Separação entre informação, simulação e contratação.",
      "Revisão humana para recomendações reguladas ou sensíveis.",
      "Registro de histórico e evidências comerciais.",
    ],
    angle: "Destaque governança e rastreabilidade sem transformar automação em decisão autônoma sobre cobertura adequada.",
  },
  {
    id: "dashboard-seguros",
    group: "Inteligência",
    title: "Dashboard Comercial da Corretora",
    summary: "Consolida indicadores de leads, cotações, vendas, carteira, renovações e produção.",
    bullets: [
      "Leads por origem e produto.",
      "Conversão por etapa.",
      "Renovações, perdas e motivos.",
      "Produção, ticket e carteira por corretor.",
    ],
    angle: "Destaque decisões baseadas em dados da carteira, não apenas em percepção individual.",
  },
  {
    id: "pos-venda-seguros",
    group: "Pós-venda",
    title: "Pós-venda e Relacionamento",
    summary: "Mantém contato após a contratação para fortalecer retenção, renovação e indicação.",
    bullets: [
      "Boas-vindas e confirmação de informações.",
      "Acompanhamento de solicitações.",
      "Check-ins antes da renovação.",
      "Avaliação, indicação e novas oportunidades.",
    ],
    angle: "Mostre que o relacionamento começa depois da venda e sustenta o valor da carteira no longo prazo.",
  },
];

const fruteiraModules: ScopeModule[] = [
  {
    id: "captacao-local-fruteira",
    group: "Aquisição",
    title: "Captação Local e Presença Digital",
    summary: "Atrai clientes da região para a fruteira por campanhas locais, redes sociais, WhatsApp, Google e Landing Pages.",
    bullets: [
      "Campanhas por bairro, cidade e raio de entrega.",
      "Ofertas por categoria, kits, cestas e produtos sazonais.",
      "Origem da campanha registrada no CRM.",
      "CTA para pedido, WhatsApp, cadastro ou fidelidade.",
    ],
    angle: "Mostre como a fruteira deixa de depender somente do fluxo de rua e passa a gerar demanda local de forma mensurável.",
  },
  {
    id: "catalogo-hortifruti",
    group: "Catálogo",
    title: "Catálogo de Frutas, Verduras e Legumes",
    summary: "Organiza produtos frescos, categorias, variedades, unidades de venda, preços e disponibilidade.",
    bullets: [
      "Frutas, verduras, legumes, temperos, ovos, grãos e complementos.",
      "Venda por kg, unidade, bandeja, maço ou pacote.",
      "Variedade, origem, calibre e observações comerciais.",
      "Imagens, preço, promoção e status de disponibilidade.",
    ],
    angle: "Destaque um catálogo vivo que alimenta atendimento, pedidos, campanhas e canais digitais.",
  },
  {
    id: "estoque-pereciveis",
    group: "Operação",
    title: "Estoque de Perecíveis",
    summary: "Ajuda a controlar disponibilidade de produtos com giro rápido e vida útil curta.",
    bullets: [
      "Entrada por compra ou recebimento.",
      "Saldo por produto e unidade de venda.",
      "Baixa por venda, perda, descarte ou ajuste.",
      "Alertas de ruptura e excesso.",
    ],
    angle: "Material focado em reduzir falta de produto, excesso de compra e perda por deterioração.",
  },
  {
    id: "qualidade-maturacao",
    group: "Operação",
    title: "Qualidade, Maturação e Condição",
    summary: "Registra condição do produto para apoiar exposição, prioridade de venda e separação de pedidos.",
    bullets: [
      "Ponto de maturação e condição visual.",
      "Classificação operacional por qualidade.",
      "Observações de recebimento.",
      "Prioridade de giro conforme regra interna.",
    ],
    angle: "Destaque que nem todo estoque fresco tem o mesmo momento de venda e que essa diferença pode ser gerenciada.",
  },
  {
    id: "perdas-desperdicio",
    group: "Operação",
    title: "Perdas e Desperdício",
    summary: "Registra perdas e identifica onde a margem está sendo consumida por perecibilidade, manuseio ou compra excessiva.",
    bullets: [
      "Motivo da perda.",
      "Quantidade, custo e data.",
      "Produtos e categorias com maior desperdício.",
      "Comparação entre compra, venda e perda.",
    ],
    angle: "Material forte para mostrar economia direta: perder menos produto significa proteger margem.",
  },
  {
    id: "compras-fruteira",
    group: "Compras",
    title: "Compras e Reposição",
    summary: "Transforma giro, estoque e sazonalidade em apoio para decidir o que comprar e quanto comprar.",
    bullets: [
      "Necessidade de reposição.",
      "Histórico de giro.",
      "Produtos sazonais e disponibilidade.",
      "Pedido e acompanhamento de compra.",
    ],
    angle: "Mostre uma compra menos baseada em feeling e mais conectada ao comportamento real da loja.",
  },
  {
    id: "fornecedores-fruteira",
    group: "Compras",
    title: "Fornecedores, Produtores e Centrais",
    summary: "Organiza fornecedores por produto, origem, preço, qualidade e condição comercial.",
    bullets: [
      "Produtor, distribuidor, central de abastecimento ou atacadista.",
      "Produtos atendidos e regiões de origem.",
      "Preço, prazo e condição.",
      "Histórico de qualidade e negociação.",
    ],
    angle: "Destaque comparação entre fornecedores sem perder o histórico de qualidade e preço.",
  },
  {
    id: "cotacoes-fruteira",
    group: "Compras",
    title: "Cotações de Compra",
    summary: "Facilita tomada de preço para itens e categorias antes do fechamento com fornecedores.",
    bullets: [
      "Solicitação por produto ou lista.",
      "Preço, prazo, origem e condição.",
      "Comparação lado a lado.",
      "Escolha e conversão em pedido.",
    ],
    angle: "Material focado em melhorar margem já na compra.",
  },
  {
    id: "formacao-preco-fruteira",
    group: "Financeiro",
    title: "Formação de Preço e Margem",
    summary: "Ajuda a formar preço considerando custo, perda esperada, despesas e margem desejada.",
    bullets: [
      "Custo de compra.",
      "Perda operacional estimada.",
      "Frete e despesas adicionais.",
      "Margem e preço sugerido.",
    ],
    angle: "Destaque preço com visão de margem real, especialmente importante em produtos perecíveis.",
  },
  {
    id: "promocoes-giro",
    group: "Marketing",
    title: "Promoções para Giro de Estoque",
    summary: "Cria ações comerciais para acelerar giro de produtos com excesso, sazonalidade ou janela curta de venda.",
    bullets: [
      "Promoções por produto e categoria.",
      "Combos e ofertas do dia.",
      "Campanhas por estoque disponível.",
      "Acompanhamento de resultado e redução de perda.",
    ],
    angle: "Mostre marketing conectado ao estoque: vender melhor o que precisa girar.",
  },
  {
    id: "kits-cestas",
    group: "Produtos",
    title: "Kits, Cestas e Combos",
    summary: "Permite montar ofertas prontas para facilitar compra e aumentar ticket médio.",
    bullets: [
      "Cesta da semana.",
      "Kit salada, suco, frutas ou lanche.",
      "Combos por perfil de consumo.",
      "Preço, composição e disponibilidade.",
    ],
    angle: "Material ideal para destacar conveniência e aumento de ticket sem depender apenas da venda avulsa.",
  },
  {
    id: "assinaturas-cestas",
    group: "Relacionamento",
    title: "Assinaturas e Cestas Recorrentes",
    summary: "Cria recorrência com entregas programadas de cestas e kits.",
    bullets: [
      "Planos semanais, quinzenais ou mensais.",
      "Composição padrão ou flexível.",
      "Preferências do cliente.",
      "Cobrança, entrega e renovação.",
    ],
    angle: "Destaque receita recorrente e previsibilidade de demanda para a fruteira.",
  },
  {
    id: "whatsapp-pedidos-fruteira",
    group: "Atendimento",
    title: "Pedidos por WhatsApp",
    summary: "Transforma conversas no WhatsApp em pedidos organizados, com cliente, itens e status.",
    bullets: [
      "Catálogo consultável durante o atendimento.",
      "Itens, quantidades e observações.",
      "Endereço, retirada ou entrega.",
      "Status e histórico do pedido.",
    ],
    angle: "Mostre como sair do pedido perdido em conversa para uma operação organizada e rastreável.",
  },
  {
    id: "delivery-fruteira",
    group: "Operação",
    title: "Delivery e Rotas",
    summary: "Organiza separação, expedição e entrega de pedidos locais.",
    bullets: [
      "Separação e conferência.",
      "Janela de entrega.",
      "Rota e responsável.",
      "Confirmação da entrega e ocorrências.",
    ],
    angle: "Material focado em conveniência e expansão do raio de venda sem perder controle da operação.",
  },
  {
    id: "retirada-loja",
    group: "Operação",
    title: "Pedido para Retirada",
    summary: "Permite o cliente comprar antes e retirar na loja com pedido já separado.",
    bullets: [
      "Reserva de itens.",
      "Horário de retirada.",
      "Status de separação.",
      "Confirmação de entrega ao cliente.",
    ],
    angle: "Destaque rapidez para clientes que querem evitar fila ou escolher os produtos antes de chegar.",
  },
  {
    id: "crm-fruteira",
    group: "CRM",
    title: "CRM e Cliente 360",
    summary: "Centraliza relacionamento, preferências comerciais, pedidos e campanhas de cada cliente.",
    bullets: [
      "Contato, origem e frequência.",
      "Histórico de pedidos e categorias preferidas quando integrado.",
      "Cupons e campanhas.",
      "Preferências de canal e entrega.",
    ],
    angle: "Mostre como conhecer o cliente recorrente sem depender da memória do atendente.",
  },
  {
    id: "fidelidade-fruteira",
    group: "Relacionamento",
    title: "Programa de Fidelidade",
    summary: "Cria benefícios para aumentar frequência de compra e retenção.",
    bullets: [
      "Pontos, cashback ou vantagens configuráveis.",
      "Cupons por frequência ou campanha.",
      "Benefícios para clientes recorrentes.",
      "Medição de retenção e recompra.",
    ],
    angle: "Material focado em transformar compra semanal em relacionamento de longo prazo.",
  },
  {
    id: "marketing-fruteira",
    group: "Marketing",
    title: "Marketing Ativo para Hortifruti",
    summary: "Planeja conteúdo e campanhas a partir de produtos, sazonalidade, ofertas e hábitos locais.",
    bullets: [
      "Calendário semanal de ofertas.",
      "Produtos da estação.",
      "Receitas, combinações e ideias de consumo.",
      "Campanhas locais, fidelidade e delivery.",
    ],
    angle: "Mostre uma rotina de marketing conectada ao que chegou, ao que está em oferta e ao que precisa girar.",
  },
  {
    id: "conteudo-fruteira",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Transforma chegada de produtos, bastidores e ofertas em conteúdo frequente para redes sociais.",
    bullets: [
      "Chegou hoje.",
      "Seleção e qualidade dos produtos.",
      "Receitas e combinações.",
      "Ofertas, kits e cestas.",
    ],
    angle: "Destaque conteúdo simples, frequente e conectado à realidade da loja.",
  },
  {
    id: "campanhas-fruteira",
    group: "Marketing",
    title: "Campanhas por Produto, Estação e Região",
    summary: "Cria campanhas completas ligadas à sazonalidade, estoque e público local.",
    bullets: [
      "Público, região, mensagem, criativo e CTA.",
      "Ofertas por estação ou categoria.",
      "WhatsApp, LP e cupom como pontos de conversão.",
      "Acompanhamento até pedido e recompra.",
    ],
    angle: "Mostre campanhas pequenas e frequentes que acompanham o ritmo real de um hortifruti.",
  },
  {
    id: "agentes-ia-fruteira",
    group: "IA",
    title: "Agentes de IA para Atendimento e Vendas",
    summary: "Automatiza tarefas de atendimento, follow-up, relacionamento e suporte comercial.",
    bullets: [
      "Atendimento inicial e consulta de catálogo.",
      "Follow-up de pedido e entrega.",
      "Campanhas de recompra e fidelidade.",
      "Suporte sobre status, horário, retirada e disponibilidade.",
    ],
    angle: "Destaque IA atuando em tarefas repetitivas para liberar a equipe para atendimento e operação física.",
  },
  {
    id: "dashboard-fruteira",
    group: "Inteligência",
    title: "Dashboard Comercial e Operacional",
    summary: "Consolida vendas, ticket, giro, perdas, estoque, campanhas e clientes.",
    bullets: [
      "Vendas por período, produto e categoria.",
      "Ticket médio e frequência.",
      "Giro, ruptura e perda.",
      "Campanhas e canais.",
    ],
    angle: "Destaque decisões rápidas baseadas no que está vendendo, sobrando ou faltando.",
  },
  {
    id: "revenue-scout-fruteira",
    group: "Inteligência",
    title: "Revenue Scout para Fruteiras",
    summary: "Encontra oportunidades de receita dentro da própria base e operação.",
    bullets: [
      "Clientes inativos.",
      "Produtos com potencial de combo.",
      "Campanhas de recompra.",
      "Assinaturas, cestas e oportunidades de fidelização.",
    ],
    angle: "Material focado em vender mais para a base existente antes de investir mais para trazer novos clientes.",
  },
  {
    id: "b2b-fruteira",
    group: "B2B",
    title: "Vendas para Empresas, Restaurantes e Condomínios",
    summary: "Organiza oportunidades recorrentes de fornecimento para clientes empresariais e coletivos.",
    bullets: [
      "Restaurantes, hotéis, escolas, empresas e condomínios.",
      "Tabela ou condição comercial específica.",
      "Pedidos recorrentes e calendário de entrega.",
      "Responsável, faturamento e histórico.",
    ],
    angle: "Destaque contratos recorrentes e aumento de previsibilidade de volume.",
  },
  {
    id: "pos-venda-fruteira",
    group: "Relacionamento",
    title: "Pós-venda e Qualidade da Entrega",
    summary: "Acompanha satisfação, ocorrências e recuperação do cliente após pedido ou delivery.",
    bullets: [
      "Confirmação de entrega.",
      "Registro de produto avariado ou inadequado.",
      "Tratamento da ocorrência.",
      "Avaliação e recuperação do cliente.",
    ],
    angle: "Mostre que produto fresco exige confiança e que o pós-venda protege a recorrência.",
  },
  {
    id: "financeiro-fruteira",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza receitas, despesas, recebimentos e visão de resultado da fruteira.",
    bullets: [
      "Vendas e recebimentos.",
      "Compras e despesas.",
      "Margem por período e categoria quando disponível.",
      "Indicadores por canal: loja, retirada, delivery e B2B.",
    ],
    angle: "Material focado em entender resultado além do movimento de caixa diário.",
  },
];

const acougueModules: ScopeModule[] = [
  {
    id: "captacao-local-acougue",
    group: "Aquisição",
    title: "Captação Local e Presença Digital",
    summary: "Atrai clientes da região para o açougue por campanhas locais, redes sociais, WhatsApp, Google e Landing Pages.",
    bullets: [
      "Campanhas por bairro, cidade e raio de entrega.",
      "Ofertas por corte, linha, ocasião ou kit.",
      "Origem da campanha registrada no CRM.",
      "CTA para pedido, WhatsApp, cadastro ou fidelidade.",
    ],
    angle: "Mostre como o açougue deixa de depender somente do fluxo de balcão e passa a gerar demanda local de forma mensurável.",
  },
  {
    id: "catalogo-cortes",
    group: "Catálogo",
    title: "Catálogo de Carnes e Cortes",
    summary: "Organiza carnes, cortes, marcas, linhas, peso, unidade de venda, preço e disponibilidade.",
    bullets: [
      "Bovinos, suínos, aves, cordeiro, embutidos e complementos.",
      "Cortes por peça, kg, bandeja, porção ou unidade.",
      "Marca, origem, padrão de corte e observações comerciais.",
      "Imagem, preço, promoção e status de disponibilidade.",
    ],
    angle: "Destaque um catálogo estruturado que alimenta atendimento, pedidos, campanhas e canais digitais.",
  },
  {
    id: "estoque-refrigerado",
    group: "Operação",
    title: "Estoque Refrigerado e Congelado",
    summary: "Ajuda a controlar disponibilidade, giro e localização de produtos refrigerados e congelados.",
    bullets: [
      "Entrada por compra ou produção interna.",
      "Saldo por produto, lote e unidade de venda.",
      "Separação entre refrigerado e congelado.",
      "Baixas por venda, perda, produção, descarte ou ajuste.",
    ],
    angle: "Material focado em reduzir ruptura, excesso e perda de produtos de alto valor.",
  },
  {
    id: "lotes-validade-acougue",
    group: "Operação",
    title: "Lotes, Validades e Rastreabilidade",
    summary: "Organiza informações de lote, origem, validade e movimentação dos produtos.",
    bullets: [
      "Lote e fornecedor.",
      "Data de recebimento e validade.",
      "Rastreabilidade por entrada e saída.",
      "Alertas operacionais para produtos próximos do vencimento.",
    ],
    angle: "Destaque controle e rastreabilidade sem depender de anotações isoladas.",
  },
  {
    id: "rendimento-desossa",
    group: "Produção",
    title: "Rendimento de Peças, Desossa e Cortes",
    summary: "Acompanha transformação de peças em cortes vendáveis, perdas e subprodutos.",
    bullets: [
      "Peso de entrada da peça.",
      "Cortes gerados e respectivos pesos.",
      "Aparas, ossos, gordura e perdas.",
      "Rendimento percentual e valor gerado por peça.",
    ],
    angle: "Material forte para mostrar onde a margem nasce ou se perde no processo de corte.",
  },
  {
    id: "producao-interna-acougue",
    group: "Produção",
    title: "Produção Interna",
    summary: "Organiza itens produzidos dentro do açougue a partir de matérias-primas e receitas operacionais.",
    bullets: [
      "Hambúrgueres, espetinhos, porções, temperados e preparados.",
      "Ficha de composição e rendimento.",
      "Consumo de matéria-prima.",
      "Custo e quantidade produzida.",
    ],
    angle: "Destaque padronização, custo e rendimento dos produtos de maior valor agregado.",
  },
  {
    id: "perdas-acougue",
    group: "Operação",
    title: "Perdas, Quebras e Desperdício",
    summary: "Registra perdas e identifica impacto no custo e na margem.",
    bullets: [
      "Motivo da perda.",
      "Quantidade, peso e custo.",
      "Perdas por corte, validade, armazenamento ou manipulação.",
      "Indicadores por período e categoria.",
    ],
    angle: "Mostre quanto a redução de perdas pode impactar diretamente a rentabilidade.",
  },
  {
    id: "compras-acougue",
    group: "Compras",
    title: "Compras e Reposição",
    summary: "Transforma estoque, giro e demanda em apoio para decidir o que comprar e quanto comprar.",
    bullets: [
      "Necessidade de reposição.",
      "Histórico de giro por produto.",
      "Compra por peça, caixa, kg ou unidade.",
      "Pedido e acompanhamento de recebimento.",
    ],
    angle: "Destaque uma compra mais conectada ao giro real e menos dependente de percepção.",
  },
  {
    id: "fornecedores-acougue",
    group: "Compras",
    title: "Frigoríficos, Distribuidores e Fornecedores",
    summary: "Organiza fornecedores por linha, qualidade, preço, prazo e condição comercial.",
    bullets: [
      "Frigoríficos, distribuidores e produtores.",
      "Produtos e linhas atendidas.",
      "Preço, prazo, frete e condição.",
      "Histórico de compra e qualidade recebida.",
    ],
    angle: "Material focado em comparar custo e qualidade sem perder histórico de negociação.",
  },
  {
    id: "cotacoes-acougue",
    group: "Compras",
    title: "Cotações de Compra",
    summary: "Facilita tomada de preços antes do fechamento com fornecedores.",
    bullets: [
      "Solicitação por lista de produtos.",
      "Preço, prazo, frete e condição.",
      "Comparação lado a lado.",
      "Escolha e conversão em pedido.",
    ],
    angle: "Destaque economia e velocidade no processo de compras.",
  },
  {
    id: "formacao-preco-acougue",
    group: "Financeiro",
    title: "Formação de Preço e Margem",
    summary: "Ajuda a formar preço considerando custo de compra, rendimento, perdas e margem desejada.",
    bullets: [
      "Custo de aquisição.",
      "Rendimento da peça.",
      "Perdas e despesas adicionais.",
      "Margem e preço sugerido por corte ou produto.",
    ],
    angle: "Material focado em precificar cada corte com visão real de rendimento e margem.",
  },
  {
    id: "kits-churrasco",
    group: "Produtos",
    title: "Kits para Churrasco e Combos",
    summary: "Permite criar ofertas prontas para ocasiões, famílias e grupos.",
    bullets: [
      "Kit churrasco por número de pessoas.",
      "Combos com carnes, linguiças e complementos.",
      "Composição, peso e preço.",
      "Disponibilidade conforme estoque.",
    ],
    angle: "Destaque conveniência, ticket médio e venda de solução pronta em vez de produto isolado.",
  },
  {
    id: "assinaturas-acougue",
    group: "Relacionamento",
    title: "Assinaturas e Kits Recorrentes",
    summary: "Cria recorrência com cestas ou kits programados.",
    bullets: [
      "Planos semanais, quinzenais ou mensais.",
      "Composição padrão ou personalizada.",
      "Preferências do cliente.",
      "Entrega, cobrança e renovação.",
    ],
    angle: "Material focado em receita recorrente e previsibilidade de demanda.",
  },
  {
    id: "whatsapp-acougue",
    group: "Atendimento",
    title: "Pedidos por WhatsApp",
    summary: "Transforma conversas em pedidos estruturados, ligados ao cliente, itens e status.",
    bullets: [
      "Consulta de catálogo e disponibilidade.",
      "Corte, peso, ponto de preparo e observações.",
      "Retirada ou entrega.",
      "Status e histórico do pedido.",
    ],
    angle: "Mostre como sair do pedido perdido em conversa para uma operação organizada.",
  },
  {
    id: "delivery-acougue",
    group: "Operação",
    title: "Delivery e Rotas",
    summary: "Organiza separação, conferência e entrega de pedidos locais.",
    bullets: [
      "Separação e conferência do pedido.",
      "Janela de entrega.",
      "Rota e responsável.",
      "Confirmação e registro de ocorrência.",
    ],
    angle: "Destaque expansão das vendas além do balcão sem perder controle da operação.",
  },
  {
    id: "retirada-acougue",
    group: "Operação",
    title: "Pedido para Retirada",
    summary: "Permite compra antecipada com retirada rápida na loja.",
    bullets: [
      "Reserva de produtos.",
      "Peso e corte preparados.",
      "Horário de retirada.",
      "Status e confirmação de entrega.",
    ],
    angle: "Material focado em conveniência e redução de fila.",
  },
  {
    id: "crm-acougue",
    group: "CRM",
    title: "CRM e Cliente 360",
    summary: "Centraliza relacionamento, preferências comerciais, pedidos e campanhas.",
    bullets: [
      "Contato, origem e frequência.",
      "Histórico de pedidos quando integrado.",
      "Preferências de cortes, kits e canais.",
      "Cupons, campanhas e recorrência.",
    ],
    angle: "Destaque conhecimento do cliente recorrente sem depender da memória do atendente.",
  },
  {
    id: "fidelidade-acougue",
    group: "Relacionamento",
    title: "Programa de Fidelidade",
    summary: "Cria benefícios para aumentar frequência e retenção.",
    bullets: [
      "Pontos, cashback ou vantagens configuráveis.",
      "Cupons por frequência ou campanha.",
      "Benefícios para clientes recorrentes.",
      "Medição de recompra e retenção.",
    ],
    angle: "Material focado em transformar compra eventual em relacionamento recorrente.",
  },
  {
    id: "marketing-acougue",
    group: "Marketing",
    title: "Marketing Ativo para Açougues",
    summary: "Planeja conteúdo e campanhas a partir de cortes, ofertas, datas e ocasiões de consumo.",
    bullets: [
      "Calendário semanal de ofertas.",
      "Datas especiais e fins de semana.",
      "Conteúdo sobre cortes, preparo e combinações.",
      "Campanhas de kits, delivery e fidelidade.",
    ],
    angle: "Mostre uma rotina de marketing conectada ao estoque, às ofertas e ao comportamento local.",
  },
  {
    id: "conteudo-acougue",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Transforma cortes, preparo, bastidores e ofertas em conteúdo frequente.",
    bullets: [
      "Apresentação de cortes.",
      "Bastidores e preparação.",
      "Dicas culinárias gerais e ideias de uso.",
      "Ofertas, kits e novidades.",
    ],
    angle: "Destaque conteúdo visual e simples para gerar desejo e frequência.",
  },
  {
    id: "campanhas-acougue",
    group: "Marketing",
    title: "Campanhas por Ocasião, Produto e Região",
    summary: "Cria campanhas completas conectadas ao público local e ao estoque.",
    bullets: [
      "Público, região, mensagem, criativo e CTA.",
      "Campanhas para churrasco, datas especiais e kits.",
      "WhatsApp, Landing Page e cupom como conversão.",
      "Medição até pedido e recompra.",
    ],
    angle: "Mostre campanhas práticas ligadas ao que o açougue quer vender naquela semana.",
  },
  {
    id: "agentes-ia-acougue",
    group: "IA",
    title: "Agentes de IA para Atendimento e Vendas",
    summary: "Automatiza tarefas de atendimento, follow-up, relacionamento e suporte comercial.",
    bullets: [
      "Atendimento inicial e consulta de catálogo.",
      "Follow-up de pedido e entrega.",
      "Campanhas de recompra e fidelidade.",
      "Suporte sobre status, horário, retirada e disponibilidade.",
    ],
    angle: "Destaque IA atuando em tarefas repetitivas para liberar a equipe para produção e atendimento presencial.",
  },
  {
    id: "b2b-acougue",
    group: "B2B",
    title: "Vendas para Restaurantes, Lanchonetes e Empresas",
    summary: "Organiza clientes empresariais com condições, volumes e recorrência próprios.",
    bullets: [
      "Restaurantes, hamburguerias, churrascarias, hotéis e empresas.",
      "Tabela ou condição comercial específica.",
      "Pedidos recorrentes e programação de entrega.",
      "Responsável, faturamento e histórico.",
    ],
    angle: "Destaque contratos recorrentes e previsibilidade de volume.",
  },
  {
    id: "qualidade-acougue",
    group: "Qualidade",
    title: "Qualidade e Controle Operacional",
    summary: "Organiza registros internos de recebimento, armazenamento, produção e entrega.",
    bullets: [
      "Condição no recebimento.",
      "Temperatura e armazenamento quando integrado ao processo.",
      "Higiene, checklists e ocorrências internas.",
      "Registro de não conformidades e ações.",
    ],
    angle: "Material focado em disciplina operacional, rastreabilidade e padronização.",
  },
  {
    id: "dashboard-acougue",
    group: "Inteligência",
    title: "Dashboard Comercial e Operacional",
    summary: "Consolida vendas, ticket, giro, perdas, rendimento, estoque e campanhas.",
    bullets: [
      "Vendas por período, corte e categoria.",
      "Ticket médio e frequência.",
      "Giro, ruptura e perda.",
      "Rendimento e margem por produto quando disponível.",
    ],
    angle: "Destaque decisões baseadas no que realmente vende, rende ou perde margem.",
  },
  {
    id: "revenue-scout-acougue",
    group: "Inteligência",
    title: "Revenue Scout para Açougues",
    summary: "Encontra oportunidades de receita dentro da base e da operação.",
    bullets: [
      "Clientes inativos.",
      "Produtos com potencial de combo.",
      "Campanhas de recompra.",
      "Assinaturas, B2B e fidelização.",
    ],
    angle: "Material focado em vender mais para a base atual antes de aumentar investimento em aquisição.",
  },
  {
    id: "pos-venda-acougue",
    group: "Relacionamento",
    title: "Pós-venda e Qualidade da Entrega",
    summary: "Acompanha satisfação, ocorrências e recuperação do cliente após pedido ou delivery.",
    bullets: [
      "Confirmação de entrega.",
      "Registro de produto inadequado ou ocorrência.",
      "Tratamento e solução.",
      "Avaliação e recuperação do cliente.",
    ],
    angle: "Destaque confiança e recorrência em uma categoria onde qualidade percebida é decisiva.",
  },
  {
    id: "financeiro-acougue",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza receitas, despesas, compras e visão de resultado do açougue.",
    bullets: [
      "Vendas e recebimentos.",
      "Compras e despesas.",
      "Margem por período e categoria quando disponível.",
      "Indicadores por canal: balcão, retirada, delivery e B2B.",
    ],
    angle: "Material focado em enxergar resultado além do movimento diário de caixa.",
  },
];

const mercadoModules: ScopeModule[] = [
  {
    id: "captacao-local-mercado",
    group: "Aquisição",
    title: "Captação Local e Presença Digital",
    summary: "Atrai clientes da região para o mercado por campanhas locais, redes sociais, Google, WhatsApp e Landing Pages.",
    bullets: [
      "Campanhas por bairro, cidade e raio de entrega.",
      "Ofertas por categoria, encarte, marca e ocasião.",
      "Origem da campanha registrada no CRM.",
      "CTA para pedido, WhatsApp, cadastro ou clube de vantagens.",
    ],
    angle: "Mostre como o mercado pode gerar tráfego e pedidos além do fluxo espontâneo da loja.",
  },
  {
    id: "catalogo-mercado",
    group: "Catálogo",
    title: "Catálogo Completo de Produtos",
    summary: "Organiza milhares de itens por categoria, subcategoria, marca, linha, embalagem e unidade de venda.",
    bullets: [
      "Mercearia, bebidas, higiene, limpeza, hortifruti, açougue, padaria, frios e demais setores.",
      "Preço, promoção, imagem e descrição comercial.",
      "EAN, SKU e unidade de venda quando disponíveis.",
      "Disponibilidade por loja ou canal.",
    ],
    angle: "Destaque um catálogo central alimentando atendimento, campanhas, e-commerce e operação.",
  },
  {
    id: "categorias-gondolas",
    group: "Catálogo",
    title: "Categorias, Departamentos e Gondolas",
    summary: "Estrutura produtos conforme a lógica comercial e operacional da loja.",
    bullets: [
      "Departamento, categoria e subcategoria.",
      "Família, marca, linha e produto.",
      "Localização por setor ou gondola quando aplicável.",
      "Filtros para campanhas, compras e análise de desempenho.",
    ],
    angle: "Material focado em organização do mix e leitura comercial por departamento.",
  },
  {
    id: "estoque-mercado",
    group: "Operação",
    title: "Estoque e Disponibilidade",
    summary: "Centraliza saldo, movimentação, ruptura e excesso de produtos.",
    bullets: [
      "Estoque por loja, depósito ou canal.",
      "Entradas, saídas, ajustes e transferências.",
      "Alertas de baixo estoque e ruptura.",
      "Produtos parados e excesso.",
    ],
    angle: "Destaque mais disponibilidade para o cliente e menos capital parado.",
  },
  {
    id: "lotes-validades-mercado",
    group: "Operação",
    title: "Lotes e Validades",
    summary: "Ajuda a acompanhar produtos com validade e priorizar giro operacional.",
    bullets: [
      "Lote, data de entrada e validade.",
      "Alertas de vencimento próximo.",
      "Priorização de giro conforme regra interna.",
      "Histórico de movimentação.",
    ],
    angle: "Material focado em reduzir perdas por vencimento e melhorar rastreabilidade.",
  },
  {
    id: "perdas-quebras-mercado",
    group: "Operação",
    title: "Perdas, Quebras e Desperdício",
    summary: "Registra perdas por validade, avaria, furto, erro operacional ou deterioração.",
    bullets: [
      "Motivo da perda.",
      "Quantidade e custo.",
      "Perdas por setor e categoria.",
      "Indicadores por período.",
    ],
    angle: "Mostre impacto direto de perdas na margem e como medir onde o problema acontece.",
  },
  {
    id: "compras-mercado",
    group: "Compras",
    title: "Compras e Reposição",
    summary: "Transforma giro, estoque e demanda em apoio para decidir o que comprar e quando comprar.",
    bullets: [
      "Necessidade de reposição.",
      "Histórico de giro e venda.",
      "Sugestão operacional de quantidade conforme parâmetros internos.",
      "Pedido e acompanhamento.",
    ],
    angle: "Destaque compras mais conectadas ao giro real da loja.",
  },
  {
    id: "fornecedores-mercado",
    group: "Compras",
    title: "Fornecedores e Indústrias",
    summary: "Organiza fornecedores por categoria, marcas, preços, prazos e condições comerciais.",
    bullets: [
      "Fornecedor por produto e marca.",
      "Tabela de preço e condição.",
      "Prazo, frete e política comercial.",
      "Histórico de negociação e compra.",
    ],
    angle: "Material para destacar poder de negociação e histórico comercial centralizado.",
  },
  {
    id: "cotacoes-mercado",
    group: "Compras",
    title: "Cotações e Comparação de Compra",
    summary: "Facilita tomada de preços e escolha de fornecedor para listas de produtos.",
    bullets: [
      "Solicitação de cotação.",
      "Comparação de preço, prazo, frete e condição.",
      "Escolha por item ou fornecedor.",
      "Conversão em pedido.",
    ],
    angle: "Destaque economia e velocidade na compra de grandes listas.",
  },
  {
    id: "preco-margem-mercado",
    group: "Financeiro",
    title: "Formação de Preço e Margem",
    summary: "Ajuda a formar preço considerando custo, despesas, impostos configurados, perdas e margem desejada.",
    bullets: [
      "Custo de aquisição.",
      "Frete e despesas adicionais.",
      "Margem por produto e categoria.",
      "Preço sugerido e acompanhamento de resultado.",
    ],
    angle: "Material focado em proteger margem sem perder competitividade.",
  },
  {
    id: "promocoes-mercado",
    group: "Marketing",
    title: "Promoções e Ofertas",
    summary: "Cria ações promocionais ligadas a produtos, categorias, estoque e objetivos comerciais.",
    bullets: [
      "Preço promocional por período.",
      "Oferta por produto, categoria ou marca.",
      "Combos e campanhas temáticas.",
      "Medição de venda durante a promoção.",
    ],
    angle: "Mostre promoções planejadas e mensuráveis, não apenas troca manual de preço.",
  },
  {
    id: "encartes-digitais",
    group: "Marketing",
    title: "Encartes Digitais",
    summary: "Transforma ofertas da semana em material digital para redes sociais, WhatsApp e campanhas.",
    bullets: [
      "Seleção de produtos em oferta.",
      "Preço, imagem e período.",
      "Versões por loja ou região.",
      "Compartilhamento em canais digitais.",
    ],
    angle: "Destaque rapidez para publicar encartes sem depender de produção manual demorada.",
  },
  {
    id: "clube-vantagens",
    group: "Relacionamento",
    title: "Clube de Vantagens",
    summary: "Cria benefícios exclusivos para clientes cadastrados e aumenta frequência de compra.",
    bullets: [
      "Preços ou cupons exclusivos.",
      "Benefícios por campanha ou frequência.",
      "Cadastro e identificação do cliente.",
      "Medição de uso e retenção.",
    ],
    angle: "Material focado em transformar cliente anônimo em cliente conhecido e recorrente.",
  },
  {
    id: "fidelidade-mercado",
    group: "Relacionamento",
    title: "Programa de Fidelidade",
    summary: "Organiza pontos, cashback, cupons ou vantagens configuráveis.",
    bullets: [
      "Pontuação por compra.",
      "Cupons e recompensas.",
      "Campanhas segmentadas.",
      "Frequência, retenção e recompra.",
    ],
    angle: "Destaque retenção e aumento de frequência com dados do relacionamento.",
  },
  {
    id: "crm-mercado",
    group: "CRM",
    title: "CRM e Cliente 360",
    summary: "Centraliza relacionamento, preferências comerciais, campanhas e histórico de compra quando integrado.",
    bullets: [
      "Contato, origem e frequência.",
      "Categorias e marcas de interesse quando disponíveis.",
      "Cupons, campanhas e benefícios.",
      "Preferências de canal e consentimento.",
    ],
    angle: "Mostre como o mercado passa a conhecer quem compra e como se relacionar melhor com cada perfil.",
  },
  {
    id: "segmentacao-clientes-mercado",
    group: "Inteligência",
    title: "Segmentação de Clientes",
    summary: "Agrupa clientes por comportamento comercial para campanhas mais relevantes.",
    bullets: [
      "Novos, recorrentes e inativos.",
      "Frequência e ticket.",
      "Categorias e hábitos de compra quando disponíveis.",
      "Campanhas por segmento.",
    ],
    angle: "Destaque comunicação mais relevante e menos disparo genérico.",
  },
  {
    id: "whatsapp-mercado",
    group: "Atendimento",
    title: "Pedidos e Atendimento por WhatsApp",
    summary: "Transforma conversas em atendimento estruturado e pedidos rastreáveis.",
    bullets: [
      "Consulta de catálogo e disponibilidade.",
      "Montagem do pedido.",
      "Substituições autorizadas pelo cliente.",
      "Status, retirada ou entrega.",
    ],
    angle: "Mostre como sair do pedido perdido no WhatsApp para uma operação organizada.",
  },
  {
    id: "ecommerce-mercado",
    group: "Canais",
    title: "E-commerce e Loja Digital",
    summary: "Disponibiliza catálogo e pedidos online conectados à operação.",
    bullets: [
      "Produtos, categorias e busca.",
      "Carrinho e pedido.",
      "Retirada ou entrega.",
      "Campanhas e cupons integrados.",
    ],
    angle: "Destaque venda digital como extensão da loja física.",
  },
  {
    id: "delivery-mercado",
    group: "Operação",
    title: "Delivery e Rotas",
    summary: "Organiza separação, expedição e entrega de compras.",
    bullets: [
      "Separação por pedido.",
      "Conferência e substituições.",
      "Janela e rota de entrega.",
      "Confirmação e ocorrências.",
    ],
    angle: "Material focado em eficiência do delivery e experiência do cliente.",
  },
  {
    id: "retirada-mercado",
    group: "Operação",
    title: "Clique e Retire",
    summary: "Permite comprar online e retirar o pedido já separado.",
    bullets: [
      "Reserva de produtos.",
      "Separação e conferência.",
      "Horário de retirada.",
      "Confirmação da entrega ao cliente.",
    ],
    angle: "Destaque conveniência para quem quer economizar tempo sem pagar entrega.",
  },
  {
    id: "marketing-mercado",
    group: "Marketing",
    title: "Marketing Ativo para Mercados",
    summary: "Planeja conteúdo e campanhas a partir de ofertas, categorias, sazonalidade e comportamento local.",
    bullets: [
      "Calendário semanal e mensal.",
      "Campanhas por categoria e marca.",
      "Datas sazonais e eventos locais.",
      "Remarketing e reativação de clientes.",
    ],
    angle: "Mostre marketing conectado às vendas e à operação da loja.",
  },
  {
    id: "conteudo-mercado",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Transforma ofertas, novidades e bastidores em conteúdo frequente para canais digitais.",
    bullets: [
      "Ofertas da semana.",
      "Novidades e lançamentos.",
      "Receitas e ideias de consumo.",
      "Bastidores, setores e serviços.",
    ],
    angle: "Destaque produção contínua de conteúdo com base no que realmente acontece na loja.",
  },
  {
    id: "campanhas-mercado",
    group: "Marketing",
    title: "Campanhas por Categoria, Marca e Região",
    summary: "Cria campanhas completas ligadas a público, oferta, canal e resultado comercial.",
    bullets: [
      "Público, região, mensagem, criativo e CTA.",
      "Campanhas por marca, categoria ou ocasião.",
      "WhatsApp, LP, cupom ou e-commerce como conversão.",
      "Medição até compra e recompra quando integrado.",
    ],
    angle: "Mostre campanhas mensuráveis e conectadas ao resultado da loja.",
  },
  {
    id: "agentes-ia-mercado",
    group: "IA",
    title: "Agentes de IA para Atendimento e Relacionamento",
    summary: "Automatiza tarefas repetitivas de atendimento, follow-up, campanhas e suporte.",
    bullets: [
      "Atendimento inicial e consulta de catálogo.",
      "Status de pedido, retirada e entrega.",
      "Campanhas de fidelidade e recompra.",
      "Suporte operacional e encaminhamento para equipe humana.",
    ],
    angle: "Destaque eficiência sem perder supervisão humana nas exceções.",
  },
  {
    id: "b2b-mercado",
    group: "B2B",
    title: "Vendas para Empresas e Instituições",
    summary: "Organiza contas empresariais com condições, volumes e recorrência específicos.",
    bullets: [
      "Empresas, restaurantes, escolas, hotéis e condomínios.",
      "Tabela ou condição comercial.",
      "Pedidos recorrentes.",
      "Faturamento, responsáveis e histórico.",
    ],
    angle: "Material focado em contratos e pedidos recorrentes fora do varejo tradicional.",
  },
  {
    id: "operacao-loja-mercado",
    group: "Operação",
    title: "Operação de Loja",
    summary: "Organiza tarefas, checklists, ocorrências e responsabilidades do dia a dia.",
    bullets: [
      "Abertura e fechamento.",
      "Reposição e conferência.",
      "Limpeza, organização e checklists.",
      "Ocorrências e responsáveis.",
    ],
    angle: "Destaque padronização operacional para reduzir falhas entre turnos e equipes.",
  },
  {
    id: "dashboard-mercado",
    group: "Inteligência",
    title: "Dashboard Comercial e Operacional",
    summary: "Consolida vendas, ticket, giro, margem, perdas, estoque, campanhas e clientes.",
    bullets: [
      "Vendas por período, loja, setor e categoria.",
      "Ticket médio e frequência.",
      "Giro, ruptura, excesso e perdas.",
      "Campanhas, canais e clientes.",
    ],
    angle: "Destaque decisões baseadas em dados integrados da operação.",
  },
  {
    id: "revenue-scout-mercado",
    group: "Inteligência",
    title: "Revenue Scout para Mercados",
    summary: "Encontra oportunidades de receita dentro da base de clientes, produtos e operação.",
    bullets: [
      "Clientes inativos.",
      "Categorias com potencial de cross-sell.",
      "Produtos com excesso e oportunidades de campanha.",
      "Ações de recompra, fidelidade e B2B.",
    ],
    angle: "Material focado em encontrar receita antes de aumentar investimento em aquisição.",
  },
  {
    id: "financeiro-mercado",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza receitas, despesas, compras, recebimentos e visão de resultado.",
    bullets: [
      "Vendas e recebimentos.",
      "Compras e despesas.",
      "Margem por período, loja e categoria quando disponível.",
      "Indicadores por canal: loja, retirada, delivery, e-commerce e B2B.",
    ],
    angle: "Destaque visão de resultado além do faturamento bruto.",
  },
  {
    id: "pos-venda-mercado",
    group: "Relacionamento",
    title: "Pós-venda e Experiência do Cliente",
    summary: "Acompanha satisfação, ocorrências e recuperação de experiência após compra ou entrega.",
    bullets: [
      "Avaliação de compra e delivery.",
      "Registro de ocorrência.",
      "Tratamento e solução.",
      "Recuperação, fidelização e nova oportunidade.",
    ],
    angle: "Mostre como a experiência depois da compra ajuda a proteger recorrência e reputação.",
  },
];


const modaModules: ScopeModule[] = [
  {
    id: "captacao-moda",
    group: "Aquisição",
    title: "Captação e Presença Digital",
    summary: "Atrai clientes para a loja por campanhas, redes sociais, influenciadores, WhatsApp, e-commerce e Landing Pages.",
    bullets: [
      "Campanhas por público, coleção, estilo, ocasião e região.",
      "Landing Pages para lançamentos, promoções e cápsulas.",
      "Origem da campanha registrada no CRM.",
      "CTA para compra, WhatsApp, cadastro ou clube de vantagens.",
    ],
    angle: "Mostre como a marca transforma alcance e conteúdo em tráfego, cadastro e venda mensurável.",
  },
  {
    id: "catalogo-moda",
    group: "Catálogo",
    title: "Catálogo de Produtos de Moda",
    summary: "Organiza peças, acessórios e calçados por coleção, categoria, modelo, cor, tamanho e variação.",
    bullets: [
      "Categoria, subcategoria, coleção, marca e linha.",
      "Modelo, cor, tamanho, tecido e composição.",
      "Fotos, preço, descrição e disponibilidade.",
      "SKU/EAN e variações quando disponíveis.",
    ],
    angle: "Destaque um catálogo único alimentando loja, atendimento, campanhas e e-commerce.",
  },
  {
    id: "grade-cor-tamanho",
    group: "Estoque",
    title: "Grade de Cor e Tamanho",
    summary: "Controla disponibilidade por variação, evitando vender uma peça que existe em uma cor ou tamanho diferente do solicitado.",
    bullets: [
      "Grade por modelo, cor e tamanho.",
      "Saldo por loja e canal.",
      "Ruptura por variação.",
      "Transferência entre lojas quando aplicável.",
    ],
    angle: "Material focado em reduzir ruptura invisível e melhorar conversão no atendimento.",
  },
  {
    id: "colecoes-lancamentos",
    group: "Produtos",
    title: "Coleções e Lançamentos",
    summary: "Organiza lançamentos por temporada, cápsula, tema ou campanha.",
    bullets: [
      "Calendário de coleção.",
      "Produtos e variações participantes.",
      "Materiais de campanha vinculados.",
      "Acompanhamento de venda por lançamento.",
    ],
    angle: "Mostre como lançamento deixa de ser apenas publicação e passa a ter planejamento, estoque e venda acompanhados.",
  },
  {
    id: "estoque-moda",
    group: "Estoque",
    title: "Estoque por Loja e Canal",
    summary: "Centraliza saldo, giro, transferência, ruptura e excesso de peças.",
    bullets: [
      "Estoque por loja, depósito e e-commerce.",
      "Entradas, saídas, ajustes e transferências.",
      "Produtos parados e excesso.",
      "Ruptura de itens e variações.",
    ],
    angle: "Destaque disponibilidade real e melhor uso do estoque entre canais.",
  },
  {
    id: "giro-sellthrough",
    group: "Inteligência",
    title: "Giro e Sell-through",
    summary: "Ajuda a identificar quais produtos vendem rápido, quais encalham e quais precisam de ação comercial.",
    bullets: [
      "Venda por produto, coleção e categoria.",
      "Velocidade de giro.",
      "Sell-through por período.",
      "Itens com necessidade de reposição ou promoção.",
    ],
    angle: "Material focado em comprar e promover com base em comportamento real de venda.",
  },
  {
    id: "compras-moda",
    group: "Compras",
    title: "Compras e Reposição",
    summary: "Organiza pedidos de compra por coleção, fornecedor, grade e necessidade de reposição.",
    bullets: [
      "Planejamento por coleção e categoria.",
      "Reposição por giro.",
      "Pedido por fornecedor.",
      "Acompanhamento de entrega.",
    ],
    angle: "Destaque compras mais aderentes ao giro e menos dependentes de percepção.",
  },
  {
    id: "fornecedores-moda",
    group: "Compras",
    title: "Fornecedores e Marcas",
    summary: "Organiza fornecedores, marcas, condições, prazos e histórico de compra.",
    bullets: [
      "Fornecedor por categoria e marca.",
      "Tabela de preço e condição.",
      "Prazo, mínimo e política comercial.",
      "Histórico de compra e desempenho.",
    ],
    angle: "Material focado em negociação, mix e histórico comercial centralizado.",
  },
  {
    id: "preco-margem-moda",
    group: "Financeiro",
    title: "Preço, Markup e Margem",
    summary: "Ajuda a formar preço considerando custo, despesas, descontos e margem desejada.",
    bullets: [
      "Custo de aquisição.",
      "Markup e margem.",
      "Preço cheio e promocional.",
      "Impacto de desconto na rentabilidade.",
    ],
    angle: "Destaque controle de margem em um setor onde desconto e liquidação podem destruir rentabilidade.",
  },
  {
    id: "promocoes-liquidacoes",
    group: "Marketing",
    title: "Promoções e Liquidações",
    summary: "Cria ações para giro de coleção, estoque parado e datas comerciais.",
    bullets: [
      "Promoções por produto, categoria ou coleção.",
      "Desconto por período.",
      "Combos e campanhas temáticas.",
      "Medição de venda e margem durante a ação.",
    ],
    angle: "Mostre promoção com objetivo de giro e margem, não desconto sem estratégia.",
  },
  {
    id: "lookbook",
    group: "Marketing",
    title: "Lookbook e Combinações",
    summary: "Transforma produtos em looks e combinações que aumentam inspiração e ticket médio.",
    bullets: [
      "Looks completos.",
      "Peças complementares.",
      "Campanhas por ocasião e estilo.",
      "Uso no e-commerce, social e atendimento.",
    ],
    angle: "Destaque venda por composição e não apenas por peça individual.",
  },
  {
    id: "recomendacao-looks",
    group: "IA",
    title: "Recomendação de Looks e Cross-sell",
    summary: "Ajuda a sugerir combinações comerciais com base em produtos disponíveis e preferências declaradas.",
    bullets: [
      "Peças complementares.",
      "Alternativas por cor, estilo e ocasião.",
      "Respeito ao estoque disponível.",
      "Sugestões assistidas para vendedor e canais digitais.",
    ],
    angle: "Material focado em aumentar ticket médio com atendimento mais consultivo.",
  },
  {
    id: "crm-moda",
    group: "CRM",
    title: "CRM e Cliente 360",
    summary: "Centraliza histórico de relacionamento, compras, preferências e campanhas.",
    bullets: [
      "Contato, origem e frequência.",
      "Tamanhos e preferências comerciais declaradas.",
      "Histórico de compra quando integrado.",
      "Cupons, campanhas e interações.",
    ],
    angle: "Mostre atendimento personalizado sem depender da memória do vendedor.",
  },
  {
    id: "vendedor-carteira",
    group: "Comercial",
    title: "Carteira por Vendedor",
    summary: "Organiza clientes, oportunidades e relacionamento por vendedor.",
    bullets: [
      "Clientes vinculados.",
      "Última compra e último contato.",
      "Próxima ação.",
      "Metas, vendas e reativação.",
    ],
    angle: "Destaque venda assistida e relacionamento contínuo além do atendimento no balcão.",
  },
  {
    id: "whatsapp-moda",
    group: "Atendimento",
    title: "Venda e Atendimento por WhatsApp",
    summary: "Transforma conversas em atendimento estruturado com catálogo, reserva, pedido e histórico.",
    bullets: [
      "Envio de produtos e looks.",
      "Consulta de cor, tamanho e disponibilidade.",
      "Reserva, retirada ou entrega.",
      "Histórico ligado ao cliente.",
    ],
    angle: "Mostre como vender pelo WhatsApp sem perder controle de estoque e relacionamento.",
  },
  {
    id: "provador-atendimento",
    group: "Atendimento",
    title: "Provador e Atendimento Consultivo",
    summary: "Registra interesses e facilita continuidade do atendimento iniciado na loja.",
    bullets: [
      "Peças experimentadas.",
      "Preferências e tamanhos.",
      "Itens reservados ou desejados.",
      "Follow-up após atendimento.",
    ],
    angle: "Destaque continuidade da experiência mesmo quando a cliente não compra na primeira visita.",
  },
  {
    id: "wishlist-reservas",
    group: "Relacionamento",
    title: "Wishlist e Reservas",
    summary: "Permite registrar peças desejadas, reservas e avisos de reposição.",
    bullets: [
      "Lista de desejos por cliente.",
      "Reserva com prazo.",
      "Aviso de reposição.",
      "Follow-up de item não comprado.",
    ],
    angle: "Material focado em recuperar vendas que normalmente seriam perdidas.",
  },
  {
    id: "fidelidade-moda",
    group: "Relacionamento",
    title: "Fidelidade e Clube VIP",
    summary: "Cria benefícios para aumentar frequência, retenção e relacionamento com clientes valiosos.",
    bullets: [
      "Pontos, cashback ou vantagens.",
      "Acesso antecipado a lançamentos.",
      "Cupons exclusivos.",
      "Segmentação por frequência e valor.",
    ],
    angle: "Destaque exclusividade e recorrência, dois fatores fortes no varejo de moda.",
  },
  {
    id: "influenciadores-moda",
    group: "Marketing",
    title: "Influenciadores, Afiliados e Cupons",
    summary: "Organiza parceiros de divulgação e mede vendas originadas por cupons e indicações.",
    bullets: [
      "Cupom por influenciador.",
      "Comissão configurável.",
      "Clientes e vendas atribuídas.",
      "Acompanhamento de resultado por parceiro.",
    ],
    angle: "Mostre influência medida por resultado comercial, não apenas alcance.",
  },
  {
    id: "marketing-moda",
    group: "Marketing",
    title: "Marketing Ativo para Moda",
    summary: "Planeja conteúdo e campanhas por coleção, público, estilo, ocasião e objetivo.",
    bullets: [
      "Calendário de lançamentos e campanhas.",
      "Conteúdo por coleção, tendência e produto.",
      "Remarketing e reativação.",
      "Campanhas por região, público e comportamento.",
    ],
    angle: "Mostre marketing conectado a estoque, coleção e vendas.",
  },
  {
    id: "conteudo-moda",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Transforma produtos, looks, lançamentos e bastidores em conteúdo frequente.",
    bullets: [
      "Reels de looks e combinações.",
      "Lançamentos e novidades.",
      "Bastidores e prova social.",
      "Roteiros, legendas e CTAs.",
    ],
    angle: "Destaque velocidade de produção de conteúdo visual sem perder coerência de marca.",
  },
  {
    id: "campanhas-moda",
    group: "Marketing",
    title: "Campanhas por Coleção e Público",
    summary: "Cria campanhas completas para lançamentos, datas comerciais, produtos e segmentos.",
    bullets: [
      "Público, mensagem, criativo, CTA e canal.",
      "Campanhas por coleção, categoria ou ocasião.",
      "LP, WhatsApp, e-commerce e cupom como conversão.",
      "Medição até compra e recompra.",
    ],
    angle: "Mostre campanha com rastreamento do clique até a venda.",
  },
  {
    id: "ecommerce-moda",
    group: "Canais",
    title: "E-commerce de Moda",
    summary: "Disponibiliza catálogo, variações e pedidos online conectados ao estoque.",
    bullets: [
      "Produtos com cor e tamanho.",
      "Busca e filtros.",
      "Carrinho, cupom e checkout.",
      "Retirada ou entrega.",
    ],
    angle: "Destaque integração entre experiência digital, grade e estoque.",
  },
  {
    id: "marketplaces-moda",
    group: "Canais",
    title: "Marketplaces e Social Commerce",
    summary: "Organiza publicação e venda em canais externos quando houver integração.",
    bullets: [
      "Catálogo adaptado ao canal.",
      "Preço e disponibilidade.",
      "Pedidos e origem.",
      "Acompanhamento por marketplace.",
    ],
    angle: "Material focado em ampliar distribuição sem perder visão de origem e estoque.",
  },
  {
    id: "omnichannel-moda",
    group: "Canais",
    title: "Omnichannel e Estoque Unificado",
    summary: "Conecta loja física, WhatsApp e digital para oferecer a peça onde ela estiver disponível.",
    bullets: [
      "Consulta entre lojas.",
      "Reserva em uma loja e retirada em outra quando suportado.",
      "Venda digital com estoque físico.",
      "Histórico único do cliente.",
    ],
    angle: "Destaque menos venda perdida por falta localizada de estoque.",
  },
  {
    id: "trocas-devolucoes",
    group: "Pós-venda",
    title: "Trocas e Devoluções",
    summary: "Organiza solicitações, motivos, prazos e desfechos de troca ou devolução.",
    bullets: [
      "Produto, pedido e motivo.",
      "Status da solicitação.",
      "Troca, crédito ou devolução conforme política.",
      "Indicadores de motivo e produto.",
    ],
    angle: "Mostre como transformar uma etapa sensível em experiência organizada e mensurável.",
  },
  {
    id: "pos-venda-moda",
    group: "Pós-venda",
    title: "Pós-venda e Relacionamento",
    summary: "Mantém contato depois da compra para avaliação, fidelização e nova oportunidade.",
    bullets: [
      "Confirmação e acompanhamento da entrega.",
      "Avaliação da experiência.",
      "Reativação e novas coleções.",
      "Indicação e recompra.",
    ],
    angle: "Destaque que a próxima venda começa depois da primeira compra.",
  },
  {
    id: "agentes-ia-moda",
    group: "IA",
    title: "Agentes de IA para Atendimento e Vendas",
    summary: "Automatiza atendimento inicial, follow-up, campanhas e suporte comercial.",
    bullets: [
      "Consulta de catálogo e disponibilidade.",
      "Follow-up de reservas e wishlist.",
      "Reativação de clientes.",
      "Suporte sobre pedido, retirada e troca.",
    ],
    angle: "Mostre IA apoiando o vendedor sem substituir a experiência humana de estilo e relacionamento.",
  },
  {
    id: "dashboard-moda",
    group: "Inteligência",
    title: "Dashboard Comercial e de Produto",
    summary: "Consolida vendas, giro, margem, coleção, estoque, clientes e campanhas.",
    bullets: [
      "Venda por coleção, categoria, produto e vendedor.",
      "Ticket médio e frequência.",
      "Giro, sell-through e estoque parado.",
      "Campanhas, canais e clientes.",
    ],
    angle: "Destaque decisões de compra, promoção e coleção baseadas em dados.",
  },
  {
    id: "revenue-scout-moda",
    group: "Inteligência",
    title: "Revenue Scout para Moda",
    summary: "Encontra oportunidades de receita na base de clientes, estoque e histórico comercial.",
    bullets: [
      "Clientes inativos.",
      "Wishlist e reservas não convertidas.",
      "Produtos complementares e novas coleções.",
      "Campanhas de recompra e fidelidade.",
    ],
    angle: "Material focado em recuperar receita antes de aumentar investimento em aquisição.",
  },
  {
    id: "financeiro-moda",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza receitas, despesas, compras, comissões e visão de resultado.",
    bullets: [
      "Vendas e recebimentos.",
      "Compras e despesas.",
      "Comissão por vendedor quando aplicável.",
      "Margem por loja, canal, coleção e categoria.",
    ],
    angle: "Destaque resultado por coleção e canal, não apenas faturamento bruto.",
  },
];

const produtosNaturaisModules: ScopeModule[] = [
  {
    id: "captacao-naturais",
    group: "Aquisição",
    title: "Captação Local e Digital",
    summary: "Atrai clientes por campanhas locais, redes sociais, WhatsApp, Google, e-commerce e Landing Pages.",
    bullets: [
      "Campanhas por bairro, cidade, perfil e interesse.",
      "LPs por categoria, objetivo comercial, kit ou campanha.",
      "Origem e interesse registrados no CRM.",
      "CTA para WhatsApp, loja, e-commerce ou clube de vantagens.",
    ],
    angle: "Mostre como a loja deixa de depender somente do fluxo físico e passa a gerar demanda rastreável.",
  },
  {
    id: "catalogo-naturais",
    group: "Catálogo",
    title: "Catálogo de Produtos Naturais",
    summary: "Organiza alimentos naturais, funcionais, grãos, chás, suplementos, cosméticos e demais categorias.",
    bullets: [
      "Categoria, subcategoria, marca, linha e produto.",
      "Fotos, descrição, preço e promoção.",
      "Informações comerciais e de composição cadastradas pelo fornecedor.",
      "Disponibilidade por loja ou canal.",
    ],
    angle: "Destaque um catálogo central alimentando atendimento, marketing e venda digital.",
  },
  {
    id: "granel-naturais",
    group: "Operação",
    title: "Produtos a Granel",
    summary: "Controla itens vendidos por peso com estoque, custo e preço por unidade de medida.",
    bullets: [
      "Venda por kg, 100 g ou unidade configurável.",
      "Entrada e saída por peso.",
      "Preço e custo por unidade de medida.",
      "Perdas, ajustes e fracionamento.",
    ],
    angle: "Material focado em controle real de margem e estoque em itens a granel.",
  },
  {
    id: "estoque-validade-naturais",
    group: "Operação",
    title: "Estoque, Lotes e Validades",
    summary: "Ajuda a controlar disponibilidade, giro, lote e validade de produtos.",
    bullets: [
      "Saldo por produto e loja.",
      "Lote e validade quando aplicável.",
      "Alertas de baixo estoque e vencimento próximo.",
      "Ruptura, excesso e produtos parados.",
    ],
    angle: "Destaque redução de perdas e melhor giro de estoque.",
  },
  {
    id: "fornecedores-naturais",
    group: "Compras",
    title: "Fornecedores, Marcas e Distribuidores",
    summary: "Organiza fornecedores por categoria, marca, preço, prazo e condição.",
    bullets: [
      "Fornecedor por produto e marca.",
      "Tabela de preço e condição comercial.",
      "Prazo, frete e pedido mínimo.",
      "Histórico de compra e negociação.",
    ],
    angle: "Mostre melhor poder de compra e histórico comercial centralizado.",
  },
  {
    id: "compras-naturais",
    group: "Compras",
    title: "Compras e Reposição",
    summary: "Transforma giro, estoque e demanda em apoio para reposição.",
    bullets: [
      "Necessidade por produto e categoria.",
      "Histórico de giro.",
      "Sugestão operacional conforme parâmetros internos.",
      "Pedido e acompanhamento.",
    ],
    angle: "Destaque compras mais conectadas ao giro real da loja.",
  },
  {
    id: "preco-margem-naturais",
    group: "Financeiro",
    title: "Preço e Margem",
    summary: "Apoia formação de preço considerando custo, despesas e margem desejada.",
    bullets: [
      "Custo de compra.",
      "Frete e despesas adicionais.",
      "Margem por produto e categoria.",
      "Preço cheio, promocional e resultado.",
    ],
    angle: "Material focado em proteger margem sem perder competitividade.",
  },
  {
    id: "kits-combos-naturais",
    group: "Produtos",
    title: "Kits, Combos e Cestas",
    summary: "Permite montar ofertas prontas por ocasião, rotina ou objetivo comercial.",
    bullets: [
      "Kits de chás, grãos, snacks, café da manhã e presentes.",
      "Combos por categoria.",
      "Composição, preço e disponibilidade.",
      "Campanhas e cupons vinculados.",
    ],
    angle: "Destaque conveniência, aumento de ticket e venda de solução pronta.",
  },
  {
    id: "assinaturas-naturais",
    group: "Relacionamento",
    title: "Assinaturas e Recorrência",
    summary: "Cria planos recorrentes para cestas, kits e produtos de consumo frequente.",
    bullets: [
      "Planos semanais ou mensais.",
      "Composição padrão ou personalizada.",
      "Preferências do cliente.",
      "Cobrança, entrega e renovação.",
    ],
    angle: "Destaque receita recorrente e previsibilidade de recompra.",
  },
  {
    id: "atendimento-consultivo-naturais",
    group: "Atendimento",
    title: "Atendimento Consultivo Comercial",
    summary: "Organiza preferências, objetivos de compra e histórico sem transformar o sistema em ferramenta de diagnóstico.",
    bullets: [
      "Preferências alimentares e categorias de interesse.",
      "Produtos e marcas já comprados.",
      "Restrições declaradas pelo cliente para fins comerciais.",
      "Questões clínicas ou terapêuticas devem ser encaminhadas a profissional habilitado.",
    ],
    angle: "Mostre atendimento mais contextualizado mantendo limites claros entre venda e orientação de saúde.",
  },
  {
    id: "whatsapp-naturais",
    group: "Atendimento",
    title: "Vendas por WhatsApp",
    summary: "Transforma conversas em atendimento organizado e pedidos estruturados.",
    bullets: [
      "Consulta de catálogo e disponibilidade.",
      "Montagem de pedido.",
      "Reserva, retirada ou entrega.",
      "Status e histórico.",
    ],
    angle: "Mostre WhatsApp como canal de venda com processo e rastreabilidade.",
  },
  {
    id: "ecommerce-naturais",
    group: "Canais",
    title: "E-commerce e Loja Digital",
    summary: "Conecta catálogo, estoque, campanhas, cupons e pedidos online.",
    bullets: [
      "Busca e filtros por categoria e marca.",
      "Carrinho e pedido.",
      "Retirada ou entrega.",
      "Campanhas e cupons integrados.",
    ],
    angle: "Destaque a loja digital como extensão da operação física.",
  },
  {
    id: "crm-naturais",
    group: "CRM",
    title: "CRM e Cliente 360",
    summary: "Centraliza relacionamento, preferências comerciais, campanhas e histórico de compra quando integrado.",
    bullets: [
      "Contato, origem e frequência.",
      "Categorias e marcas de interesse.",
      "Cupons, campanhas e benefícios.",
      "Preferências de canal e consentimento.",
    ],
    angle: "Mostre como conhecer o cliente recorrente sem depender da memória do atendente.",
  },
  {
    id: "fidelidade-naturais",
    group: "Relacionamento",
    title: "Fidelidade e Clube de Vantagens",
    summary: "Cria benefícios para aumentar frequência, retenção e recompra.",
    bullets: [
      "Pontos, cashback ou vantagens.",
      "Cupons por campanha ou frequência.",
      "Benefícios para clientes recorrentes.",
      "Medição de retenção e recompra.",
    ],
    angle: "Destaque relacionamento contínuo com clientes de consumo recorrente.",
  },
  {
    id: "marketing-naturais",
    group: "Marketing",
    title: "Marketing Ativo para Produtos Naturais",
    summary: "Planeja conteúdo e campanhas por categoria, sazonalidade, hábitos e objetivos comerciais.",
    bullets: [
      "Calendário de conteúdo e ofertas.",
      "Campanhas por categoria e marca.",
      "Nutrição e remarketing.",
      "Ações para recompra e fidelidade.",
    ],
    angle: "Mostre marketing contínuo conectado a catálogo, estoque e CRM.",
  },
  {
    id: "conteudo-naturais",
    group: "Marketing",
    title: "Conteúdo Educativo, Reels e Vídeos",
    summary: "Ajuda a produzir conteúdo comercial e educativo com revisão humana quando houver alegações sensíveis.",
    bullets: [
      "Receitas, formas de uso e combinações culinárias.",
      "Bastidores, novidades e lançamentos.",
      "Conteúdo sobre categorias e produtos.",
      "Evitar promessas terapêuticas ou alegações de saúde não validadas.",
    ],
    angle: "Destaque autoridade e educação sem transformar conteúdo comercial em prescrição.",
  },
  {
    id: "campanhas-naturais",
    group: "Marketing",
    title: "Campanhas por Categoria, Marca e Público",
    summary: "Cria campanhas completas ligadas a público, oferta, canal e conversão.",
    bullets: [
      "Público, mensagem, criativo e CTA.",
      "Campanhas por categoria ou marca.",
      "WhatsApp, LP, cupom ou e-commerce como conversão.",
      "Medição até compra e recompra.",
    ],
    angle: "Mostre campanhas segmentadas e mensuráveis.",
  },
  {
    id: "agentes-ia-naturais",
    group: "IA",
    title: "Agentes de IA para Atendimento e Relacionamento",
    summary: "Automatiza tarefas comerciais e operacionais, com limites claros para temas de saúde.",
    bullets: [
      "Atendimento inicial e busca de produtos.",
      "Follow-up de pedidos e recompra.",
      "Suporte sobre status, retirada e entrega.",
      "Encaminhamento humano para dúvidas clínicas ou terapêuticas.",
    ],
    angle: "Destaque eficiência sem ultrapassar o papel comercial do sistema.",
  },
  {
    id: "b2b-naturais",
    group: "B2B",
    title: "Vendas para Empresas e Parceiros",
    summary: "Organiza oportunidades com academias, clínicas, cafeterias, hotéis, empresas e revendedores.",
    bullets: [
      "Tabela ou condição comercial.",
      "Pedidos recorrentes.",
      "Kits corporativos.",
      "Responsável, faturamento e histórico.",
    ],
    angle: "Destaque crescimento por canais B2B e parceiros locais.",
  },
  {
    id: "dashboard-naturais",
    group: "Inteligência",
    title: "Dashboard Comercial e Operacional",
    summary: "Consolida vendas, ticket, giro, estoque, margem, campanhas e clientes.",
    bullets: [
      "Vendas por categoria, marca e canal.",
      "Ticket médio e frequência.",
      "Giro, ruptura e excesso.",
      "Campanhas e recompra.",
    ],
    angle: "Destaque decisões baseadas em dados da operação.",
  },
  {
    id: "revenue-scout-naturais",
    group: "Inteligência",
    title: "Revenue Scout para Produtos Naturais",
    summary: "Encontra oportunidades de receita dentro da base de clientes, produtos e campanhas.",
    bullets: [
      "Clientes inativos.",
      "Produtos complementares.",
      "Campanhas de recompra.",
      "Assinaturas, fidelidade e oportunidades B2B.",
    ],
    angle: "Material focado em recuperar receita antes de aumentar investimento em aquisição.",
  },
  {
    id: "financeiro-naturais",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza receitas, compras, despesas e visão de resultado por canal e categoria.",
    bullets: [
      "Vendas e recebimentos.",
      "Compras e despesas.",
      "Margem por categoria quando disponível.",
      "Indicadores por loja, e-commerce, WhatsApp e B2B.",
    ],
    angle: "Destaque resultado além do faturamento bruto.",
  },
  {
    id: "pos-venda-naturais",
    group: "Pós-venda",
    title: "Pós-venda e Relacionamento",
    summary: "Acompanha pedidos, entregas, ocorrências, avaliação e recuperação do cliente.",
    bullets: [
      "Confirmação de entrega ou retirada.",
      "Tratamento de ocorrência.",
      "Avaliação e satisfação.",
      "Recompra, fidelização e indicação.",
    ],
    angle: "Mostre como o pós-venda protege recorrência e reputação.",
  },
];

const moveisCasaModules: ScopeModule[] = [
  {
    id: "captacao-moveis",
    group: "Aquisição",
    title: "Captação por Ambiente e Necessidade",
    summary: "Atrai clientes por tipo de ambiente, estilo, faixa de investimento e intenção de compra.",
    bullets: [
      "Campanhas para cozinha, quarto, sala, home office, corporativo e ambientes completos.",
      "Landing Pages por ambiente, estilo, coleção, linha ou projeto.",
      "Origem e interesse registrados no CRM.",
      "CTA para orçamento, medição, projeto, WhatsApp ou loja.",
    ],
    angle: "Mostre como captar clientes já dizendo o que querem mobiliar e qual etapa da decisão estão.",
  },
  {
    id: "briefing-ambiente-moveis",
    group: "Aquisição",
    title: "Briefing de Ambiente",
    summary: "Estrutura necessidades, medidas iniciais, estilo e preferências antes da proposta.",
    bullets: [
      "Ambiente, uso, usuários e prioridades.",
      "Medidas, fotos e referências.",
      "Estilo, cores, materiais e faixa de investimento.",
      "Resumo para vendedor, projetista ou designer.",
    ],
    angle: "Destaque reuniões mais produtivas e propostas mais alinhadas.",
  },
  {
    id: "medicao-tecnica-moveis",
    group: "Projeto",
    title: "Medição Técnica",
    summary: "Organiza o levantamento do ambiente antes do projeto e da produção.",
    bullets: [
      "Dimensões do ambiente.",
      "Pontos elétricos, hidráulicos e interferências.",
      "Fotos e observações técnicas.",
      "Responsável, data e revisão da medição.",
    ],
    angle: "Material focado em reduzir erro de projeto e retrabalho de instalação.",
  },
  {
    id: "arqdor-moveis",
    group: "Projeto",
    title: "Projeto e Visualização com Arqdor.ai",
    summary: "Permite estudar layout, mobiliário, acabamentos e apresentação visual antes da venda.",
    bullets: [
      "Estudo de layout e circulação.",
      "Inserção de móveis e componentes.",
      "Aplicação de materiais e acabamentos.",
      "Render e apresentação ao cliente.",
    ],
    angle: "Mostre ao cliente como o ambiente ficará antes de fechar a compra.",
  },
  {
    id: "catalogo-moveis",
    group: "Catálogo",
    title: "Catálogo de Móveis e Itens para Casa",
    summary: "Centraliza móveis, decoração, iluminação, utilidades e complementos.",
    bullets: [
      "Categoria, subcategoria, coleção, linha e produto.",
      "Fotos, medidas, materiais e cores.",
      "Preço, promoção e disponibilidade.",
      "Produtos prontos, sob medida ou planejados.",
    ],
    angle: "Destaque um catálogo único para loja, projeto, vendedor e canais digitais.",
  },
  {
    id: "acabamentos-moveis",
    group: "Catálogo",
    title: "Materiais, Cores e Acabamentos",
    summary: "Organiza padrões de MDF, lâminas, pedras, tecidos, metais, vidros, puxadores e demais acabamentos.",
    bullets: [
      "Amostras e imagens de aplicação.",
      "Fabricante, linha, código e cor.",
      "Disponibilidade e observações.",
      "Uso em produto, ambiente ou composição.",
    ],
    angle: "Material ideal para destacar personalização e precisão na escolha dos acabamentos.",
  },
  {
    id: "componentes-moveis",
    group: "Catálogo",
    title: "Componentes e Ferragens",
    summary: "Organiza ferragens, corrediças, dobradiças, puxadores e componentes técnicos.",
    bullets: [
      "Fabricante, modelo e aplicação.",
      "Compatibilidade com linhas e módulos.",
      "Custo e disponibilidade.",
      "Uso em composição e orçamento.",
    ],
    angle: "Destaque controle técnico e qualidade dos componentes invisíveis ao cliente final.",
  },
  {
    id: "modulos-planejados",
    group: "Planejados",
    title: "Módulos e Famílias de Planejados",
    summary: "Estrutura armários, aéreos, gaveteiros, torres, painéis e demais módulos configuráveis.",
    bullets: [
      "Dimensões padrão e personalizáveis.",
      "Portas, gavetas, nichos e acessórios.",
      "Acabamentos e ferragens.",
      "Composição por ambiente.",
    ],
    angle: "Mostre velocidade para montar soluções sem começar cada projeto do zero.",
  },
  {
    id: "moveis-sob-medida",
    group: "Planejados",
    title: "Móveis Sob Medida",
    summary: "Organiza o fluxo comercial e técnico de peças exclusivas para um ambiente específico.",
    bullets: [
      "Briefing e medição.",
      "Projeto e detalhamento.",
      "Materiais, ferragens e acabamento.",
      "Orçamento, aprovação, produção e instalação.",
    ],
    angle: "Destaque continuidade completa da ideia até a instalação.",
  },
  {
    id: "orcamento-moveis",
    group: "Comercial",
    title: "Orçamento por Ambiente e Composição",
    summary: "Transforma projeto, módulos, materiais e serviços em proposta comercial estruturada.",
    bullets: [
      "Produtos e módulos.",
      "Materiais, ferragens e acessórios.",
      "Mão de obra, montagem e instalação.",
      "Frete, comissão, margem e condições comerciais.",
    ],
    angle: "Material focado em orçamento rápido e conectado ao que foi projetado.",
  },
  {
    id: "propostas-moveis",
    group: "Comercial",
    title: "Propostas e Apresentação Comercial",
    summary: "Reúne projeto, imagens, produtos, acabamentos, preço e condições em uma proposta profissional.",
    bullets: [
      "Projeto e renders.",
      "Escopo e composição da solução.",
      "Preço e condições.",
      "Versões, negociações e aceite.",
    ],
    angle: "Destaque uma proposta visual que vende solução, não apenas uma lista de itens.",
  },
  {
    id: "aprovacoes-moveis",
    group: "Cliente",
    title: "Aprovações de Projeto e Acabamentos",
    summary: "Registra decisões do cliente antes da produção.",
    bullets: [
      "Layout aprovado.",
      "Medidas e módulos.",
      "Cores, materiais e ferragens.",
      "Histórico de revisão e aceite.",
    ],
    angle: "Material focado em reduzir erro e discussão posterior sobre o que foi aprovado.",
  },
  {
    id: "crm-moveis",
    group: "CRM",
    title: "CRM e Cliente 360",
    summary: "Centraliza briefing, ambientes, projetos, propostas, preferências e histórico comercial.",
    bullets: [
      "Origem e interesse.",
      "Ambientes e preferências.",
      "Projetos, propostas e documentos.",
      "Próxima ação, negociações e pós-venda.",
    ],
    angle: "Mostre todo o histórico do cliente e da casa em um único lugar.",
  },
  {
    id: "pipeline-moveis",
    group: "Comercial",
    title: "Pipeline de Projetos e Vendas",
    summary: "Acompanha oportunidades desde o primeiro contato até medição, proposta, fechamento e instalação.",
    bullets: [
      "Etapas por tipo de venda.",
      "Valor e probabilidade.",
      "Responsável e próxima ação.",
      "Motivos de perda e reativação.",
    ],
    angle: "Destaque previsibilidade de vendas e redução de orçamentos esquecidos.",
  },
  {
    id: "agenda-moveis",
    group: "Comercial",
    title: "Agenda de Visitas, Medições e Apresentações",
    summary: "Organiza compromissos técnicos e comerciais ligados ao cliente e ao projeto.",
    bullets: [
      "Visita comercial.",
      "Medição técnica.",
      "Apresentação de projeto.",
      "Montagem, instalação e assistência.",
    ],
    angle: "Mostre uma agenda que acompanha toda a jornada, e não apenas reuniões.",
  },
  {
    id: "producao-marcenaria",
    group: "Produção",
    title: "Produção e Marcenaria",
    summary: "Transforma pedidos aprovados em etapas de produção rastreáveis.",
    bullets: [
      "Liberação para produção.",
      "Etapas, responsáveis e prazos.",
      "Materiais e componentes necessários.",
      "Status por ambiente, módulo ou pedido.",
    ],
    angle: "Destaque visibilidade do que está em produção e do que pode atrasar a entrega.",
  },
  {
    id: "plano-corte-insumos",
    group: "Produção",
    title: "Insumos e Planejamento de Materiais",
    summary: "Organiza chapas, ferragens, acessórios e demais insumos necessários para produzir.",
    bullets: [
      "Necessidade por pedido.",
      "Estoque disponível.",
      "Faltas e reposição.",
      "Consumo e custo por projeto.",
    ],
    angle: "Material focado em reduzir falta de material e compra emergencial.",
  },
  {
    id: "compras-moveis",
    group: "Compras",
    title: "Compras e Cotações",
    summary: "Organiza tomada de preço e compra de materiais, ferragens, móveis e itens complementares.",
    bullets: [
      "Solicitação de compra.",
      "Fornecedores e cotações.",
      "Comparação de preço, prazo e frete.",
      "Pedido e acompanhamento.",
    ],
    angle: "Destaque economia e rastreabilidade nas compras.",
  },
  {
    id: "fornecedores-moveis",
    group: "Compras",
    title: "Fornecedores e Parceiros",
    summary: "Centraliza fabricantes, distribuidores, marcenarias, instaladores e prestadores.",
    bullets: [
      "Categoria e região.",
      "Produtos e serviços atendidos.",
      "Condições e prazos.",
      "Histórico de compra e desempenho.",
    ],
    angle: "Mostre uma rede de parceiros organizada e mensurável.",
  },
  {
    id: "estoque-moveis",
    group: "Operação",
    title: "Estoque de Produtos e Insumos",
    summary: "Controla produtos prontos, materiais, ferragens e itens de casa disponíveis.",
    bullets: [
      "Saldo por item e localização.",
      "Reserva para pedido ou projeto.",
      "Entrada, saída e transferência.",
      "Ruptura, excesso e itens parados.",
    ],
    angle: "Destaque disponibilidade real antes de vender ou liberar produção.",
  },
  {
    id: "instalacao-moveis",
    group: "Execução",
    title: "Entrega, Montagem e Instalação",
    summary: "Organiza o fechamento operacional da venda até a instalação concluída.",
    bullets: [
      "Agendamento.",
      "Equipe responsável.",
      "Checklist de montagem.",
      "Fotos, pendências e aceite do cliente.",
    ],
    angle: "Material focado em reduzir falhas na etapa que mais afeta a experiência final.",
  },
  {
    id: "assistencia-moveis",
    group: "Pós-venda",
    title: "Assistência Técnica",
    summary: "Organiza ajustes, garantias, ocorrências e atendimento depois da instalação.",
    bullets: [
      "Chamado com fotos e descrição.",
      "Responsável e prazo.",
      "Peças ou materiais necessários.",
      "Follow-up até solução e avaliação.",
    ],
    angle: "Destaque controle de assistência e proteção da reputação da marca.",
  },
  {
    id: "itens-casa-ecommerce",
    group: "Canais",
    title: "E-commerce de Móveis e Itens para Casa",
    summary: "Permite vender produtos prontos, decoração e complementos em canal digital.",
    bullets: [
      "Catálogo e filtros.",
      "Carrinho e pedido.",
      "Frete, retirada e entrega.",
      "Campanhas, cupons e disponibilidade.",
    ],
    angle: "Mostre a combinação entre venda consultiva de planejados e venda digital de itens prontos.",
  },
  {
    id: "whatsapp-moveis",
    group: "Atendimento",
    title: "Atendimento e Venda por WhatsApp",
    summary: "Centraliza conversas, referências, orçamento e follow-up em torno do cliente.",
    bullets: [
      "Envio de catálogo e projetos.",
      "Recebimento de fotos e medidas iniciais.",
      "Reserva e orçamento.",
      "Histórico e próxima ação.",
    ],
    angle: "Destaque WhatsApp como parte do CRM, não como canal isolado.",
  },
  {
    id: "marketing-moveis",
    group: "Marketing",
    title: "Marketing Ativo para Móveis e Casa",
    summary: "Planeja conteúdo e campanhas por ambiente, estilo, coleção e objetivo comercial.",
    bullets: [
      "Antes/depois e projetos reais.",
      "Ambientes, tendências e combinações.",
      "Campanhas de planejados, sob medida e produtos prontos.",
      "Remarketing de orçamentos e clientes.",
    ],
    angle: "Mostre marketing visual conectado ao que a empresa realmente projeta e vende.",
  },
  {
    id: "conteudo-moveis",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Transforma projetos, montagem, materiais e ambientes em conteúdo frequente.",
    bullets: [
      "Antes/depois.",
      "Processo de projeto e montagem.",
      "Materiais, ferragens e diferenciais.",
      "Roteiros para Reels e vídeos.",
    ],
    angle: "Destaque prova visual e bastidores para aumentar confiança.",
  },
  {
    id: "influenciadores-moveis",
    group: "Marketing",
    title: "Influenciadores, Arquitetos e Indicadores",
    summary: "Organiza parceiros que geram clientes e vendas.",
    bullets: [
      "Cupom ou origem individual.",
      "Cliente indicado vinculado.",
      "Comissão configurável.",
      "Acompanhamento de conversão e negócios futuros.",
    ],
    angle: "Material focado em transformar indicação em canal comercial mensurável.",
  },
  {
    id: "fidelidade-moveis",
    group: "Relacionamento",
    title: "Fidelidade e Recompra para Casa",
    summary: "Mantém relacionamento para novas compras, ambientes e complementos.",
    bullets: [
      "Novos cômodos ou reformas.",
      "Decoração e itens complementares.",
      "Cupons e benefícios.",
      "Campanhas de recompra.",
    ],
    angle: "Destaque que um cliente de móveis pode gerar várias vendas ao longo dos anos.",
  },
  {
    id: "revenue-scout-moveis",
    group: "Inteligência",
    title: "Revenue Scout para Móveis e Casa",
    summary: "Encontra oportunidades escondidas em clientes, propostas e projetos anteriores.",
    bullets: [
      "Orçamentos não fechados.",
      "Clientes com outros ambientes a mobiliar.",
      "Cross-sell de decoração e complementos.",
      "Indicações e reativação.",
    ],
    angle: "Material focado em gerar nova receita na base antes de comprar mais leads.",
  },
  {
    id: "dashboard-moveis",
    group: "Inteligência",
    title: "Dashboard Comercial e Operacional",
    summary: "Consolida vendas, projetos, produção, instalação, margem e carteira.",
    bullets: [
      "Leads, propostas e conversão.",
      "Ticket por ambiente e linha.",
      "Produção e instalação.",
      "Margem, prazo e responsáveis.",
    ],
    angle: "Destaque visão completa do comercial à entrega.",
  },
  {
    id: "financeiro-moveis",
    group: "Financeiro",
    title: "Financeiro por Pedido e Projeto",
    summary: "Organiza receitas, custos, recebimentos e margem por venda.",
    bullets: [
      "Valor vendido e recebimentos.",
      "Custos de materiais, produção e instalação.",
      "Comissões.",
      "Margem prevista e realizada.",
    ],
    angle: "Mostre resultado real por projeto, não apenas faturamento.",
  },
];


const eletronicosTecnologiaModules: ScopeModule[] = [
  {
    id: "captacao-tech",
    group: "Aquisição",
    title: "Captação para Eletrônicos & Tecnologia",
    summary: "Atrai clientes por campanhas, lançamentos, comparativos, redes sociais, Google, WhatsApp, e-commerce e Landing Pages.",
    bullets: [
      "Campanhas por categoria, marca, modelo, faixa de preço e perfil.",
      "LPs para lançamentos, ofertas, pré-venda e campanhas sazonais.",
      "Origem e interesse registrados no CRM.",
      "CTA para compra, WhatsApp, reserva ou orçamento.",
    ],
    angle: "Mostre como transformar interesse por tecnologia em oportunidade rastreável e venda.",
  },
  {
    id: "catalogo-tech",
    group: "Catálogo",
    title: "Catálogo Técnico de Produtos",
    summary: "Organiza eletrônicos e tecnologia por categoria, marca, modelo, especificação e disponibilidade.",
    bullets: [
      "Smartphones, notebooks, TVs, áudio, games, wearables, periféricos, smart home e acessórios.",
      "Marca, modelo, geração, cor, capacidade e especificações.",
      "Fotos, preço, promoção e disponibilidade.",
      "SKU, EAN e referência quando disponíveis.",
    ],
    angle: "Destaque catálogo rico em especificações para apoiar venda consultiva e busca rápida.",
  },
  {
    id: "variantes-tech",
    group: "Catálogo",
    title: "Modelos, Variações e Configurações",
    summary: "Controla variantes de um mesmo produto por memória, armazenamento, cor, conectividade e demais atributos.",
    bullets: [
      "RAM, armazenamento, tamanho, cor e conectividade.",
      "SKU por variação.",
      "Preço e estoque por variante.",
      "Comparação entre configurações.",
    ],
    angle: "Material focado em reduzir erro de venda e facilitar comparação entre versões.",
  },
  {
    id: "comparador-tech",
    group: "Comercial",
    title: "Comparador de Produtos",
    summary: "Ajuda equipe e cliente a comparar características comerciais e técnicas lado a lado.",
    bullets: [
      "Especificações relevantes por categoria.",
      "Preço e disponibilidade.",
      "Diferenças entre modelos.",
      "Recomendação comercial baseada em critérios informados pelo cliente, com supervisão humana.",
    ],
    angle: "Destaque venda consultiva e clareza na decisão sem transformar a IA em decisora autônoma.",
  },
  {
    id: "estoque-serial-tech",
    group: "Operação",
    title: "Estoque, Serial e Identificação",
    summary: "Acompanha saldo e identificação individual de produtos quando aplicável.",
    bullets: [
      "Estoque por loja, depósito e canal.",
      "Número de série, IMEI ou identificador quando disponível.",
      "Reserva por pedido.",
      "Entradas, saídas, transferências e ajustes.",
    ],
    angle: "Mostre controle de itens de maior valor e melhor rastreabilidade.",
  },
  {
    id: "acessorios-kits-tech",
    group: "Produtos",
    title: "Acessórios, Kits e Venda Complementar",
    summary: "Organiza produtos complementares para aumentar ticket e melhorar experiência de compra.",
    bullets: [
      "Capas, carregadores, cabos, fones, suportes e periféricos.",
      "Kits por produto principal.",
      "Sugestões de combinação cadastradas.",
      "Campanhas de cross-sell.",
    ],
    angle: "Destaque aumento de ticket médio com complementos relevantes.",
  },
  {
    id: "trade-in-tech",
    group: "Comercial",
    title: "Trade-in e Troca com Usado",
    summary: "Organiza avaliação comercial de equipamento usado como parte de uma nova venda.",
    bullets: [
      "Cadastro do equipamento usado.",
      "Estado, acessórios e observações.",
      "Valor estimado conforme regra interna.",
      "Crédito aplicado na nova compra.",
    ],
    angle: "Material focado em reduzir barreira de preço e acelerar troca de equipamento.",
  },
  {
    id: "financiamento-tech",
    group: "Financeiro",
    title: "Parcelamento e Financiamento",
    summary: "Apresenta opções comerciais de pagamento e parcelamento configuradas pela operação.",
    bullets: [
      "Parcelas e condições disponíveis.",
      "Entrada e valor financiado quando aplicável.",
      "Comparação de condições.",
      "Sem assumir decisão de crédito fora das integrações autorizadas.",
    ],
    angle: "Destaque facilidade de compra sem prometer aprovação financeira.",
  },
  {
    id: "garantia-tech",
    group: "Pós-venda",
    title: "Garantia e Assistência Técnica",
    summary: "Organiza garantia, chamados, assistência autorizada e acompanhamento pós-venda.",
    bullets: [
      "Data de compra e cobertura registrada.",
      "Chamado com descrição e evidências.",
      "Encaminhamento para assistência.",
      "Follow-up até resolução.",
    ],
    angle: "Mostre pós-venda estruturado como diferencial em produtos de maior valor.",
  },
  {
    id: "rma-tech",
    group: "Operação",
    title: "RMA, Trocas e Devoluções",
    summary: "Controla devoluções, defeitos, troca de produto e processos de retorno ao fornecedor.",
    bullets: [
      "Motivo e evidências.",
      "Produto, serial e pedido.",
      "Status do processo.",
      "Solução aplicada e histórico.",
    ],
    angle: "Material focado em reduzir perda de informação e acelerar resolução.",
  },
  {
    id: "fornecedores-tech",
    group: "Compras",
    title: "Distribuidores, Marcas e Fornecedores",
    summary: "Centraliza fornecedores, marcas, tabelas e condições de compra.",
    bullets: [
      "Fornecedor por categoria e marca.",
      "Tabela de preço e disponibilidade.",
      "Prazo, frete e condição.",
      "Histórico de compra e negociação.",
    ],
    angle: "Destaque negociação e abastecimento centralizados.",
  },
  {
    id: "compras-tech",
    group: "Compras",
    title: "Compras e Reposição",
    summary: "Usa estoque, giro, lançamentos e demanda para apoiar reposição.",
    bullets: [
      "Necessidade por produto e variante.",
      "Histórico de giro.",
      "Reposição por loja ou canal.",
      "Pedido e acompanhamento.",
    ],
    angle: "Mostre compras mais conectadas ao giro real e ao ciclo de tecnologia.",
  },
  {
    id: "preco-margem-tech",
    group: "Financeiro",
    title: "Preço, Margem e Competitividade",
    summary: "Apoia formação de preço considerando custo, despesas, margem e campanhas.",
    bullets: [
      "Custo de aquisição.",
      "Frete e despesas.",
      "Margem por produto.",
      "Preço cheio, promocional e resultado.",
    ],
    angle: "Material focado em proteger margem em categorias com alta pressão competitiva.",
  },
  {
    id: "crm-tech",
    group: "CRM",
    title: "CRM e Cliente 360",
    summary: "Centraliza relacionamento, interesses, equipamentos, compras e oportunidades futuras.",
    bullets: [
      "Origem, categoria e produtos de interesse.",
      "Histórico de compras quando integrado.",
      "Equipamentos atuais declarados pelo cliente.",
      "Campanhas, contatos e próximos passos.",
    ],
    angle: "Destaque continuidade do relacionamento além de uma única compra.",
  },
  {
    id: "whatsapp-tech",
    group: "Atendimento",
    title: "Vendas e Suporte por WhatsApp",
    summary: "Organiza atendimento comercial, comparação de produtos, reservas e suporte operacional.",
    bullets: [
      "Envio de catálogo e comparativos.",
      "Reserva e pedido.",
      "Status de entrega ou retirada.",
      "Suporte sobre garantia, troca e assistência.",
    ],
    angle: "Mostre WhatsApp como canal integrado de venda e pós-venda.",
  },
  {
    id: "ecommerce-tech",
    group: "Canais",
    title: "E-commerce e Loja Digital",
    summary: "Conecta catálogo, variantes, estoque, campanhas e pedidos online.",
    bullets: [
      "Busca por categoria, marca e especificação.",
      "Comparação e carrinho.",
      "Cupom e campanha.",
      "Retirada em loja ou entrega.",
    ],
    angle: "Destaque experiência digital rica em especificações e disponibilidade.",
  },
  {
    id: "marketplaces-tech",
    group: "Canais",
    title: "Marketplaces",
    summary: "Organiza publicação e acompanhamento de produtos em canais externos quando houver integração.",
    bullets: [
      "Catálogo e atributos por canal.",
      "Preço e estoque.",
      "Pedidos e status.",
      "Desempenho por marketplace.",
    ],
    angle: "Material focado em ampliar distribuição sem perder controle central.",
  },
  {
    id: "lancamentos-tech",
    group: "Marketing",
    title: "Lançamentos e Pré-vendas",
    summary: "Estrutura campanhas para novos modelos, gerações e produtos.",
    bullets: [
      "Lista de espera e interesse.",
      "Conteúdo de lançamento.",
      "Pré-venda ou reserva quando disponível.",
      "Follow-up até disponibilidade e compra.",
    ],
    angle: "Destaque velocidade para capturar demanda em produtos com alto interesse inicial.",
  },
  {
    id: "marketing-tech",
    group: "Marketing",
    title: "Marketing Ativo para Tecnologia",
    summary: "Planeja campanhas por categoria, lançamento, público, necessidade e ocasião.",
    bullets: [
      "Calendário de lançamentos e promoções.",
      "Campanhas por marca e categoria.",
      "Remarketing e recuperação de interesse.",
      "Conteúdo de comparação e uso.",
    ],
    angle: "Mostre marketing conectado ao catálogo e ao ciclo rápido de lançamentos.",
  },
  {
    id: "conteudo-tech",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Transforma produtos, testes e novidades em conteúdo comercial e educativo.",
    bullets: [
      "Unboxing, comparativos e demonstrações.",
      "Dicas de uso e configuração.",
      "Novidades e lançamentos.",
      "Roteiros para Reels e vídeos.",
    ],
    angle: "Destaque conteúdo útil para reduzir dúvida e acelerar decisão.",
  },
  {
    id: "campanhas-tech",
    group: "Marketing",
    title: "Campanhas por Produto, Marca e Perfil",
    summary: "Cria campanhas completas conectadas a catálogo, público, canal e conversão.",
    bullets: [
      "Público, mensagem, criativo e CTA.",
      "Landing Page ou página de produto.",
      "WhatsApp, e-commerce ou reserva como conversão.",
      "Medição até compra e recompra.",
    ],
    angle: "Mostre campanhas mensuráveis ligadas a produtos específicos.",
  },
  {
    id: "agentes-ia-tech",
    group: "IA",
    title: "Agentes de IA para Vendas e Suporte",
    summary: "Automatiza qualificação, comparação, follow-up e suporte operacional.",
    bullets: [
      "Atendimento inicial e busca de produtos.",
      "Follow-up de interesse e carrinho.",
      "Suporte sobre status, garantia e assistência.",
      "Encaminhamento humano para casos técnicos complexos.",
    ],
    angle: "Destaque IA como apoio à equipe sem substituir especialistas em casos críticos.",
  },
  {
    id: "b2b-tech",
    group: "B2B",
    title: "Vendas Corporativas e TI",
    summary: "Organiza oportunidades com empresas, escolas, escritórios e equipes de TI.",
    bullets: [
      "Conta, decisores e necessidade.",
      "Lista de equipamentos e especificações.",
      "Proposta e condições comerciais.",
      "Renovação de parque e recompra.",
    ],
    angle: "Material focado em ciclos B2B de maior ticket e recorrência.",
  },
  {
    id: "renovacao-parque-tech",
    group: "Inteligência",
    title: "Renovação de Equipamentos",
    summary: "Identifica oportunidades futuras com base em idade, categoria e histórico do equipamento quando disponíveis.",
    bullets: [
      "Equipamentos antigos declarados ou registrados.",
      "Ciclo de troca configurável.",
      "Campanhas de upgrade.",
      "Trade-in e recompra.",
    ],
    angle: "Destaque relacionamento de longo prazo e oportunidade de upgrade.",
  },
  {
    id: "revenue-scout-tech",
    group: "Inteligência",
    title: "Revenue Scout para Tecnologia",
    summary: "Encontra oportunidades em clientes, carrinhos, produtos complementares e ciclos de troca.",
    bullets: [
      "Clientes inativos.",
      "Interesses não convertidos.",
      "Acessórios e produtos complementares.",
      "Upgrade, recompra e B2B.",
    ],
    angle: "Material focado em recuperar receita dentro da base existente.",
  },
  {
    id: "dashboard-tech",
    group: "Inteligência",
    title: "Dashboard Comercial e Operacional",
    summary: "Consolida vendas, estoque, giro, margem, campanhas, garantia e clientes.",
    bullets: [
      "Vendas por categoria, marca, modelo e canal.",
      "Ticket médio e margem.",
      "Giro, ruptura e excesso.",
      "Campanhas, devoluções e pós-venda.",
    ],
    angle: "Destaque leitura integrada do que vende, gira e gera margem.",
  },
  {
    id: "financeiro-tech",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza receitas, compras, despesas e resultado por produto, canal e cliente.",
    bullets: [
      "Vendas e recebimentos.",
      "Compras e despesas.",
      "Margem por categoria e produto.",
      "Indicadores por loja, e-commerce, marketplace e B2B.",
    ],
    angle: "Destaque rentabilidade por canal e categoria, não apenas faturamento.",
  },
  {
    id: "pos-venda-tech",
    group: "Pós-venda",
    title: "Pós-venda e Relacionamento",
    summary: "Acompanha entrega, configuração, garantia, avaliação e novas oportunidades.",
    bullets: [
      "Confirmação de entrega ou retirada.",
      "Suporte inicial e orientações operacionais.",
      "Garantia, troca e assistência.",
      "Avaliação, upgrade e recompra.",
    ],
    angle: "Mostre que tecnologia exige relacionamento depois da venda para gerar confiança e recorrência.",
  },
];

const materiaisConstrucaoModules: ScopeModule[] = [
  {
    id: "captacao-materiais-construcao",
    group: "Aquisição",
    title: "Captação por Obra, Etapa e Região",
    summary: "Atrai clientes e profissionais com campanhas conectadas ao tipo de obra, etapa construtiva, região e necessidade de compra.",
    bullets: [
      "Campanhas por fundação, estrutura, cobertura, instalações, acabamento e reforma.",
      "Landing Pages por categoria, marca, sistema construtivo ou etapa da obra.",
      "Origem, campanha e interesse registrados no CRM.",
      "CTA para orçamento, WhatsApp, visita à loja ou envio de lista de materiais.",
    ],
    angle: "Mostre que a loja pode acompanhar a obra inteira, e não apenas a primeira compra.",
  },
  {
    id: "catalogo-materiais-construcao",
    group: "Catálogo",
    title: "Catálogo Técnico de Materiais",
    summary: "Organiza materiais por categoria, aplicação, linha, marca, especificação, unidade de venda e disponibilidade.",
    bullets: [
      "Cimento, aço, blocos, argamassas, impermeabilizantes, hidráulica, elétrica, coberturas e acabamentos.",
      "Categoria, subcategoria, linha, aplicação e família.",
      "Unidade de venda por peça, saco, m², m³, metro, caixa ou unidade.",
      "Ficha técnica, imagens, preço e disponibilidade.",
    ],
    angle: "Destaque um catálogo técnico capaz de atender balcão, orçamento, campanhas e e-commerce.",
  },
  {
    id: "etapas-obra-materiais",
    group: "Inteligência",
    title: "Materiais por Etapa da Obra",
    summary: "Relaciona produtos às etapas da construção para antecipar necessidades e oportunidades comerciais.",
    bullets: [
      "Projeto e preparação.",
      "Fundação, estrutura e alvenaria.",
      "Cobertura, instalações e impermeabilização.",
      "Revestimentos, pintura, esquadrias e acabamentos.",
    ],
    angle: "Material focado em vender a próxima etapa antes que o cliente compre em outro lugar.",
  },
  {
    id: "listas-materiais",
    group: "Comercial",
    title: "Lista de Materiais e Orçamento por Obra",
    summary: "Transforma listas de engenheiros, arquitetos, mestres de obra e clientes em orçamento estruturado.",
    bullets: [
      "Importação ou cadastro de lista.",
      "Produtos, quantidades e unidades.",
      "Alternativas de marca ou linha previamente cadastradas.",
      "Orçamento, versão e histórico.",
    ],
    angle: "Destaque velocidade para responder listas grandes sem perder rastreabilidade.",
  },
  {
    id: "orcamento-balcao",
    group: "Comercial",
    title: "Orçamento de Balcão e WhatsApp",
    summary: "Organiza consultas rápidas e transforma atendimento em proposta rastreável.",
    bullets: [
      "Busca por produto, aplicação ou categoria.",
      "Quantidade, preço e condição.",
      "Reserva de itens e validade do orçamento.",
      "Follow-up automático do orçamento não fechado.",
    ],
    angle: "Mostre como cada consulta vira uma oportunidade acompanhável.",
  },
  {
    id: "crm-obras-clientes",
    group: "CRM",
    title: "CRM por Cliente e Obra",
    summary: "Centraliza clientes, obras, profissionais envolvidos, histórico de compras e próximas necessidades.",
    bullets: [
      "Cliente, endereço e tipo de obra.",
      "Engenheiro, arquiteto, mestre ou profissional relacionado.",
      "Etapa atual e próximas etapas.",
      "Orçamentos, pedidos, entregas e histórico comercial.",
    ],
    angle: "Destaque memória comercial por obra, não apenas por contato.",
  },
  {
    id: "pipeline-obras-loja",
    group: "Comercial",
    title: "Pipeline de Obras e Orçamentos",
    summary: "Acompanha oportunidades desde a prospecção da obra até orçamento, pedido, entrega e recompra.",
    bullets: [
      "Lead/obra, levantamento, orçamento, negociação e pedido.",
      "Valor, responsável e próxima ação.",
      "Motivos de perda.",
      "Próxima fase da obra como oportunidade futura.",
    ],
    angle: "Material ideal para previsibilidade comercial e gestão de carteira de obras.",
  },
  {
    id: "prospector-materiais",
    group: "Comercial",
    title: "Prospector para Materiais de Construção",
    summary: "Busca oportunidades por região, perfil, obras em andamento e sinais observáveis.",
    bullets: [
      "Construtoras, profissionais, obras e empresas.",
      "Região e tipo de projeto.",
      "Sinais de nova obra, reforma ou expansão.",
      "Fila de prospecção e pré-qualificação.",
    ],
    angle: "Mostre que a loja pode gerar demanda ativa em vez de esperar o cliente aparecer.",
  },
  {
    id: "profissionais-parceiros",
    group: "Relacionamento",
    title: "Profissionais Parceiros",
    summary: "Organiza relacionamento com arquitetos, engenheiros, pedreiros, instaladores e especificadores.",
    bullets: [
      "Cadastro e especialidade.",
      "Obras e clientes relacionados.",
      "Indicações e oportunidades.",
      "Campanhas, benefícios e histórico comercial.",
    ],
    angle: "Destaque criação de um ecossistema de profissionais que gera demanda recorrente.",
  },
  {
    id: "estoque-materiais",
    group: "Operação",
    title: "Estoque e Disponibilidade",
    summary: "Controla saldo, reserva, ruptura, excesso e movimentação por loja ou depósito.",
    bullets: [
      "Saldo por produto e unidade de venda.",
      "Reserva para orçamento, pedido ou obra.",
      "Transferências entre lojas ou depósitos.",
      "Ruptura, excesso e produtos parados.",
    ],
    angle: "Destaque confiabilidade na promessa comercial e menos venda de item indisponível.",
  },
  {
    id: "compras-materiais",
    group: "Compras",
    title: "Compras e Reposição",
    summary: "Usa giro, estoque, carteira de obras e demanda prevista para apoiar compras.",
    bullets: [
      "Necessidade por produto e categoria.",
      "Histórico de giro.",
      "Demanda futura por obras abertas.",
      "Pedido e acompanhamento de entrega.",
    ],
    angle: "Mostre compras conectadas à demanda real e futura.",
  },
  {
    id: "fornecedores-materiais",
    group: "Compras",
    title: "Fornecedores, Indústrias e Distribuidores",
    summary: "Centraliza marcas, fornecedores, tabelas, condições e histórico de negociação.",
    bullets: [
      "Fornecedor por categoria e marca.",
      "Preço, prazo, frete e pedido mínimo.",
      "Condições comerciais e bonificações.",
      "Histórico de compra e desempenho.",
    ],
    angle: "Destaque mais poder de negociação e menos dependência de planilhas isoladas.",
  },
  {
    id: "cotacoes-materiais",
    group: "Compras",
    title: "Cotações e Comparação de Fornecedores",
    summary: "Facilita tomada de preço para listas extensas de materiais.",
    bullets: [
      "Solicitação por produto ou lista.",
      "Comparação de preço, prazo, frete e condição.",
      "Escolha por item ou fornecedor.",
      "Conversão em pedido.",
    ],
    angle: "Material focado em proteger margem desde a compra.",
  },
  {
    id: "preco-margem-materiais",
    group: "Financeiro",
    title: "Preço, Margem e Condição Comercial",
    summary: "Apoia formação de preço considerando custo, frete, comissão, despesas e margem.",
    bullets: [
      "Custo e preço de venda.",
      "Margem por produto e categoria.",
      "Desconto máximo e alçada.",
      "Condição diferenciada por cliente ou volume.",
    ],
    angle: "Destaque controle de margem mesmo em negociações grandes.",
  },
  {
    id: "entrega-obra",
    group: "Logística",
    title: "Entrega em Obra e Roteirização",
    summary: "Organiza expedição, entrega, endereço da obra, rota e comprovação.",
    bullets: [
      "Pedido e separação.",
      "Carga, veículo e responsável.",
      "Janela e endereço de entrega.",
      "Confirmação, foto e ocorrência.",
    ],
    angle: "Mostre a entrega como parte da experiência comercial e não como operação desconectada.",
  },
  {
    id: "frete-materiais",
    group: "Logística",
    title: "Frete e Condições de Entrega",
    summary: "Organiza regras de frete por região, volume, peso, pedido e cliente.",
    bullets: [
      "Região e distância.",
      "Peso, volume e tipo de carga.",
      "Valor ou gratuidade conforme regra.",
      "Prazo estimado e condição comercial.",
    ],
    angle: "Destaque transparência e consistência na negociação de frete.",
  },
  {
    id: "marketing-materiais",
    group: "Marketing",
    title: "Marketing Ativo por Etapa da Obra",
    summary: "Planeja conteúdo e campanhas conforme fase da construção e perfil do cliente.",
    bullets: [
      "Campanhas por fundação, estrutura, instalações e acabamento.",
      "Conteúdo técnico e comercial.",
      "Promoções e lançamentos.",
      "Remarketing de obras e orçamentos não fechados.",
    ],
    angle: "Mostre marketing conectado ao momento real da obra.",
  },
  {
    id: "conteudo-materiais",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Transforma produtos, aplicações, comparativos e obras em conteúdo comercial e educativo.",
    bullets: [
      "Aplicação correta e usos comuns.",
      "Comparação entre linhas e acabamentos.",
      "Novidades, lançamentos e promoções.",
      "Bastidores de entrega e obras atendidas.",
    ],
    angle: "Destaque autoridade técnica sem complicar a comunicação.",
  },
  {
    id: "campanhas-materiais",
    group: "Marketing",
    title: "Campanhas por Categoria, Obra e Região",
    summary: "Cria campanhas completas conectadas a público, etapa, região e objetivo comercial.",
    bullets: [
      "Público, promessa, criativos e CTA.",
      "Landing Page por categoria ou etapa.",
      "WhatsApp, orçamento ou visita à loja como conversão.",
      "Medição até pedido e recompra.",
    ],
    angle: "Mostre campanhas que levam o cliente direto para orçamento ou compra.",
  },
  {
    id: "agentes-ia-materiais",
    group: "IA",
    title: "Agentes de IA para Atendimento e Vendas",
    summary: "Automatiza busca, qualificação, follow-up, suporte e relacionamento comercial.",
    bullets: [
      "Atendimento inicial e busca de produto.",
      "Follow-up de orçamento.",
      "Acompanhamento de pedido e entrega.",
      "Reativação e próxima etapa da obra.",
    ],
    angle: "Destaque IA cuidando de tarefas repetitivas para liberar vendedores para negociações de maior valor.",
  },
  {
    id: "b2b-materiais",
    group: "B2B",
    title: "Construtoras, Incorporadoras e Empresas",
    summary: "Organiza contas empresariais com múltiplas obras, tabelas e condições.",
    bullets: [
      "Empresa, responsáveis e obras.",
      "Tabela e condição comercial.",
      "Pedidos e entregas por obra.",
      "Limite, faturamento e histórico quando integrado.",
    ],
    angle: "Material focado em profissionalizar grandes contas e contratos recorrentes.",
  },
  {
    id: "revenue-scout-materiais",
    group: "Inteligência",
    title: "Revenue Scout por Obra",
    summary: "Encontra oportunidades dentro da carteira com base na fase da obra, histórico e produtos ainda não comprados.",
    bullets: [
      "Próxima etapa da obra.",
      "Produtos complementares.",
      "Orçamentos não fechados.",
      "Novas obras, indicações e reativação.",
    ],
    angle: "Destaque receita que normalmente é perdida quando a loja não acompanha a evolução da obra.",
  },
  {
    id: "dashboard-materiais",
    group: "Inteligência",
    title: "Dashboard Comercial e Operacional",
    summary: "Consolida vendas, orçamentos, obras, estoque, margem, entregas e clientes.",
    bullets: [
      "Vendas por categoria, vendedor e região.",
      "Conversão de orçamento em pedido.",
      "Receita por obra e cliente.",
      "Margem, estoque, entrega e recompra.",
    ],
    angle: "Mostre visão integrada da carteira de obras e operação da loja.",
  },
  {
    id: "financeiro-materiais",
    group: "Financeiro",
    title: "Financeiro por Pedido, Cliente e Obra",
    summary: "Organiza recebimentos, compras, despesas, comissões e resultado comercial.",
    bullets: [
      "Vendas e recebimentos.",
      "Compras e despesas.",
      "Comissões quando aplicável.",
      "Margem por obra, cliente e categoria.",
    ],
    angle: "Destaque rentabilidade por obra e cliente, não apenas faturamento total.",
  },
  {
    id: "pos-venda-materiais",
    group: "Pós-venda",
    title: "Pós-venda, Trocas e Próxima Etapa",
    summary: "Acompanha entrega, ocorrências, trocas e prepara o próximo ciclo de compra da obra.",
    bullets: [
      "Confirmação de entrega.",
      "Troca, devolução ou avaria.",
      "Solução de ocorrência.",
      "Próxima necessidade da obra e recompra.",
    ],
    angle: "Mostre que o pós-venda também pode gerar a próxima venda.",
  },
];

const petVetModules: ScopeModule[] = [
  {
    id: "captacao-pet-vet",
    group: "Aquisição",
    title: "Captação para Pet Shop & Veterinária",
    summary: "Atrai tutores por campanhas locais, serviços, espécies, necessidades e canais digitais.",
    bullets: [
      "Campanhas por banho e tosa, consulta, vacinação, check-up, produtos e serviços.",
      "Landing Pages por serviço, espécie, região ou campanha.",
      "Origem e interesse registrados no CRM.",
      "CTA para agendamento, WhatsApp, loja ou e-commerce.",
    ],
    angle: "Mostre como transformar procura local em relacionamento recorrente com tutor e pet.",
  },
  {
    id: "cadastro-tutor-pet",
    group: "CRM",
    title: "Cadastro de Tutor e Pet",
    summary: "Centraliza dados do tutor e informações essenciais do animal em uma visão única.",
    bullets: [
      "Tutor, contatos e consentimentos.",
      "Nome, espécie, raça, sexo, idade e peso do pet.",
      "Preferências de atendimento e histórico comercial.",
      "Vínculo entre múltiplos pets e o mesmo tutor.",
    ],
    angle: "Destaque atendimento contextualizado e histórico preservado.",
  },
  {
    id: "agenda-veterinaria",
    group: "Atendimento",
    title: "Agenda de Consultas e Serviços",
    summary: "Organiza consultas, retornos, procedimentos, banho, tosa e demais serviços.",
    bullets: [
      "Agenda por profissional, unidade e serviço.",
      "Lembretes automáticos.",
      "Confirmação e reagendamento.",
      "Histórico ligado ao tutor e ao pet.",
    ],
    angle: "Mostre menos faltas, mais organização e melhor ocupação da agenda.",
  },
  {
    id: "prontuario-vet",
    group: "Veterinário",
    title: "Prontuário Veterinário",
    summary: "Organiza registros clínicos do animal sob responsabilidade de profissional habilitado.",
    bullets: [
      "Anamnese, evolução, exames e procedimentos.",
      "Documentos e anexos.",
      "Histórico por pet.",
      "Acesso restrito conforme perfil profissional.",
    ],
    angle: "Destaque organização e continuidade clínica, sem substituir decisão do veterinário.",
  },
  {
    id: "vacinas-retornos",
    group: "Veterinário",
    title: "Vacinas, Retornos e Lembretes",
    summary: "Acompanha agendas preventivas e retornos definidos pelo profissional.",
    bullets: [
      "Calendário de vacinas registrado pelo veterinário.",
      "Lembretes de retorno.",
      "Pendências e histórico.",
      "Contato com tutor conforme consentimento.",
    ],
    angle: "Mostre prevenção e recorrência com supervisão clínica.",
  },
  {
    id: "banho-tosa",
    group: "Serviços",
    title: "Banho, Tosa e Estética Pet",
    summary: "Organiza serviços recorrentes de estética e cuidados.",
    bullets: [
      "Tipo de serviço e pacote.",
      "Preferências do tutor.",
      "Agenda e responsável.",
      "Histórico e recorrência.",
    ],
    angle: "Destaque recorrência, fidelização e padronização do atendimento.",
  },
  {
    id: "catalogo-pet",
    group: "Catálogo",
    title: "Catálogo de Produtos Pet",
    summary: "Organiza rações, petiscos, higiene, acessórios, medicamentos veterinários e demais itens.",
    bullets: [
      "Categoria, marca, linha, espécie e porte.",
      "Fotos, preço e disponibilidade.",
      "SKU e variações.",
      "Produtos relacionados e complementares.",
    ],
    angle: "Mostre catálogo único para balcão, WhatsApp e e-commerce.",
  },
  {
    id: "estoque-pet",
    group: "Operação",
    title: "Estoque, Lotes e Validades",
    summary: "Controla disponibilidade, lote e validade de produtos quando aplicável.",
    bullets: [
      "Saldo por loja e depósito.",
      "Lote e validade.",
      "Alertas de ruptura e vencimento.",
      "Reserva para pedidos ou serviços.",
    ],
    angle: "Destaque controle de estoque e redução de perdas.",
  },
  {
    id: "farmacia-veterinaria",
    group: "Veterinário",
    title: "Farmácia Veterinária e Itens Regulados",
    summary: "Organiza produtos veterinários sujeitos a regras específicas, com validação profissional quando necessário.",
    bullets: [
      "Cadastro e disponibilidade.",
      "Receita e validação quando aplicável.",
      "Registro de dispensação conforme processo interno.",
      "Sem prescrição automática pela IA.",
    ],
    angle: "Destaque segurança e governança em produtos regulados.",
  },
  {
    id: "assinaturas-pet",
    group: "Relacionamento",
    title: "Planos, Pacotes e Assinaturas",
    summary: "Cria recorrência com pacotes de serviços e produtos.",
    bullets: [
      "Banho e tosa recorrente.",
      "Planos de benefícios.",
      "Assinaturas de ração ou itens frequentes.",
      "Renovação e cobrança.",
    ],
    angle: "Mostre previsibilidade de receita e conveniência para o tutor.",
  },
  {
    id: "whatsapp-pet",
    group: "Atendimento",
    title: "Atendimento por WhatsApp",
    summary: "Centraliza conversas, agendamentos, pedidos e follow-ups.",
    bullets: [
      "Agendamento de serviços.",
      "Consulta de catálogo.",
      "Status de pedido ou atendimento.",
      "Histórico ligado ao tutor e pet.",
    ],
    angle: "Mostre WhatsApp como parte do processo, não como canal isolado.",
  },
  {
    id: "ecommerce-pet",
    group: "Canais",
    title: "E-commerce e Delivery",
    summary: "Conecta catálogo, estoque, pedidos e entrega.",
    bullets: [
      "Busca por espécie, categoria e marca.",
      "Carrinho e pedido.",
      "Retirada ou entrega.",
      "Cupons e campanhas.",
    ],
    angle: "Destaque conveniência e recorrência de compra.",
  },
  {
    id: "marketing-pet",
    group: "Marketing",
    title: "Marketing Ativo para Pet",
    summary: "Planeja conteúdo e campanhas por serviço, espécie, perfil e objetivo.",
    bullets: [
      "Calendário de campanhas.",
      "Conteúdo educativo e comercial.",
      "Remarketing e reativação.",
      "Campanhas de serviços e produtos.",
    ],
    angle: "Mostre marketing contínuo conectado à agenda e ao CRM.",
  },
  {
    id: "agentes-ia-pet",
    group: "IA",
    title: "Agentes de IA para Atendimento e Relacionamento",
    summary: "Automatiza tarefas comerciais e operacionais com limites claros para decisões clínicas.",
    bullets: [
      "Atendimento inicial e triagem administrativa.",
      "Follow-up de consultas, serviços e pedidos.",
      "Lembretes e campanhas.",
      "Encaminhamento ao veterinário em temas clínicos.",
    ],
    angle: "Destaque automação sem substituir julgamento profissional.",
  },
  {
    id: "compras-pet",
    group: "Compras",
    title: "Compras e Fornecedores",
    summary: "Organiza reposição, fornecedores, preços e condições.",
    bullets: [
      "Necessidade por produto.",
      "Fornecedores e marcas.",
      "Cotações e comparação.",
      "Pedido e acompanhamento.",
    ],
    angle: "Mostre compras mais conectadas ao giro real.",
  },
  {
    id: "fidelidade-pet",
    group: "Relacionamento",
    title: "Fidelidade e Clube de Vantagens",
    summary: "Cria benefícios para aumentar frequência e retenção.",
    bullets: [
      "Pontos, cashback ou vantagens.",
      "Cupons por campanha.",
      "Benefícios por serviço ou compra.",
      "Medição de recorrência.",
    ],
    angle: "Destaque relacionamento de longo prazo com tutor e pet.",
  },
  {
    id: "parcerias-pet",
    group: "B2B",
    title: "Parcerias e Rede Pet",
    summary: "Organiza relacionamento com criadores, hotéis, adestradores, ONGs e empresas.",
    bullets: [
      "Parceiros e origem de indicações.",
      "Campanhas conjuntas.",
      "Condições comerciais.",
      "Histórico de oportunidades.",
    ],
    angle: "Mostre crescimento por ecossistema local.",
  },
  {
    id: "revenue-scout-pet",
    group: "Inteligência",
    title: "Revenue Scout para Pet Shop & Veterinária",
    summary: "Encontra oportunidades na base de tutores, pets, serviços e produtos.",
    bullets: [
      "Clientes inativos.",
      "Retornos e serviços recorrentes.",
      "Produtos complementares.",
      "Planos, assinaturas e indicações.",
    ],
    angle: "Destaque receita escondida na própria base.",
  },
  {
    id: "dashboard-pet",
    group: "Inteligência",
    title: "Dashboard Comercial e Operacional",
    summary: "Consolida agenda, vendas, serviços, estoque, recorrência e clientes.",
    bullets: [
      "Atendimentos e ocupação da agenda.",
      "Vendas por serviço e produto.",
      "Recorrência e retenção.",
      "Estoque e campanhas.",
    ],
    angle: "Mostre visão integrada da operação.",
  },
  {
    id: "financeiro-pet",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza receitas, despesas, compras e resultado por serviço e canal.",
    bullets: [
      "Vendas e recebimentos.",
      "Compras e despesas.",
      "Receita por profissional ou serviço quando aplicável.",
      "Margem por produto e canal.",
    ],
    angle: "Destaque rentabilidade além do faturamento bruto.",
  },
  {
    id: "pos-venda-pet",
    group: "Pós-venda",
    title: "Pós-atendimento e Relacionamento",
    summary: "Acompanha satisfação, dúvidas operacionais, retornos e novas oportunidades.",
    bullets: [
      "Follow-up após serviço ou consulta.",
      "Avaliação e satisfação.",
      "Retorno e recorrência.",
      "Indicações e novas oportunidades.",
    ],
    angle: "Mostre continuidade do cuidado e do relacionamento.",
  },
];

const advocaciaModules: ScopeModule[] = [
  {
    id: "captacao-advocacia",
    group: "Aquisição",
    title: "Captação Ética e Presença Digital",
    summary: "Organiza presença digital, conteúdo informativo e entrada de potenciais clientes dentro das regras profissionais aplicáveis.",
    bullets: [
      "Landing Pages institucionais por área de atuação.",
      "Formulários de contato e triagem inicial.",
      "Origem do contato registrada no CRM.",
      "Conteúdo informativo sem promessa de resultado.",
    ],
    angle: "Mostre organização da demanda e comunicação profissional sem transformar marketing jurídico em promessa comercial indevida.",
  },
  {
    id: "triagem-juridica",
    group: "Atendimento",
    title: "Triagem Inicial de Casos",
    summary: "Estrutura coleta inicial de fatos, documentos e urgência antes da análise do advogado.",
    bullets: [
      "Área do direito e natureza da demanda.",
      "Partes envolvidas, datas e fatos principais.",
      "Documentos e evidências iniciais.",
      "Encaminhamento para advogado responsável.",
    ],
    angle: "Destaque ganho de tempo na primeira análise sem substituir avaliação jurídica profissional.",
  },
  {
    id: "crm-juridico",
    group: "CRM",
    title: "CRM de Clientes e Casos",
    summary: "Centraliza clientes, contatos, casos, histórico, documentos e próximos passos.",
    bullets: [
      "Cliente, contatos e origem.",
      "Casos, áreas, responsáveis e status.",
      "Conversas, documentos e compromissos.",
      "Histórico de relacionamento.",
    ],
    angle: "Mostre memória jurídica e comercial organizada em um só lugar.",
  },
  {
    id: "pipeline-juridico",
    group: "Comercial",
    title: "Pipeline de Atendimento e Contratação",
    summary: "Acompanha potenciais clientes desde o primeiro contato até contratação ou encerramento.",
    bullets: [
      "Contato inicial, triagem, reunião, proposta e contratação.",
      "Responsável e próxima ação.",
      "Motivos de perda ou não contratação.",
      "Follow-up estruturado.",
    ],
    angle: "Destaque previsibilidade e redução de contatos esquecidos.",
  },
  {
    id: "agenda-juridica",
    group: "Operação",
    title: "Agenda Jurídica",
    summary: "Organiza reuniões, audiências, diligências, prazos internos e compromissos.",
    bullets: [
      "Agenda por advogado e equipe.",
      "Lembretes e responsáveis.",
      "Vínculo com cliente e caso.",
      "Histórico de compromissos.",
    ],
    angle: "Mostre contexto e organização da rotina jurídica.",
  },
  {
    id: "prazos-juridicos",
    group: "Operação",
    title: "Controle de Prazos",
    summary: "Centraliza prazos processuais e internos com responsáveis e alertas.",
    bullets: [
      "Data, tipo de prazo e processo.",
      "Responsável e prioridade.",
      "Alertas e escalonamento.",
      "Registro de conclusão.",
    ],
    angle: "Material focado em reduzir risco operacional por prazo perdido.",
  },
  {
    id: "processos-juridicos",
    group: "Operação",
    title: "Gestão de Processos e Casos",
    summary: "Organiza processos judiciais e demandas extrajudiciais por cliente, responsável e fase.",
    bullets: [
      "Número do processo quando aplicável.",
      "Fase, movimentações e tarefas.",
      "Documentos e histórico.",
      "Responsável e equipe.",
    ],
    angle: "Destaque visão centralizada de cada caso.",
  },
  {
    id: "documentos-juridicos",
    group: "Documentação",
    title: "Gestão de Documentos",
    summary: "Centraliza contratos, procurações, peças, comprovantes, pareceres e anexos.",
    bullets: [
      "Documentos por cliente e caso.",
      "Versões e histórico.",
      "Permissões de acesso.",
      "Checklists documentais.",
    ],
    angle: "Mostre organização e segurança documental.",
  },
  {
    id: "contratos-honorarios",
    group: "Financeiro",
    title: "Contratos e Honorários",
    summary: "Organiza propostas, contratos, condições e honorários por cliente e caso.",
    bullets: [
      "Escopo contratado.",
      "Honorários fixos, recorrentes ou por etapa.",
      "Condições de pagamento.",
      "Versões, aceite e documentação.",
    ],
    angle: "Destaque clareza comercial e financeira desde a contratação.",
  },
  {
    id: "financeiro-advocacia",
    group: "Financeiro",
    title: "Financeiro por Cliente e Caso",
    summary: "Acompanha receitas, recebimentos, despesas e resultado por contrato ou caso.",
    bullets: [
      "Honorários contratados.",
      "Parcelas e recebimentos.",
      "Despesas vinculadas.",
      "Resultado por cliente, área e caso.",
    ],
    angle: "Mostre rentabilidade por caso e não apenas faturamento total.",
  },
  {
    id: "tarefas-equipe-juridica",
    group: "Gestão",
    title: "Tarefas, Equipe e Responsabilidades",
    summary: "Distribui atividades entre advogados, estagiários, assistentes e administrativo.",
    bullets: [
      "Tarefa, responsável, prazo e prioridade.",
      "Vínculo com cliente e caso.",
      "Pendências e bloqueios.",
      "Acompanhamento de carga e andamento.",
    ],
    angle: "Destaque gestão profissional da equipe e redução de tarefas perdidas.",
  },
  {
    id: "whatsapp-email-advocacia",
    group: "Atendimento",
    title: "WhatsApp, E-mail e Omnichannel",
    summary: "Centraliza comunicações no contexto do cliente e do caso.",
    bullets: [
      "Histórico de conversas.",
      "Transferência preservando contexto.",
      "Registro de documentos e tarefas.",
      "Follow-up sem perder o histórico.",
    ],
    angle: "Mostre comunicação organizada sem depender de caixas pessoais.",
  },
  {
    id: "agentes-ia-advocacia",
    group: "IA",
    title: "Agentes de IA para Rotinas Jurídicas",
    summary: "Apoia triagem administrativa, organização, follow-up e atendimento operacional.",
    bullets: [
      "Coleta inicial de informações.",
      "Resumo de documentos e conversas para revisão humana.",
      "Follow-up de pendências e agenda.",
      "Encaminhamento ao advogado para orientação jurídica.",
    ],
    angle: "Destaque produtividade sem delegar decisão jurídica à IA.",
  },
  {
    id: "base-conhecimento-juridica",
    group: "Conhecimento",
    title: "Base de Conhecimento Interna",
    summary: "Organiza modelos, entendimentos internos, procedimentos e referências do escritório.",
    bullets: [
      "Modelos e checklists.",
      "Procedimentos internos.",
      "Perguntas frequentes.",
      "Pesquisa por tema e área.",
    ],
    angle: "Mostre padronização interna e acesso rápido ao conhecimento do escritório.",
  },
  {
    id: "portal-cliente-advocacia",
    group: "Cliente",
    title: "Portal do Cliente",
    summary: "Permite compartilhar informações liberadas pelo escritório de forma organizada.",
    bullets: [
      "Documentos e contratos.",
      "Status e atualizações liberadas.",
      "Compromissos e pendências.",
      "Comunicação e solicitações.",
    ],
    angle: "Destaque transparência e redução de consultas repetitivas.",
  },
  {
    id: "marketing-conteudo-juridico",
    group: "Marketing",
    title: "Conteúdo Jurídico Institucional",
    summary: "Ajuda a planejar conteúdo informativo e institucional compatível com regras profissionais.",
    bullets: [
      "Artigos, posts, vídeos e FAQs informativos.",
      "Conteúdo por área de atuação.",
      "Sem promessa de êxito ou captação abusiva.",
      "Revisão humana antes da publicação.",
    ],
    angle: "Destaque autoridade informativa e presença digital responsável.",
  },
  {
    id: "relacionamento-advocacia",
    group: "Relacionamento",
    title: "Relacionamento e Pós-atendimento",
    summary: "Mantém contato após encerramento para avaliação, atualização cadastral e relacionamento institucional.",
    bullets: [
      "Avaliação de atendimento.",
      "Comunicação institucional.",
      "Atualização de contatos.",
      "Novas demandas iniciadas pelo cliente.",
    ],
    angle: "Mostre continuidade do relacionamento sem prospecção inadequada.",
  },
  {
    id: "revenue-scout-advocacia",
    group: "Inteligência",
    title: "Revenue Scout para Escritórios",
    summary: "Identifica oportunidades legítimas dentro da base, respeitando limites éticos e profissionais.",
    bullets: [
      "Clientes empresariais com contratos recorrentes.",
      "Demandas já manifestadas pelo cliente.",
      "Renovações contratuais.",
      "Relacionamentos e serviços previamente contratados.",
    ],
    angle: "Material focado em organização de oportunidades existentes, sem caça indiscriminada a litígios.",
  },
  {
    id: "dashboard-advocacia",
    group: "Inteligência",
    title: "Dashboard do Escritório",
    summary: "Consolida clientes, casos, prazos, contratos, recebimentos e produtividade.",
    bullets: [
      "Casos por área e responsável.",
      "Prazos e tarefas.",
      "Contratos e honorários.",
      "Indicadores de atendimento e operação.",
    ],
    angle: "Destaque gestão do escritório baseada em dados.",
  },
];


const contabilidadeModules: ScopeModule[] = [
  {
    id: "captacao-contabilidade",
    group: "Aquisição",
    title: "Captação para Escritórios Contábeis",
    summary: "Atrai empresas por segmento, porte, regime e necessidade, conectando campanhas, LPs, WhatsApp e CRM.",
    bullets: [
      "Campanhas por abertura, troca de contador, folha, fiscal, BPO e consultoria.",
      "Landing Pages por nicho empresarial.",
      "Origem e interesse registrados no CRM.",
      "CTA para diagnóstico inicial, reunião ou proposta.",
    ],
    angle: "Mostre como o escritório pode crescer por nichos e necessidades específicas, sem comunicação genérica.",
  },
  {
    id: "onboarding-contabil",
    group: "Onboarding",
    title: "Onboarding de Empresas",
    summary: "Organiza a entrada de novos clientes, documentos, acessos, responsáveis e pendências.",
    bullets: [
      "Dados da empresa e responsáveis.",
      "CNPJ, regime, atividades e unidades.",
      "Documentos e acessos necessários.",
      "Checklist de implantação e migração.",
    ],
    angle: "Destaque uma entrada organizada que reduz retrabalho e atraso no início do atendimento.",
  },
  {
    id: "crm-contabil",
    group: "CRM",
    title: "CRM de Clientes e Empresas",
    summary: "Centraliza empresas, contatos, serviços contratados, histórico e oportunidades.",
    bullets: [
      "Empresa, sócios e contatos.",
      "Serviços contratados.",
      "Conversas, documentos e atividades.",
      "Relacionamento e próximos passos.",
    ],
    angle: "Mostre uma visão completa da conta, não apenas do CNPJ.",
  },
  {
    id: "documentos-contabeis",
    group: "Documentação",
    title: "Documentos e Pendências",
    summary: "Organiza documentos recebidos, faltantes e responsáveis por competência.",
    bullets: [
      "Checklist mensal.",
      "Anexos por área e competência.",
      "Pendências do cliente.",
      "Alertas e follow-up.",
    ],
    angle: "Destaque menos cobrança manual de documentos e mais previsibilidade operacional.",
  },
  {
    id: "obrigacoes-prazos-contabil",
    group: "Operação",
    title: "Obrigações e Prazos",
    summary: "Centraliza obrigações, vencimentos, responsáveis e status.",
    bullets: [
      "Obrigação, competência e vencimento.",
      "Responsável e prioridade.",
      "Alertas e escalonamento.",
      "Registro de conclusão.",
    ],
    angle: "Material focado em reduzir risco operacional por obrigação esquecida.",
  },
  {
    id: "fiscal-contabilidade",
    group: "Fiscal",
    title: "Rotina Fiscal",
    summary: "Organiza tarefas, documentos, apurações e entregas da área fiscal.",
    bullets: [
      "Documentos fiscais recebidos.",
      "Apurações e conferências.",
      "Pendências por cliente.",
      "Tarefas e vencimentos.",
    ],
    angle: "Destaque controle de fluxo e produtividade da equipe fiscal.",
  },
  {
    id: "contabil-contabilidade",
    group: "Contábil",
    title: "Rotina Contábil",
    summary: "Organiza conciliações, fechamentos, documentos e pendências por cliente e competência.",
    bullets: [
      "Conciliações e fechamentos.",
      "Documentos e informações pendentes.",
      "Tarefas por competência.",
      "Revisões e aprovações internas.",
    ],
    angle: "Mostre fechamento contábil com fluxo, responsáveis e visibilidade.",
  },
  {
    id: "folha-contabilidade",
    group: "Folha",
    title: "Departamento Pessoal e Folha",
    summary: "Organiza admissões, desligamentos, folha, férias, eventos e pendências.",
    bullets: [
      "Colaboradores e eventos.",
      "Admissões e desligamentos.",
      "Férias e afastamentos.",
      "Prazos e documentos.",
    ],
    angle: "Destaque controle de rotina e redução de mensagens dispersas com o cliente.",
  },
  {
    id: "societario-contabilidade",
    group: "Societário",
    title: "Societário e Legalização",
    summary: "Organiza abertura, alteração, baixa e regularização de empresas.",
    bullets: [
      "Tipo de processo.",
      "Documentos necessários.",
      "Etapas, órgãos e pendências.",
      "Responsável e prazo.",
    ],
    angle: "Material focado em transparência do processo e acompanhamento por etapa.",
  },
  {
    id: "tickets-contabilidade",
    group: "Atendimento",
    title: "Central de Atendimento e Tickets",
    summary: "Transforma solicitações dos clientes em tickets com prioridade, responsável e prazo.",
    bullets: [
      "Categoria e assunto.",
      "Responsável e SLA.",
      "Anexos e histórico.",
      "Follow-up até solução.",
    ],
    angle: "Mostre atendimento organizado sem depender de grupos de WhatsApp.",
  },
  {
    id: "whatsapp-contabilidade",
    group: "Atendimento",
    title: "WhatsApp, E-mail e Omnichannel",
    summary: "Centraliza conversas no contexto da empresa cliente.",
    bullets: [
      "Histórico por cliente.",
      "Transferência preservando contexto.",
      "Criação de tarefa ou ticket.",
      "Registro de documentos e decisões.",
    ],
    angle: "Destaque comunicação centralizada e rastreável.",
  },
  {
    id: "tarefas-equipe-contabil",
    group: "Gestão",
    title: "Tarefas, Equipe e Carteiras",
    summary: "Distribui clientes e atividades entre fiscal, contábil, folha, societário e atendimento.",
    bullets: [
      "Responsável por cliente e área.",
      "Tarefa, prazo e prioridade.",
      "Pendências e bloqueios.",
      "Carga e produtividade da equipe.",
    ],
    angle: "Mostre gestão de carteira e equipe sem depender de planilhas paralelas.",
  },
  {
    id: "honorarios-contabilidade",
    group: "Financeiro",
    title: "Honorários e Contratos",
    summary: "Organiza serviços, planos, valores, reajustes e condições comerciais.",
    bullets: [
      "Serviços contratados.",
      "Honorário mensal e extras.",
      "Reajustes e histórico.",
      "Contrato e aceite.",
    ],
    angle: "Destaque clareza do que está contratado e do que é serviço adicional.",
  },
  {
    id: "cobranca-contabilidade",
    group: "Financeiro",
    title: "Cobrança e Inadimplência",
    summary: "Acompanha honorários pendentes e cadências de cobrança.",
    bullets: [
      "Parcelas e vencimentos.",
      "Pendências e histórico.",
      "Follow-up de cobrança.",
      "Indicadores de inadimplência.",
    ],
    angle: "Material focado em reduzir cobrança manual e dar visibilidade financeira.",
  },
  {
    id: "agentes-ia-contabilidade",
    group: "IA",
    title: "Agentes de IA para Operação Contábil",
    summary: "Apoia atendimento, triagem, follow-up, organização documental e rotinas administrativas.",
    bullets: [
      "Triagem de solicitações.",
      "Resumo de documentos e conversas.",
      "Follow-up de pendências.",
      "Encaminhamento ao contador para decisões técnicas.",
    ],
    angle: "Destaque produtividade sem transferir responsabilidade técnica para a IA.",
  },
  {
    id: "portal-cliente-contabilidade",
    group: "Cliente",
    title: "Portal do Cliente",
    summary: "Centraliza documentos, pendências, solicitações e informações liberadas pelo escritório.",
    bullets: [
      "Envio e consulta de documentos.",
      "Tickets e solicitações.",
      "Pendências e prazos.",
      "Contratos e informações financeiras.",
    ],
    angle: "Mostre autonomia para o cliente e menos demandas repetitivas para a equipe.",
  },
  {
    id: "marketing-contabilidade",
    group: "Marketing",
    title: "Marketing e Conteúdo Contábil",
    summary: "Planeja conteúdo institucional e educativo por nicho, serviço e momento empresarial.",
    bullets: [
      "Conteúdo por segmento.",
      "Abertura, gestão, folha, fiscal e societário.",
      "Campanhas de diagnóstico e troca de contador.",
      "Revisão humana para conteúdos técnicos sensíveis.",
    ],
    angle: "Destaque autoridade e especialização por nicho.",
  },
  {
    id: "revenue-scout-contabilidade",
    group: "Inteligência",
    title: "Revenue Scout para Contabilidade",
    summary: "Identifica oportunidades de expansão dentro da base de clientes.",
    bullets: [
      "Serviços não contratados.",
      "Mudanças de porte, equipe ou operação.",
      "BPO, folha, societário ou consultoria.",
      "Clientes inativos e indicações.",
    ],
    angle: "Material focado em crescer dentro da carteira antes de aumentar aquisição.",
  },
  {
    id: "dashboard-contabilidade",
    group: "Inteligência",
    title: "Dashboard do Escritório Contábil",
    summary: "Consolida clientes, obrigações, tarefas, tickets, honorários e produtividade.",
    bullets: [
      "Clientes por carteira e área.",
      "Obrigações e pendências.",
      "Tickets e SLA.",
      "Receita, inadimplência e produtividade.",
    ],
    angle: "Destaque gestão do escritório baseada em dados operacionais e financeiros.",
  },
  {
    id: "pos-atendimento-contabilidade",
    group: "Relacionamento",
    title: "Pós-atendimento e Relacionamento",
    summary: "Acompanha satisfação, pendências resolvidas, novas demandas e retenção.",
    bullets: [
      "Avaliação de atendimento.",
      "Follow-up de solicitações.",
      "Reuniões de relacionamento.",
      "Novas necessidades e expansão de serviços.",
    ],
    angle: "Mostre relacionamento contínuo e redução de churn.",
  },
];


const belezaBarbeariaModules: ScopeModule[] = [
  {
    id: "captacao-beleza",
    group: "Aquisição",
    title: "Captação Local e Presença Digital",
    summary: "Atrai clientes por campanhas locais, redes sociais, Google, WhatsApp e Landing Pages.",
    bullets: [
      "Campanhas por serviço, profissional, público, bairro ou ocasião.",
      "LPs para corte, barba, coloração, manicure, estética e combos.",
      "Origem e interesse registrados no CRM.",
      "CTA para agendamento, WhatsApp ou compra de pacote.",
    ],
    angle: "Mostre como transformar visibilidade local em agenda preenchida e clientes recorrentes.",
  },
  {
    id: "agenda-beleza",
    group: "Agenda",
    title: "Agenda Inteligente",
    summary: "Organiza horários por profissional, serviço, duração e unidade.",
    bullets: [
      "Agenda por profissional e serviço.",
      "Bloqueios, intervalos e disponibilidade.",
      "Confirmação, reagendamento e lembretes.",
      "Histórico ligado ao cliente.",
    ],
    angle: "Destaque ocupação da agenda e redução de conflitos de horário.",
  },
  {
    id: "no-show-beleza",
    group: "Agenda",
    title: "Redução de No-show",
    summary: "Cria lembretes e cadências para reduzir faltas e horários vazios.",
    bullets: [
      "Confirmação antecipada.",
      "Lembretes automáticos.",
      "Lista de espera.",
      "Reaproveitamento de horários cancelados.",
    ],
    angle: "Material focado em proteger faturamento perdido por ausência.",
  },
  {
    id: "profissionais-beleza",
    group: "Equipe",
    title: "Profissionais, Especialidades e Disponibilidade",
    summary: "Organiza cabeleireiros, barbeiros, manicures, esteticistas e demais profissionais.",
    bullets: [
      "Especialidades e serviços.",
      "Agenda e disponibilidade.",
      "Comissão e metas.",
      "Histórico de atendimentos.",
    ],
    angle: "Destaque gestão de equipe e produtividade por profissional.",
  },
  {
    id: "servicos-beleza",
    group: "Serviços",
    title: "Catálogo de Serviços",
    summary: "Centraliza serviços, duração, preço, profissionais aptos e insumos relacionados.",
    bullets: [
      "Corte, barba, escova, coloração, manicure, estética e demais serviços.",
      "Duração e preço.",
      "Profissionais habilitados.",
      "Combos e adicionais.",
    ],
    angle: "Mostre serviços organizados e prontos para agenda, campanha e venda.",
  },
  {
    id: "combos-pacotes-beleza",
    group: "Serviços",
    title: "Combos, Pacotes e Assinaturas",
    summary: "Cria ofertas recorrentes e pacotes de serviços.",
    bullets: [
      "Combos de serviços.",
      "Planos mensais.",
      "Créditos ou sessões.",
      "Validade, uso e renovação.",
    ],
    angle: "Destaque recorrência e previsibilidade de receita.",
  },
  {
    id: "crm-beleza",
    group: "CRM",
    title: "CRM e Cliente 360",
    summary: "Centraliza histórico, preferências, serviços realizados e relacionamento.",
    bullets: [
      "Contato, origem e frequência.",
      "Preferências de profissional, corte, cor ou estilo.",
      "Histórico de serviços e compras.",
      "Campanhas, cupons e observações.",
    ],
    angle: "Mostre atendimento personalizado sem depender da memória da equipe.",
  },
  {
    id: "fidelidade-beleza",
    group: "Relacionamento",
    title: "Fidelidade e Clube de Vantagens",
    summary: "Cria benefícios para aumentar frequência e retenção.",
    bullets: [
      "Pontos, cashback ou vantagens.",
      "Cupons e benefícios.",
      "Recompensas por frequência.",
      "Indicação de novos clientes.",
    ],
    angle: "Destaque relacionamento contínuo e aumento de recorrência.",
  },
  {
    id: "whatsapp-beleza",
    group: "Atendimento",
    title: "WhatsApp e Atendimento Omnichannel",
    summary: "Centraliza agendamentos, dúvidas, campanhas e follow-ups.",
    bullets: [
      "Agendamento e confirmação.",
      "Envio de catálogo de serviços.",
      "Reagendamento e cancelamento.",
      "Histórico preservado no CRM.",
    ],
    angle: "Mostre WhatsApp como parte organizada da operação.",
  },
  {
    id: "estoque-beleza",
    group: "Operação",
    title: "Estoque de Produtos e Insumos",
    summary: "Controla produtos de uso interno e itens para revenda.",
    bullets: [
      "Shampoos, tinturas, cosméticos e descartáveis.",
      "Entrada, saída e consumo por serviço quando configurado.",
      "Ruptura e reposição.",
      "Produtos para venda no balcão.",
    ],
    angle: "Destaque controle de custo e oportunidade de venda complementar.",
  },
  {
    id: "venda-produtos-beleza",
    group: "Comercial",
    title: "Venda de Produtos no Balcão",
    summary: "Conecta serviços realizados a produtos de manutenção e cuidado.",
    bullets: [
      "Produtos relacionados ao serviço.",
      "Venda por profissional ou recepção.",
      "Campanhas de recompra.",
      "Ticket médio e conversão.",
    ],
    angle: "Material focado em aumentar ticket sem depender apenas de serviços.",
  },
  {
    id: "comissoes-beleza",
    group: "Financeiro",
    title: "Comissões e Repasse",
    summary: "Organiza comissões por profissional, serviço e venda de produto.",
    bullets: [
      "Percentual ou regra por serviço.",
      "Comissão por produto.",
      "Período e fechamento.",
      "Histórico e conferência.",
    ],
    angle: "Destaque transparência e redução de cálculo manual.",
  },
  {
    id: "metas-beleza",
    group: "Gestão",
    title: "Metas e Produtividade",
    summary: "Acompanha desempenho por profissional, serviço e período.",
    bullets: [
      "Atendimentos realizados.",
      "Ticket médio.",
      "Taxa de ocupação.",
      "Vendas de produtos e recorrência.",
    ],
    angle: "Mostre gestão baseada em indicadores reais da equipe.",
  },
  {
    id: "marketing-beleza",
    group: "Marketing",
    title: "Marketing Ativo para Beleza e Barbearia",
    summary: "Planeja campanhas por serviço, profissional, ocasião e perfil de cliente.",
    bullets: [
      "Calendário de conteúdo e ofertas.",
      "Campanhas sazonais.",
      "Remarketing e reativação.",
      "Promoção de profissionais e serviços.",
    ],
    angle: "Destaque marketing conectado diretamente à agenda.",
  },
  {
    id: "conteudo-beleza",
    group: "Marketing",
    title: "Conteúdo, Reels e Antes/Depois",
    summary: "Transforma trabalhos realizados em conteúdo visual para aquisição e prova social.",
    bullets: [
      "Antes e depois.",
      "Transformações e bastidores.",
      "Dicas de manutenção.",
      "Roteiros para Reels e vídeos.",
    ],
    angle: "Mostre o próprio trabalho como principal ativo de marketing.",
  },
  {
    id: "campanhas-beleza",
    group: "Marketing",
    title: "Campanhas para Preencher Agenda",
    summary: "Cria campanhas ligadas a horários disponíveis, serviços e públicos específicos.",
    bullets: [
      "Público, serviço e oferta.",
      "Profissional e horários disponíveis.",
      "WhatsApp ou agendamento como CTA.",
      "Medição até presença e recompra.",
    ],
    angle: "Destaque campanha como ferramenta para ocupar capacidade ociosa.",
  },
  {
    id: "agentes-ia-beleza",
    group: "IA",
    title: "Agentes de IA para Atendimento e Relacionamento",
    summary: "Automatiza agendamento, confirmação, follow-up e campanhas.",
    bullets: [
      "Atendimento inicial.",
      "Confirmação e reagendamento.",
      "Follow-up pós-serviço.",
      "Reativação de clientes.",
    ],
    angle: "Destaque IA liberando a recepção e a equipe para focarem no atendimento presencial.",
  },
  {
    id: "revenue-scout-beleza",
    group: "Inteligência",
    title: "Revenue Scout para Salões e Barbearias",
    summary: "Encontra oportunidades dentro da própria base de clientes.",
    bullets: [
      "Clientes inativos.",
      "Serviços com ciclo de recompra.",
      "Pacotes e assinaturas.",
      "Produtos complementares e indicações.",
    ],
    angle: "Material focado em recuperar agenda antes de investir mais em aquisição.",
  },
  {
    id: "dashboard-beleza",
    group: "Inteligência",
    title: "Dashboard Comercial e Operacional",
    summary: "Consolida agenda, faturamento, ocupação, clientes, profissionais e produtos.",
    bullets: [
      "Taxa de ocupação.",
      "Faturamento por profissional e serviço.",
      "Ticket médio e recorrência.",
      "No-show, produtos e campanhas.",
    ],
    angle: "Destaque visão rápida da saúde da operação.",
  },
  {
    id: "financeiro-beleza",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza receitas, despesas, comissões e resultado.",
    bullets: [
      "Recebimentos por serviço e produto.",
      "Despesas e compras.",
      "Comissões e repasses.",
      "Resultado por profissional e período.",
    ],
    angle: "Mostre rentabilidade além do faturamento bruto.",
  },
  {
    id: "pos-atendimento-beleza",
    group: "Pós-venda",
    title: "Pós-atendimento e Recompra",
    summary: "Acompanha satisfação e prepara o próximo agendamento.",
    bullets: [
      "Avaliação do atendimento.",
      "Follow-up pós-serviço.",
      "Lembrete de manutenção ou retorno.",
      "Indicação e recompra.",
    ],
    angle: "Destaque que o próximo atendimento começa logo após o atual.",
  },
];


const saudeClinicasModules: ScopeModule[] = [
  {
    id: "captacao-saude",
    group: "Aquisição",
    title: "Captação Ética e Presença Digital",
    summary: "Organiza presença digital, conteúdo informativo e entrada de pacientes por especialidade, unidade e tipo de atendimento.",
    bullets: [
      "Landing Pages por especialidade e serviço.",
      "Formulários de contato e agendamento.",
      "Origem do contato registrada no CRM.",
      "Comunicação sem promessa de resultado clínico.",
    ],
    angle: "Mostre aquisição organizada e responsável para clínicas e profissionais de saúde.",
  },
  {
    id: "cadastro-paciente",
    group: "CRM",
    title: "Cadastro do Paciente",
    summary: "Centraliza dados cadastrais, contatos, consentimentos e histórico administrativo do paciente.",
    bullets: [
      "Dados pessoais e contatos.",
      "Responsável quando aplicável.",
      "Consentimentos e preferências de comunicação.",
      "Histórico de relacionamento com a clínica.",
    ],
    angle: "Destaque uma visão única do paciente sem misturar dados administrativos com decisões clínicas.",
  },
  {
    id: "agenda-saude",
    group: "Agenda",
    title: "Agenda por Profissional e Especialidade",
    summary: "Organiza consultas, sessões, avaliações, procedimentos e retornos.",
    bullets: [
      "Agenda por profissional, sala e unidade.",
      "Duração por tipo de atendimento.",
      "Confirmação, reagendamento e cancelamento.",
      "Lista de espera e encaixes.",
    ],
    angle: "Mostre ocupação inteligente da agenda e redução de conflitos.",
  },
  {
    id: "no-show-saude",
    group: "Agenda",
    title: "Redução de No-show",
    summary: "Cria lembretes e cadências para reduzir faltas e horários ociosos.",
    bullets: [
      "Confirmação antecipada.",
      "Lembretes automáticos.",
      "Lista de espera.",
      "Recuperação de cancelamentos.",
    ],
    angle: "Material focado em proteger capacidade e receita perdida por ausência.",
  },
  {
    id: "triagem-administrativa-saude",
    group: "Atendimento",
    title: "Triagem Administrativa",
    summary: "Coleta informações iniciais para direcionar o paciente ao fluxo correto sem realizar diagnóstico.",
    bullets: [
      "Especialidade ou serviço procurado.",
      "Motivo informado pelo paciente.",
      "Preferência de profissional, unidade e horário.",
      "Encaminhamento humano para questões clínicas.",
    ],
    angle: "Destaque agilidade no atendimento inicial sem substituir avaliação profissional.",
  },
  {
    id: "prontuario-saude",
    group: "Clínico",
    title: "Prontuário e Histórico Clínico",
    summary: "Organiza registros clínicos sob responsabilidade do profissional habilitado.",
    bullets: [
      "Anamnese, evolução e condutas registradas pelo profissional.",
      "Exames, imagens e documentos.",
      "Histórico por paciente.",
      "Controle de acesso por perfil.",
    ],
    angle: "Mostre continuidade clínica e organização documental com governança.",
  },
  {
    id: "planos-cuidado-saude",
    group: "Clínico",
    title: "Planos de Cuidado e Tratamento",
    summary: "Permite registrar planos definidos pelo profissional e acompanhar execução, sessões e retornos.",
    bullets: [
      "Objetivos e etapas definidos pelo profissional.",
      "Sessões, retornos ou procedimentos previstos.",
      "Evolução e reavaliações.",
      "Sem decisão clínica autônoma pela IA.",
    ],
    angle: "Destaque acompanhamento estruturado mantendo a decisão clínica com o profissional.",
  },
  {
    id: "fisioterapia-saude",
    group: "Especialidades",
    title: "Fisioterapia e Reabilitação",
    summary: "Organiza avaliações, sessões, evolução funcional e recorrência de atendimento.",
    bullets: [
      "Avaliação inicial registrada pelo fisioterapeuta.",
      "Plano de sessões.",
      "Evolução e reavaliação.",
      "Agenda recorrente e faltas.",
    ],
    angle: "Mostre continuidade de sessões e visibilidade da jornada de reabilitação.",
  },
  {
    id: "nutricao-saude",
    group: "Especialidades",
    title: "Nutrição",
    summary: "Organiza consultas, retornos, registros e acompanhamento definido pelo nutricionista.",
    bullets: [
      "Avaliação e histórico registrados pelo profissional.",
      "Planos e orientações elaborados pelo nutricionista.",
      "Retornos e acompanhamento.",
      "Documentos e evolução.",
    ],
    angle: "Destaque acompanhamento contínuo sem gerar prescrição autônoma.",
  },
  {
    id: "odontologia-saude",
    group: "Especialidades",
    title: "Odontologia",
    summary: "Organiza avaliações, procedimentos, orçamentos clínicos, retornos e manutenção.",
    bullets: [
      "Plano odontológico definido pelo dentista.",
      "Procedimentos e etapas.",
      "Imagens e documentos.",
      "Retornos, manutenção e agenda.",
    ],
    angle: "Mostre jornada completa do paciente odontológico da avaliação ao acompanhamento.",
  },
  {
    id: "terapias-saude",
    group: "Especialidades",
    title: "Psicologia e Terapias",
    summary: "Organiza agenda, registros profissionais, recorrência e acompanhamento com privacidade reforçada.",
    bullets: [
      "Sessões e recorrência.",
      "Registros restritos ao profissional autorizado.",
      "Consentimentos e comunicação.",
      "Acesso administrativo separado do conteúdo clínico sensível.",
    ],
    angle: "Destaque privacidade e separação clara entre operação e conteúdo terapêutico.",
  },
  {
    id: "medicina-saude",
    group: "Especialidades",
    title: "Clínicas Médicas e Especialidades",
    summary: "Organiza consultas, retornos, exames, procedimentos e acompanhamento por especialidade.",
    bullets: [
      "Agenda por médico e especialidade.",
      "Prontuário e documentos.",
      "Pedidos e resultados anexados quando integrados.",
      "Retornos e acompanhamento.",
    ],
    angle: "Mostre uma jornada organizada do agendamento ao retorno.",
  },
  {
    id: "documentos-exames-saude",
    group: "Documentação",
    title: "Documentos, Exames e Anexos",
    summary: "Centraliza documentos clínicos e administrativos conforme permissões.",
    bullets: [
      "Exames e laudos.",
      "Termos e consentimentos.",
      "Imagens e anexos.",
      "Histórico e controle de acesso.",
    ],
    angle: "Destaque menos informação dispersa e melhor continuidade do atendimento.",
  },
  {
    id: "retornos-recorrencia-saude",
    group: "Relacionamento",
    title: "Retornos e Recorrência",
    summary: "Acompanha retornos e sessões já definidos pelo profissional.",
    bullets: [
      "Retorno recomendado registrado pelo profissional.",
      "Lembretes administrativos.",
      "Sessões recorrentes.",
      "Reativação de pacientes que interromperam o acompanhamento.",
    ],
    angle: "Mostre continuidade do cuidado e melhor ocupação da agenda.",
  },
  {
    id: "whatsapp-saude",
    group: "Atendimento",
    title: "WhatsApp e Omnichannel",
    summary: "Centraliza agendamentos, confirmações, dúvidas administrativas e follow-ups.",
    bullets: [
      "Agendamento e confirmação.",
      "Documentos e orientações administrativas.",
      "Status de solicitação.",
      "Encaminhamento ao profissional em temas clínicos.",
    ],
    angle: "Destaque atendimento rápido sem transformar WhatsApp em prontuário informal.",
  },
  {
    id: "portal-paciente-saude",
    group: "Paciente",
    title: "Portal do Paciente",
    summary: "Disponibiliza agenda, documentos e informações liberadas pela clínica.",
    bullets: [
      "Consultas e sessões.",
      "Documentos liberados.",
      "Pendências administrativas.",
      "Solicitações e comunicação.",
    ],
    angle: "Mostre autonomia do paciente e redução de demandas repetitivas.",
  },
  {
    id: "convenios-saude",
    group: "Operação",
    title: "Convênios, Particular e Formas de Atendimento",
    summary: "Organiza regras administrativas por convênio, particular, pacote ou contrato.",
    bullets: [
      "Tipo de atendimento.",
      "Tabela e condição administrativa.",
      "Autorizações e documentos quando aplicável.",
      "Faturamento e pendências.",
    ],
    angle: "Destaque organização financeira e operacional por modalidade de atendimento.",
  },
  {
    id: "orcamentos-procedimentos-saude",
    group: "Comercial",
    title: "Orçamentos e Planos Financeiros",
    summary: "Organiza valores de procedimentos e planos já definidos pela equipe profissional.",
    bullets: [
      "Procedimentos e etapas.",
      "Condições de pagamento.",
      "Versões e aceite.",
      "Sem alterar indicação clínica para adequar valor.",
    ],
    angle: "Mostre clareza financeira sem interferir na decisão clínica.",
  },
  {
    id: "financeiro-saude",
    group: "Financeiro",
    title: "Financeiro da Clínica",
    summary: "Organiza receitas, despesas, recebimentos e resultado por unidade, profissional e serviço.",
    bullets: [
      "Recebimentos particulares e convênios.",
      "Despesas e compras.",
      "Repasse por profissional quando aplicável.",
      "Indicadores por unidade e serviço.",
    ],
    angle: "Destaque rentabilidade e previsibilidade financeira.",
  },
  {
    id: "marketing-saude",
    group: "Marketing",
    title: "Marketing Institucional em Saúde",
    summary: "Planeja conteúdo informativo e institucional por especialidade respeitando regras profissionais.",
    bullets: [
      "Conteúdo educativo e institucional.",
      "Apresentação de estrutura e especialidades.",
      "Campanhas de relacionamento e prevenção quando adequadas.",
      "Sem promessa de cura ou resultado garantido.",
    ],
    angle: "Destaque autoridade e informação responsável.",
  },
  {
    id: "agentes-ia-saude",
    group: "IA",
    title: "Agentes de IA para Operação em Saúde",
    summary: "Automatiza tarefas administrativas, atendimento inicial e follow-up com limites clínicos rígidos.",
    bullets: [
      "Agendamento e confirmação.",
      "Triagem administrativa.",
      "Cobrança de documentos e pendências.",
      "Encaminhamento humano para diagnóstico, prescrição ou conduta clínica.",
    ],
    angle: "Destaque produtividade administrativa sem substituir profissionais de saúde.",
  },
  {
    id: "lgpd-saude",
    group: "Governança",
    title: "Privacidade, Consentimento e Acessos",
    summary: "Organiza consentimentos, permissões e acesso a dados sensíveis.",
    bullets: [
      "Perfis e permissões.",
      "Consentimentos e registros.",
      "Separação entre áreas administrativa e clínica.",
      "Histórico de acesso quando suportado.",
    ],
    angle: "Mostre governança para dados de saúde e informações sensíveis.",
  },
  {
    id: "dashboard-saude",
    group: "Inteligência",
    title: "Dashboard da Clínica",
    summary: "Consolida agenda, no-show, pacientes, recorrência, financeiro e operação.",
    bullets: [
      "Ocupação da agenda.",
      "No-show e cancelamentos.",
      "Retornos e recorrência.",
      "Receita por unidade, profissional e serviço.",
    ],
    angle: "Destaque gestão baseada em indicadores operacionais e financeiros.",
  },
  {
    id: "revenue-scout-saude",
    group: "Inteligência",
    title: "Revenue Scout para Clínicas",
    summary: "Identifica oportunidades administrativas legítimas dentro da base sem criar necessidades clínicas artificiais.",
    bullets: [
      "Retornos já recomendados pelo profissional.",
      "Pacientes que interromperam sessões previamente indicadas.",
      "Pacotes ou serviços administrativos já contratados.",
      "Reativação de relacionamento sem indução clínica.",
    ],
    angle: "Material focado em recuperar agenda e continuidade já indicada, sem inventar demanda médica.",
  },
  {
    id: "pos-atendimento-saude",
    group: "Relacionamento",
    title: "Pós-atendimento e Experiência do Paciente",
    summary: "Acompanha satisfação, dúvidas administrativas, retornos e experiência após o atendimento.",
    bullets: [
      "Avaliação de atendimento.",
      "Follow-up administrativo.",
      "Lembretes de retorno já definido.",
      "Tratamento de ocorrências e experiência.",
    ],
    angle: "Mostre continuidade de relacionamento e qualidade do atendimento.",
  },
];


const restaurantesDeliveryModules: ScopeModule[] = [
  { id:"captacao-restaurante", group:"Aquisição", title:"Captação Local e Digital", summary:"Atrai clientes por campanhas locais, redes sociais, Google, WhatsApp, delivery e Landing Pages.", bullets:["Campanhas por região, ocasião, tipo de cozinha e oferta.","LPs para combos, almoço, jantar, eventos e delivery.","Origem do contato e campanha registradas.","CTA para pedido, reserva, WhatsApp ou cardápio."], angle:"Mostre como transformar presença local em pedidos e recorrência." },
  { id:"cardapio-digital", group:"Cardápio", title:"Cardápio Digital", summary:"Organiza pratos, categorias, adicionais, variações, disponibilidade e preço.", bullets:["Categorias, produtos e descrições.","Adicionais, complementos e observações.","Fotos, preço e disponibilidade.","Cardápios por unidade, turno ou canal."], angle:"Destaque um cardápio único para salão, balcão, WhatsApp e delivery." },
  { id:"pedidos-restaurante", group:"Pedidos", title:"Gestão de Pedidos", summary:"Centraliza pedidos de salão, balcão, retirada, WhatsApp e tele-entrega.", bullets:["Origem do pedido.","Itens, adicionais e observações.","Status do preparo.","Pagamento, retirada ou entrega."], angle:"Mostre todos os canais entrando em um único fluxo." },
  { id:"salao-mesas", group:"Operação", title:"Salão, Mesas e Comandas", summary:"Organiza mesas, comandas, consumo e fechamento.", bullets:["Abertura e fechamento de mesa.","Pedidos por comanda.","Transferência e divisão quando suportado.","Histórico por atendimento."], angle:"Destaque agilidade no salão e menor perda de informação." },
  { id:"reservas-restaurante", group:"Atendimento", title:"Reservas e Lista de Espera", summary:"Organiza reservas, confirmação, capacidade e espera.", bullets:["Data, horário e número de pessoas.","Confirmação automática.","Lista de espera.","Histórico do cliente."], angle:"Mostre melhor ocupação sem superlotação ou mesas ociosas." },
  { id:"kds-cozinha", group:"Cozinha", title:"Cozinha / KDS e Produção", summary:"Organiza fila de preparo, prioridades e andamento dos pedidos.", bullets:["Pedidos por estação.","Tempo de preparo.","Status e prioridade.","Integração com expedição."], angle:"Destaque cozinha mais previsível e menos papel ou gritos." },
  { id:"ficha-tecnica-restaurante", group:"Custos", title:"Ficha Técnica e CMV", summary:"Relaciona cada prato a ingredientes, rendimento e custo.", bullets:["Ingredientes e quantidades.","Rendimento por receita.","Custo por porção.","CMV e margem por item."], angle:"Mostre preço baseado em custo real e não em estimativa." },
  { id:"estoque-insumos-restaurante", group:"Estoque", title:"Estoque de Insumos", summary:"Controla ingredientes, bebidas, embalagens e materiais operacionais.", bullets:["Saldo e movimentação.","Baixa por produção quando configurada.","Ruptura e mínimo.","Lotes e validade quando aplicável."], angle:"Destaque menos desperdício e mais previsibilidade de compra." },
  { id:"perdas-desperdicio-restaurante", group:"Operação", title:"Perdas e Desperdício", summary:"Registra sobras, descarte, quebra e diferenças de produção.", bullets:["Motivo da perda.","Quantidade e custo.","Perdas por insumo ou prato.","Indicadores por período."], angle:"Mostre o impacto do desperdício na margem." },
  { id:"compras-restaurante", group:"Compras", title:"Compras e Reposição", summary:"Apoia compras com base em estoque, giro e demanda.", bullets:["Necessidades de reposição.","Lista de compras.","Pedido e acompanhamento.","Histórico por fornecedor."], angle:"Destaque compras mais conectadas ao consumo real." },
  { id:"fornecedores-restaurante", group:"Compras", title:"Fornecedores e Cotações", summary:"Centraliza fornecedores, preços, prazos e condições.", bullets:["Fornecedor por insumo.","Tabela e condição.","Cotação comparativa.","Histórico de compra."], angle:"Mostre poder de negociação e controle de custo." },
  { id:"delivery-proprio", group:"Delivery", title:"Tele-entrega Própria", summary:"Organiza pedidos, expedição, entregadores, rota e comprovação.", bullets:["Separação e expedição.","Entregador responsável.","Rota e status.","Confirmação e ocorrência."], angle:"Destaque controle do pedido até a porta do cliente." },
  { id:"entregadores-rotas", group:"Delivery", title:"Entregadores e Rotas", summary:"Organiza entregadores próprios ou parceiros e distribuição de entregas.", bullets:["Disponibilidade.","Agrupamento por rota.","Status em trânsito.","Histórico por entregador."], angle:"Mostre menor atraso e melhor utilização da equipe." },
  { id:"marketplaces-delivery", group:"Canais", title:"Marketplaces de Delivery", summary:"Organiza pedidos e desempenho de canais externos quando integrados.", bullets:["Origem do pedido.","Taxas e comissões.","Produtos e preços por canal.","Comparação com canal próprio."], angle:"Destaque visão consolidada sem perder controle por canal." },
  { id:"whatsapp-restaurante", group:"Atendimento", title:"Pedidos pelo WhatsApp", summary:"Transforma conversas em pedidos estruturados e rastreáveis.", bullets:["Cardápio e seleção de itens.","Endereço e forma de entrega.","Status do pedido.","Histórico do cliente."], angle:"Mostre WhatsApp como canal operacional, não conversa solta." },
  { id:"crm-restaurante", group:"CRM", title:"CRM e Cliente 360", summary:"Centraliza clientes, frequência, pedidos, preferências comerciais e campanhas.", bullets:["Frequência e ticket.","Itens preferidos.","Cupons e campanhas.","Histórico de atendimento."], angle:"Destaque conhecimento do cliente para aumentar recompra." },
  { id:"fidelidade-restaurante", group:"Relacionamento", title:"Fidelidade e Clube de Vantagens", summary:"Cria benefícios para aumentar frequência e retenção.", bullets:["Pontos, cashback ou recompensas.","Cupons personalizados.","Benefícios por frequência.","Indicação e recompra."], angle:"Mostre recorrência além da promoção genérica." },
  { id:"combos-cupons-restaurante", group:"Marketing", title:"Combos, Cupons e Promoções", summary:"Cria ofertas por canal, horário, produto ou público.", bullets:["Combos e adicionais.","Cupom por campanha.","Promoção por período.","Medição de uso e margem."], angle:"Destaque promoção controlada e mensurável." },
  { id:"marketing-restaurante", group:"Marketing", title:"Marketing Ativo para Restaurantes", summary:"Planeja campanhas por ocasião, horário, produto e região.", bullets:["Almoço, jantar, fim de semana e datas especiais.","Campanhas de delivery e salão.","Remarketing e reativação.","Conteúdo ligado ao cardápio."], angle:"Mostre marketing conectado à capacidade e aos pedidos." },
  { id:"conteudo-restaurante", group:"Marketing", title:"Conteúdo, Reels e Vídeos", summary:"Transforma pratos, bastidores e experiências em conteúdo contínuo.", bullets:["Pratos e lançamentos.","Bastidores da cozinha.","Depoimentos e experiência.","Roteiros de Reels e vídeos."], angle:"Destaque apelo visual e prova social." },
  { id:"agentes-ia-restaurante", group:"IA", title:"Agentes de IA para Atendimento e Pedidos", summary:"Automatiza atendimento inicial, pedidos, status, reservas e follow-up.", bullets:["Atendimento e cardápio.","Reserva e pedido.","Status de entrega.","Reativação de clientes."], angle:"Destaque velocidade sem perder supervisão operacional." },
  { id:"avaliacoes-restaurante", group:"Reputação", title:"Avaliações e Experiência do Cliente", summary:"Acompanha satisfação, ocorrências e recuperação de experiência.", bullets:["Avaliação pós-pedido.","Fotos quando disponíveis.","Tratamento de reclamações.","Recuperação e nova oportunidade."], angle:"Mostre reputação como parte do processo, não só uma nota externa." },
  { id:"revenue-scout-restaurante", group:"Inteligência", title:"Revenue Scout para Restaurantes", summary:"Encontra oportunidades na base de clientes, pedidos e horários.", bullets:["Clientes inativos.","Horários de baixa demanda.","Itens complementares.","Campanhas de recompra."], angle:"Destaque receita escondida na própria base." },
  { id:"dashboard-restaurante", group:"Inteligência", title:"Dashboard Comercial e Operacional", summary:"Consolida vendas, pedidos, ticket, canais, CMV, entregas e clientes.", bullets:["Vendas por canal e período.","Ticket médio.","Tempo de preparo e entrega.","CMV, margem e recorrência."], angle:"Mostre visão integrada da operação do pedido ao resultado." },
  { id:"financeiro-restaurante", group:"Financeiro", title:"Financeiro da Operação", summary:"Organiza receitas, taxas, compras, despesas e resultado por canal.", bullets:["Recebimentos.","Taxas de marketplaces.","Compras e despesas.","Margem por canal e produto."], angle:"Destaque rentabilidade além do faturamento bruto." },
  { id:"pos-venda-restaurante", group:"Pós-venda", title:"Pós-venda e Recompra", summary:"Acompanha experiência após pedido e prepara nova compra.", bullets:["Confirmação de entrega.","Avaliação.","Tratamento de ocorrência.","Cupom, fidelidade e recompra."], angle:"Mostre que o próximo pedido começa depois da entrega atual." },
];


const academiasFitnessModules: ScopeModule[] = [
  {
    id: "captacao-fitness",
    group: "Aquisição",
    title: "Captação para Academias & Fitness",
    summary: "Atrai alunos por campanhas locais, modalidades, objetivos e perfis, conectando anúncios, Landing Pages, WhatsApp e CRM.",
    bullets: [
      "Campanhas por musculação, funcional, dança, lutas, pilates e demais modalidades.",
      "LPs para aula experimental, matrícula e planos.",
      "Origem e interesse registrados no CRM.",
      "CTA para visita, avaliação, matrícula ou WhatsApp.",
    ],
    angle: "Mostre como transformar interesse em matrícula rastreável e relacionamento contínuo.",
  },
  {
    id: "crm-alunos",
    group: "CRM",
    title: "CRM de Alunos",
    summary: "Centraliza dados, planos, histórico de atendimento, frequência e relacionamento.",
    bullets: [
      "Aluno, contatos e origem.",
      "Plano, modalidade e unidade.",
      "Histórico de visitas e interações.",
      "Campanhas, indicações e observações.",
    ],
    angle: "Destaque visão completa do aluno além da matrícula.",
  },
  {
    id: "planos-mensalidades",
    group: "Comercial",
    title: "Planos, Matrículas e Mensalidades",
    summary: "Organiza planos, recorrência, adesão, upgrades e renovações.",
    bullets: [
      "Plano mensal, trimestral, semestral ou anual.",
      "Matrícula e condições comerciais.",
      "Renovação e upgrade.",
      "Benefícios por plano.",
    ],
    angle: "Mostre previsibilidade de receita e clareza comercial.",
  },
  {
    id: "avaliacao-inicial-fitness",
    group: "Atendimento",
    title: "Avaliação Inicial",
    summary: "Organiza coleta inicial e encaminhamento ao profissional habilitado antes da prescrição de treino.",
    bullets: [
      "Objetivos informados pelo aluno.",
      "Histórico e restrições declaradas.",
      "Medidas e avaliações registradas pelo profissional.",
      "Encaminhamento para profissional responsável.",
    ],
    angle: "Destaque personalização com responsabilidade técnica.",
  },
  {
    id: "treinos-fitness",
    group: "Treinos",
    title: "Treinos e Prescrição Profissional",
    summary: "Permite registrar treinos definidos por profissionais habilitados e acompanhar execução.",
    bullets: [
      "Ficha de treino.",
      "Séries, repetições e carga.",
      "Revisões e progressões.",
      "Sem prescrição autônoma pela IA.",
    ],
    angle: "Mostre acompanhamento estruturado mantendo a responsabilidade com o profissional.",
  },
  {
    id: "personal-trainer",
    group: "Serviços",
    title: "Personal Trainer e Atendimento Individual",
    summary: "Organiza agenda, pacotes e acompanhamento individual.",
    bullets: [
      "Sessões e pacotes.",
      "Agenda por profissional.",
      "Histórico de atendimento.",
      "Renovação e recorrência.",
    ],
    angle: "Destaque gestão de serviço premium e recorrente.",
  },
  {
    id: "aulas-coletivas",
    group: "Agenda",
    title: "Aulas Coletivas e Turmas",
    summary: "Organiza grade, professores, vagas e presença.",
    bullets: [
      "Modalidade, horário e professor.",
      "Capacidade da turma.",
      "Reserva e lista de espera.",
      "Presença e recorrência.",
    ],
    angle: "Mostre ocupação eficiente das turmas e melhor experiência do aluno.",
  },
  {
    id: "checkin-academia",
    group: "Operação",
    title: "Check-in e Frequência",
    summary: "Acompanha presença, horários e padrões de frequência.",
    bullets: [
      "Check-in por unidade.",
      "Frequência semanal e mensal.",
      "Horários de pico.",
      "Sinais de queda de frequência.",
    ],
    angle: "Destaque frequência como indicador antecipado de churn.",
  },
  {
    id: "churn-retencao-fitness",
    group: "Relacionamento",
    title: "Retenção e Prevenção de Churn",
    summary: "Identifica sinais de abandono e cria ações de relacionamento.",
    bullets: [
      "Queda de frequência.",
      "Mensalidade em atraso.",
      "Plano próximo do vencimento.",
      "Campanhas de reativação.",
    ],
    angle: "Mostre como agir antes do aluno cancelar.",
  },
  {
    id: "inadimplencia-fitness",
    group: "Financeiro",
    title: "Inadimplência e Cobrança",
    summary: "Acompanha mensalidades, vencimentos e cadências de cobrança.",
    bullets: [
      "Parcelas e vencimentos.",
      "Pendências por aluno.",
      "Lembretes e follow-up.",
      "Indicadores de inadimplência.",
    ],
    angle: "Destaque redução de cobrança manual e maior previsibilidade de caixa.",
  },
  {
    id: "whatsapp-fitness",
    group: "Atendimento",
    title: "WhatsApp e Atendimento Omnichannel",
    summary: "Centraliza dúvidas, matrículas, aulas experimentais e follow-ups.",
    bullets: [
      "Informações sobre planos.",
      "Agendamento de visita ou aula experimental.",
      "Renovação e reativação.",
      "Histórico preservado no CRM.",
    ],
    angle: "Mostre atendimento rápido sem perder contexto.",
  },
  {
    id: "indicacoes-fitness",
    group: "Relacionamento",
    title: "Indicações e Programa de Benefícios",
    summary: "Cria mecanismos para alunos indicarem novos clientes.",
    bullets: [
      "Código ou vínculo de indicação.",
      "Benefícios para aluno e indicado.",
      "Campanhas de indicação.",
      "Medição de conversão.",
    ],
    angle: "Destaque crescimento orgânico a partir da própria base.",
  },
  {
    id: "loja-fitness",
    group: "Produtos",
    title: "Loja, Suplementos e Produtos",
    summary: "Organiza produtos para venda complementar na academia.",
    bullets: [
      "Suplementos, roupas, acessórios e bebidas.",
      "Estoque e preço.",
      "Venda por aluno.",
      "Campanhas de recompra.",
    ],
    angle: "Mostre aumento de ticket além da mensalidade.",
  },
  {
    id: "marketing-fitness",
    group: "Marketing",
    title: "Marketing Ativo para Academias",
    summary: "Planeja campanhas por modalidade, objetivo, horário e público.",
    bullets: [
      "Calendário de campanhas.",
      "Campanhas para matrícula e reativação.",
      "Conteúdo de modalidades e estrutura.",
      "Remarketing de interessados.",
    ],
    angle: "Destaque marketing conectado à ocupação e receita recorrente.",
  },
  {
    id: "conteudo-fitness",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Transforma rotina, modalidades, professores e estrutura em conteúdo contínuo.",
    bullets: [
      "Aulas e modalidades.",
      "Bastidores e estrutura.",
      "Histórias de comunidade sem promessas de resultado físico.",
      "Roteiros para Reels e campanhas.",
    ],
    angle: "Mostre comunidade e experiência como ativos de aquisição.",
  },
  {
    id: "agentes-ia-fitness",
    group: "IA",
    title: "Agentes de IA para Atendimento e Retenção",
    summary: "Automatiza atendimento inicial, follow-up, cobrança e reativação, sem prescrever treino.",
    bullets: [
      "Informações sobre planos.",
      "Follow-up de leads.",
      "Lembretes de renovação e cobrança.",
      "Encaminhamento ao profissional para orientações de treino ou saúde.",
    ],
    angle: "Destaque produtividade comercial com limites técnicos claros.",
  },
  {
    id: "revenue-scout-fitness",
    group: "Inteligência",
    title: "Revenue Scout para Academias",
    summary: "Encontra oportunidades de receita dentro da base de alunos.",
    bullets: [
      "Alunos inativos ou com queda de frequência.",
      "Renovações próximas.",
      "Upgrades de plano.",
      "Personal, produtos e indicações.",
    ],
    angle: "Material focado em recuperar receita antes de aumentar aquisição.",
  },
  {
    id: "dashboard-fitness",
    group: "Inteligência",
    title: "Dashboard da Academia",
    summary: "Consolida matrículas, frequência, ocupação, churn, inadimplência e receita.",
    bullets: [
      "Alunos ativos e novos.",
      "Check-ins e frequência.",
      "Churn e retenção.",
      "Receita, inadimplência e ticket.",
    ],
    angle: "Destaque gestão baseada em indicadores recorrentes.",
  },
  {
    id: "financeiro-fitness",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza mensalidades, receitas, despesas, comissões e resultado.",
    bullets: [
      "Mensalidades e recebimentos.",
      "Despesas e compras.",
      "Comissões e repasses quando aplicável.",
      "Resultado por unidade e modalidade.",
    ],
    angle: "Mostre previsibilidade e rentabilidade por unidade.",
  },
  {
    id: "pos-atendimento-fitness",
    group: "Relacionamento",
    title: "Pós-matrícula e Experiência do Aluno",
    summary: "Acompanha adaptação, satisfação e continuidade após a matrícula.",
    bullets: [
      "Contato após início.",
      "Avaliação de experiência.",
      "Identificação de barreiras de frequência.",
      "Ações de retenção e indicação.",
    ],
    angle: "Mostre que retenção começa logo após a matrícula.",
  },
];


const imobiliariasCorretoresModules: ScopeModule[] = [
  {
    id: "captacao-imobiliaria",
    group: "Aquisição",
    title: "Captação de Leads Imobiliários",
    summary: "Atrai compradores, locatários, investidores e proprietários por campanhas, portais, redes sociais, Google, WhatsApp e Landing Pages.",
    bullets: [
      "Campanhas por cidade, bairro, tipo de imóvel e faixa de valor.",
      "LPs por empreendimento, imóvel, lançamento ou objetivo.",
      "Origem, campanha e interesse registrados no CRM.",
      "CTA para visita, simulação, atendimento ou cadastro.",
    ],
    angle: "Mostre como transformar interesse em oportunidade imobiliária rastreável.",
  },
  {
    id: "captacao-imoveis",
    group: "Captação",
    title: "Captação de Imóveis",
    summary: "Organiza prospecção e entrada de imóveis para venda ou locação.",
    bullets: [
      "Proprietário e dados de contato.",
      "Tipo, localização e características do imóvel.",
      "Pretensão de venda ou locação.",
      "Status da captação e documentação pendente.",
    ],
    angle: "Destaque crescimento da carteira com processo e histórico.",
  },
  {
    id: "cadastro-imoveis",
    group: "Carteira",
    title: "Cadastro Completo de Imóveis",
    summary: "Centraliza informações comerciais, técnicas, fotos, documentos e disponibilidade.",
    bullets: [
      "Tipo, finalidade, localização, área e dormitórios.",
      "Preço, condomínio, IPTU e condições.",
      "Fotos, vídeos, tour e plantas.",
      "Características, diferenciais e status.",
    ],
    angle: "Mostre uma carteira estruturada para atendimento, portais e campanhas.",
  },
  {
    id: "proprietarios-imobiliaria",
    group: "CRM",
    title: "CRM de Proprietários",
    summary: "Organiza relacionamento com proprietários e histórico dos imóveis captados.",
    bullets: [
      "Dados do proprietário.",
      "Imóveis vinculados.",
      "Propostas, visitas e feedbacks.",
      "Documentos e comunicação.",
    ],
    angle: "Destaque transparência e relacionamento durante todo o processo.",
  },
  {
    id: "crm-compradores-locatarios",
    group: "CRM",
    title: "CRM de Compradores e Locatários",
    summary: "Centraliza perfil, necessidades, histórico e imóveis de interesse.",
    bullets: [
      "Faixa de investimento ou aluguel.",
      "Regiões e tipos de imóvel.",
      "Características desejadas.",
      "Histórico de contatos, visitas e propostas.",
    ],
    angle: "Mostre atendimento personalizado e menos lead perdido.",
  },
  {
    id: "matching-imoveis",
    group: "Inteligência",
    title: "Matching Cliente × Imóvel",
    summary: "Cruza preferências declaradas com imóveis disponíveis para apoiar o corretor.",
    bullets: [
      "Faixa de preço.",
      "Localização e tipo.",
      "Características desejadas.",
      "Lista de imóveis compatíveis para revisão humana.",
    ],
    angle: "Destaque velocidade para encontrar imóveis aderentes ao perfil.",
  },
  {
    id: "pipeline-vendas-imoveis",
    group: "Comercial",
    title: "Pipeline de Venda",
    summary: "Acompanha oportunidades desde o primeiro contato até proposta, documentação e fechamento.",
    bullets: [
      "Lead, qualificação, visita, proposta, negociação e fechamento.",
      "Corretor responsável.",
      "Próxima ação e prazo.",
      "Motivos de perda.",
    ],
    angle: "Mostre previsibilidade comercial e disciplina de follow-up.",
  },
  {
    id: "pipeline-locacao",
    group: "Locação",
    title: "Pipeline de Locação",
    summary: "Organiza atendimento de locatários desde interesse até análise, contrato e entrega de chaves.",
    bullets: [
      "Interesse e visita.",
      "Documentação e análise.",
      "Proposta e contrato.",
      "Vistoria e entrega de chaves.",
    ],
    angle: "Destaque fluidez e rastreabilidade no processo de locação.",
  },
  {
    id: "agenda-visitas-imobiliaria",
    group: "Agenda",
    title: "Agenda de Visitas",
    summary: "Organiza visitas por imóvel, corretor, cliente e horário.",
    bullets: [
      "Agendamento e confirmação.",
      "Corretor e imóvel.",
      "Lembretes automáticos.",
      "Feedback pós-visita.",
    ],
    angle: "Mostre menos conflito e melhor aproveitamento das visitas.",
  },
  {
    id: "propostas-imobiliaria",
    group: "Comercial",
    title: "Propostas e Negociação",
    summary: "Organiza valores, condições, contrapropostas e histórico da negociação.",
    bullets: [
      "Valor proposto.",
      "Condições e prazos.",
      "Contrapropostas.",
      "Histórico e responsáveis.",
    ],
    angle: "Destaque transparência e controle em negociações de alto valor.",
  },
  {
    id: "documentos-imobiliaria",
    group: "Documentação",
    title: "Documentação do Imóvel e das Partes",
    summary: "Centraliza documentos necessários por imóvel, proprietário, comprador ou locatário.",
    bullets: [
      "Documentos pessoais e cadastrais.",
      "Matrícula, certidões e documentos do imóvel.",
      "Checklists por processo.",
      "Pendências e responsáveis.",
    ],
    angle: "Mostre menos retrabalho e mais clareza documental.",
  },
  {
    id: "contratos-imobiliaria",
    group: "Documentação",
    title: "Contratos e Assinaturas",
    summary: "Organiza contratos de venda, locação e intermediação.",
    bullets: [
      "Modelos e versões.",
      "Partes envolvidas.",
      "Condições comerciais.",
      "Aceite e assinatura quando integrada.",
    ],
    angle: "Destaque continuidade do processo até a formalização.",
  },
  {
    id: "comissoes-imobiliaria",
    group: "Financeiro",
    title: "Comissões e Repasse",
    summary: "Organiza comissão por negócio, corretor, captador e parceiro.",
    bullets: [
      "Percentual ou valor.",
      "Divisão entre participantes.",
      "Status de recebimento.",
      "Histórico por negócio.",
    ],
    angle: "Mostre transparência e menos cálculo manual.",
  },
  {
    id: "portais-imobiliarios",
    group: "Canais",
    title: "Portais Imobiliários e Publicação",
    summary: "Organiza distribuição da carteira para portais e canais quando integrados.",
    bullets: [
      "Imóveis publicados.",
      "Status por canal.",
      "Leads por origem.",
      "Qualidade e atualização do anúncio.",
    ],
    angle: "Destaque carteira atualizada e origem dos leads visível.",
  },
  {
    id: "site-imobiliaria",
    group: "Canais",
    title: "Site e Busca de Imóveis",
    summary: "Disponibiliza carteira com filtros por localização, tipo, preço e características.",
    bullets: [
      "Busca e filtros.",
      "Página detalhada do imóvel.",
      "Formulário e WhatsApp.",
      "Imóveis relacionados.",
    ],
    angle: "Mostre o site como canal ativo de geração de oportunidades.",
  },
  {
    id: "whatsapp-imobiliaria",
    group: "Atendimento",
    title: "WhatsApp e Atendimento Omnichannel",
    summary: "Centraliza conversas, imóveis enviados, visitas e follow-ups.",
    bullets: [
      "Envio de imóveis.",
      "Agendamento de visitas.",
      "Follow-up de proposta.",
      "Histórico preservado no CRM.",
    ],
    angle: "Mostre atendimento contínuo sem perder o contexto do cliente.",
  },
  {
    id: "marketing-imobiliaria",
    group: "Marketing",
    title: "Marketing Imobiliário",
    summary: "Planeja conteúdo e campanhas por imóvel, bairro, empreendimento e perfil.",
    bullets: [
      "Campanhas de imóveis e lançamentos.",
      "Conteúdo sobre bairros e oportunidades.",
      "Remarketing de interessados.",
      "Captação de proprietários.",
    ],
    angle: "Destaque marketing conectado à carteira real.",
  },
  {
    id: "conteudo-imobiliaria",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos de Imóveis",
    summary: "Transforma imóveis e regiões em conteúdo visual para aquisição.",
    bullets: [
      "Tour de imóvel.",
      "Destaques e diferenciais.",
      "Bairro e localização.",
      "Roteiros para Reels e campanhas.",
    ],
    angle: "Mostre o próprio estoque de imóveis como ativo de marketing.",
  },
  {
    id: "agentes-ia-imobiliaria",
    group: "IA",
    title: "Agentes de IA para Atendimento Imobiliário",
    summary: "Automatiza atendimento inicial, qualificação, follow-up e matching, preservando supervisão humana.",
    bullets: [
      "Qualificação de perfil.",
      "Busca inicial de imóveis.",
      "Agendamento de visita.",
      "Follow-up e reativação.",
    ],
    angle: "Destaque velocidade sem substituir o corretor na negociação.",
  },
  {
    id: "revenue-scout-imobiliaria",
    group: "Inteligência",
    title: "Revenue Scout Imobiliário",
    summary: "Encontra oportunidades dentro da carteira de clientes e imóveis.",
    bullets: [
      "Leads inativos.",
      "Novos imóveis aderentes a clientes existentes.",
      "Proprietários com imóveis sem giro.",
      "Cross-sell entre compra, locação e investimento.",
    ],
    angle: "Material focado em recuperar receita antes de aumentar aquisição.",
  },
  {
    id: "dashboard-imobiliaria",
    group: "Inteligência",
    title: "Dashboard Comercial Imobiliário",
    summary: "Consolida leads, imóveis, visitas, propostas, fechamentos e corretores.",
    bullets: [
      "Leads por origem.",
      "Conversão por corretor.",
      "Imóveis com maior interesse.",
      "Visitas, propostas e fechamento.",
    ],
    angle: "Destaque gestão da operação baseada em funil e carteira.",
  },
  {
    id: "financeiro-imobiliaria",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza receitas, comissões, despesas e resultado por negócio.",
    bullets: [
      "Comissões recebidas.",
      "Repasse a corretores.",
      "Despesas comerciais.",
      "Resultado por venda, locação e corretor.",
    ],
    angle: "Mostre rentabilidade por negócio e canal.",
  },
  {
    id: "pos-venda-imobiliaria",
    group: "Pós-venda",
    title: "Pós-venda, Pós-locação e Indicações",
    summary: "Mantém relacionamento após fechamento para satisfação, indicação e novas oportunidades.",
    bullets: [
      "Acompanhamento após entrega de chaves.",
      "Avaliação da experiência.",
      "Indicações.",
      "Novas oportunidades de compra, venda ou locação.",
    ],
    angle: "Destaque que cada fechamento pode gerar a próxima oportunidade.",
  },
];


const distribuidoresAlimentosBebidasModules: ScopeModule[] = [
  {
    id: "captacao-distribuidor-alimentos",
    group: "Aquisição",
    title: "Captação B2B e Prospecção",
    summary: "Atrai e prospecta mercados, restaurantes, bares, hotéis, conveniências, padarias e demais pontos de venda.",
    bullets: [
      "Segmentação por região, perfil e potencial de compra.",
      "Prospector por sinais e perfil comercial.",
      "Landing Pages e campanhas por linha ou marca.",
      "Origem e oportunidade registradas no CRM.",
    ],
    angle: "Mostre crescimento de carteira com prospecção estruturada e menos dependência de indicação.",
  },
  {
    id: "crm-carteira-distribuidor",
    group: "CRM",
    title: "CRM de Clientes e Carteira",
    summary: "Centraliza clientes, compradores, condições, histórico e potencial comercial.",
    bullets: [
      "Empresa, responsáveis e canais.",
      "Segmento, região e rota.",
      "Histórico de pedidos e frequência.",
      "Condição comercial e potencial de compra.",
    ],
    angle: "Destaque uma carteira viva e priorizada para cada representante.",
  },
  {
    id: "representantes-distribuidor",
    group: "Comercial",
    title: "Representantes, Territórios e Carteiras",
    summary: "Organiza vendedores por região, rota, carteira, meta e desempenho.",
    bullets: [
      "Carteira por representante.",
      "Região e território.",
      "Metas e cobertura.",
      "Visitas, pedidos e conversão.",
    ],
    angle: "Mostre gestão comercial por território e carteira.",
  },
  {
    id: "catalogo-distribuidor",
    group: "Catálogo",
    title: "Catálogo por Marca, Linha e Embalagem",
    summary: "Organiza produtos por categoria, marca, linha, embalagem, unidade e aplicação comercial.",
    bullets: [
      "Alimentos, bebidas e categorias complementares.",
      "Marca, linha, sabor, volume e embalagem.",
      "SKU, EAN e unidade de venda.",
      "Imagens, preço e disponibilidade.",
    ],
    angle: "Destaque um catálogo único para vendedores, clientes e campanhas.",
  },
  {
    id: "tabelas-condicoes-distribuidor",
    group: "Comercial",
    title: "Tabelas e Condições Comerciais",
    summary: "Controla preços e condições por cliente, canal, região, volume ou campanha.",
    bullets: [
      "Tabela por perfil de cliente.",
      "Desconto e faixa de volume.",
      "Prazo e condição de pagamento.",
      "Regras de campanha e bonificação.",
    ],
    angle: "Mostre flexibilidade comercial sem perder controle de margem.",
  },
  {
    id: "pedidos-b2b-distribuidor",
    group: "Pedidos",
    title: "Pedidos B2B",
    summary: "Organiza pedidos recorrentes com produtos, quantidades, condições e status.",
    bullets: [
      "Pedido por cliente e vendedor.",
      "Itens, volumes e unidades.",
      "Condição comercial aplicada.",
      "Separação, faturamento e entrega.",
    ],
    angle: "Destaque agilidade do pedido até a entrega.",
  },
  {
    id: "pedidos-recorrentes-distribuidor",
    group: "Pedidos",
    title: "Pedidos Recorrentes e Reposição",
    summary: "Identifica ciclos de recompra e facilita reposições frequentes.",
    bullets: [
      "Frequência por cliente e item.",
      "Sugestão comercial de recompra.",
      "Lista rápida baseada em histórico.",
      "Follow-up de cliente atrasado no ciclo.",
    ],
    angle: "Mostre como recuperar pedidos antes que o cliente compre do concorrente.",
  },
  {
    id: "estoque-lotes-distribuidor",
    group: "Operação",
    title: "Estoque, Lotes e Validades",
    summary: "Controla disponibilidade, lote, validade e giro de produtos.",
    bullets: [
      "Saldo por depósito.",
      "Lote e validade.",
      "Ruptura, excesso e vencimento próximo.",
      "Reserva para pedidos.",
    ],
    angle: "Destaque redução de perdas e melhor disponibilidade comercial.",
  },
  {
    id: "compras-abastecimento-distribuidor",
    group: "Compras",
    title: "Compras e Abastecimento",
    summary: "Usa giro, estoque, carteira e demanda prevista para apoiar compras.",
    bullets: [
      "Necessidade por produto e marca.",
      "Histórico de giro.",
      "Demanda prevista por carteira.",
      "Pedido e acompanhamento.",
    ],
    angle: "Mostre abastecimento conectado à demanda real.",
  },
  {
    id: "fornecedores-industria-distribuidor",
    group: "Compras",
    title: "Indústrias, Marcas e Fornecedores",
    summary: "Centraliza fornecedores, acordos, tabelas, bonificações e histórico.",
    bullets: [
      "Fornecedor por marca e linha.",
      "Preço, prazo e condição.",
      "Bonificações e verbas quando aplicáveis.",
      "Histórico de compra e desempenho.",
    ],
    angle: "Destaque negociação e gestão de marcas em um só lugar.",
  },
  {
    id: "roteirizacao-distribuidor",
    group: "Logística",
    title: "Roteirização e Sequência de Entregas",
    summary: "Organiza entregas por região, veículo, capacidade e prioridade.",
    bullets: [
      "Pedidos por rota.",
      "Sequência de entrega.",
      "Veículo e motorista.",
      "Status e ocorrências.",
    ],
    angle: "Mostre menor custo logístico e mais previsibilidade.",
  },
  {
    id: "entrega-comprovacao-distribuidor",
    group: "Logística",
    title: "Entrega, Comprovação e Ocorrências",
    summary: "Acompanha saída, entrega, confirmação e problemas logísticos.",
    bullets: [
      "Separação e expedição.",
      "Comprovante ou foto quando aplicável.",
      "Ocorrência de falta, avaria ou devolução.",
      "Status até conclusão.",
    ],
    angle: "Destaque rastreabilidade completa da entrega.",
  },
  {
    id: "credito-cobranca-distribuidor",
    group: "Financeiro",
    title: "Crédito, Cobrança e Inadimplência",
    summary: "Organiza condições, limites, vencimentos e follow-up financeiro.",
    bullets: [
      "Limite e condição por cliente quando integrado.",
      "Parcelas e vencimentos.",
      "Cobrança e histórico.",
      "Indicadores de inadimplência.",
    ],
    angle: "Mostre crescimento de vendas com controle financeiro.",
  },
  {
    id: "comissoes-distribuidor",
    group: "Financeiro",
    title: "Comissões de Representantes",
    summary: "Organiza comissão por vendedor, cliente, produto e período.",
    bullets: [
      "Percentual ou regra por linha.",
      "Pedidos elegíveis.",
      "Estorno e ajuste quando aplicável.",
      "Fechamento por período.",
    ],
    angle: "Destaque transparência e menos cálculo manual.",
  },
  {
    id: "metas-distribuidor",
    group: "Gestão",
    title: "Metas, Cobertura e Mix",
    summary: "Acompanha desempenho por vendedor, cliente, região, marca e categoria.",
    bullets: [
      "Faturamento e volume.",
      "Cobertura de carteira.",
      "Mix por cliente.",
      "Clientes ativos e reativados.",
    ],
    angle: "Mostre gestão comercial além do faturamento bruto.",
  },
  {
    id: "marketing-trade-distribuidor",
    group: "Marketing",
    title: "Marketing e Trade por Cliente",
    summary: "Cria campanhas por região, canal, marca, categoria e oportunidade de giro.",
    bullets: [
      "Campanhas por linha e marca.",
      "Materiais para vendedores e clientes.",
      "Ações de sell-in e sell-out quando aplicáveis.",
      "Cupons, combos ou condições por campanha.",
    ],
    angle: "Destaque marketing conectado à venda e ao giro no cliente.",
  },
  {
    id: "whatsapp-distribuidor",
    group: "Atendimento",
    title: "WhatsApp e Atendimento B2B",
    summary: "Centraliza pedidos, consultas, cotações e follow-ups.",
    bullets: [
      "Consulta de catálogo e preço.",
      "Pedido e reposição.",
      "Status de entrega.",
      "Histórico preservado no CRM.",
    ],
    angle: "Mostre WhatsApp como canal de venda estruturado.",
  },
  {
    id: "agentes-ia-distribuidor",
    group: "IA",
    title: "Agentes de IA para Vendas e Carteira",
    summary: "Automatiza prospecção, follow-up, recompra, cobrança e suporte comercial.",
    bullets: [
      "Qualificação de novos clientes.",
      "Follow-up de pedido e orçamento.",
      "Reativação e recompra.",
      "Alertas de carteira para o vendedor.",
    ],
    angle: "Destaque IA aumentando cobertura sem substituir o relacionamento do representante.",
  },
  {
    id: "revenue-scout-distribuidor",
    group: "Inteligência",
    title: "Revenue Scout para Distribuidores",
    summary: "Encontra oportunidades dentro da carteira, mix e frequência de compra.",
    bullets: [
      "Cliente comprando menos.",
      "Produto ou categoria ausente no mix.",
      "Recompra atrasada.",
      "Cross-sell, reativação e expansão de carteira.",
    ],
    angle: "Material focado em encontrar receita escondida antes de buscar mais clientes.",
  },
  {
    id: "dashboard-distribuidor",
    group: "Inteligência",
    title: "Dashboard Comercial e Logístico",
    summary: "Consolida vendas, carteira, mix, estoque, rota, entrega, margem e inadimplência.",
    bullets: [
      "Vendas por vendedor, cliente, região e marca.",
      "Cobertura e frequência de carteira.",
      "Ruptura, estoque e validade.",
      "Entrega, margem e inadimplência.",
    ],
    angle: "Destaque visão integrada do comercial à logística.",
  },
  {
    id: "financeiro-distribuidor",
    group: "Financeiro",
    title: "Financeiro da Distribuição",
    summary: "Organiza receitas, compras, despesas, comissões e resultado por canal e carteira.",
    bullets: [
      "Faturamento e recebimentos.",
      "Compras e despesas.",
      "Comissões e fretes.",
      "Margem por cliente, produto e região.",
    ],
    angle: "Mostre rentabilidade por carteira e canal.",
  },
  {
    id: "pos-venda-distribuidor",
    group: "Pós-venda",
    title: "Pós-venda e Continuidade da Carteira",
    summary: "Acompanha entrega, satisfação, ocorrências e próximo ciclo de compra.",
    bullets: [
      "Confirmação de entrega.",
      "Tratamento de devoluções e avarias.",
      "Avaliação do atendimento.",
      "Preparação da próxima recompra.",
    ],
    angle: "Destaque que cada entrega já prepara o próximo pedido.",
  },
];


const distribuidoresMateriaisConstrucaoModules: ScopeModule[] = [
  {
    id: "captacao-distribuidor-materiais",
    group: "Aquisição",
    title: "Captação B2B e Prospecção",
    summary: "Prospecta lojas, construtoras, incorporadoras, empreiteiros, instaladores e profissionais por região, porte e perfil de compra.",
    bullets: [
      "Prospector por cidade, segmento, obra e potencial.",
      "Campanhas por categoria, marca ou linha.",
      "Landing Pages para novos clientes e representantes.",
      "Origem e oportunidade registradas no CRM.",
    ],
    angle: "Mostre crescimento de carteira com prospecção orientada por potencial real.",
  },
  {
    id: "crm-carteira-distribuidor-materiais",
    group: "CRM",
    title: "CRM de Clientes e Carteira",
    summary: "Centraliza lojistas, construtoras, profissionais, compradores, condições comerciais e histórico.",
    bullets: [
      "Empresa, comprador e contatos.",
      "Segmento, território e potencial.",
      "Histórico de pedidos e frequência.",
      "Mix comprado, condições e oportunidades.",
    ],
    angle: "Destaque uma carteira B2B priorizada por valor e potencial.",
  },
  {
    id: "representantes-territorios-materiais",
    group: "Comercial",
    title: "Representantes, Territórios e Carteiras",
    summary: "Organiza vendedores por região, canal, carteira, rota e meta.",
    bullets: [
      "Carteira por representante.",
      "Território e cobertura.",
      "Metas por categoria e marca.",
      "Visitas, pedidos e conversão.",
    ],
    angle: "Mostre gestão comercial por território, carteira e especialidade.",
  },
  {
    id: "catalogo-tecnico-distribuidor-materiais",
    group: "Catálogo",
    title: "Catálogo Técnico de Materiais",
    summary: "Organiza produtos por categoria, aplicação, marca, linha, unidade e características técnicas.",
    bullets: [
      "Estrutura por Categoria → Subcategoria → Nicho → Linha → Aplicação.",
      "SKU, unidade, embalagem e rendimento.",
      "Ficha técnica, imagens e documentos.",
      "Produtos substitutos e complementares.",
    ],
    angle: "Destaque catálogo técnico útil para vendas, cotação e especificação.",
  },
  {
    id: "mix-cliente-distribuidor-materiais",
    group: "Inteligência",
    title: "Mix por Cliente",
    summary: "Compara o potencial da conta com as categorias que ela já compra.",
    bullets: [
      "Categorias compradas.",
      "Categorias ausentes.",
      "Marcas e linhas ativas.",
      "Oportunidades de cross-sell.",
    ],
    angle: "Mostre receita escondida dentro da própria carteira.",
  },
  {
    id: "tabelas-condicoes-materiais",
    group: "Comercial",
    title: "Tabelas e Condições Comerciais",
    summary: "Controla preço, desconto, volume, prazo e condição por cliente, região, canal ou campanha.",
    bullets: [
      "Tabela por perfil de cliente.",
      "Faixa de volume.",
      "Desconto e condição de pagamento.",
      "Regras de campanha e bonificação.",
    ],
    angle: "Destaque flexibilidade comercial com proteção de margem.",
  },
  {
    id: "orcamentos-cotacoes-materiais",
    group: "Comercial",
    title: "Orçamentos e Cotações B2B",
    summary: "Organiza cotações de alto volume por cliente, obra, categoria e condição.",
    bullets: [
      "Lista de itens e quantidades.",
      "Condição comercial aplicada.",
      "Validade e prazo de entrega.",
      "Follow-up até fechamento.",
    ],
    angle: "Mostre velocidade e rastreabilidade em cotações complexas.",
  },
  {
    id: "pedidos-distribuidor-materiais",
    group: "Pedidos",
    title: "Pedidos B2B e Reposição",
    summary: "Organiza pedidos recorrentes e reposições por carteira.",
    bullets: [
      "Pedido por cliente, obra ou loja.",
      "Itens, quantidades e unidades.",
      "Tabela e condição aplicada.",
      "Separação, faturamento e entrega.",
    ],
    angle: "Destaque fluidez do pedido até a entrega.",
  },
  {
    id: "estoque-distribuidor-materiais",
    group: "Operação",
    title: "Estoque e Disponibilidade",
    summary: "Controla saldo, reserva, ruptura e giro por depósito e categoria.",
    bullets: [
      "Saldo por depósito.",
      "Reserva para pedido.",
      "Estoque mínimo e ruptura.",
      "Giro por item e linha.",
    ],
    angle: "Mostre disponibilidade confiável para o vendedor e o cliente.",
  },
  {
    id: "compras-distribuidor-materiais",
    group: "Compras",
    title: "Compras e Abastecimento",
    summary: "Usa giro, carteira, pedidos e previsão de demanda para apoiar reposição.",
    bullets: [
      "Necessidade por produto.",
      "Histórico de giro.",
      "Demanda por carteira e região.",
      "Pedido e acompanhamento.",
    ],
    angle: "Destaque abastecimento conectado à venda real.",
  },
  {
    id: "fornecedores-industria-materiais",
    group: "Compras",
    title: "Indústrias, Marcas e Fornecedores",
    summary: "Centraliza tabelas, acordos, bonificações, exclusividades e histórico.",
    bullets: [
      "Fornecedor por categoria e marca.",
      "Preço, prazo e condição.",
      "Campanhas e verbas.",
      "Histórico de compra e desempenho.",
    ],
    angle: "Mostre gestão profissional de fornecedores e marcas.",
  },
  {
    id: "frete-roteirizacao-materiais",
    group: "Logística",
    title: "Frete, Roteirização e Entregas",
    summary: "Organiza entregas por região, veículo, peso, volume e prioridade.",
    bullets: [
      "Pedidos por rota.",
      "Peso, volume e cubagem quando aplicável.",
      "Veículo e motorista.",
      "Status e ocorrências.",
    ],
    angle: "Destaque menor custo logístico e melhor previsibilidade.",
  },
  {
    id: "obra-destino-materiais",
    group: "Logística",
    title: "Entrega Direta em Obra",
    summary: "Permite vincular pedido, endereço da obra, responsável e comprovação de entrega.",
    bullets: [
      "Obra e cliente vinculados.",
      "Janela de entrega.",
      "Responsável pelo recebimento.",
      "Foto, assinatura ou ocorrência quando configurado.",
    ],
    angle: "Mostre rastreabilidade até o destino final da obra.",
  },
  {
    id: "credito-cobranca-materiais",
    group: "Financeiro",
    title: "Crédito, Cobrança e Inadimplência",
    summary: "Organiza limites, condições, vencimentos e histórico financeiro.",
    bullets: [
      "Limite por cliente quando integrado.",
      "Parcelas e vencimentos.",
      "Cobrança e follow-up.",
      "Indicadores de inadimplência.",
    ],
    angle: "Mostre crescimento com controle de risco comercial.",
  },
  {
    id: "comissoes-distribuidor-materiais",
    group: "Financeiro",
    title: "Comissões e Repasse Comercial",
    summary: "Calcula e acompanha comissão por vendedor, categoria, marca ou cliente.",
    bullets: [
      "Regra por linha ou produto.",
      "Pedidos elegíveis.",
      "Ajustes e estornos.",
      "Fechamento por período.",
    ],
    angle: "Destaque transparência e menos cálculo manual.",
  },
  {
    id: "metas-distribuidor-materiais",
    group: "Gestão",
    title: "Metas, Cobertura e Desempenho",
    summary: "Acompanha venda, cobertura, mix, margem e atividade por representante.",
    bullets: [
      "Faturamento e margem.",
      "Cobertura de carteira.",
      "Mix por cliente.",
      "Clientes ativos e reativados.",
    ],
    angle: "Mostre gestão comercial além do faturamento.",
  },
  {
    id: "marketing-trade-materiais",
    group: "Marketing",
    title: "Marketing e Trade B2B",
    summary: "Cria campanhas por marca, categoria, região, cliente e etapa da obra.",
    bullets: [
      "Campanhas por linha e fornecedor.",
      "Materiais para vendedores e clientes.",
      "Ações de lançamento e giro.",
      "Campanhas por etapa construtiva.",
    ],
    angle: "Destaque marketing conectado à venda técnica e ao giro.",
  },
  {
    id: "whatsapp-distribuidor-materiais",
    group: "Atendimento",
    title: "WhatsApp e Atendimento B2B",
    summary: "Centraliza cotações, pedidos, consultas e follow-ups.",
    bullets: [
      "Consulta de catálogo e preço.",
      "Orçamento e pedido.",
      "Status de entrega.",
      "Histórico preservado no CRM.",
    ],
    angle: "Mostre WhatsApp como canal comercial estruturado.",
  },
  {
    id: "agentes-ia-distribuidor-materiais",
    group: "IA",
    title: "Agentes de IA para Vendas B2B",
    summary: "Automatiza prospecção, follow-up, recompra e suporte comercial.",
    bullets: [
      "Qualificação de novos clientes.",
      "Follow-up de cotação.",
      "Reativação e recompra.",
      "Alertas de carteira e mix.",
    ],
    angle: "Destaque IA aumentando cobertura da equipe comercial.",
  },
  {
    id: "revenue-scout-distribuidor-materiais",
    group: "Inteligência",
    title: "Revenue Scout para Distribuidores",
    summary: "Identifica oportunidades por obra, cliente, categoria, frequência e mix.",
    bullets: [
      "Cliente comprando menos.",
      "Categoria ausente no mix.",
      "Obra em nova etapa.",
      "Recompra atrasada e cross-sell.",
    ],
    angle: "Material focado em encontrar receita escondida na carteira.",
  },
  {
    id: "dashboard-distribuidor-materiais",
    group: "Inteligência",
    title: "Dashboard Comercial e Logístico",
    summary: "Consolida vendas, margem, estoque, carteira, entregas, metas e inadimplência.",
    bullets: [
      "Vendas por vendedor, cliente, região e marca.",
      "Margem e mix.",
      "Estoque e ruptura.",
      "Entrega e inadimplência.",
    ],
    angle: "Destaque visão integrada do comercial à logística.",
  },
  {
    id: "financeiro-distribuidor-materiais",
    group: "Financeiro",
    title: "Financeiro da Distribuição",
    summary: "Organiza receitas, compras, fretes, comissões, despesas e resultado.",
    bullets: [
      "Faturamento e recebimentos.",
      "Compras e despesas.",
      "Fretes e comissões.",
      "Margem por cliente, categoria e região.",
    ],
    angle: "Mostre rentabilidade por carteira e canal.",
  },
  {
    id: "pos-venda-distribuidor-materiais",
    group: "Pós-venda",
    title: "Pós-venda e Próxima Compra",
    summary: "Acompanha entrega, satisfação, ocorrências e próximo ciclo de compra ou etapa da obra.",
    bullets: [
      "Confirmação de entrega.",
      "Tratamento de avarias ou devoluções.",
      "Avaliação do atendimento.",
      "Preparação da próxima necessidade.",
    ],
    angle: "Destaque que cada entrega já prepara o próximo pedido.",
  },
];


const veiculosMobilidadeModules: ScopeModule[] = [
  {
    id: "captacao-veiculos",
    group: "Aquisição",
    title: "Captação de Leads para Veículos",
    summary: "Atrai interessados por modelo, faixa de preço, categoria, marca, combustível e perfil de uso.",
    bullets: [
      "Campanhas para 0 km, seminovos, motos e elétricos.",
      "Landing Pages por veículo, campanha ou condição.",
      "Origem e interesse registrados no CRM.",
      "CTA para simulação, avaliação, proposta ou test-drive.",
    ],
    angle: "Mostre como transformar interesse em oportunidade comercial rastreável.",
  },
  {
    id: "estoque-veiculos",
    group: "Estoque",
    title: "Estoque de Veículos",
    summary: "Centraliza veículos disponíveis com dados comerciais, técnicos e documentação.",
    bullets: [
      "Marca, modelo, versão, ano e quilometragem.",
      "Cor, combustível, câmbio e opcionais.",
      "Preço, custo, margem e status.",
      "Fotos, vídeos e documentação.",
    ],
    angle: "Destaque uma vitrine única para loja, site, anúncios e vendedores.",
  },
  {
    id: "zero-km-veiculos",
    group: "Segmentos",
    title: "Veículos 0 km",
    summary: "Organiza estoque, versões, condições e campanhas para veículos novos.",
    bullets: [
      "Versões e configurações.",
      "Tabela e condição comercial.",
      "Campanhas e bônus.",
      "Pedidos e disponibilidade.",
    ],
    angle: "Mostre controle comercial por modelo, versão e campanha.",
  },
  {
    id: "seminovos-veiculos",
    group: "Segmentos",
    title: "Seminovos e Usados",
    summary: "Controla avaliação, preparação, entrada em estoque, preço e giro.",
    bullets: [
      "Origem do veículo.",
      "Avaliação e custo de preparação.",
      "Preço, margem e tempo em estoque.",
      "Histórico e documentação.",
    ],
    angle: "Destaque giro de estoque e margem por unidade.",
  },
  {
    id: "motos-veiculos",
    group: "Segmentos",
    title: "Motos",
    summary: "Organiza motos novas e usadas com estoque, condições e perfil de uso.",
    bullets: [
      "Cilindrada, categoria e versão.",
      "Novas e seminovas.",
      "Acessórios e equipamentos relacionados.",
      "Condições e campanhas.",
    ],
    angle: "Mostre uma operação de motos com a mesma inteligência do automotivo.",
  },
  {
    id: "mobilidade-eletrica",
    group: "Segmentos",
    title: "Mobilidade Elétrica",
    summary: "Organiza carros, motos, scooters e demais veículos elétricos com atributos específicos.",
    bullets: [
      "Autonomia e capacidade de bateria.",
      "Tipo de carregamento e tempo estimado.",
      "Garantia de bateria e veículo.",
      "Acessórios, carregadores e infraestrutura relacionada.",
    ],
    angle: "Destaque os dados que realmente diferenciam a compra de um veículo elétrico.",
  },
  {
    id: "crm-veiculos",
    group: "CRM",
    title: "CRM de Clientes e Oportunidades",
    summary: "Centraliza perfil, veículo de interesse, histórico, propostas e próximos passos.",
    bullets: [
      "Cliente e contatos.",
      "Veículos de interesse.",
      "Faixa de preço e forma de pagamento.",
      "Histórico de conversas, visitas e propostas.",
    ],
    angle: "Mostre atendimento consultivo com contexto preservado.",
  },
  {
    id: "avaliacao-troca-veiculos",
    group: "Comercial",
    title: "Avaliação e Veículo na Troca",
    summary: "Organiza avaliação de veículo usado como parte da negociação.",
    bullets: [
      "Dados do veículo.",
      "Quilometragem e condição.",
      "Fotos e observações.",
      "Valor de avaliação e proposta de troca.",
    ],
    angle: "Destaque transparência e agilidade na composição do negócio.",
  },
  {
    id: "test-drive-veiculos",
    group: "Agenda",
    title: "Test-drive e Visitas",
    summary: "Agenda test-drives por veículo, vendedor e cliente.",
    bullets: [
      "Data, horário e veículo.",
      "Vendedor responsável.",
      "Confirmação e lembrete.",
      "Feedback após test-drive.",
    ],
    angle: "Mostre conversão maior com acompanhamento de cada experiência.",
  },
  {
    id: "propostas-veiculos",
    group: "Comercial",
    title: "Propostas e Negociação",
    summary: "Organiza preço, entrada, troca, financiamento, acessórios e contrapropostas.",
    bullets: [
      "Valor do veículo.",
      "Entrada e veículo na troca.",
      "Condições e acessórios.",
      "Histórico de negociação.",
    ],
    angle: "Destaque controle completo de negociações de alto valor.",
  },
  {
    id: "financiamento-veiculos",
    group: "Financeiro",
    title: "Financiamento e Simulações",
    summary: "Organiza propostas financeiras e simulações sem prometer aprovação.",
    bullets: [
      "Entrada e prazo.",
      "Instituição financeira.",
      "Simulações e condições.",
      "Status da análise.",
    ],
    angle: "Mostre apoio à venda sem transformar simulação em garantia de crédito.",
  },
  {
    id: "documentacao-veiculos",
    group: "Documentação",
    title: "Documentação e Transferência",
    summary: "Centraliza documentos do cliente e do veículo durante a venda.",
    bullets: [
      "Checklist documental.",
      "Documentos do veículo.",
      "Pendências de transferência.",
      "Status até conclusão.",
    ],
    angle: "Destaque menos retrabalho no fechamento.",
  },
  {
    id: "comissoes-veiculos",
    group: "Financeiro",
    title: "Comissões de Vendedores",
    summary: "Organiza comissão por venda, margem, financiamento e produtos adicionais.",
    bullets: [
      "Comissão por veículo.",
      "Regras por campanha.",
      "Bônus e adicionais.",
      "Fechamento por período.",
    ],
    angle: "Mostre transparência e menos cálculo manual.",
  },
  {
    id: "portais-veiculos",
    group: "Canais",
    title: "Portais e Anúncios de Veículos",
    summary: "Organiza publicação de estoque em portais e canais digitais quando integrados.",
    bullets: [
      "Veículos publicados.",
      "Status do anúncio.",
      "Leads por origem.",
      "Atualização de preço e disponibilidade.",
    ],
    angle: "Destaque estoque atualizado e origem dos leads visível.",
  },
  {
    id: "site-veiculos",
    group: "Canais",
    title: "Site e Vitrine Digital",
    summary: "Disponibiliza estoque com filtros e páginas detalhadas.",
    bullets: [
      "Busca por marca, modelo, preço e categoria.",
      "Página do veículo.",
      "Simulação e WhatsApp.",
      "Veículos relacionados.",
    ],
    angle: "Mostre o site como vendedor ativo da loja.",
  },
  {
    id: "whatsapp-veiculos",
    group: "Atendimento",
    title: "WhatsApp e Atendimento Omnichannel",
    summary: "Centraliza conversas, veículos enviados, propostas e follow-ups.",
    bullets: [
      "Envio de veículos e condições.",
      "Agendamento de visita ou test-drive.",
      "Follow-up de proposta.",
      "Histórico preservado no CRM.",
    ],
    angle: "Mostre atendimento contínuo sem perder contexto.",
  },
  {
    id: "marketing-veiculos",
    group: "Marketing",
    title: "Marketing Automotivo",
    summary: "Planeja campanhas por modelo, categoria, condição, público e estoque parado.",
    bullets: [
      "Campanhas de estoque.",
      "Lançamentos e oportunidades.",
      "Remarketing de interessados.",
      "Captação de veículos para troca ou compra.",
    ],
    angle: "Destaque marketing conectado ao estoque real.",
  },
  {
    id: "agentes-ia-veiculos",
    group: "IA",
    title: "Agentes de IA para Vendas Automotivas",
    summary: "Automatiza atendimento inicial, qualificação, follow-up e reativação.",
    bullets: [
      "Qualificação por perfil e orçamento.",
      "Busca inicial de veículos.",
      "Agendamento de test-drive.",
      "Follow-up de propostas.",
    ],
    angle: "Destaque velocidade comercial sem substituir o vendedor na negociação.",
  },
  {
    id: "pos-venda-veiculos",
    group: "Pós-venda",
    title: "Pós-venda e Relacionamento",
    summary: "Acompanha entrega, satisfação, manutenção, recompra e indicação.",
    bullets: [
      "Entrega técnica.",
      "Avaliação da experiência.",
      "Lembretes de manutenção quando aplicável.",
      "Recompra e indicação.",
    ],
    angle: "Mostre que a venda inicia um novo ciclo de relacionamento.",
  },
  {
    id: "oficina-servicos-veiculos",
    group: "Serviços",
    title: "Oficina, Revisões e Serviços",
    summary: "Organiza serviços pós-venda quando a operação também possui oficina.",
    bullets: [
      "Agenda de serviços.",
      "Ordem de serviço.",
      "Peças e mão de obra.",
      "Histórico por veículo.",
    ],
    angle: "Destaque receita recorrente após a venda.",
  },
  {
    id: "revenue-scout-veiculos",
    group: "Inteligência",
    title: "Revenue Scout Automotivo",
    summary: "Encontra oportunidades dentro da base de clientes e estoque.",
    bullets: [
      "Clientes com potencial de troca.",
      "Veículos parados em estoque.",
      "Propostas sem fechamento.",
      "Acessórios, serviços e recompra.",
    ],
    angle: "Material focado em recuperar receita antes de aumentar aquisição.",
  },
  {
    id: "dashboard-veiculos",
    group: "Inteligência",
    title: "Dashboard Comercial Automotivo",
    summary: "Consolida leads, estoque, test-drives, propostas, vendas, margem e giro.",
    bullets: [
      "Leads por origem.",
      "Conversão por vendedor.",
      "Dias em estoque.",
      "Margem e vendas por categoria.",
    ],
    angle: "Destaque gestão baseada em giro, conversão e margem.",
  },
  {
    id: "financeiro-veiculos",
    group: "Financeiro",
    title: "Financeiro da Operação",
    summary: "Organiza receitas, custos, comissões, despesas e resultado por veículo.",
    bullets: [
      "Venda e recebimentos.",
      "Custo de aquisição e preparação.",
      "Comissões e despesas.",
      "Margem por unidade e categoria.",
    ],
    angle: "Mostre rentabilidade por veículo, não apenas faturamento.",
  },
];


const autopecasCentroAutomotivoModules: ScopeModule[] = [
  { id:"captacao-autopecas", group:"Aquisição", title:"Captação Local e B2B", summary:"Atrai consumidores, oficinas, frotistas e empresas por região, tipo de veículo e necessidade.", bullets:["Campanhas por peça, serviço, marca e veículo.","Prospecção de oficinas e frotas.","Landing Pages por categoria ou serviço.","Origem e interesse registrados no CRM."], angle:"Mostre aquisição conectada a veículo, necessidade e potencial de recorrência." },
  { id:"crm-veiculo-autopecas", group:"CRM", title:"CRM por Cliente e Veículo", summary:"Centraliza cliente, veículos, placa, chassi, histórico de peças, serviços e oportunidades.", bullets:["Cliente e contatos.","Placa, chassi, marca, modelo e ano.","Histórico de compras e serviços.","Próximas necessidades e revisões."], angle:"Destaque relacionamento baseado no veículo real do cliente." },
  { id:"busca-placa-chassi", group:"Catálogo", title:"Busca por Placa e Chassi", summary:"Ajuda a identificar o veículo correto para filtrar peças compatíveis quando houver fonte integrada.", bullets:["Identificação do veículo.","Marca, modelo, versão e ano.","Compatibilidade de aplicação.","Redução de erro de peça."], angle:"Mostre velocidade na identificação e menos devoluções por incompatibilidade." },
  { id:"catalogo-autopecas", group:"Catálogo", title:"Catálogo Técnico de Autopeças", summary:"Organiza peças por sistema, aplicação, fabricante, código e veículo compatível.", bullets:["Categoria e subcategoria.","Marca, fabricante e código.","Aplicação por veículo.","Originais, similares e alternativas comerciais."], angle:"Destaque catálogo técnico conectado à compatibilidade." },
  { id:"compatibilidade-autopecas", group:"Catálogo", title:"Compatibilidade Peça × Veículo", summary:"Relaciona cada item aos veículos e versões compatíveis.", bullets:["Marca, modelo, motor e ano.","Código original e equivalentes.","Aplicação e observações.","Alternativas compatíveis para revisão humana."], angle:"Mostre menos erro de venda e atendimento mais técnico." },
  { id:"estoque-autopecas", group:"Estoque", title:"Estoque e Disponibilidade", summary:"Controla saldo, localização, giro, ruptura e reserva de peças.", bullets:["Saldo por loja ou depósito.","Estoque mínimo.","Reserva para orçamento ou OS.","Itens parados e alto giro."], angle:"Destaque disponibilidade real no momento da venda." },
  { id:"orcamento-autopecas", group:"Comercial", title:"Orçamento de Peças e Serviços", summary:"Monta orçamentos com peças, mão de obra, descontos e condições.", bullets:["Peças e quantidades.","Serviços e mão de obra.","Desconto e condição.","Conversão do orçamento em venda ou OS."], angle:"Mostre orçamento rápido e rastreável." },
  { id:"ordem-servico-auto", group:"Oficina", title:"Ordem de Serviço", summary:"Organiza veículo, serviços, peças, responsável, prazo e status.", bullets:["Entrada do veículo.","Diagnóstico registrado pelo profissional.","Peças e serviços autorizados.","Status até entrega."], angle:"Destaque fluxo completo da recepção à entrega." },
  { id:"agenda-oficina", group:"Oficina", title:"Agenda da Oficina", summary:"Organiza horários por box, técnico e tipo de serviço.", bullets:["Agendamento por serviço.","Capacidade por box ou equipe.","Confirmação e lembretes.","Histórico por veículo."], angle:"Mostre melhor uso da capacidade da oficina." },
  { id:"revisoes-manutencao", group:"Pós-venda", title:"Revisões e Manutenção Preventiva", summary:"Acompanha ciclos de manutenção definidos pelo fabricante ou profissional.", bullets:["Quilometragem e data.","Serviços realizados.","Próxima revisão registrada.","Lembretes de retorno."], angle:"Destaque recorrência e retenção sem inventar necessidade técnica." },
  { id:"pneus-alinhamento", group:"Serviços", title:"Pneus, Alinhamento e Balanceamento", summary:"Organiza pneus, medidas, estoque e serviços relacionados.", bullets:["Medida, índice e aplicação.","Estoque por marca e modelo.","Montagem, alinhamento e balanceamento.","Histórico por veículo."], angle:"Mostre venda de produto e serviço no mesmo fluxo." },
  { id:"compras-autopecas", group:"Compras", title:"Compras e Reposição", summary:"Apoia reposição com base em giro, estoque mínimo e demanda.", bullets:["Necessidade por item.","Histórico de giro.","Pedido a fornecedor.","Acompanhamento de entrega."], angle:"Destaque compra conectada ao giro real." },
  { id:"fornecedores-autopecas", group:"Compras", title:"Fornecedores e Distribuidores", summary:"Centraliza fornecedores, tabelas, prazos e condições.", bullets:["Fornecedor por linha.","Preço e prazo.","Cotações e comparação.","Histórico de compra."], angle:"Mostre melhores decisões de compra." },
  { id:"b2b-oficinas-frotas", group:"B2B", title:"Oficinas, Frotas e Clientes Empresariais", summary:"Organiza carteiras B2B com condição, recorrência e atendimento dedicado.", bullets:["Oficinas parceiras.","Frotistas e empresas.","Tabela e condição comercial.","Pedidos recorrentes e crédito."], angle:"Destaque expansão de receita por carteira B2B." },
  { id:"garantias-devolucoes-autopecas", group:"Pós-venda", title:"Garantias, Trocas e Devoluções", summary:"Controla ocorrências por peça, serviço e fornecedor.", bullets:["Item e nota relacionada.","Motivo e evidências.","Fornecedor e prazo.","Status até solução."], angle:"Mostre rastreabilidade e redução de conflitos." },
  { id:"whatsapp-autopecas", group:"Atendimento", title:"WhatsApp e Atendimento Omnichannel", summary:"Centraliza consultas de peças, orçamentos, pedidos e follow-ups.", bullets:["Busca por veículo e necessidade.","Envio de orçamento.","Status de pedido ou OS.","Histórico preservado no CRM."], angle:"Mostre WhatsApp como canal técnico e comercial estruturado." },
  { id:"marketing-autopecas", group:"Marketing", title:"Marketing Automotivo", summary:"Planeja campanhas por veículo, categoria, serviço e perfil de cliente.", bullets:["Campanhas de revisão e manutenção.","Ofertas por categoria.","Conteúdo técnico e educativo.","Remarketing e reativação."], angle:"Destaque marketing conectado ao veículo e ao histórico do cliente." },
  { id:"agentes-ia-autopecas", group:"IA", title:"Agentes de IA para Autopeças", summary:"Automatiza atendimento inicial, busca assistida, follow-up e reativação.", bullets:["Identificação inicial do veículo.","Busca orientada no catálogo.","Follow-up de orçamento.","Reativação de clientes."], angle:"Destaque velocidade sem substituir diagnóstico mecânico profissional." },
  { id:"revenue-scout-autopecas", group:"Inteligência", title:"Revenue Scout para Autopeças", summary:"Encontra oportunidades na base de clientes, veículos, estoque e frequência.", bullets:["Clientes inativos.","Orçamentos não fechados.","Peças e serviços complementares.","Ciclos de manutenção já registrados."], angle:"Material focado em recuperar receita dentro da base." },
  { id:"dashboard-autopecas", group:"Inteligência", title:"Dashboard Comercial e Operacional", summary:"Consolida vendas, orçamento, estoque, OS, giro e recorrência.", bullets:["Vendas por categoria e vendedor.","Conversão de orçamento.","Giro e ruptura de estoque.","Receita por serviço e cliente."], angle:"Destaque gestão integrada de loja e oficina." },
  { id:"financeiro-autopecas", group:"Financeiro", title:"Financeiro da Operação", summary:"Organiza receitas, custos, compras, margem e resultado.", bullets:["Vendas e recebimentos.","Compras e despesas.","Margem por peça e serviço.","Resultado por unidade e canal."], angle:"Mostre rentabilidade além do faturamento." },
  { id:"pos-venda-autopecas", group:"Pós-venda", title:"Pós-venda e Próxima Necessidade", summary:"Acompanha satisfação, garantia, revisão e próxima oportunidade.", bullets:["Confirmação de serviço ou entrega.","Avaliação.","Tratamento de ocorrência.","Lembrete de próxima revisão registrada."], angle:"Destaque relacionamento contínuo com o veículo e o cliente." },
];



const hoteisPousadasModules: ScopeModule[] = [
  { id:"captacao-hotel", group:"Aquisição", title:"Captação e Reservas Diretas", summary:"Atrai hóspedes por campanhas, Google, redes sociais, site e WhatsApp.", bullets:["Campanhas por período, público e experiência.","Landing Pages e motor de contato/reserva.","Origem do hóspede no CRM.","Remarketing de interessados."], angle:"Mostre como aumentar reservas diretas e reduzir dependência de intermediários." },
  { id:"reservas-hotel", group:"Reservas", title:"Reservas e Disponibilidade", summary:"Organiza quartos, datas, tarifas, ocupação e status.", bullets:["Disponibilidade por categoria.","Tarifas e pacotes.","Reserva, alteração e cancelamento.","Mapa de ocupação."], angle:"Destaque controle de ocupação e previsibilidade." },
  { id:"hospede-crm", group:"CRM", title:"CRM de Hóspedes", summary:"Centraliza perfil, histórico, preferências e estadias.", bullets:["Dados e contatos.","Histórico de reservas.","Preferências e observações.","Campanhas e recorrência."], angle:"Mostre relacionamento que continua após o checkout." },
  { id:"checkin-checkout-hotel", group:"Operação", title:"Check-in, Check-out e Hospedagem", summary:"Organiza chegada, permanência, consumo e saída.", bullets:["Pré-check-in.","Status do quarto.","Consumos e adicionais.","Check-out e avaliação."], angle:"Destaque uma jornada sem atritos." },
  { id:"housekeeping-hotel", group:"Operação", title:"Governança e Limpeza", summary:"Controla quartos limpos, ocupados, manutenção e liberação.", bullets:["Status do quarto.","Tarefas de limpeza.","Inspeção e liberação.","Ocorrências."], angle:"Mostre integração entre recepção e governança." },
  { id:"upsell-hotel", group:"Comercial", title:"Upsell e Experiências", summary:"Oferece adicionais relevantes antes e durante a hospedagem.", bullets:["Café, estacionamento e late checkout.","Passeios e experiências.","Upgrade de categoria.","Pacotes e datas especiais."], angle:"Destaque aumento de receita por hóspede." },
  { id:"whatsapp-hotel", group:"Atendimento", title:"WhatsApp e Concierge", summary:"Centraliza dúvidas, reservas, solicitações e pós-estadia.", bullets:["Reserva e confirmação.","Solicitações durante hospedagem.","Informações locais.","Follow-up pós-checkout."], angle:"Mostre atendimento rápido com contexto do hóspede." },
  { id:"revenue-scout-hotel", group:"Inteligência", title:"Revenue Scout para Hospedagem", summary:"Encontra oportunidades de retorno, upsell e ocupação.", bullets:["Hóspedes recorrentes.","Períodos de baixa ocupação.","Reservas abandonadas.","Campanhas por perfil e sazonalidade."], angle:"Mostre receita escondida na base e na ocupação ociosa." },
  { id:"dashboard-hotel", group:"Inteligência", title:"Dashboard de Hospedagem", summary:"Consolida ocupação, diária média, reservas, canais e receita.", bullets:["Ocupação.","Receita por canal.","Reservas diretas versus intermediadas.","Recorrência e avaliações."], angle:"Destaque gestão comercial e operacional integrada." },
];

const escolasCursosModules: ScopeModule[] = [
  { id:"captacao-educacao", group:"Aquisição", title:"Captação de Alunos", summary:"Atrai interessados por curso, turma, faixa etária e objetivo.", bullets:["Campanhas por curso e unidade.","Landing Pages de matrícula.","Aula experimental quando aplicável.","Origem e interesse no CRM."], angle:"Mostre o funil completo do lead à matrícula." },
  { id:"crm-alunos-educacao", group:"CRM", title:"CRM de Alunos e Responsáveis", summary:"Centraliza aluno, responsável, histórico e relacionamento.", bullets:["Dados cadastrais.","Responsáveis e contatos.","Curso, turma e unidade.","Histórico comercial e acadêmico administrativo."], angle:"Destaque visão única do relacionamento." },
  { id:"matriculas-educacao", group:"Comercial", title:"Matrículas e Contratos", summary:"Organiza proposta, matrícula, documentos, contrato e aceite.", bullets:["Plano e turma.","Documentos pendentes.","Contrato e condições.","Status da matrícula."], angle:"Mostre menos abandono entre interesse e início." },
  { id:"turmas-calendario", group:"Operação", title:"Turmas, Agenda e Calendário", summary:"Organiza turmas, professores, salas e horários.", bullets:["Capacidade por turma.","Calendário de aulas.","Professor e sala.","Reposições e eventos."], angle:"Destaque ocupação e organização acadêmica." },
  { id:"mensalidades-educacao", group:"Financeiro", title:"Mensalidades e Inadimplência", summary:"Acompanha cobranças, vencimentos e pendências.", bullets:["Parcelas e vencimentos.","Lembretes e cobrança.","Descontos e bolsas quando aplicável.","Indicadores de inadimplência."], angle:"Mostre previsibilidade financeira." },
  { id:"retencao-rematricula", group:"Relacionamento", title:"Retenção e Rematrícula", summary:"Identifica alunos em risco e prepara renovação.", bullets:["Frequência e engajamento administrativo.","Sinais de cancelamento.","Campanhas de rematrícula.","Reativação de ex-alunos."], angle:"Destaque retenção antes de nova aquisição." },
  { id:"whatsapp-educacao", group:"Atendimento", title:"WhatsApp e Atendimento", summary:"Centraliza dúvidas, matrícula, documentos e comunicação.", bullets:["Informações sobre cursos.","Agendamento de visita.","Pendências de matrícula.","Follow-up."], angle:"Mostre atendimento rápido e rastreável." },
  { id:"revenue-scout-educacao", group:"Inteligência", title:"Revenue Scout para Educação", summary:"Encontra oportunidades de rematrícula, novos cursos e indicações.", bullets:["Ex-alunos.","Cursos complementares.","Turmas com vagas.","Indicações e familiares."], angle:"Mostre crescimento dentro da própria base." },
  { id:"dashboard-educacao", group:"Inteligência", title:"Dashboard Educacional", summary:"Consolida leads, matrículas, ocupação, retenção e financeiro.", bullets:["Conversão por curso.","Vagas e ocupação.","Cancelamentos e rematrículas.","Receita e inadimplência."], angle:"Destaque gestão baseada em funil e permanência." },
];

const energiaSolarModules: ScopeModule[] = [
  { id:"captacao-solar", group:"Aquisição", title:"Captação para Energia Solar", summary:"Atrai residências, empresas e propriedades rurais por perfil de consumo e região.", bullets:["Campanhas por economia e geração própria.","Landing Pages com diagnóstico inicial.","Conta de energia como entrada de dados.","Origem e interesse no CRM."], angle:"Mostre aquisição baseada em potencial real de projeto." },
  { id:"diagnostico-solar", group:"Pré-venda", title:"Diagnóstico e Dimensionamento Comercial", summary:"Organiza consumo, local, tarifa e premissas para estudo técnico.", bullets:["Histórico de consumo.","Local da instalação.","Tipo de telhado ou área.","Premissas para revisão técnica."], angle:"Destaque velocidade sem substituir projeto de engenharia." },
  { id:"proposta-solar", group:"Comercial", title:"Propostas e Simulações", summary:"Monta proposta com sistema, geração estimada, investimento e condições.", bullets:["Potência e equipamentos.","Geração estimada.","Investimento e condições.","Cenários financeiros sem garantia de retorno."], angle:"Mostre proposta técnica-comercial clara." },
  { id:"projeto-homologacao-solar", group:"Execução", title:"Projeto e Homologação", summary:"Acompanha etapas técnicas, documentação e concessionária.", bullets:["Projeto técnico.","Documentos.","Protocolo e pendências.","Status de homologação."], angle:"Destaque acompanhamento ponta a ponta." },
  { id:"instalacao-solar", group:"Execução", title:"Instalação e Comissionamento", summary:"Organiza equipe, materiais, etapas e entrega.", bullets:["Agenda de instalação.","Checklist de materiais.","Fotos e evidências.","Comissionamento e entrega."], angle:"Mostre execução rastreável." },
  { id:"estoque-solar", group:"Operação", title:"Equipamentos e Estoque", summary:"Controla módulos, inversores, estruturas, cabos e acessórios.", bullets:["SKU e fabricante.","Número de série quando aplicável.","Disponibilidade.","Reserva por obra."], angle:"Destaque ligação entre venda e execução." },
  { id:"monitoramento-solar", group:"Pós-venda", title:"Monitoramento e Pós-venda", summary:"Acompanha sistema instalado, garantias e atendimento.", bullets:["Dados do sistema.","Garantias.","Chamados e manutenção.","Relacionamento pós-instalação."], angle:"Mostre continuidade após a entrega." },
  { id:"revenue-scout-solar", group:"Inteligência", title:"Revenue Scout Solar", summary:"Identifica expansão, manutenção e indicações.", bullets:["Ampliação de sistema.","Baterias e carregadores.","Clientes com novas unidades.","Indicações."], angle:"Destaque novas receitas na base instalada." },
  { id:"dashboard-solar", group:"Inteligência", title:"Dashboard Solar", summary:"Consolida leads, propostas, projetos, instalação e pós-venda.", bullets:["Conversão.","Ticket e margem.","Projetos por etapa.","Prazo de implantação."], angle:"Mostre gestão do comercial à entrega." },
];

const transportadorasLogisticaModules: ScopeModule[] = [
  { id:"captacao-logistica", group:"Aquisição", title:"Captação B2B de Embarcadores", summary:"Prospecta empresas por rota, perfil de carga e frequência.", bullets:["Segmentação por região.","Perfil de carga.","Volume e recorrência.","CRM de oportunidades."], angle:"Mostre prospecção baseada em capacidade e rota." },
  { id:"cotacao-frete", group:"Comercial", title:"Cotação de Frete", summary:"Organiza origem, destino, carga, prazo e condição.", bullets:["Peso e cubagem.","Origem e destino.","Prazo e modalidade.","Preço e validade."], angle:"Destaque rapidez e padronização de cotações." },
  { id:"coletas-logistica", group:"Operação", title:"Coletas e Expedição", summary:"Agenda coletas e acompanha preparação da carga.", bullets:["Janela de coleta.","Veículo e motorista.","Documentos.","Status da coleta."], angle:"Mostre rastreabilidade desde a origem." },
  { id:"roteirizacao-logistica", group:"Operação", title:"Roteirização e Cargas", summary:"Organiza rotas, veículos, capacidade e sequência.", bullets:["Rota e paradas.","Capacidade.","Consolidação de cargas.","Ocorrências."], angle:"Destaque eficiência operacional." },
  { id:"rastreio-logistica", group:"Cliente", title:"Rastreio e Portal do Cliente", summary:"Disponibiliza status e eventos da entrega.", bullets:["Coletado, em trânsito e entregue.","Previsão.","Ocorrências.","Comprovante de entrega."], angle:"Mostre transparência ao embarcador." },
  { id:"frota-motoristas", group:"Frota", title:"Frota e Motoristas", summary:"Organiza veículos, motoristas, documentos e disponibilidade.", bullets:["Veículo e capacidade.","Motorista responsável.","Documentos e vencimentos.","Manutenção e disponibilidade."], angle:"Destaque capacidade operacional real." },
  { id:"ocorrencias-logistica", group:"Operação", title:"Ocorrências e SLA", summary:"Controla atrasos, avarias, devoluções e tratativas.", bullets:["Tipo de ocorrência.","Responsável.","Prazo de solução.","Comunicação ao cliente."], angle:"Mostre tratamento estruturado de exceções." },
  { id:"financeiro-logistica", group:"Financeiro", title:"Financeiro por Frete e Cliente", summary:"Organiza receitas, custos, motoristas, combustível e margem.", bullets:["Receita por carga.","Custos de viagem.","Comissões e terceiros.","Margem por rota."], angle:"Destaque rentabilidade por operação." },
  { id:"revenue-scout-logistica", group:"Inteligência", title:"Revenue Scout Logístico", summary:"Encontra clientes inativos, rotas ociosas e oportunidades recorrentes.", bullets:["Rotas com capacidade.","Clientes com queda de volume.","Novos trechos.","Cross-sell de serviços."], angle:"Mostre receita a partir da malha existente." },
];

const agroMaquinasModules: ScopeModule[] = [
  { id:"captacao-agro", group:"Aquisição", title:"Captação de Produtores e Empresas Rurais", summary:"Prospecta por região, cultura, propriedade e perfil de operação.", bullets:["Produtor e propriedade.","Cultura e safra.","Máquinas e necessidades.","Origem no CRM."], angle:"Mostre prospecção baseada em contexto produtivo." },
  { id:"crm-propriedade-agro", group:"CRM", title:"CRM por Produtor e Propriedade", summary:"Centraliza clientes, propriedades, máquinas e histórico.", bullets:["Propriedade e localização.","Culturas e calendário.","Máquinas instaladas.","Compras e serviços."], angle:"Destaque relacionamento por propriedade, não só por contato." },
  { id:"catalogo-maquinas-agro", group:"Catálogo", title:"Máquinas, Implementos e Peças", summary:"Organiza equipamentos, implementos, peças e acessórios.", bullets:["Marca e modelo.","Aplicação.","Peças compatíveis.","Estoque e disponibilidade."], angle:"Mostre catálogo técnico ligado ao parque do cliente." },
  { id:"propostas-agro", group:"Comercial", title:"Propostas e Financiamento", summary:"Organiza máquinas, entrada, troca, financiamento e condições.", bullets:["Equipamento.","Usado na troca.","Condições.","Status de crédito sem garantia de aprovação."], angle:"Destaque negociação de alto valor." },
  { id:"assistencia-agro", group:"Serviços", title:"Assistência Técnica e Campo", summary:"Agenda técnicos e acompanha chamados em propriedades.", bullets:["Máquina e ocorrência.","Técnico e rota.","Peças utilizadas.","Conclusão e evidências."], angle:"Mostre pós-venda em campo." },
  { id:"safra-oportunidades", group:"Inteligência", title:"Safra e Oportunidades", summary:"Relaciona ciclos produtivos a demandas comerciais legítimas.", bullets:["Calendário de safra.","Manutenção pré-safra.","Peças e consumíveis.","Renovação de máquinas."], angle:"Destaque timing comercial do agro." },
  { id:"revenue-scout-agro", group:"Inteligência", title:"Revenue Scout Agro", summary:"Encontra oportunidades por propriedade, parque de máquinas e ciclo.", bullets:["Máquinas sem revisão recente.","Peças recorrentes.","Upgrade e renovação.","Clientes inativos."], angle:"Mostre receita escondida na base instalada." },
  { id:"dashboard-agro", group:"Inteligência", title:"Dashboard Agro Comercial", summary:"Consolida carteira, propostas, máquinas, serviços e receita.", bullets:["Vendas por região.","Parque instalado.","Chamados e peças.","Margem e recorrência."], angle:"Destaque visão territorial e por propriedade." },
];

const industriasModules: ScopeModule[] = [
  { id:"captacao-industria", group:"Aquisição", title:"Captação B2B Industrial", summary:"Prospecta clientes por segmento, aplicação, região e potencial.", bullets:["Segmentação por indústria.","Aplicação e demanda.","Prospector B2B.","CRM de oportunidades."], angle:"Mostre venda consultiva orientada a aplicação." },
  { id:"catalogo-industrial", group:"Catálogo", title:"Catálogo Técnico Industrial", summary:"Organiza produtos, especificações, aplicações e versões.", bullets:["Família e produto.","Ficha técnica.","Aplicações.","Variantes e customizações."], angle:"Destaque catálogo técnico para vendas complexas." },
  { id:"cotacao-industrial", group:"Comercial", title:"Cotações e Propostas Técnicas", summary:"Organiza escopo, preço, prazo e condições.", bullets:["Itens e especificações.","Quantidade e lote.","Prazo de produção.","Condição comercial."], angle:"Mostre rastreabilidade da proposta ao pedido." },
  { id:"pedidos-industria", group:"Pedidos", title:"Pedidos e Carteira", summary:"Acompanha pedidos B2B, recorrência e programação.", bullets:["Pedido e cliente.","Itens e quantidades.","Prazo prometido.","Status."], angle:"Destaque previsibilidade comercial." },
  { id:"producao-industria", group:"Operação", title:"Produção e Atendimento do Pedido", summary:"Conecta pedido a etapas produtivas quando integrado.", bullets:["Ordem de produção.","Status.","Pendências.","Previsão de conclusão."], angle:"Mostre integração comercial-operacional." },
  { id:"qualidade-industria", group:"Qualidade", title:"Qualidade e Não Conformidades", summary:"Registra ocorrências, devoluções e tratativas.", bullets:["Lote e item.","Não conformidade.","Ação corretiva.","Retorno ao cliente."], angle:"Destaque pós-venda técnico." },
  { id:"representantes-industria", group:"Comercial", title:"Representantes e Territórios", summary:"Organiza carteira, região, comissão e metas.", bullets:["Território.","Carteira.","Metas.","Comissões."], angle:"Mostre gestão de canais de venda." },
  { id:"revenue-scout-industria", group:"Inteligência", title:"Revenue Scout Industrial", summary:"Encontra recompra, cross-sell e clientes com queda de volume.", bullets:["Recompra atrasada.","Mix incompleto.","Clientes inativos.","Novas aplicações."], angle:"Mostre expansão na carteira instalada." },
  { id:"dashboard-industria", group:"Inteligência", title:"Dashboard Industrial Comercial", summary:"Consolida carteira, propostas, pedidos, margem e prazo.", bullets:["Conversão.","Backlog.","Prazo prometido.","Margem por cliente e produto."], angle:"Destaque gestão do pedido à receita." },
];

const assistenciaTecnicaModules: ScopeModule[] = [
  { id:"captacao-assistencia", group:"Aquisição", title:"Captação de Serviços", summary:"Atrai clientes por equipamento, marca, problema e região.", bullets:["Campanhas locais.","Landing Pages por categoria.","WhatsApp e formulário.","Origem no CRM."], angle:"Mostre entrada organizada de chamados." },
  { id:"cadastro-equipamento", group:"CRM", title:"Cliente e Equipamento", summary:"Centraliza cliente, equipamento, número de série e histórico.", bullets:["Marca e modelo.","Número de série.","Garantia.","Serviços anteriores."], angle:"Destaque histórico técnico por equipamento." },
  { id:"ordem-servico-assistencia", group:"Operação", title:"Ordem de Serviço", summary:"Controla entrada, diagnóstico, orçamento, autorização e execução.", bullets:["Defeito relatado.","Diagnóstico técnico.","Peças e mão de obra.","Status até entrega."], angle:"Mostre fluxo claro para cliente e equipe." },
  { id:"orcamento-assistencia", group:"Comercial", title:"Orçamento e Aprovação", summary:"Organiza itens, mão de obra, prazo e aceite.", bullets:["Peças.","Serviços.","Prazo.","Aprovação do cliente."], angle:"Destaque conversão e menos atraso por aprovação." },
  { id:"pecas-assistencia", group:"Estoque", title:"Peças e Estoque", summary:"Controla peças usadas em reparos e reposição.", bullets:["Estoque.","Reserva por OS.","Compras.","Fornecedores."], angle:"Mostre disponibilidade ligada ao prazo." },
  { id:"agenda-tecnicos", group:"Agenda", title:"Agenda de Técnicos e Campo", summary:"Organiza bancada, visitas e técnicos.", bullets:["Técnico responsável.","Agenda.","Rota quando externo.","Evidências de conclusão."], angle:"Destaque capacidade e SLA." },
  { id:"garantia-assistencia", group:"Pós-venda", title:"Garantia do Serviço", summary:"Controla garantia, retorno e recorrência.", bullets:["Prazo de garantia.","Retorno técnico.","Peças trocadas.","Histórico."], angle:"Mostre confiança e rastreabilidade." },
  { id:"revenue-scout-assistencia", group:"Inteligência", title:"Revenue Scout para Assistência", summary:"Encontra manutenção, acessórios e clientes recorrentes.", bullets:["Equipamentos antigos.","Serviços recorrentes.","Orçamentos não aprovados.","Contratos empresariais."], angle:"Mostre receita na base instalada." },
  { id:"dashboard-assistencia", group:"Inteligência", title:"Dashboard da Assistência", summary:"Consolida OS, prazo, conversão, peças e receita.", bullets:["OS abertas.","Tempo médio.","Conversão de orçamento.","Margem por serviço."], angle:"Destaque produtividade e rentabilidade." },
];

const provedoresInternetModules: ScopeModule[] = [
  { id:"captacao-isp", group:"Aquisição", title:"Captação e Consulta de Cobertura", summary:"Atrai clientes e valida região atendida.", bullets:["Endereço e cobertura.","Planos disponíveis.","Origem do lead.","Agendamento de instalação."], angle:"Mostre conversão baseada em cobertura real." },
  { id:"crm-assinantes-isp", group:"CRM", title:"CRM de Assinantes", summary:"Centraliza cliente, plano, endereço, equipamentos e histórico.", bullets:["Plano contratado.","Endereço de instalação.","Equipamentos.","Atendimentos e pagamentos."], angle:"Destaque visão completa do assinante." },
  { id:"instalacao-isp", group:"Operação", title:"Instalação e Ativação", summary:"Organiza agenda, técnico, equipamentos e ativação.", bullets:["Ordem de instalação.","Roteador/ONU.","Técnico e rota.","Checklist de ativação."], angle:"Mostre implantação rastreável." },
  { id:"suporte-isp", group:"Suporte", title:"Suporte e Tickets", summary:"Controla falhas, chamados, SLA e solução.", bullets:["Tipo de problema.","Prioridade.","Técnico responsável.","Follow-up até resolução."], angle:"Destaque suporte até o fechamento do ticket." },
  { id:"cobranca-isp", group:"Financeiro", title:"Mensalidades e Cobrança", summary:"Acompanha vencimentos, inadimplência e negociação.", bullets:["Faturas.","Lembretes.","Pendências.","Reativação após pagamento."], angle:"Mostre previsibilidade e menos cobrança manual." },
  { id:"retencao-isp", group:"Relacionamento", title:"Retenção e Churn", summary:"Identifica clientes em risco e ações de retenção.", bullets:["Tickets repetidos.","Atrasos.","Pedido de cancelamento.","Ofertas de upgrade ou ajuste."], angle:"Mostre prevenção de churn baseada em sinais." },
  { id:"upgrade-isp", group:"Comercial", title:"Upgrade e Serviços Adicionais", summary:"Encontra oportunidades de aumento de plano e adicionais.", bullets:["Maior velocidade.","Mesh e Wi-Fi.","IP fixo ou serviços empresariais.","Novos pontos."], angle:"Destaque expansão na base instalada." },
  { id:"revenue-scout-isp", group:"Inteligência", title:"Revenue Scout para ISP", summary:"Encontra upgrades, clientes empresariais e áreas de expansão.", bullets:["Planos antigos.","Clientes de alto uso.","Bairros com demanda.","Serviços adicionais."], angle:"Mostre crescimento por base e cobertura." },
  { id:"dashboard-isp", group:"Inteligência", title:"Dashboard do Provedor", summary:"Consolida leads, instalações, tickets, churn e receita.", bullets:["Conversão.","Instalações.","SLA de suporte.","Churn e inadimplência."], angle:"Destaque gestão da jornada completa do assinante." },
];

const saasTecnologiaModules: ScopeModule[] = [
  { id:"captacao-saas", group:"Aquisição", title:"Captação B2B para SaaS", summary:"Atrai empresas por dor, segmento, porte e caso de uso.", bullets:["Campanhas por ICP.","Landing Pages por solução.","Demo ou trial.","Origem e intenção no CRM."], angle:"Mostre aquisição orientada ao problema real." },
  { id:"pipeline-saas", group:"Comercial", title:"Pipeline SaaS", summary:"Acompanha lead, discovery, demo, proposta, trial e fechamento.", bullets:["Etapa e responsável.","Próxima ação.","Stakeholders.","Motivos de perda."], angle:"Destaque venda consultiva previsível." },
  { id:"trial-onboarding-saas", group:"Onboarding", title:"Trial e Onboarding", summary:"Acompanha ativação, configuração e primeiros resultados.", bullets:["Checklist de implantação.","Integrações.","Usuários.","Marcos de ativação."], angle:"Mostre redução do time-to-value." },
  { id:"assinaturas-saas", group:"Financeiro", title:"Planos e Assinaturas", summary:"Organiza plano, usuários, cobrança e renovação.", bullets:["Plano e limites.","MRR/ARR.","Upgrade e downgrade.","Renovação."], angle:"Destaque receita recorrente e expansão." },
  { id:"customer-success-saas", group:"Relacionamento", title:"Customer Success", summary:"Acompanha adoção, resultados, riscos e plano de sucesso.", bullets:["Uso e engajamento.","Objetivos do cliente.","Health score.","QBR e follow-ups."], angle:"Mostre retenção baseada em valor entregue." },
  { id:"suporte-saas", group:"Suporte", title:"Suporte e Tickets", summary:"Controla chamados, SLA, bugs e acompanhamento.", bullets:["Prioridade.","Produto/módulo.","Status.","Avaliação final."], angle:"Destaque suporte até a resolução." },
  { id:"churn-expansao-saas", group:"Inteligência", title:"Churn, Upsell e Expansão", summary:"Identifica risco e oportunidades de crescimento.", bullets:["Queda de uso.","Tickets críticos.","Novos usuários.","Módulos adicionais."], angle:"Mostre crescimento na base antes de nova aquisição." },
  { id:"revenue-scout-saas", group:"Inteligência", title:"Revenue Scout SaaS", summary:"Encontra expansão, renovação e reativação.", bullets:["Trials parados.","Clientes subutilizando.","Contas com potencial.","Ex-clientes."], angle:"Destaque receita recorrente escondida." },
  { id:"dashboard-saas", group:"Inteligência", title:"Dashboard SaaS", summary:"Consolida funil, MRR, churn, expansão e suporte.", bullets:["CAC comercial quando disponível.","MRR/ARR.","Churn e expansão.","Ativação e tickets."], angle:"Destaque visão integrada de crescimento e retenção." },
];


type SegmentKey = "construtoras" | "arquitetura-design" | "farmacias" | "seguros" | "fruteiras" | "acougues" | "mercados" | "moda" | "produtos-naturais" | "moveis-casa" | "eletronicos-tecnologia" | "materiais-construcao" | "pet-veterinario" | "advocacia" | "contabilidade" | "beleza-barbearia" | "saude-clinicas" | "restaurantes-delivery" | "academias-fitness" | "imobiliarias-corretores" | "distribuidores-alimentos-bebidas" | "distribuidores-materiais-construcao" | "veiculos-mobilidade" | "autopecas-centro-automotivo" | "hoteis-pousadas" | "escolas-cursos" | "energia-solar" | "transportadoras-logistica" | "agro-maquinas" | "industrias" | "assistencia-tecnica" | "provedores-internet" | "saas-tecnologia";

const segmentCatalog: Record<SegmentKey, { label: string; description: string; modules: ScopeModule[] }> = {
  construtoras: {
    label: "Construtoras",
    description: "Captação, vendas, orçamento, planejamento, execução, custos, app e pós-venda.",
    modules: construtoraModules,
  },
  "arquitetura-design": {
    label: "Arquitetura & Design",
    description: "Captação, briefing, criação, apresentação, aprovação, gestão de projeto, fornecedores e relacionamento.",
    modules: arquiteturaDesignModules,
  },
  farmacias: {
    label: "Farmácias",
    description: "Captação, atendimento, CRM, fidelização, catálogo, estoque, compras, delivery, compliance, inteligência e pós-venda.",
    modules: farmaciaModules,
  },
  seguros: {
    label: "Seguros",
    description: "Captação, cotação, CRM, carteira, renovações, sinistros, cross-sell, parceiros, compliance, financeiro e pós-venda.",
    modules: segurosModules,
  },
  fruteiras: {
    label: "Fruteiras / Hortifruti",
    description: "Captação local, catálogo, perecíveis, compras, perdas, preço, promoções, pedidos, delivery, fidelidade, B2B e inteligência.",
    modules: fruteiraModules,
  },
  acougues: {
    label: "Açougues / Carnes",
    description: "Captação local, catálogo de cortes, estoque, lotes, rendimento, produção, compras, preço, pedidos, delivery, B2B e inteligência.",
    modules: acougueModules,
  },
  mercados: {
    label: "Mercados / Supermercados",
    description: "Captação local, catálogo amplo, estoque, compras, preço, promoções, fidelidade, pedidos, delivery, e-commerce, B2B e inteligência.",
    modules: mercadoModules,
  },
  moda: {
    label: "Vestuário & Moda",
    description: "Captação, catálogo por grade, coleções, estoque, compras, preço, marketing, fidelidade, influenciadores, e-commerce, omnichannel e inteligência.",
    modules: modaModules,
  },
  "produtos-naturais": {
    label: "Loja de Produtos Naturais",
    description: "Catálogo, granel, estoque, validade, compras, kits, assinaturas, atendimento, e-commerce, fidelidade, B2B e inteligência.",
    modules: produtosNaturaisModules,
  },
  "moveis-casa": {
    label: "Móveis, Planejados & Casa",
    description: "Captação, briefing, medição, projeto, catálogo, planejados, orçamento, produção, instalação, e-commerce, CRM e pós-venda.",
    modules: moveisCasaModules,
  },
  "eletronicos-tecnologia": {
    label: "Eletrônicos & Tecnologia",
    description: "Catálogo técnico, comparação, estoque, garantia, assistência, fornecedores, e-commerce, B2B, inteligência e pós-venda.",
    modules: eletronicosTecnologiaModules,
  },
  "materiais-construcao": {
    label: "Materiais de Construção & Acabamentos",
    description: "Catálogo técnico, etapas da obra, orçamentos, estoque, compras, entrega, profissionais, B2B, Revenue Scout e pós-venda.",
    modules: materiaisConstrucaoModules,
  },
  "pet-veterinario": {
    label: "Pet Shop & Clínica Veterinária",
    description: "Tutor e pet, agenda, prontuário, vacinas, banho e tosa, catálogo, estoque, planos, e-commerce, CRM e pós-atendimento.",
    modules: petVetModules,
  },
  advocacia: {
    label: "Advocacia / Escritórios Jurídicos",
    description: "Triagem, CRM de casos, prazos, documentos, contratos, honorários, equipe, atendimento, portal, conteúdo e inteligência.",
    modules: advocaciaModules,
  },
  contabilidade: {
    label: "Contabilidade / Escritórios Contábeis",
    description: "Onboarding, CRM, documentos, obrigações, fiscal, contábil, folha, societário, atendimento, honorários e inteligência.",
    modules: contabilidadeModules,
  },
  "beleza-barbearia": {
    label: "Salão de Beleza & Barbearia",
    description: "Agenda, profissionais, serviços, CRM, fidelidade, estoque, comissões, campanhas, Revenue Scout e pós-atendimento.",
    modules: belezaBarbeariaModules,
  },
  "saude-clinicas": {
    label: "Clínicas & Profissionais de Saúde",
    description: "Médicas, odontológicas, fisioterapia, nutrição, psicologia, terapias e demais especialidades com agenda, prontuário, CRM e gestão.",
    modules: saudeClinicasModules,
  },
  "restaurantes-delivery": {
    label: "Restaurantes & Tele-entrega",
    description: "Cardápio, salão, pedidos, cozinha, estoque, CMV, delivery, rotas, WhatsApp, marketplaces, fidelidade e inteligência.",
    modules: restaurantesDeliveryModules,
  },
  "academias-fitness": {
    label: "Academias & Fitness",
    description: "Captação, planos, CRM de alunos, avaliação, treinos, aulas, check-in, retenção, cobrança, Revenue Scout e financeiro.",
    modules: academiasFitnessModules,
  },
  "imobiliarias-corretores": {
    label: "Imobiliárias & Corretores de Imóveis",
    description: "Captação, carteira de imóveis, proprietários, compradores, locação, visitas, propostas, contratos, portais, comissões e inteligência.",
    modules: imobiliariasCorretoresModules,
  },
  "distribuidores-alimentos-bebidas": {
    label: "Distribuidores de Alimentos & Bebidas",
    description: "Carteira B2B, representantes, catálogo, pedidos recorrentes, estoque/lotes, logística, crédito, comissão, Revenue Scout e pós-venda.",
    modules: distribuidoresAlimentosBebidasModules,
  },
  "distribuidores-materiais-construcao": {
    label: "Distribuidores de Materiais de Construção",
    description: "Carteira B2B, representantes, catálogo técnico, cotações, pedidos, estoque, compras, frete, crédito, comissões e inteligência.",
    modules: distribuidoresMateriaisConstrucaoModules,
  },
  "veiculos-mobilidade": {
    label: "Lojas de Veículos & Mobilidade",
    description: "0 km, seminovos, motos e mobilidade elétrica com estoque, CRM, avaliação, test-drive, financiamento, anúncios, pós-venda e inteligência.",
    modules: veiculosMobilidadeModules,
  },
  "autopecas-centro-automotivo": {
    label: "Autopeças & Centro Automotivo",
    description: "Catálogo por veículo, placa/chassi, compatibilidade, estoque, orçamento, OS, oficina, pneus, compras, B2B, garantia e inteligência.",
    modules: autopecasCentroAutomotivoModules,
  },
  "hoteis-pousadas": {
    label: "Hotéis, Pousadas & Hospedagem",
    description: "Reservas, disponibilidade, hóspedes, check-in/out, governança, upsell, atendimento, Revenue Scout e indicadores.",
    modules: hoteisPousadasModules,
  },
  "escolas-cursos": {
    label: "Escolas, Cursos & Educação",
    description: "Captação, matrículas, turmas, mensalidades, retenção, rematrícula, atendimento e inteligência.",
    modules: escolasCursosModules,
  },
  "energia-solar": {
    label: "Energia Solar",
    description: "Captação, diagnóstico, proposta, projeto, homologação, instalação, equipamentos, monitoramento e pós-venda.",
    modules: energiaSolarModules,
  },
  "transportadoras-logistica": {
    label: "Transportadoras & Logística",
    description: "Captação B2B, cotação, coletas, roteirização, rastreio, frota, SLA, financeiro e inteligência.",
    modules: transportadorasLogisticaModules,
  },
  "agro-maquinas": {
    label: "Agro, Máquinas & Implementos",
    description: "Produtores, propriedades, máquinas, peças, propostas, assistência de campo, safra e Revenue Scout.",
    modules: agroMaquinasModules,
  },
  industrias: {
    label: "Indústrias & Fábricas",
    description: "Captação B2B, catálogo técnico, cotações, pedidos, produção, qualidade, representantes e inteligência.",
    modules: industriasModules,
  },
  "assistencia-tecnica": {
    label: "Assistência Técnica",
    description: "Cliente/equipamento, ordem de serviço, orçamento, peças, técnicos, garantia, Revenue Scout e indicadores.",
    modules: assistenciaTecnicaModules,
  },
  "provedores-internet": {
    label: "Provedores de Internet & Telecom",
    description: "Cobertura, assinantes, instalação, suporte, cobrança, retenção, upgrades, Revenue Scout e dashboard.",
    modules: provedoresInternetModules,
  },
  "saas-tecnologia": {
    label: "SaaS & Empresas de Tecnologia",
    description: "Captação B2B, pipeline, trial, onboarding, assinatura, Customer Success, suporte, churn, expansão e inteligência.",
    modules: saasTecnologiaModules,
  },
};

type KnowledgeSegment = {
  key: string;
  label: string;
  description: string;
  modules: ScopeModule[];
  isCustom: boolean;
  persisted: boolean;
};

type SegmentForm = {
  key: string;
  label: string;
  description: string;
};

type ModuleForm = {
  id: string;
  group: string;
  title: string;
  summary: string;
  bullets: string;
  angle: string;
};

const EMPTY_MODULE_FORM: ModuleForm = {
  id: "",
  group: "",
  title: "",
  summary: "",
  bullets: "",
  angle: "",
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function moduleToForm(module?: ScopeModule | null): ModuleForm {
  if (!module) return { ...EMPTY_MODULE_FORM };
  return {
    id: module.id,
    group: module.group,
    title: module.title,
    summary: module.summary,
    bullets: module.bullets.join("\n"),
    angle: module.angle,
  };
}

function sanitizeStaticSegmentOverride(key: string, item: KnowledgeSegment): KnowledgeSegment {
  const base = Object.entries(segmentCatalog).find(([segmentKey]) => segmentKey === key)?.[1];
  if (!base) return item;

  const ownIds = new Set(base.modules.map((module) => module.id));
  const foreignStaticIds = new Set<string>();

  for (const [otherKey, otherSegment] of Object.entries(segmentCatalog)) {
    if (otherKey === key) continue;
    for (const module of otherSegment.modules) {
      if (!ownIds.has(module.id)) foreignStaticIds.add(module.id);
    }
  }

  const hasCrossSegmentModule = item.modules.some((module) => foreignStaticIds.has(module.id));
  if (!hasCrossSegmentModule) return item;

  const cleanedModules = item.modules.filter((module) => !foreignStaticIds.has(module.id));
  const stillHasOwnModule = cleanedModules.some((module) => ownIds.has(module.id));

  return {
    ...item,
    label: item.label || base.label,
    description: item.description || base.description,
    modules: stillHasOwnModule ? cleanedModules : base.modules,
  };
}

export default function AdminKnowledgeBaseInternal() {
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<Record<string, KnowledgeSegment>>({});
  const [segment, setSegment] = useState<string>("construtoras");
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [segmentSearch, setSegmentSearch] = useState("");
  const [group, setGroup] = useState("Todos");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false);
  const [editingSegmentKey, setEditingSegmentKey] = useState<string | null>(null);
  const [segmentForm, setSegmentForm] = useState<SegmentForm>({ key: "", label: "", description: "" });

  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [moduleForm, setModuleForm] = useState<ModuleForm>({ ...EMPTY_MODULE_FORM });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/internal-knowledge", { headers: authHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json() as Array<{
          key: string;
          label: string;
          description: string;
          modules: ScopeModule[];
          isCustom: boolean;
        }>;
        if (cancelled) return;
        const next: Record<string, KnowledgeSegment> = {};
        for (const row of rows) {
          next[row.key] = { ...row, persisted: true };
        }
        setOverrides(next);
      } catch (error) {
        console.error("[internal-knowledge] load failed", error);
        toast({
          title: "Base carregada com conteúdo padrão",
          description: "Não foi possível carregar edições salvas no banco agora.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const catalog = useMemo(() => {
    const merged: Record<string, KnowledgeSegment> = {};
    for (const [key, item] of Object.entries(segmentCatalog)) {
      merged[key] = {
        key,
        label: item.label,
        description: item.description,
        modules: item.modules,
        isCustom: false,
        persisted: false,
      };
    }
    for (const [key, item] of Object.entries(overrides)) {
      merged[key] = sanitizeStaticSegmentOverride(key, item);
    }
    return merged;
  }, [overrides]);

  const activeCatalog = catalog[segment] ?? Object.values(catalog)[0];
  const scopeModules = activeCatalog?.modules ?? [];

  useEffect(() => {
    if (!catalog[segment]) {
      const first = Object.keys(catalog)[0];
      if (first) setSegment(first);
    }
  }, [catalog, segment]);

  const groups = useMemo(
    () => ["Todos", ...Array.from(new Set(scopeModules.map((item) => item.group))).sort()],
    [scopeModules],
  );

  const selectedScope = useMemo(
    () => scopeModules.find((item) => item.id === selectedScopeId) ?? null,
    [scopeModules, selectedScopeId],
  );

  const filteredSegments = useMemo(() => {
    const q = segmentSearch.trim().toLowerCase();
    const items = Object.values(catalog);
    if (!q) return items;
    return items.filter((item) =>
      [item.label, item.description].join(" ").toLowerCase().includes(q),
    );
  }, [catalog, segmentSearch]);

  const filteredScopes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scopeModules.filter((item) => {
      if (group !== "Todos" && item.group !== group) return false;
      if (!query) return true;
      const haystack = [item.title, item.group, item.summary, item.angle, ...item.bullets].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [group, scopeModules, search]);

  async function persistSegment(payload: KnowledgeSegment) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/internal-knowledge/${encodeURIComponent(payload.key)}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          label: payload.label,
          description: payload.description,
          modules: payload.modules,
          isCustom: payload.isCustom,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      const saved: KnowledgeSegment = { ...body, persisted: true };
      setOverrides((current) => ({ ...current, [saved.key]: saved }));
      return saved;
    } finally {
      setSaving(false);
    }
  }

  function chooseSegment(key: string) {
    setSegment(key);
    setSelectedScopeId(null);
    setSearch("");
    setGroup("Todos");
  }

  function openNewSegment() {
    setEditingSegmentKey(null);
    setSegmentForm({ key: "", label: "", description: "" });
    setSegmentDialogOpen(true);
  }

  function openEditSegment() {
    if (!activeCatalog) return;
    setEditingSegmentKey(activeCatalog.key);
    setSegmentForm({
      key: activeCatalog.key,
      label: activeCatalog.label,
      description: activeCatalog.description,
    });
    setSegmentDialogOpen(true);
  }

  async function saveSegmentForm() {
    const label = segmentForm.label.trim();
    const key = editingSegmentKey ?? slugify(segmentForm.key || label);
    if (!label || !key) {
      toast({ title: "Informe o nome do segmento", variant: "destructive" });
      return;
    }
    if (!editingSegmentKey && catalog[key]) {
      toast({ title: "Já existe um segmento com essa chave", variant: "destructive" });
      return;
    }

    const current = editingSegmentKey ? catalog[editingSegmentKey] : null;
    try {
      const saved = await persistSegment({
        key,
        label,
        description: segmentForm.description.trim(),
        modules: current?.modules ?? [],
        isCustom: current?.isCustom ?? true,
        persisted: true,
      });
      setSegmentDialogOpen(false);
      chooseSegment(saved.key);
      toast({ title: editingSegmentKey ? "Segmento atualizado" : "Segmento criado" });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: String(error), variant: "destructive" });
    }
  }

  function openNewModule() {
    setEditingModuleId(null);
    setModuleForm({ ...EMPTY_MODULE_FORM });
    setModuleDialogOpen(true);
  }

  function openEditModule(module: ScopeModule) {
    setEditingModuleId(module.id);
    setModuleForm(moduleToForm(module));
    setModuleDialogOpen(true);
  }

  async function saveModuleForm() {
    if (!activeCatalog) return;
    const title = moduleForm.title.trim();
    const id = editingModuleId ?? slugify(moduleForm.id || title);
    const groupValue = moduleForm.group.trim();
    const summary = moduleForm.summary.trim();
    if (!title || !id || !groupValue || !summary) {
      toast({ title: "Preencha grupo, título e resumo", variant: "destructive" });
      return;
    }
    if (!editingModuleId && scopeModules.some((item) => item.id === id)) {
      toast({ title: "Já existe uma informação com esse identificador", variant: "destructive" });
      return;
    }

    const nextModule: ScopeModule = {
      id,
      group: groupValue,
      title,
      summary,
      bullets: moduleForm.bullets.split("\n").map((item) => item.trim()).filter(Boolean),
      angle: moduleForm.angle.trim(),
    };
    const modules = editingModuleId
      ? scopeModules.map((item) => item.id === editingModuleId ? nextModule : item)
      : [...scopeModules, nextModule];

    try {
      await persistSegment({ ...activeCatalog, modules });
      setSelectedScopeId(id);
      setModuleDialogOpen(false);
      toast({ title: editingModuleId ? "Informação atualizada" : "Informação adicionada" });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: String(error), variant: "destructive" });
    }
  }

  async function deleteModule(module: ScopeModule) {
    if (!activeCatalog) return;
    if (!window.confirm(`Excluir “${module.title}” desta base?`)) return;
    try {
      await persistSegment({
        ...activeCatalog,
        modules: scopeModules.filter((item) => item.id !== module.id),
      });
      if (selectedScopeId === module.id) setSelectedScopeId(null);
      toast({ title: "Informação excluída" });
    } catch (error) {
      toast({ title: "Não foi possível excluir", description: String(error), variant: "destructive" });
    }
  }

  async function removeOrResetSegment() {
    if (!activeCatalog) return;
    const isStatic = Object.prototype.hasOwnProperty.call(segmentCatalog, activeCatalog.key);
    const action = isStatic ? "restaurar o conteúdo padrão" : "excluir este segmento";
    if (!window.confirm(`Confirma ${action}?`)) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/internal-knowledge/${encodeURIComponent(activeCatalog.key)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOverrides((current) => {
        const next = { ...current };
        delete next[activeCatalog.key];
        return next;
      });
      setSelectedScopeId(null);
      if (!isStatic) setSegment("construtoras");
      toast({ title: isStatic ? "Conteúdo padrão restaurado" : "Segmento excluído" });
    } catch (error) {
      toast({ title: "Não foi possível concluir", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!activeCatalog) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando base interna...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <div className="mb-2 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <Badge variant="secondary">Somente Superadmin</Badge>
              <Badge variant="outline">{Object.keys(catalog).length} segmentos</Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Base Interna da Empresa</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Base estratégica e funcional do Vendor.ai. Aqui você lê, adiciona e edita o conhecimento de cada segmento. Esta tela não gera campanhas ou materiais de marketing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openNewSegment}>
              <Plus className="mr-2 h-4 w-4" /> Novo segmento
            </Button>
            <Button onClick={openNewModule}>
              <Plus className="mr-2 h-4 w-4" /> Nova informação
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Segmentos</CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={segmentSearch}
                onChange={(event) => setSegmentSearch(event.target.value)}
                placeholder="Buscar segmento..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredSegments.map((item) => {
              const active = segment === item.key;
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => chooseSegment(item.key)}
                  className={[
                    "min-w-0 rounded-xl border p-4 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted/50",
                  ].join(" ")}
                >
                  <strong className="block break-words text-sm leading-5">{item.label}</strong>
                  <span className={active ? "mt-1 block break-words text-xs leading-5 text-primary-foreground/80" : "mt-1 block break-words text-xs leading-5 text-muted-foreground"}>
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <Badge>{activeCatalog.label}</Badge>
                {activeCatalog.persisted && <Badge variant="outline">Editado no banco</Badge>}
              </div>
              <CardTitle className="text-xl">{activeCatalog.label}</CardTitle>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{activeCatalog.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={openEditSegment}>
                <Pencil className="mr-2 h-4 w-4" /> Editar segmento
              </Button>
              {activeCatalog.persisted && (
                <Button variant="outline" onClick={removeOrResetSegment} disabled={saving}>
                  {activeCatalog.isCustom ? <Trash2 className="mr-2 h-4 w-4" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  {activeCatalog.isCustom ? "Excluir segmento" : "Restaurar padrão"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.7fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg">Informações da base</CardTitle>
              <Badge variant="outline">{scopeModules.length} itens</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar função, dor, recurso ou característica..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {groups.map((item) => (
                <Button key={item} size="sm" variant={group === item ? "default" : "outline"} onClick={() => setGroup(item)}>
                  {item}
                </Button>
              ))}
            </div>

            <div className="space-y-3">
              {filteredScopes.map((item) => {
                const active = selectedScopeId === item.id;
                return (
                  <div key={item.id} className={active ? "rounded-xl border border-primary bg-primary/5 p-4" : "rounded-xl border p-4"}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Badge variant="outline" className="mb-2">{item.group}</Badge>
                        <h3 className="break-words font-semibold">{item.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant={active ? "secondary" : "outline"} onClick={() => setSelectedScopeId(item.id)}>
                          <Eye className="mr-2 h-4 w-4" /> Ler
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEditModule(item)} aria-label={`Editar ${item.title}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteModule(item)} aria-label={`Excluir ${item.title}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredScopes.length === 0 && (
                <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Nenhuma informação encontrada. Use “Nova informação” para adicionar.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle className="text-lg">Conteúdo completo</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedScope ? (
              <div className="space-y-5">
                <div>
                  <Badge variant="outline">{selectedScope.group}</Badge>
                  <h2 className="mt-3 text-xl font-semibold">{selectedScope.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedScope.summary}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold">Características / informações</p>
                  <div className="mt-2 space-y-2">
                    {selectedScope.bullets.length > 0 ? selectedScope.bullets.map((bullet) => (
                      <p key={bullet} className="text-sm leading-6 text-muted-foreground">• {bullet}</p>
                    )) : (
                      <p className="text-sm text-muted-foreground">Nenhum detalhe adicional cadastrado.</p>
                    )}
                  </div>
                </div>

                {selectedScope.angle && (
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <p className="text-sm font-semibold">Observação estratégica</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedScope.angle}</p>
                  </div>
                )}

                <Button className="w-full" variant="outline" onClick={() => openEditModule(selectedScope)}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar esta informação
                </Button>
              </div>
            ) : (
              <div className="py-12 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">Selecione uma informação para ler</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Clique em “Ler” em qualquer item da lista. O conteúdo completo aparecerá aqui.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={segmentDialogOpen} onOpenChange={setSegmentDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingSegmentKey ? "Editar segmento" : "Novo segmento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="segment-label">Nome do segmento</Label>
              <Input id="segment-label" className="mt-1" value={segmentForm.label} onChange={(e) => setSegmentForm((v) => ({ ...v, label: e.target.value }))} />
            </div>
            {!editingSegmentKey && (
              <div>
                <Label htmlFor="segment-key">Identificador</Label>
                <Input id="segment-key" className="mt-1" placeholder="Gerado automaticamente se deixar vazio" value={segmentForm.key} onChange={(e) => setSegmentForm((v) => ({ ...v, key: e.target.value }))} />
              </div>
            )}
            <div>
              <Label htmlFor="segment-description">Descrição</Label>
              <Textarea id="segment-description" className="mt-1 min-h-28" value={segmentForm.description} onChange={(e) => setSegmentForm((v) => ({ ...v, description: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSegmentDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveSegmentForm} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={moduleDialogOpen} onOpenChange={setModuleDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingModuleId ? "Editar informação" : `Nova informação — ${activeCatalog.label}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="module-group">Grupo</Label>
                <Input id="module-group" className="mt-1" placeholder="Ex.: CRM, Comercial, Operação" value={moduleForm.group} onChange={(e) => setModuleForm((v) => ({ ...v, group: e.target.value }))} />
              </div>
              {!editingModuleId && (
                <div>
                  <Label htmlFor="module-id">Identificador</Label>
                  <Input id="module-id" className="mt-1" placeholder="Gerado pelo título se vazio" value={moduleForm.id} onChange={(e) => setModuleForm((v) => ({ ...v, id: e.target.value }))} />
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="module-title">Título</Label>
              <Input id="module-title" className="mt-1" value={moduleForm.title} onChange={(e) => setModuleForm((v) => ({ ...v, title: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="module-summary">Resumo</Label>
              <Textarea id="module-summary" className="mt-1 min-h-24" value={moduleForm.summary} onChange={(e) => setModuleForm((v) => ({ ...v, summary: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="module-bullets">Características / informações</Label>
              <Textarea id="module-bullets" className="mt-1 min-h-36" placeholder={"Uma informação por linha\nOutra informação\nOutra característica"} value={moduleForm.bullets} onChange={(e) => setModuleForm((v) => ({ ...v, bullets: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="module-angle">Observação estratégica</Label>
              <Textarea id="module-angle" className="mt-1 min-h-24" value={moduleForm.angle} onChange={(e) => setModuleForm((v) => ({ ...v, angle: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModuleDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveModuleForm} disabled={saving}>{saving ? "Salvando..." : "Salvar informação"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {loading && <p className="text-center text-xs text-muted-foreground">Sincronizando edições salvas...</p>}
    </div>
  );
}
