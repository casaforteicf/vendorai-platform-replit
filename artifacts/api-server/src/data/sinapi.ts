export interface SinapiItem {
  codigo: string;
  descricao: string;
  unidade: string;
  preco: number;
}

export const SINAPI_ITEMS: SinapiItem[] = [
  // ── SERVIÇOS PRELIMINARES ────────────────────────────────────────────────
  { codigo: "73966", descricao: "ADMINISTRACAO LOCAL DE OBRAS E SERVICOS", unidade: "MES", preco: 5842.34 },
  { codigo: "73964", descricao: "INSTALACAO DE CANTEIRO DE OBRAS", unidade: "M2", preco: 247.31 },
  { codigo: "73965", descricao: "LOCACAO E DEMARCACAO DE OBRAS", unidade: "M2", preco: 8.72 },
  { codigo: "72122", descricao: "ANDAIME TUBULAR METALICO - LOCACAO", unidade: "M2/MES", preco: 12.45 },
  { codigo: "88309", descricao: "ALUGUEL CAÇAMBA METÁLICA BASCULANTE 5 M3", unidade: "MES", preco: 724.50 },

  // ── TERRAPLENAGEM ────────────────────────────────────────────────────────
  { codigo: "74078", descricao: "ESCAVACAO MECANICA DE VALA, PROFUNDIDADE ATE 2 M", unidade: "M3", preco: 12.85 },
  { codigo: "74084", descricao: "ATERRO COMPACTADO MECANICAMENTE, CAMADAS DE 20 CM", unidade: "M3", preco: 24.35 },
  { codigo: "74070", descricao: "CORTE E ATERRO COMPACTADO MECANICAMENTE EM JAZIDA", unidade: "M3", preco: 18.76 },
  { codigo: "73902", descricao: "REATERRO MANUAL APILOADO COM SOQUETE", unidade: "M3", preco: 43.21 },
  { codigo: "72856", descricao: "ESCAVACAO MANUAL DE VALA EM TERRA", unidade: "M3", preco: 36.45 },

  // ── FUNDAÇÕES ────────────────────────────────────────────────────────────
  { codigo: "94961", descricao: "CONCRETO MAGRO FCK=10 MPA, PREPARO MECANICO", unidade: "M3", preco: 412.89 },
  { codigo: "94963", descricao: "CONCRETO FCK=15 MPA, PREPARO MECANICO COM BETONEIRA", unidade: "M3", preco: 437.21 },
  { codigo: "94965", descricao: "CONCRETO FCK=20 MPA, PREPARO MECANICO COM BETONEIRA", unidade: "M3", preco: 458.76 },
  { codigo: "94967", descricao: "CONCRETO FCK=25 MPA, PREPARO MECANICO COM BETONEIRA", unidade: "M3", preco: 481.43 },
  { codigo: "94971", descricao: "CONCRETO FCK=30 MPA, PREPARO MECANICO COM BETONEIRA", unidade: "M3", preco: 518.92 },
  { codigo: "94978", descricao: "CONCRETO FCK=35 MPA, PREPARO MECANICO COM BETONEIRA", unidade: "M3", preco: 557.34 },
  { codigo: "92782", descricao: "CONCRETO USINADO BOMBEADO, FCK=25 MPA, LANCAMENTO", unidade: "M3", preco: 547.80 },
  { codigo: "92783", descricao: "CONCRETO USINADO BOMBEADO, FCK=30 MPA, LANCAMENTO", unidade: "M3", preco: 573.45 },
  { codigo: "92784", descricao: "CONCRETO USINADO BOMBEADO, FCK=35 MPA, LANCAMENTO", unidade: "M3", preco: 608.12 },
  { codigo: "94228", descricao: "FORMA TABUA 2 APROVEITAMENTOS, FUNDACAO, P/CONCRETO", unidade: "M2", preco: 58.43 },
  { codigo: "94219", descricao: "FORMA COMPENSADO RESINADO 12MM, 1 APROVEITAMENTO, FUNDACAO", unidade: "M2", preco: 87.21 },
  { codigo: "94290", descricao: "ARMAÇÃO DE AÇO CA-50, DIÂMETRO 6,3 MM", unidade: "KG", preco: 10.87 },
  { codigo: "94291", descricao: "ARMAÇÃO DE AÇO CA-50, DIÂMETRO 8,0 MM", unidade: "KG", preco: 10.43 },
  { codigo: "94292", descricao: "ARMAÇÃO DE AÇO CA-50, DIÂMETRO 10,0 MM", unidade: "KG", preco: 10.21 },
  { codigo: "94293", descricao: "ARMAÇÃO DE AÇO CA-50, DIÂMETRO 12,5 MM", unidade: "KG", preco: 9.98 },
  { codigo: "94294", descricao: "ARMAÇÃO DE AÇO CA-50, DIÂMETRO 16,0 MM", unidade: "KG", preco: 9.87 },
  { codigo: "94296", descricao: "ARMAÇÃO DE AÇO CA-50, DIÂMETRO 20,0 MM", unidade: "KG", preco: 9.76 },
  { codigo: "94298", descricao: "ARMAÇÃO DE AÇO CA-60, DIÂMETRO 4,2 MM (ESTRIBOS)", unidade: "KG", preco: 11.34 },
  { codigo: "94299", descricao: "ARMAÇÃO DE AÇO CA-60, DIÂMETRO 5,0 MM (ESTRIBOS)", unidade: "KG", preco: 11.12 },
  { codigo: "73963", descricao: "BLOCO CONCRETO VEDAÇÃO 14X19X39 CM, FCK 4MPA", unidade: "M2", preco: 74.32 },

  // ── ESTRUTURA ─────────────────────────────────────────────────────────────
  { codigo: "94231", descricao: "FORMA COMPENSADO RESINADO 12MM, 2 APROVEITAMENTOS, LAJE", unidade: "M2", preco: 73.45 },
  { codigo: "94240", descricao: "ESCORAMENTO METÁLICO - LOCAÇÃO MENSAL", unidade: "M2/MES", preco: 8.76 },
  { codigo: "73863", descricao: "LAJE PRE-MOLDADA VIGOTA/LAJOTAS PARA PISO, SOBRECARGA 200 KG/M2", unidade: "M2", preco: 132.45 },
  { codigo: "73864", descricao: "LAJE PRE-MOLDADA VIGOTA/LAJOTAS PARA COBERTURA, SOBRECARGA 100 KG/M2", unidade: "M2", preco: 118.73 },
  { codigo: "92003", descricao: "LAJE MACIÇA DE CONCRETO ARMADO, E=10CM FCK=25MPA", unidade: "M2", preco: 187.43 },
  { codigo: "92004", descricao: "LAJE MACIÇA DE CONCRETO ARMADO, E=12CM FCK=25MPA", unidade: "M2", preco: 208.32 },
  { codigo: "92005", descricao: "LAJE MACIÇA DE CONCRETO ARMADO, E=15CM FCK=25MPA", unidade: "M2", preco: 245.67 },
  { codigo: "92792", descricao: "VIGA DE CONCRETO ARMADO FCK=25MPA, SEÇÃO 20X40CM", unidade: "M3", preco: 2187.43 },
  { codigo: "92793", descricao: "PILAR DE CONCRETO ARMADO FCK=25MPA, SEÇÃO 20X20CM", unidade: "M3", preco: 2354.21 },
  { codigo: "92794", descricao: "PILAR DE CONCRETO ARMADO FCK=25MPA, SEÇÃO 25X25CM", unidade: "M3", preco: 2298.76 },

  // ── ALVENARIA ─────────────────────────────────────────────────────────────
  { codigo: "87453", descricao: "ALVENARIA DE TIJOLO CERAMICO FURADO 9X14X19, ESPESSURA 14CM", unidade: "M2", preco: 72.45 },
  { codigo: "87454", descricao: "ALVENARIA DE TIJOLO CERAMICO FURADO 9X19X29, ESPESSURA 19CM", unidade: "M2", preco: 87.32 },
  { codigo: "87455", descricao: "ALVENARIA DE BLOCO CERAMICO 14X19X29, ESPESSURA 14CM", unidade: "M2", preco: 95.43 },
  { codigo: "87456", descricao: "ALVENARIA DE BLOCO CERAMICO 14X19X39, ESPESSURA 14CM", unidade: "M2", preco: 98.76 },
  { codigo: "73960", descricao: "ALVENARIA DE BLOCO DE CONCRETO 14X19X39, VEDAÇÃO, ESPESSURA 14CM", unidade: "M2", preco: 82.35 },
  { codigo: "73961", descricao: "ALVENARIA DE BLOCO DE CONCRETO 19X19X39, ESTRUTURAL, ESPESSURA 19CM", unidade: "M2", preco: 118.45 },

  // ── COBERTURA ─────────────────────────────────────────────────────────────
  { codigo: "72125", descricao: "TELHADO FIBROCIMENTO ONDULADO 6MM, SEM ESTRUTURA", unidade: "M2", preco: 42.34 },
  { codigo: "72126", descricao: "TELHADO FIBROCIMENTO ONDULADO 8MM, SEM ESTRUTURA", unidade: "M2", preco: 54.87 },
  { codigo: "72127", descricao: "TELHADO CERAMICO TIPO COLONIAL, SEM ESTRUTURA", unidade: "M2", preco: 65.43 },
  { codigo: "72128", descricao: "TELHADO CERAMICO TIPO PORTUGUESA, SEM ESTRUTURA", unidade: "M2", preco: 68.21 },
  { codigo: "88002", descricao: "TELHA METALICA TRAPEZOIDAL EM AÇO GALVANIZADO E=0,5MM", unidade: "M2", preco: 78.43 },
  { codigo: "88003", descricao: "TELHA METALICA ONDULADA EM AÇO GALVANIZADO E=0,5MM", unidade: "M2", preco: 62.34 },
  { codigo: "88004", descricao: "TELHA SANDUÍCHE TERMOACÚSTICA, E=30MM", unidade: "M2", preco: 187.65 },
  { codigo: "72129", descricao: "ESTRUTURA MADEIRA PARA TELHADO, VÃOS ATÉ 5M, E=6%", unidade: "M2", preco: 87.45 },
  { codigo: "72130", descricao: "ESTRUTURA MADEIRA PARA TELHADO, VÃOS ATÉ 5M, E=30%", unidade: "M2", preco: 132.67 },
  { codigo: "88005", descricao: "ESTRUTURA METALICA EM AÇO PARA TELHADO", unidade: "M2", preco: 214.32 },
  { codigo: "73918", descricao: "CALHA EM AÇO GALVANIZADO SEMICIRCULAR D=125MM", unidade: "M", preco: 34.87 },
  { codigo: "73919", descricao: "RUFO EM CHAPA GALVANIZADA #26, LARGURA 33CM", unidade: "M", preco: 28.43 },

  // ── IMPERMEABILIZAÇÃO ─────────────────────────────────────────────────────
  { codigo: "72239", descricao: "IMPERMEABILIZAÇÃO COM EMULSÃO ASFÁLTICA, 2 DEMÃOS", unidade: "M2", preco: 18.45 },
  { codigo: "72240", descricao: "IMPERMEABILIZAÇÃO COM MANTA ASFÁLTICA ELASTOMÉRICA 3MM", unidade: "M2", preco: 78.32 },
  { codigo: "72241", descricao: "IMPERMEABILIZAÇÃO COM MANTA ASFÁLTICA ELASTOMÉRICA 4MM", unidade: "M2", preco: 95.43 },
  { codigo: "72242", descricao: "IMPERMEABILIZAÇÃO COM MEMBRANA CRISTALIZANTE, 2 DEMÃOS", unidade: "M2", preco: 42.87 },
  { codigo: "72243", descricao: "IMPERMEABILIZAÇÃO ARGAMASSA POLIMÉRICA, 3 DEMÃOS", unidade: "M2", preco: 54.65 },

  // ── REVESTIMENTO INTERNO ──────────────────────────────────────────────────
  { codigo: "87251", descricao: "CHAPISCO COM ARGAMASSA DE CIMENTO E AREIA, TRAÇO 1:3", unidade: "M2", preco: 7.43 },
  { codigo: "87252", descricao: "EMBOÇO COM ARGAMASSA DE CIMENTO E AREIA, ESPESSURA 20MM", unidade: "M2", preco: 32.45 },
  { codigo: "87253", descricao: "REBOCO COM ARGAMASSA DE CAL E AREIA, ESPESSURA 5MM", unidade: "M2", preco: 18.76 },
  { codigo: "87261", descricao: "REBOCO PAULISTA - ARGAMASSA INDUSTRIALIZADA, E=5MM", unidade: "M2", preco: 24.32 },
  { codigo: "87263", descricao: "MASSA ÚNICA - ARGAMASSA INDUSTRIALIZADA, E=20MM", unidade: "M2", preco: 38.65 },
  { codigo: "87542", descricao: "GESSO LISO EM PAREDES, ESPESSURA 10MM", unidade: "M2", preco: 28.43 },
  { codigo: "87543", descricao: "GESSO PROJETADO EM PAREDES, ESPESSURA 10MM", unidade: "M2", preco: 22.87 },
  { codigo: "87448", descricao: "AZULEJO 20X20CM ASSENTADO COM ARGAMASSA CIMENTÍCIA", unidade: "M2", preco: 68.43 },
  { codigo: "87449", descricao: "AZULEJO/PORCELANATO 30X60CM ASSENTADO COM ARGAMASSA", unidade: "M2", preco: 78.65 },
  { codigo: "87450", descricao: "PORCELANATO 60X60CM ASSENTADO COM ARGAMASSA CIMENTÍCIA", unidade: "M2", preco: 98.34 },
  { codigo: "87451", descricao: "REJUNTE CERÂMICO COM ARGAMASSA INDUSTRIALIZADA", unidade: "M2", preco: 8.45 },

  // ── REVESTIMENTO EXTERNO ──────────────────────────────────────────────────
  { codigo: "87271", descricao: "CHAPISCO EXTERNO COM ARGAMASSA CIMENTÍCIA", unidade: "M2", preco: 8.32 },
  { codigo: "87272", descricao: "EMBOÇO EXTERNO COM ARGAMASSA MISTA, E=25MM", unidade: "M2", preco: 37.65 },
  { codigo: "87398", descricao: "REVESTIMENTO CERÂMICO FACHADA 20X20CM", unidade: "M2", preco: 87.43 },
  { codigo: "88485", descricao: "REVESTIMENTO FACHADA PORCELANATO 60X120CM", unidade: "M2", preco: 187.65 },
  { codigo: "88486", descricao: "TEXTURA ACRÍLICA LISO EM FACHADA", unidade: "M2", preco: 32.45 },
  { codigo: "88487", descricao: "TEXTURA ACRÍLICA RASPADA EM FACHADA", unidade: "M2", preco: 28.87 },

  // ── PISOS ─────────────────────────────────────────────────────────────────
  { codigo: "73863", descricao: "CONTRAPISO DE CONCRETO SIMPLES, E=5CM, FCK=10MPA", unidade: "M2", preco: 48.32 },
  { codigo: "96590", descricao: "PISO CERÂMICO 30X30CM, PEI 4, ASSENTADO COM ARGAMASSA", unidade: "M2", preco: 72.43 },
  { codigo: "96591", descricao: "PISO CERÂMICO 45X45CM, PEI 4, ASSENTADO COM ARGAMASSA", unidade: "M2", preco: 82.65 },
  { codigo: "96592", descricao: "PISO PORCELANATO 60X60CM, ASSENTADO COM ARGAMASSA", unidade: "M2", preco: 108.43 },
  { codigo: "96593", descricao: "PISO PORCELANATO 80X80CM, ASSENTADO COM ARGAMASSA", unidade: "M2", preco: 128.76 },
  { codigo: "96594", descricao: "PISO LAMINADO 8MM INSTALADO COM UNDERLAY", unidade: "M2", preco: 87.43 },
  { codigo: "96595", descricao: "PISO VINÍLICO LVT 4MM INSTALADO COLADO", unidade: "M2", preco: 98.32 },
  { codigo: "96596", descricao: "PISO EPÓXI AUTONIVELANTE, E=2MM", unidade: "M2", preco: 72.45 },
  { codigo: "73992", descricao: "PISO CIMENTADO QUEIMADO, E=1CM", unidade: "M2", preco: 42.34 },
  { codigo: "88262", descricao: "PISO INTERTRAVADO BLOCO CONCRETO 10X20CM, E=6CM", unidade: "M2", preco: 72.87 },
  { codigo: "88263", descricao: "PISO INTERTRAVADO BLOCO CONCRETO 10X20CM, E=8CM", unidade: "M2", preco: 87.43 },
  { codigo: "74156", descricao: "RODAPÉ CERÂMICO H=7CM, ASSENTADO COM ARGAMASSA", unidade: "M", preco: 24.32 },

  // ── PINTURAS ─────────────────────────────────────────────────────────────
  { codigo: "88491", descricao: "PINTURA LATEX PVA PAREDES INTERNAS, 2 DEMÃOS", unidade: "M2", preco: 14.32 },
  { codigo: "88492", descricao: "PINTURA LATEX ACRÍLICA PAREDES INTERNAS, 2 DEMÃOS", unidade: "M2", preco: 18.45 },
  { codigo: "88493", descricao: "PINTURA LATEX ACRÍLICA PAREDES EXTERNAS, 2 DEMÃOS", unidade: "M2", preco: 22.87 },
  { codigo: "88494", descricao: "PINTURA ESMALTE SINTÉTICO ESQUADRIAS METÁLICAS, 2 DEMÃOS", unidade: "M2", preco: 28.43 },
  { codigo: "88495", descricao: "PINTURA ESMALTE SINTÉTICO MADEIRAS, 2 DEMÃOS", unidade: "M2", preco: 32.65 },
  { codigo: "88496", descricao: "MASSA CORRIDA PVA PAREDES INTERNAS", unidade: "M2", preco: 12.43 },
  { codigo: "88497", descricao: "MASSA ACRÍLICA PAREDES EXTERNAS", unidade: "M2", preco: 18.32 },
  { codigo: "88498", descricao: "SELADOR ACRÍLICO PAREDES E TETOS", unidade: "M2", preco: 8.45 },
  { codigo: "88499", descricao: "PRIMER P/ METAL ANTICORROSIVO, 2 DEMÃOS", unidade: "M2", preco: 22.87 },

  // ── ESQUADRIAS DE MADEIRA ─────────────────────────────────────────────────
  { codigo: "74065", descricao: "PORTA INTERNA DE MADEIRA MACIÇA, 70X210CM, INCLUI BATENTE", unidade: "UN", preco: 847.43 },
  { codigo: "74066", descricao: "PORTA INTERNA DE MADEIRA MACIÇA, 80X210CM, INCLUI BATENTE", unidade: "UN", preco: 924.65 },
  { codigo: "74067", descricao: "PORTA INTERNA DE MADEIRA SEMI-OCA, 70X210CM, INCLUI BATENTE", unidade: "UN", preco: 487.32 },
  { codigo: "74068", descricao: "PORTA INTERNA DE MADEIRA SEMI-OCA, 80X210CM, INCLUI BATENTE", unidade: "UN", preco: 524.87 },
  { codigo: "74069", descricao: "PORTA EXTERNA DE MADEIRA MACIÇA, 90X210CM, INCLUI BATENTE", unidade: "UN", preco: 1248.43 },
  { codigo: "74071", descricao: "JANELA DE MADEIRA ABRIR 1,20X1,20M, INCLUI BATENTE", unidade: "UN", preco: 672.43 },

  // ── ESQUADRIAS DE ALUMÍNIO ────────────────────────────────────────────────
  { codigo: "74226", descricao: "JANELA ALUMÍNIO ANODIZADO NATURAL CORRER 1,20X1,20M", unidade: "UN", preco: 842.43 },
  { codigo: "74227", descricao: "JANELA ALUMÍNIO ANODIZADO NATURAL CORRER 1,50X1,20M", unidade: "UN", preco: 987.65 },
  { codigo: "74228", descricao: "JANELA ALUMÍNIO ANODIZADO NATURAL CORRER 2,00X1,20M", unidade: "UN", preco: 1248.32 },
  { codigo: "74229", descricao: "PORTA BALCÃO ALUMÍNIO ANODIZADO NATURAL CORRER 2,00X2,10M", unidade: "UN", preco: 2187.43 },
  { codigo: "74230", descricao: "PORTA BALCÃO ALUMÍNIO ANODIZADO NATURAL CORRER 3,00X2,10M", unidade: "UN", preco: 3124.65 },
  { codigo: "74231", descricao: "MAXIM-AR ALUMÍNIO ANODIZADO NATURAL 0,60X0,60M", unidade: "UN", preco: 284.32 },
  { codigo: "74232", descricao: "MAXIM-AR ALUMÍNIO ANODIZADO NATURAL 1,00X0,60M", unidade: "UN", preco: 387.43 },
  { codigo: "74233", descricao: "PORTA DE ALUMÍNIO ABRIR 90X210CM", unidade: "UN", preco: 1287.65 },

  // ── VIDROS ────────────────────────────────────────────────────────────────
  { codigo: "72477", descricao: "VIDRO LISO INCOLOR 4MM, TEMPERADO", unidade: "M2", preco: 187.43 },
  { codigo: "72478", descricao: "VIDRO LISO INCOLOR 6MM, TEMPERADO", unidade: "M2", preco: 248.32 },
  { codigo: "72479", descricao: "VIDRO LAMINADO 6+6MM, INCOLOR", unidade: "M2", preco: 387.65 },
  { codigo: "72480", descricao: "VIDRO INSULADO (DUPLO) 4+12+4MM", unidade: "M2", preco: 524.43 },

  // ── INSTALAÇÕES HIDRÁULICAS ───────────────────────────────────────────────
  { codigo: "89723", descricao: "CAIXA D'ÁGUA FIBRA DE VIDRO 500L INSTALADA", unidade: "UN", preco: 847.43 },
  { codigo: "89724", descricao: "CAIXA D'ÁGUA FIBRA DE VIDRO 1000L INSTALADA", unidade: "UN", preco: 1287.65 },
  { codigo: "89725", descricao: "CAIXA D'ÁGUA FIBRA DE VIDRO 2000L INSTALADA", unidade: "UN", preco: 2187.43 },
  { codigo: "89734", descricao: "TUBULAÇÃO PVC SOLDÁVEL DN 25MM (3/4\"), ÁGUA FRIA", unidade: "M", preco: 18.43 },
  { codigo: "89735", descricao: "TUBULAÇÃO PVC SOLDÁVEL DN 32MM (1\"), ÁGUA FRIA", unidade: "M", preco: 24.32 },
  { codigo: "89736", descricao: "TUBULAÇÃO PVC SOLDÁVEL DN 40MM (1 1/4\"), ÁGUA FRIA", unidade: "M", preco: 32.87 },
  { codigo: "89737", descricao: "TUBULAÇÃO PVC SOLDÁVEL DN 50MM (1 1/2\"), ÁGUA FRIA", unidade: "M", preco: 42.43 },
  { codigo: "89738", descricao: "TUBULAÇÃO CPVC DN 15MM (1/2\"), ÁGUA QUENTE", unidade: "M", preco: 32.65 },
  { codigo: "89739", descricao: "TUBULAÇÃO CPVC DN 22MM (3/4\"), ÁGUA QUENTE", unidade: "M", preco: 42.87 },
  { codigo: "89740", descricao: "TUBULAÇÃO PPR DN 20MM, ÁGUA QUENTE", unidade: "M", preco: 28.43 },
  { codigo: "89741", descricao: "TUBULAÇÃO PPR DN 25MM, ÁGUA QUENTE", unidade: "M", preco: 38.65 },
  { codigo: "89742", descricao: "TUBULAÇÃO PVC ESGOTO DN 40MM", unidade: "M", preco: 22.43 },
  { codigo: "89743", descricao: "TUBULAÇÃO PVC ESGOTO DN 50MM", unidade: "M", preco: 28.32 },
  { codigo: "89744", descricao: "TUBULAÇÃO PVC ESGOTO DN 75MM", unidade: "M", preco: 38.87 },
  { codigo: "89745", descricao: "TUBULAÇÃO PVC ESGOTO DN 100MM", unidade: "M", preco: 48.43 },
  { codigo: "89746", descricao: "RALO SIFONADO QUADRADO 10X10CM", unidade: "UN", preco: 32.87 },
  { codigo: "89747", descricao: "CAIXA SIFONADA 150X150X50MM, INCLUI GRELHA", unidade: "UN", preco: 42.43 },
  { codigo: "89748", descricao: "CAIXA DE INSPEÇÃO ESGOTO 60X60CM, ALVENARIA", unidade: "UN", preco: 248.65 },
  { codigo: "89749", descricao: "FOSSA SÉPTICA PREF. ALVENARIA ATÉ 5 PESSOAS", unidade: "UN", preco: 2187.43 },
  { codigo: "89750", descricao: "SUMIDOURO ALVENARIA", unidade: "UN", preco: 1248.32 },
  { codigo: "89754", descricao: "VASO SANITÁRIO LOUÇA COM CAIXA ACOPLADA", unidade: "UN", preco: 487.65 },
  { codigo: "89755", descricao: "LAVATÓRIO DE LOUÇA 29X40CM COMPLETO", unidade: "UN", preco: 248.43 },
  { codigo: "89756", descricao: "PIA DE LOUÇA SIMPLES 55X40CM COMPLETA", unidade: "UN", preco: 387.87 },
  { codigo: "89757", descricao: "TANQUE DE LOUÇA 26L COMPLETO", unidade: "UN", preco: 342.43 },
  { codigo: "89758", descricao: "BANHEIRA DE HIDROMASSAGEM 170X90CM", unidade: "UN", preco: 3487.65 },
  { codigo: "89761", descricao: "CHUVEIRO ELÉTRICO 7500W COM DUCHA", unidade: "UN", preco: 187.43 },
  { codigo: "89762", descricao: "TORNEIRA CROMADA LAVATÓRIO 1/4 VOLTA", unidade: "UN", preco: 124.32 },
  { codigo: "89763", descricao: "TORNEIRA CROMADA PIA COZINHA BICA ALTA 1/4 VOLTA", unidade: "UN", preco: 187.65 },
  { codigo: "89764", descricao: "AQUECEDOR DE ÁGUA A GÁS 15 L/MIN", unidade: "UN", preco: 1248.43 },
  { codigo: "89765", descricao: "AQUECEDOR SOLAR PLANO 1,5 M² + BOILER 200L", unidade: "UN", preco: 4287.65 },
  { codigo: "89766", descricao: "BOMBA RECALQUE SUBMERSA 1/2 CV", unidade: "UN", preco: 748.43 },

  // ── INSTALAÇÕES ELÉTRICAS ─────────────────────────────────────────────────
  { codigo: "91923", descricao: "QUADRO DISTRIBUIÇÃO EMBUTIDO 12 DISJUNTORES", unidade: "UN", preco: 487.43 },
  { codigo: "91924", descricao: "QUADRO DISTRIBUIÇÃO EMBUTIDO 24 DISJUNTORES", unidade: "UN", preco: 724.65 },
  { codigo: "91925", descricao: "DISJUNTOR MONOPOLAR 20A", unidade: "UN", preco: 32.43 },
  { codigo: "91926", descricao: "DISJUNTOR MONOPOLAR 30A", unidade: "UN", preco: 38.65 },
  { codigo: "91927", descricao: "DISJUNTOR BIPOLAR 40A", unidade: "UN", preco: 87.43 },
  { codigo: "91928", descricao: "DISJUNTOR TRIPOLAR 50A", unidade: "UN", preco: 124.32 },
  { codigo: "91931", descricao: "ELETRODUTO PVC CORRUGADO DN 25MM EMBUTIDO", unidade: "M", preco: 8.43 },
  { codigo: "91932", descricao: "ELETRODUTO PVC CORRUGADO DN 32MM EMBUTIDO", unidade: "M", preco: 10.87 },
  { codigo: "91933", descricao: "ELETRODUTO PVC RÍGIDO DN 25MM APARENTE", unidade: "M", preco: 12.43 },
  { codigo: "91934", descricao: "ELETRODUTO PVC RÍGIDO DN 32MM APARENTE", unidade: "M", preco: 15.87 },
  { codigo: "91935", descricao: "CABO FLEXÍVEL 2,5MM² 750V (FASE, NEUTRO OU TERRA)", unidade: "M", preco: 4.32 },
  { codigo: "91936", descricao: "CABO FLEXÍVEL 4,0MM² 750V", unidade: "M", preco: 6.87 },
  { codigo: "91937", descricao: "CABO FLEXÍVEL 6,0MM² 750V", unidade: "M", preco: 9.43 },
  { codigo: "91938", descricao: "CABO FLEXÍVEL 10,0MM² 750V", unidade: "M", preco: 14.65 },
  { codigo: "91941", descricao: "PONTO DE TOMADA 2P+T 10A, EMBUTIDA, INCLUI CAIXA E TAMPA", unidade: "PT", preco: 124.43 },
  { codigo: "91942", descricao: "PONTO DE TOMADA 2P+T 20A, EMBUTIDA, INCLUI CAIXA E TAMPA", unidade: "PT", preco: 142.87 },
  { codigo: "91943", descricao: "PONTO DE ILUMINAÇÃO SIMPLES, INCLUI CAIXA E INTERRUPTOR", unidade: "PT", preco: 98.43 },
  { codigo: "91944", descricao: "PONTO DE ILUMINAÇÃO COM DIMMER, INCLUI CAIXA", unidade: "PT", preco: 187.65 },
  { codigo: "91945", descricao: "LUMINÁRIA EMBUTIDA DOWNLIGHT LED 9W", unidade: "UN", preco: 87.43 },
  { codigo: "91946", descricao: "LUMINÁRIA EMBUTIDA DOWNLIGHT LED 18W", unidade: "UN", preco: 124.32 },
  { codigo: "91947", descricao: "PONTO DE TOMADA DE FORÇA TRIFÁSICO 3P+N+T 50A", unidade: "PT", preco: 487.65 },
  { codigo: "91948", descricao: "ATERRAMENTO — HASTE COBRE 5/8\"X2,4M", unidade: "UN", preco: 124.43 },
  { codigo: "91949", descricao: "SPDA — PARA-RAIOS FRANKLIN, INCLUI DESCIDA", unidade: "UN", preco: 2487.65 },

  // ── FORRO E DIVISÓRIAS ────────────────────────────────────────────────────
  { codigo: "73988", descricao: "FORRO DE GESSO ACARTONADO COM ESTRUTURA METÁLICA", unidade: "M2", preco: 87.43 },
  { codigo: "73989", descricao: "FORRO DE GESSO EM PLACAS 625X625MM", unidade: "M2", preco: 72.65 },
  { codigo: "73990", descricao: "FORRO DE PVC RÉGUA 10CM, INCLUI ESTRUTURA", unidade: "M2", preco: 54.43 },
  { codigo: "73991", descricao: "FORRO DE MADEIRA COMPENSADA, RÉGUA 10CM", unidade: "M2", preco: 97.87 },
  { codigo: "91472", descricao: "DIVISÓRIA DRYWALL SIMPLES (60MM), 1 FACE CADA LADO", unidade: "M2", preco: 98.43 },
  { codigo: "91473", descricao: "DIVISÓRIA DRYWALL DUPLA (125MM), 2 FACES CADA LADO", unidade: "M2", preco: 145.87 },
  { codigo: "91474", descricao: "PAREDE DRYWALL RESISTENTE A UMIDADE (RU) 98MM", unidade: "M2", preco: 132.43 },

  // ── SERVIÇOS COMPLEMENTARES ───────────────────────────────────────────────
  { codigo: "73818", descricao: "DEMOLIÇÃO DE ALVENARIA DE TIJOLOS", unidade: "M3", preco: 42.43 },
  { codigo: "73819", descricao: "DEMOLIÇÃO DE CONCRETO SIMPLES", unidade: "M3", preco: 87.65 },
  { codigo: "73820", descricao: "DEMOLIÇÃO DE CONCRETO ARMADO", unidade: "M3", preco: 142.43 },
  { codigo: "73821", descricao: "REMOÇÃO DE ENTULHO COM CAMINHÃO BASCULANTE", unidade: "M3", preco: 48.87 },
  { codigo: "73822", descricao: "LIMPEZA FINAL DE OBRA", unidade: "M2", preco: 14.43 },
  { codigo: "73823", descricao: "SERVIÇO TOPOGRAFICO DE LEVANTAMENTO PLANIALTIMÉTRICO", unidade: "M2", preco: 3.87 },

  // ── MÃO DE OBRA ───────────────────────────────────────────────────────────
  { codigo: "88316", descricao: "SERVENTE DE OBRAS - H/DIA", unidade: "H", preco: 18.43 },
  { codigo: "88317", descricao: "PEDREIRO - H/DIA", unidade: "H", preco: 28.65 },
  { codigo: "88318", descricao: "CARPINTEIRO DE FORMAS - H/DIA", unidade: "H", preco: 32.43 },
  { codigo: "88319", descricao: "ARMADOR DE FERRO - H/DIA", unidade: "H", preco: 32.87 },
  { codigo: "88320", descricao: "ENCANADOR/BOMBEIRO HIDRÁULICO - H/DIA", unidade: "H", preco: 38.43 },
  { codigo: "88321", descricao: "ELETRICISTA INSTALADOR - H/DIA", unidade: "H", preco: 38.87 },
  { codigo: "88322", descricao: "PINTOR - H/DIA", unidade: "H", preco: 28.43 },
  { codigo: "88323", descricao: "AZULEJISTA - H/DIA", unidade: "H", preco: 32.65 },
  { codigo: "88324", descricao: "GESSEIRO - H/DIA", unidade: "H", preco: 28.87 },
  { codigo: "88325", descricao: "MESTRE DE OBRAS - H/DIA", unidade: "H", preco: 48.43 },
  { codigo: "88326", descricao: "TÉCNICO EM EDIFICAÇÕES - H/DIA", unidade: "H", preco: 58.65 },
  { codigo: "88327", descricao: "ENGENHEIRO CIVIL - H/DIA", unidade: "H", preco: 98.43 },

  // ── EQUIPAMENTOS ─────────────────────────────────────────────────────────
  { codigo: "72008", descricao: "BETONEIRA ELÉTRICA 400L - HORA PRODUTIVA", unidade: "H", preco: 14.32 },
  { codigo: "72009", descricao: "VIBRADOR DE CONCRETO IMERSÃO - HORA PRODUTIVA", unidade: "H", preco: 8.43 },
  { codigo: "72010", descricao: "ESCAVADEIRA HIDRÁULICA 20T - HORA PRODUTIVA", unidade: "H", preco: 312.43 },
  { codigo: "72011", descricao: "COMPACTADOR PLACA VIBRATÓRIA 62 KG - HORA PRODUTIVA", unidade: "H", preco: 18.87 },
  { codigo: "72012", descricao: "CAMINHÃO BASCULANTE 8M3 - HORA PRODUTIVA", unidade: "H", preco: 148.43 },
  { codigo: "72013", descricao: "GUINDASTE TELESCÓPICO 25T - HORA PRODUTIVA", unidade: "H", preco: 487.65 },
];

export function searchSinapi(q: string, limit = 20): SinapiItem[] {
  if (!q || q.trim().length < 2) return [];
  const terms = q.trim().toUpperCase().split(/\s+/);
  const scored: Array<{ item: SinapiItem; score: number }> = [];

  for (const item of SINAPI_ITEMS) {
    const target = `${item.codigo} ${item.descricao}`.toUpperCase();
    let score = 0;
    for (const term of terms) {
      if (target.includes(term)) score += 2;
      else if (item.codigo === term) score += 5;
    }
    if (score > 0) scored.push({ item, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
