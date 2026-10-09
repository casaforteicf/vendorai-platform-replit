import type { StandardConstructionComposition, StandardConstructionStage, StandardConstructionSystem, StandardCompositionItem } from "./construction-composition-catalog-universal";

const mat = (codigo:string,nome:string,unidade:string,quantidade:string,categoria:string):StandardCompositionItem => ({codigo,nome,unidade,quantidade,categoria,tipo:"material"});
const mo = (codigo:string,nome:string,unidade="h",quantidade="1.00"):StandardCompositionItem => ({codigo,nome,unidade,quantidade,categoria:"Mão de obra",tipo:"mao_de_obra"});
const svc = (codigo:string,nome:string,unidade="serv",quantidade="1.00",categoria="Serviços"):StandardCompositionItem => ({codigo,nome,unidade,quantidade,categoria,tipo:"servico"});
const eqp = (codigo:string,nome:string,unidade="h",quantidade="1.00"):StandardCompositionItem => ({codigo,nome,unidade,quantidade,categoria:"Equipamentos",tipo:"equipamento"});
const C = (codigo:string,nome:string,etapaKey:StandardConstructionStage,unidade:string,itens:StandardCompositionItem[],ordem:number,sistemasConstrutivos:StandardConstructionSystem[],descricao?:string):StandardConstructionComposition => ({
  codigo,nome,descricao:descricao ?? `Composição técnica referencial editável para ${nome}.`,unidade,etapaKey,sistemasConstrutivos,comumTodosSistemas:false,ordem,itens
});

/**
 * Catálogo detalhado por sistema — V2.
 * Coeficientes são referências iniciais e devem ser validados por projeto,
 * memorial, fabricante e condições da obra. Não contém preços monetários.
 */
