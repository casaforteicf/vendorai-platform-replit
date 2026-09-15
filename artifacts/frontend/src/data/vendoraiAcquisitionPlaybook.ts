export type AcquisitionItem = { day:number; pillar:string; format:string; title:string; pain:string; cta:string; destination:string };

export const vendoraiAcquisitionPlaybook: AcquisitionItem[] = [
  { day:1, pillar:"crm", format:"carrossel", title:"Seu CRM não está te dizendo qual é a próxima ação?", pain:"Negócios ficam parados porque o time registra dados, mas não sabe o que fazer depois.", cta:"Veja como funciona", destination:"/produtos/crm" },
  { day:2, pillar:"agentes", format:"reel", title:"Uma IA que responde não é a mesma coisa que um agente que trabalha", pain:"Chatbots conversam, mas não executam o processo comercial.", cta:"Conheça os agentes", destination:"/agentes-virtuais-inteligentes" },
  { day:3, pillar:"marketing", format:"carrossel", title:"Postar sem objetivo não é marketing", pain:"Empresas produzem conteúdo sem saber se querem alcance, lead ou venda.", cta:"Veja o Marketing IA", destination:"/produtos/marketing" },
  { day:4, pillar:"creative", format:"reel", title:"Você não precisa gravar todo dia para aparecer todo dia", pain:"Executivos e vendedores não conseguem manter rotina de gravação.", cta:"Veja o Dublê Digital", destination:"/produtos/creative-studio" },
  { day:5, pillar:"prospeccao", format:"carrossel", title:"Sua equipe ainda monta lista de prospecção na mão?", pain:"Horas são perdidas pesquisando empresas sem priorização.", cta:"Conheça a prospecção", destination:"/produtos/prospeccao" },
  { day:6, pillar:"revenue", format:"reel", title:"Quanto dinheiro está parado dentro da sua própria carteira?", pain:"Clientes antigos, recompra e cross-sell ficam invisíveis.", cta:"Conheça o Revenue Scout", destination:"/produtos/revenue-scout" },
  { day:7, pillar:"crm", format:"artigo", title:"CRM com IA: o que muda quando o sistema define a próxima ação", pain:"CRM tradicional vira arquivo morto.", cta:"Teste o VendorAI", destination:"/produtos/crm" },
  { day:8, pillar:"marketing", format:"reel", title:"Como planejar 30 dias de Instagram sem improvisar", pain:"A empresa decide o que postar no mesmo dia.", cta:"Veja o Content Planner", destination:"/produtos/content-planner" },
  { day:9, pillar:"creative", format:"carrossel", title:"Imagem, vídeo, voz e roteiro em um único fluxo", pain:"Produção depende de várias ferramentas e pessoas.", cta:"Veja o Creative Studio", destination:"/produtos/creative-studio" },
  { day:10, pillar:"agentes", format:"carrossel", title:"7 trabalhos que agentes de IA já podem assumir na operação comercial", pain:"A equipe repete tarefas manuais todos os dias.", cta:"Conheça a equipe de agentes", destination:"/agentes-virtuais-inteligentes" },
  { day:11, pillar:"prospeccao", format:"post", title:"Prospecção sem ICP é só volume", pain:"Mais contatos não significam mais oportunidades.", cta:"Veja a prospecção com IA", destination:"/produtos/prospeccao" },
  { day:12, pillar:"revenue", format:"carrossel", title:"Recompra, upsell e reativação não deveriam depender da memória do vendedor", pain:"Receita recorrente se perde por falta de monitoramento.", cta:"Veja como funciona", destination:"/produtos/revenue-scout" }
];

export const vendoraiAcquisitionGoals = {
  primary:"aumentar alcance qualificado e gerar visitas para páginas comerciais prioritárias",
  secondary:["seguidores","visitas ao perfil","cliques para o site","leads","trials","oportunidades"],
  rule:"cada conteúdo explica uma dor real, uma execução concreta do VendorAI e uma próxima ação mensurável"
};