export const SYSTEM_DETAIL_COMPOSITIONS_V2: StandardConstructionComposition[] = [
  // ── ICF ───────────────────────────────────────────────────────────────────
  C("SYS-ICF-05-010","Impermeabilização/isolamento sob primeira fiada ICF","fundacoes","m",[
    mat("ICF-MAT-BARCAP","Barreira capilar/impermeável de base","m","1.05","ICF"),
    mat("ICF-MAT-SELBASE","Selante de base","un","0.05","ICF"),
    mo("ICF-MO-BASE","Preparação de base para ICF","m","1.00")
  ],210,["icf"]),
  C("SYS-ICF-08-010","Parede ICF estrutural — espessura configurável","sistema_construtivo_paredes","m²",[
    mat("ICF-MAT-FORMA","Forma/bloco ICF conforme espessura","m²","1.05","ICF"),
    mat("ARQ-MAT-CONC30","Concreto estrutural","m³","0.11","Concreto"),
    mat("ARQ-MAT-ACO","Armadura vertical/horizontal","kg","5.50","Aço"),
    mat("ICF-MAT-ESP","Espaçadores, travas e acessórios","cj","0.05","ICF"),
    eqp("ICF-EQP-ESCORA","Escoramento/alinhamento","dia","0.03"),
    mo("ICF-MO-MONT","Montagem ICF","m²","1.00"),
    mo("ICF-MO-CONC","Concretagem ICF","m²","1.00")
  ],220,["icf"]),
  C("SYS-ICF-08-011","Canto/encontro T/cruzamento ICF","sistema_construtivo_paredes","m",[
    mat("ICF-MAT-CANTO","Peças/cortes especiais ICF","m","1.05","ICF"),
    mat("ARQ-MAT-ACO","Reforço adicional de aço","kg","2.00","Aço"),
    mat("ICF-MAT-FIX","Fixadores/travas","un","4.00","ICF"),
    mo("ICF-MO-CANTO","Montagem de encontro ICF","m","1.00")
  ],230,["icf"]),
  C("SYS-ICF-08-012","Verga estrutural em ICF","sistema_construtivo_paredes","m",[
    mat("ICF-MAT-FORMA","Forma/bloco ICF","m²","0.35","ICF"),
    mat("ARQ-MAT-CONC30","Concreto estrutural","m³","0.04","Concreto"),
    mat("ARQ-MAT-ACO","Aço de reforço de verga","kg","3.00","Aço"),
    mo("ICF-MO-VERGA","Execução de verga ICF","m","1.00")
  ],240,["icf"]),
  C("SYS-ICF-11-010","Contramarco/aro técnico em vão ICF","esquadrias","m",[
    mat("ICF-MAT-AROVAO","Perfil/aro técnico de vão","m","1.05","Esquadrias"),
    mat("ICF-MAT-SELVAO","Selante e fita de vedação","m","1.10","Esquadrias"),
    mo("ICF-MO-AROVAO","Execução de aro técnico","m","1.00")
  ],250,["icf"]),
  C("SYS-ICF-19-010","Reboco bruto interno sobre ICF com tela metálica","revestimento_bruto_interno","m²",[
    mat("ICF-MAT-TELAACO","Tela metálica galvanizada","m²","1.10","Revestimentos"),
    mat("ICF-MAT-FIXTELA","Fixação de tela","un","6.00","Revestimentos"),
    mat("ARQ-MAT-CHAP","Ponte de aderência/chapisco","kg","4.00","Argamassas"),
    mat("ARQ-MAT-REVARG","Argamassa de reboco","kg","20.00","Argamassas"),
    mo("ICF-MO-REBINT","Aplicação de revestimento interno","m²","1.00")
  ],260,["icf"]),
  C("SYS-ICF-20-010","Reboco bruto externo sobre ICF com tela metálica","revestimento_bruto_externo","m²",[
    mat("ICF-MAT-TELAACO","Tela metálica galvanizada","m²","1.10","Revestimentos"),
    mat("ICF-MAT-FIXTELA","Fixação de tela","un","6.00","Revestimentos"),
    mat("ARQ-MAT-CHAP","Ponte de aderência/chapisco","kg","4.00","Argamassas"),
    mat("ARQ-MAT-REVARG","Argamassa de reboco externo","kg","22.00","Argamassas"),
    mo("ICF-MO-REBEXT","Aplicação de revestimento externo","m²","1.00")
  ],270,["icf"]),

  // ── ALVENARIA CONVENCIONAL ────────────────────────────────────────────────
  C("SYS-ALVC-05-010","Baldrame para alvenaria convencional","fundacoes","m",[
    mat("ARQ-MAT-CONC30","Concreto estrutural","m³","0.10","Concreto"),
    mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","8.00","Aço"),
    mat("ARQ-MAT-FORMA","Forma","m²","0.80","Formas"),
    mo("ALVC-MO-BALD","Execução de baldrame","m","1.00")
  ],210,["alvenaria_convencional"]),
  C("SYS-ALVC-08-010","Parede bloco cerâmico de vedação","sistema_construtivo_paredes","m²",[
    mat("ALVC-MAT-BLOCOCER","Bloco cerâmico de vedação","un","16.50","Alvenaria"),
    mat("SYS-MAT-ARGASS","Argamassa de assentamento","kg","9.00","Argamassas"),
    mo("ALVC-MO-ELEV","Elevação de alvenaria","m²","1.00")
  ],220,["alvenaria_convencional"]),
  C("SYS-ALVC-08-011","Parede bloco de concreto de vedação","sistema_construtivo_paredes","m²",[
    mat("ALVC-MAT-BLOCOCONC","Bloco de concreto de vedação","un","12.50","Alvenaria"),
    mat("SYS-MAT-ARGASS","Argamassa de assentamento","kg","8.00","Argamassas"),
    mo("ALVC-MO-ELEVCONC","Elevação de alvenaria bloco concreto","m²","1.00")
  ],230,["alvenaria_convencional"]),
  C("SYS-ALVC-08-012","Encunhamento de alvenaria convencional","sistema_construtivo_paredes","m",[
    mat("ALVC-MAT-ENC","Argamassa/material de encunhamento","kg","2.00","Alvenaria"),
    mo("ALVC-MO-ENC","Execução de encunhamento","m","1.00")
  ],240,["alvenaria_convencional"]),
  C("SYS-ALVC-19-010","Chapisco + emboço/reboco interno","revestimento_bruto_interno","m²",[
    mat("ARQ-MAT-CHAP","Chapisco","kg","4.00","Argamassas"),
    mat("ARQ-MAT-REVARG","Argamassa de emboço/reboco","kg","20.00","Argamassas"),
    mo("ALVC-MO-REBINT","Revestimento interno","m²","1.00")
  ],250,["alvenaria_convencional"]),
  C("SYS-ALVC-20-010","Chapisco + emboço/reboco externo","revestimento_bruto_externo","m²",[
    mat("ARQ-MAT-CHAP","Chapisco","kg","4.00","Argamassas"),
    mat("ARQ-MAT-REVARG","Argamassa de emboço/reboco externo","kg","22.00","Argamassas"),
    mo("ALVC-MO-REBEXT","Revestimento externo","m²","1.00")
  ],260,["alvenaria_convencional"]),

  // ── ALVENARIA ESTRUTURAL ──────────────────────────────────────────────────
  C("SYS-ALVE-05-010","Fundação preparada para alvenaria estrutural","fundacoes","m",[
    mat("ARQ-MAT-CONC30","Concreto estrutural","m³","0.12","Concreto"),
    mat("ARQ-MAT-ACO","Aço/arranques","kg","10.00","Aço"),
    mo("ALVE-MO-FUND","Execução de base para alvenaria estrutural","m","1.00")
  ],210,["alvenaria_estrutural"]),
  C("SYS-ALVE-08-010","Parede estrutural bloco de concreto","sistema_construtivo_paredes","m²",[
    mat("ALVE-MAT-BLOCOEST","Bloco estrutural","un","12.50","Alvenaria estrutural"),
    mat("ALVE-MAT-ARGEST","Argamassa estrutural","kg","8.00","Argamassas"),
    mat("SYS-MAT-GRAUTE","Graute","m³","0.015","Concreto"),
    mat("ARQ-MAT-ACO","Armadura vertical/horizontal","kg","2.00","Aço"),
    mo("ALVE-MO-PAREDE","Execução de parede estrutural","m²","1.00")
  ],220,["alvenaria_estrutural"]),
  C("SYS-ALVE-08-011","Cinta de amarração em alvenaria estrutural","sistema_construtivo_paredes","m",[
    mat("SYS-MAT-CANALETAEST","Canaleta estrutural","un","2.50","Alvenaria estrutural"),
    mat("SYS-MAT-GRAUTE","Graute","m³","0.012","Concreto"),
    mat("ARQ-MAT-ACO","Aço longitudinal","kg","1.80","Aço"),
    mo("ALVE-MO-CINTA","Execução cinta","m","1.00")
  ],230,["alvenaria_estrutural"]),
  C("SYS-ALVE-08-012","Verga/contraverga estrutural","sistema_construtivo_paredes","m",[
    mat("SYS-MAT-CANALETAEST","Canaleta estrutural","un","2.50","Alvenaria estrutural"),
    mat("SYS-MAT-GRAUTE","Graute","m³","0.012","Concreto"),
    mat("ARQ-MAT-ACO","Aço de reforço","kg","2.20","Aço"),
    mo("ALVE-MO-VERGA","Execução verga/contraverga","m","1.00")
  ],240,["alvenaria_estrutural"]),
  C("SYS-ALVE-19-010","Revestimento interno em alvenaria estrutural","revestimento_bruto_interno","m²",[
    mat("ARQ-MAT-CHAP","Chapisco","kg","4.00","Argamassas"),
    mat("ARQ-MAT-REVARG","Argamassa de reboco","kg","18.00","Argamassas"),
    mo("ALVE-MO-REVINT","Revestimento interno","m²","1.00")
  ],250,["alvenaria_estrutural"]),

  // ── CONCRETO ARMADO + VEDAÇÃO ─────────────────────────────────────────────
  C("SYS-CAV-07-010","Estrutura reticulada de concreto armado","estrutura_principal","m³",[
    mat("ARQ-MAT-CONC30","Concreto estrutural","m³","1.00","Concreto"),
    mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","125.00","Aço"),
    mat("ARQ-MAT-FORMA","Forma","m²","9.50","Formas"),
    mo("CAV-MO-ESTR","Execução estrutura reticulada","m³","1.00")
  ],210,["concreto_armado_vedacao"]),
  C("SYS-CAV-08-010","Vedação cerâmica em estrutura de concreto","sistema_construtivo_paredes","m²",[
    mat("ALVC-MAT-BLOCOCER","Bloco cerâmico de vedação","un","16.50","Alvenaria"),
    mat("SYS-MAT-ARGASS","Argamassa de assentamento","kg","9.00","Argamassas"),
    mo("CAV-MO-VED","Execução vedação","m²","1.00")
  ],220,["concreto_armado_vedacao"]),
  C("SYS-CAV-19-010","Tratamento de encontro concreto/alvenaria interno","revestimento_bruto_interno","m",[
    mat("CAV-MAT-TELA","Tela de reforço de interface","m","1.10","Revestimentos"),
    mat("ARQ-MAT-CHAP","Chapisco/ponte de aderência","kg","2.00","Argamassas"),
    mo("CAV-MO-INTERF","Tratamento de interface","m","1.00")
  ],230,["concreto_armado_vedacao"]),
  C("SYS-CAV-20-010","Tratamento de encontro concreto/alvenaria externo","revestimento_bruto_externo","m",[
    mat("CAV-MAT-TELA","Tela de reforço de interface","m","1.10","Revestimentos"),
    mat("ARQ-MAT-CHAP","Chapisco/ponte de aderência","kg","2.00","Argamassas"),
    mo("CAV-MO-INTERFEXT","Tratamento interface externa","m","1.00")
  ],240,["concreto_armado_vedacao"]),

  // ── PAREDE DE CONCRETO ────────────────────────────────────────────────────
  C("SYS-PCON-05-010","Radier para parede de concreto","fundacoes","m²",[
    mat("ARQ-MAT-CONC30","Concreto estrutural","m³","0.12","Concreto"),
    mat("ARQ-MAT-MALHA","Tela soldada","m²","1.10","Aço"),
    mat("ARQ-MAT-ACO","Reforços/arranques","kg","4.00","Aço"),
    mo("PCON-MO-RAD","Execução de radier","m²","1.00")
  ],210,["parede_concreto"]),
  C("SYS-PCON-08-010","Parede de concreto moldada in loco — ciclo completo","sistema_construtivo_paredes","m²",[
    mat("ARQ-MAT-CONC30","Concreto para parede","m³","0.10","Concreto"),
    mat("ARQ-MAT-ACO","Armadura/tela","kg","4.50","Aço"),
    mat("SYS-MAT-FORMAPC","Sistema de formas","m²","1.00","Formas"),
    mat("PCON-MAT-DESMOLD","Desmoldante","l","0.05","Formas"),
    mat("PCON-MAT-ESP","Espaçadores/tirantes","un","4.00","Estrutura"),
    mo("PCON-MO-CICLO","Montagem, concretagem e desforma","m²","1.00")
  ],220,["parede_concreto"]),
  C("SYS-PCON-08-011","Embutes/caixas em parede de concreto","sistema_construtivo_paredes","ponto",[
    mat("PCON-MAT-EMB","Caixa/embutido compatível","un","1.00","Instalações"),
    mat("PCON-MAT-FIXEMB","Fixação de embutidos","cj","1.00","Instalações"),
    mo("PCON-MO-EMB","Posicionamento de embutidos antes da concretagem","ponto","1.00")
  ],230,["parede_concreto"]),
  C("SYS-PCON-19-010","Regularização fina interna de parede de concreto","revestimento_bruto_interno","m²",[
    mat("PCON-MAT-PONTE","Ponte de aderência","kg","0.25","Revestimentos"),
    mat("PCON-MAT-REG","Massa cimentícia de regularização","kg","3.00","Revestimentos"),
    mo("PCON-MO-REG","Regularização fina","m²","1.00")
  ],240,["parede_concreto"]),

  // ── LIGHT STEEL FRAME ─────────────────────────────────────────────────────
  C("SYS-LSF-05-010","Base/ancoragem de painel LSF","fundacoes","m",[
    mat("LSF-MAT-GUIA","Guia de base galvanizada","m","1.05","Steel Frame"),
    mat("SYS-MAT-ANCLSF","Chumbadores/ancoragens","un","1.50","Steel Frame"),
    mat("SYS-MAT-FITAISO","Fita de isolamento sob guia","m","1.05","Steel Frame"),
    mo("LSF-MO-BASE","Montagem da base","m","1.00")
  ],210,["steel_frame"]),
  C("SYS-LSF-08-010","Painel LSF externo completo","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-LSFPERF","Perfis galvanizados","kg","6.50","Steel Frame"),
    mat("SYS-MAT-OSB","OSB estrutural","m²","1.05","Steel Frame"),
    mat("SYS-MAT-MEMB","Membrana hidrófuga","m²","1.10","Steel Frame"),
    mat("SYS-MAT-CIMENT","Placa cimentícia","m²","1.05","Steel Frame"),
    mat("SYS-MAT-LA","Isolamento termoacústico","m²","1.00","Isolamento"),
    mat("SYS-MAT-DRYCHAPA","Drywall interno","m²","1.05","Drywall"),
    mat("SYS-MAT-LSFFIX","Parafusos/fixadores","un","25.00","Steel Frame"),
    mo("LSF-MO-PAINEL","Montagem painel externo","m²","1.00")
  ],220,["steel_frame"]),
  C("SYS-LSF-08-011","Painel LSF interno","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-LSFPERF","Perfis galvanizados","kg","4.50","Steel Frame"),
    mat("SYS-MAT-DRYCHAPA","Chapas drywall duas faces","m²","2.10","Drywall"),
    mat("SYS-MAT-LA","Isolamento termoacústico","m²","1.00","Isolamento"),
    mat("SYS-MAT-LSFFIX","Parafusos/fixadores","un","24.00","Steel Frame"),
    mo("LSF-MO-INT","Montagem painel interno","m²","1.00")
  ],230,["steel_frame"]),
  C("SYS-LSF-09-010","Tesoura/estrutura de cobertura LSF","cobertura","m²",[
    mat("LSF-MAT-PERFCOB","Perfis LSF de cobertura","kg","5.50","Cobertura"),
    mat("SYS-MAT-LSFFIX","Parafusos/fixadores","un","18.00","Cobertura"),
    mo("LSF-MO-COB","Montagem cobertura LSF","m²","1.00")
  ],240,["steel_frame"]),
  C("SYS-LSF-20-010","Fachada LSF com basecoat e tela","revestimento_bruto_externo","m²",[
    mat("SYS-MAT-BASECOAT","Basecoat","kg","4.00","Fachada"),
    mat("SYS-MAT-TELAFV","Tela de fibra de vidro AR","m²","1.10","Fachada"),
    mat("SYS-MAT-CANTPVC","Cantoneiras/perfis de acabamento","m","0.20","Fachada"),
    mo("LSF-MO-FACH","Tratamento de fachada","m²","1.00")
  ],250,["steel_frame"]),

  // ── WOOD FRAME ────────────────────────────────────────────────────────────
  C("SYS-WF-05-010","Base/ancoragem de painel Wood Frame","fundacoes","m",[
    mat("WF-MAT-SOLEIRA","Soleira de madeira tratada","m","1.05","Wood Frame"),
    mat("SYS-MAT-ANCWF","Chumbadores/ancoragens","un","1.50","Wood Frame"),
    mat("SYS-MAT-BARREIRABASE","Barreira capilar","m","1.05","Wood Frame"),
    mo("WF-MO-BASE","Montagem da base","m","1.00")
  ],210,["wood_frame"]),
  C("SYS-WF-08-010","Painel Wood Frame externo completo","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-MADESTR","Madeira estrutural tratada","m³","0.025","Wood Frame"),
    mat("SYS-MAT-OSB","OSB estrutural","m²","1.05","Wood Frame"),
    mat("SYS-MAT-MEMB","Membrana hidrófuga","m²","1.10","Wood Frame"),
    mat("SYS-MAT-CIMENT","Placa cimentícia","m²","1.05","Wood Frame"),
    mat("SYS-MAT-LA","Isolamento termoacústico","m²","1.00","Isolamento"),
    mat("SYS-MAT-DRYCHAPA","Drywall interno","m²","1.05","Drywall"),
    mat("SYS-MAT-WFFIX","Fixadores","un","25.00","Wood Frame"),
    mo("WF-MO-PAINEL","Montagem painel externo","m²","1.00")
  ],220,["wood_frame"]),
  C("SYS-WF-08-011","Painel Wood Frame interno","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-MADESTR","Madeira estrutural tratada","m³","0.018","Wood Frame"),
    mat("SYS-MAT-DRYCHAPA","Chapas drywall duas faces","m²","2.10","Drywall"),
    mat("SYS-MAT-LA","Isolamento termoacústico","m²","1.00","Isolamento"),
    mat("SYS-MAT-WFFIX","Fixadores","un","24.00","Wood Frame"),
    mo("WF-MO-INT","Montagem painel interno","m²","1.00")
  ],230,["wood_frame"]),
  C("SYS-WF-09-010","Estrutura de cobertura Wood Frame","cobertura","m²",[
    mat("WF-MAT-MADCOB","Madeira estrutural para cobertura","m³","0.025","Cobertura"),
    mat("SYS-MAT-WFFIX","Fixadores","un","18.00","Cobertura"),
    mo("WF-MO-COB","Montagem cobertura Wood Frame","m²","1.00")
  ],240,["wood_frame"]),
  C("SYS-WF-20-010","Fachada Wood Frame com placa cimentícia/basecoat","revestimento_bruto_externo","m²",[
    mat("SYS-MAT-CIMENT","Placa cimentícia","m²","1.05","Fachada"),
    mat("SYS-MAT-TELAFV","Tela de fibra de vidro AR","m²","1.10","Fachada"),
    mat("SYS-MAT-BASECOAT","Basecoat","kg","4.00","Fachada"),
    mo("WF-MO-FACH","Tratamento de fachada","m²","1.00")
  ],250,["wood_frame"]),

  // ── PRÉ-MOLDADO DE CONCRETO ───────────────────────────────────────────────
  C("SYS-PRE-05-010","Fundação tipo cálice para pilar pré-moldado","fundacoes","un",[
    mat("ARQ-MAT-CONC30","Concreto estrutural","m³","0.60","Concreto"),
    mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","65.00","Aço"),
    mat("ARQ-MAT-FORMA","Forma","m²","4.00","Formas"),
    mo("PRE-MO-CALICE","Execução de cálice","un","1.00")
  ],210,["pre_moldado_concreto"]),
  C("SYS-PRE-07-010","Pilar pré-moldado de concreto","estrutura_principal","m³",[
    svc("PRE-SRV-PILAR","Pilar pré-moldado conforme projeto","m³","1.00","Pré-moldado"),
    svc("PRE-SRV-ICAPIL","Içamento e montagem","m³","1.00","Equipamentos"),
    mat("SYS-MAT-GRAUTEPRE","Graute de ligação","kg","3.00","Pré-moldado"),
    mo("PRE-MO-PILAR","Equipe de montagem","m³","1.00")
  ],220,["pre_moldado_concreto"]),
  C("SYS-PRE-07-011","Viga pré-moldada de concreto","estrutura_principal","m³",[
    svc("PRE-SRV-VIGA","Viga pré-moldada conforme projeto","m³","1.00","Pré-moldado"),
    svc("PRE-SRV-ICAVIG","Içamento e montagem","m³","1.00","Equipamentos"),
    mat("PRE-MAT-APOIO","Apoios/insertos de ligação","cj","1.00","Pré-moldado"),
    mo("PRE-MO-VIGA","Equipe de montagem","m³","1.00")
  ],230,["pre_moldado_concreto"]),
  C("SYS-PRE-07-012","Laje alveolar/pré-moldada","estrutura_principal","m²",[
    svc("PRE-SRV-LAJE","Laje pré-moldada/alveolar","m²","1.00","Pré-moldado"),
    svc("PRE-SRV-ICALAJ","Içamento e montagem","m²","1.00","Equipamentos"),
    mat("PRE-MAT-JUNTA","Graute/junta de laje","kg","3.00","Pré-moldado"),
    mo("PRE-MO-LAJE","Montagem de laje","m²","1.00")
  ],240,["pre_moldado_concreto"]),
  C("SYS-PRE-08-010","Painel pré-moldado de fechamento","sistema_construtivo_paredes","m²",[
    svc("PRE-SRV-PAINEL","Painel pré-moldado","m²","1.00","Pré-moldado"),
    svc("PRE-SRV-ICAPAINEL","Içamento e montagem","m²","1.00","Equipamentos"),
    mat("SYS-MAT-SELJUNTA","Selante de juntas","m","0.30","Pré-moldado"),
    mo("PRE-MO-PAINEL","Equipe de montagem","m²","1.00")
  ],250,["pre_moldado_concreto"]),

  // ── ESTRUTURA METÁLICA + FECHAMENTO ───────────────────────────────────────
  C("SYS-EMF-05-010","Base e chumbadores de pilar metálico","fundacoes","un",[
    mat("SYS-MAT-PLACABASE","Placa base metálica","un","1.00","Estrutura metálica"),
    mat("SYS-MAT-CHUMBEST","Chumbadores estruturais","cj","1.00","Estrutura metálica"),
    mat("SYS-MAT-GRAUTENA","Graute não retrátil","kg","10.00","Estrutura metálica"),
    mo("EMF-MO-BASE","Nivelamento e montagem placa base","un","1.00")
  ],210,["estrutura_metalica_fechamento"]),
  C("SYS-EMF-07-010","Pilar metálico","estrutura_principal","kg",[
    mat("ARQ-MAT-ACOPERF","Perfil estrutural de aço","kg","1.00","Estrutura metálica"),
    mat("SYS-MAT-CHAPAACO","Chapas de ligação","kg","0.08","Estrutura metálica"),
    mat("SYS-MAT-PARAFEST","Parafusos estruturais","un","0.12","Estrutura metálica"),
    svc("EMF-SRV-PROT","Proteção anticorrosiva","kg","1.00","Estrutura metálica"),
    mo("EMF-MO-PILAR","Fabricação e montagem","kg","1.00")
  ],220,["estrutura_metalica_fechamento"]),
  C("SYS-EMF-07-011","Viga metálica","estrutura_principal","kg",[
    mat("ARQ-MAT-ACOPERF","Perfil estrutural de aço","kg","1.00","Estrutura metálica"),
    mat("SYS-MAT-CHAPAACO","Chapas de ligação","kg","0.10","Estrutura metálica"),
    mat("SYS-MAT-PARAFEST","Parafusos estruturais","un","0.14","Estrutura metálica"),
    svc("EMF-SRV-PROT","Proteção anticorrosiva","kg","1.00","Estrutura metálica"),
    mo("EMF-MO-VIGA","Fabricação e montagem","kg","1.00")
  ],230,["estrutura_metalica_fechamento"]),
  C("SYS-EMF-08-010","Fechamento em painel termoacústico","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-PAINELTERM","Painel termoacústico","m²","1.05","Fechamentos"),
    mat("SYS-MAT-FIXPAINEL","Fixadores e vedação","cj","0.10","Fechamentos"),
    mo("EMF-MO-FECH","Instalação de fechamento","m²","1.00")
  ],240,["estrutura_metalica_fechamento"]),
  C("SYS-EMF-09-010","Cobertura metálica com telha termoacústica","cobertura","m²",[
    mat("ARQ-MAT-ACOPERF","Perfis metálicos de cobertura","kg","8.00","Cobertura"),
    mat("ARQ-MAT-TELHATERM","Telha termoacústica","m²","1.08","Cobertura"),
    mat("ARQ-MAT-FIXTELHA","Fixadores","un","5.00","Cobertura"),
    mo("EMF-MO-COB","Montagem de cobertura","m²","1.00")
  ],250,["estrutura_metalica_fechamento"]),

  // ── SIP / PAINÉIS INDUSTRIALIZADOS ────────────────────────────────────────
  C("SYS-SIP-05-010","Base e ancoragem de painéis SIP","fundacoes","m",[
    mat("SYS-MAT-ANCSIP","Ancoragens/conectores de base","cj","0.20","SIP"),
    mat("SYS-MAT-SELSIP","Selante/barreira de base","m","1.05","SIP"),
    mo("SIP-MO-BASE","Montagem da base","m","1.00")
  ],210,["sip_paineis"]),
  C("SYS-SIP-08-010","Painel SIP de parede","sistema_construtivo_paredes","m²",[
    svc("SYS-SRV-SIP","Painel SIP estrutural","m²","1.05","SIP"),
    mat("SYS-MAT-SIPCON","Spline/conector","m","0.50","SIP"),
    mat("SYS-MAT-SIPFIX","Fixadores e selantes","cj","0.10","SIP"),
    mo("SIP-MO-PAINEL","Montagem de painel SIP","m²","1.00")
  ],220,["sip_paineis"]),
  C("SYS-SIP-08-011","Reforço de vão em painel SIP","sistema_construtivo_paredes","m",[
    mat("SIP-MAT-REFVAO","Perfil/peça de reforço","m","1.05","SIP"),
    mat("SYS-MAT-SIPFIX","Fixadores e selantes","cj","0.10","SIP"),
    mo("SIP-MO-VAO","Execução de reforço de vão","m","1.00")
  ],230,["sip_paineis"]),
  C("SYS-SIP-09-010","Cobertura com painel SIP","cobertura","m²",[
    svc("SIP-SRV-PAINELCOB","Painel SIP de cobertura","m²","1.05","SIP"),
    mat("SYS-MAT-SIPCON","Conectores","m","0.50","SIP"),
    mat("SYS-MAT-SIPFIX","Fixadores/selantes","cj","0.10","SIP"),
    mo("SIP-MO-COB","Montagem cobertura SIP","m²","1.00")
  ],240,["sip_paineis"]),
  C("SYS-SIP-20-010","Fachada sobre SIP com membrana + placa/basecoat","revestimento_bruto_externo","m²",[
    mat("SYS-MAT-MEMB","Membrana hidrófuga","m²","1.10","SIP"),
    mat("SYS-MAT-CIMENT","Placa cimentícia","m²","1.05","SIP"),
    mat("SYS-MAT-TELAFV","Tela AR","m²","1.10","Fachada"),
    mat("SYS-MAT-BASECOAT","Basecoat","kg","4.00","Fachada"),
    mo("SIP-MO-FACH","Execução de fachada SIP","m²","1.00")
  ],250,["sip_paineis"]),

  // ── SISTEMA HÍBRIDO ───────────────────────────────────────────────────────
  C("SYS-HIB-05-010","Compatibilização de ancoragens entre sistemas","fundacoes","un",[
    svc("HIB-SRV-ANC","Detalhe/kit de ancoragem entre tecnologias"),
    mo("HIB-MO-ANC","Execução de ancoragem híbrida","un","1.00")
  ],210,["hibrido"]),
  C("SYS-HIB-07-010","Ligação estrutural entre sistemas","estrutura_principal","un",[
    svc("HIB-SRV-LIG","Ligação/conector estrutural conforme projeto"),
    mo("HIB-MO-LIG","Execução de ligação estrutural","un","1.00")
  ],220,["hibrido"]),
  C("SYS-HIB-08-010","Transição de parede entre sistemas","sistema_construtivo_paredes","m",[
    mat("HIB-MAT-PERFIL","Perfil/peça de transição","m","1.05","Sistema híbrido"),
    mat("HIB-MAT-SEL","Selante/fita compatível","m","1.10","Sistema híbrido"),
    mo("HIB-MO-PAREDE","Execução de transição","m","1.00")
  ],230,["hibrido"]),
  C("SYS-HIB-10-010","Impermeabilização de encontro híbrido","impermeabilizacao","m",[
    mat("SYS-MAT-HIBMEMB","Membrana/fita de transição","m","1.10","Impermeabilização"),
    mat("SYS-MAT-HIBSEL","Selante compatível","un","0.10","Impermeabilização"),
    mo("HIB-MO-IMP","Tratamento de encontro","m","1.00")
  ],240,["hibrido"]),
  C("SYS-HIB-20-010","Tratamento de fachada em transição híbrida","revestimento_bruto_externo","m",[
    mat("SYS-MAT-HIBTELA","Tela de reforço de interface","m","1.10","Fachada"),
    mat("SYS-MAT-HIBMASSA","Massa/basecoat compatível","kg","2.00","Fachada"),
    mo("HIB-MO-FACH","Tratamento de transição de fachada","m","1.00")
  ],250,["hibrido"])
];
