/**
 * Catálogo universal de composições de obra — v2026.10.07.
 *
 * Objetivos:
 * - cobrir as 40 macroetapas padrão;
 * - reutilizar composições universais entre sistemas;
 * - adicionar composições específicas somente onde a tecnologia altera a execução;
 * - não gravar preços monetários: preços vêm da Tabela Mestre/cotações/histórico/manual;
 * - coeficientes são referências iniciais editáveis e devem ser confirmados pelo projeto,
 *   memorial e fabricante antes de fechamento executivo.
 */

export type StandardCompositionItem = {
  codigo: string;
  nome: string;
  unidade: string;
  tipo: "material" | "mao_de_obra" | "equipamento" | "servico";
  categoria: string;
  quantidade: string;
};

export type StandardConstructionSystem =
  | "icf"
  | "alvenaria_convencional"
  | "alvenaria_estrutural"
  | "concreto_armado_vedacao"
  | "parede_concreto"
  | "steel_frame"
  | "wood_frame"
  | "pre_moldado_concreto"
  | "estrutura_metalica_fechamento"
  | "sip_paineis"
  | "hibrido"
  | "outro";

export type StandardConstructionStage =
  | "pre_obra_projetos"
  | "mobilizacao_canteiro"
  | "terraplenagem_preparacao"
  | "locacao_obra"
  | "fundacoes"
  | "infraestrutura_enterrada"
  | "estrutura_principal"
  | "sistema_construtivo_paredes"
  | "cobertura"
  | "impermeabilizacao"
  | "esquadrias"
  | "instalacoes_hidraulicas"
  | "instalacoes_sanitarias"
  | "instalacoes_pluviais"
  | "instalacoes_eletricas"
  | "dados_automacao_seguranca"
  | "climatizacao_ventilacao"
  | "energia_sistemas_especiais"
  | "revestimento_bruto_interno"
  | "revestimento_bruto_externo"
  | "contrapisos_regularizacoes"
  | "forros"
  | "revestimentos_pisos"
  | "revestimentos_paredes"
  | "pintura_interna"
  | "pintura_externa_fachadas"
  | "loucas_metais"
  | "marcenaria_mobiliario"
  | "marmoraria"
  | "serralheria"
  | "iluminacao_acabamentos_eletricos"
  | "piscina_lazer"
  | "areas_externas"
  | "paisagismo"
  | "infraestrutura_externa"
  | "equipamentos_especiais"
  | "limpeza_acabamento_final"
  | "testes_comissionamento"
  | "vistoria_entrega"
  | "pos_obra_assistencia";

export type StandardConstructionComposition = {
  codigo: string;
  nome: string;
  descricao: string;
  unidade: string;
  etapaKey: StandardConstructionStage;
  sistemasConstrutivos: StandardConstructionSystem[];
  comumTodosSistemas: boolean;
  ordem: number;
  itens: StandardCompositionItem[];
};

const svc = (codigo: string, nome: string, unidade = "serv", quantidade = "1.00", categoria = "Serviços"): StandardCompositionItem => ({
  codigo, nome, unidade, tipo: "servico", categoria, quantidade,
});
const mo = (codigo: string, nome: string, unidade = "h", quantidade = "1.00"): StandardCompositionItem => ({
  codigo, nome, unidade, tipo: "mao_de_obra", categoria: "Mão de obra", quantidade,
});
const mat = (codigo: string, nome: string, unidade: string, quantidade: string, categoria: string): StandardCompositionItem => ({
  codigo, nome, unidade, tipo: "material", categoria, quantidade,
});
const eqp = (codigo: string, nome: string, unidade = "h", quantidade = "1.00"): StandardCompositionItem => ({
  codigo, nome, unidade, tipo: "equipamento", categoria: "Equipamentos", quantidade,
});
const C = (
  codigo: string,
  nome: string,
  etapaKey: StandardConstructionStage,
  unidade: string,
  itens: StandardCompositionItem[],
  ordem: number,
  sistemasConstrutivos: StandardConstructionSystem[] = [],
  descricao?: string,
): StandardConstructionComposition => ({
  codigo,
  nome,
  descricao: descricao ?? `Composição padrão editável para ${nome}.`,
  unidade,
  etapaKey,
  sistemasConstrutivos,
  comumTodosSistemas: sistemasConstrutivos.length === 0,
  ordem,
  itens,
});

const UNIVERSAIS: StandardConstructionComposition[] = [
  C("ARQ-01-001","Levantamento topográfico","pre_obra_projetos","serv",[svc("ARQ-SRV-TOPO","Levantamento topográfico")],10),
  C("ARQ-01-002","Sondagem do solo","pre_obra_projetos","serv",[svc("ARQ-SRV-SOND","Sondagem geotécnica")],20),
  C("ARQ-01-003","Projetos e compatibilização","pre_obra_projetos","serv",[svc("ARQ-SRV-PROJ","Projetos técnicos e compatibilização")],30),
  C("ARQ-01-004","Aprovações, ART/RRT e licenças","pre_obra_projetos","serv",[svc("ARQ-SRV-LIC","Taxas, ART/RRT e aprovações")],40),

  C("ARQ-02-001","Implantação do canteiro","mobilizacao_canteiro","serv",[mat("ARQ-MAT-TAPUME","Tapume e fechamento provisório","m","1.00","Canteiro"),svc("ARQ-SRV-BARRACAO","Barracão/apoio provisório"),svc("ARQ-SRV-BANHPROV","Banheiro provisório"),mo("ARQ-MO-CANT","Mão de obra de implantação","h","8.00")],10),
  C("ARQ-02-002","Água e energia provisórias","mobilizacao_canteiro","serv",[svc("ARQ-SRV-AGUAPROV","Ligação provisória de água"),svc("ARQ-SRV-ENEPROV","Ligação provisória de energia")],20),

  C("ARQ-03-001","Limpeza e preparação do terreno","terraplenagem_preparacao","m²",[mo("ARQ-MO-LIMPTERR","Limpeza do terreno","m²","1.00"),eqp("ARQ-EQP-RETRO","Retroescavadeira","h","0.02")],10),
  C("ARQ-03-002","Corte/aterro e compactação","terraplenagem_preparacao","m³",[eqp("ARQ-EQP-ESCAV","Escavação mecânica","h","0.04"),eqp("ARQ-EQP-COMPACT","Compactação mecânica","h","0.05"),mo("ARQ-MO-TERRA","Apoio terraplenagem","h","0.10")],20),

  C("ARQ-04-001","Locação e gabarito da obra","locacao_obra","m²",[mat("ARQ-MAT-GAB","Madeira/material de gabarito","m","0.20","Locação"),mo("ARQ-MO-LOC","Mão de obra locação","m²","1.00"),svc("ARQ-SRV-CONFTOPO","Conferência topográfica")],10),

  C("ARQ-05-001","Escavação de fundações","fundacoes","m³",[eqp("ARQ-EQP-ESCAV","Escavação mecânica","h","0.08"),mo("ARQ-MO-ESCAV","Acerto manual de escavação","h","0.30")],10),
  C("ARQ-05-002","Lastro de concreto magro","fundacoes","m³",[mat("ARQ-MAT-CONCMAG","Concreto magro","m³","1.00","Concreto"),mo("ARQ-MO-LASTRO","Lançamento de lastro","h","1.20")],20),
  C("ARQ-05-003","Radier de concreto armado","fundacoes","m²",[mat("ARQ-MAT-CONC30","Concreto estrutural C30","m³","0.12","Concreto"),mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","8.00","Aço"),mat("ARQ-MAT-MALHA","Tela soldada","m²","1.05","Aço"),mat("ARQ-MAT-ESP","Espaçadores","un","4.00","Estrutura"),mo("ARQ-MO-RADIER","Execução de radier","m²","1.00")],30),
  C("ARQ-05-004","Sapata/bloco de fundação em concreto armado","fundacoes","m³",[mat("ARQ-MAT-CONC30","Concreto estrutural C30","m³","1.00","Concreto"),mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","90.00","Aço"),mat("ARQ-MAT-FORMA","Forma para concreto","m²","6.00","Formas"),mo("ARQ-MO-FUNDCA","Mão de obra concreto armado fundação","h","8.00")],40),
  C("ARQ-05-005","Impermeabilização de baldrame/fundação","fundacoes","m²",[mat("ARQ-MAT-IMPERFUND","Impermeabilizante para fundação","kg","1.20","Impermeabilização"),mo("ARQ-MO-IMPERFUND","Aplicação impermeabilização","m²","1.00")],50),

  C("ARQ-06-001","Rede enterrada de esgoto","infraestrutura_enterrada","m",[mat("ARQ-MAT-TUBESG100","Tubo PVC esgoto 100 mm","m","1.05","Sanitária"),mat("ARQ-MAT-CONESG","Conexões esgoto","un","0.20","Sanitária"),mo("ARQ-MO-REDEESG","Instalação rede enterrada","m","1.00")],10),
  C("ARQ-06-002","Rede enterrada de água","infraestrutura_enterrada","m",[mat("ARQ-MAT-TUBAF","Tubulação água fria","m","1.05","Hidráulica"),mat("ARQ-MAT-CONAF","Conexões água fria","un","0.15","Hidráulica"),mo("ARQ-MO-REDEAF","Instalação rede água","m","1.00")],20),
  C("ARQ-06-003","Drenagem e pluvial enterrado","infraestrutura_enterrada","m",[mat("ARQ-MAT-TUBPLUV","Tubulação pluvial","m","1.05","Pluvial"),mat("ARQ-MAT-CXPLUV","Caixas/drenos pluviais","un","0.08","Pluvial"),mo("ARQ-MO-PLUV","Instalação drenagem","m","1.00")],30),

  C("ARQ-07-001","Pilar de concreto armado","estrutura_principal","m³",[mat("ARQ-MAT-CONC30","Concreto estrutural C30","m³","1.00","Concreto"),mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","120.00","Aço"),mat("ARQ-MAT-FORMA","Forma para concreto","m²","10.00","Formas"),mo("ARQ-MO-PILAR","Execução de pilar","m³","1.00")],10),
  C("ARQ-07-002","Viga de concreto armado","estrutura_principal","m³",[mat("ARQ-MAT-CONC30","Concreto estrutural C30","m³","1.00","Concreto"),mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","130.00","Aço"),mat("ARQ-MAT-FORMA","Forma para concreto","m²","9.00","Formas"),mo("ARQ-MO-VIGA","Execução de viga","m³","1.00")],20),
  C("ARQ-07-003","Laje treliçada com capa de concreto","estrutura_principal","m²",[mat("ARQ-MAT-LAJETR","Vigota/laje treliçada","m²","1.00","Lajes"),mat("ARQ-MAT-ENCHLAJE","Elemento de enchimento","m²","1.00","Lajes"),mat("ARQ-MAT-MALHA","Tela soldada","m²","1.05","Aço"),mat("ARQ-MAT-CONC30","Concreto estrutural C30","m³","0.05","Concreto"),mo("ARQ-MO-LAJETR","Montagem e concretagem de laje","m²","1.00")],30),
  C("ARQ-07-004","Escada de concreto armado","estrutura_principal","m³",[mat("ARQ-MAT-CONC30","Concreto estrutural C30","m³","1.00","Concreto"),mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","120.00","Aço"),mat("ARQ-MAT-FORMA","Forma para concreto","m²","8.00","Formas"),eqp("ARQ-EQP-ESCORA","Escoramento","dia","2.00"),mo("ARQ-MO-ESCADA","Execução de escada","m³","1.00")],40),

  C("ARQ-09-001","Estrutura metálica de cobertura","cobertura","kg",[mat("ARQ-MAT-ACOPERF","Perfis de aço estrutural","kg","1.00","Cobertura"),mat("ARQ-MAT-PARAFMET","Parafusos/fixadores metálicos","un","0.20","Cobertura"),mo("ARQ-MO-COBMET","Montagem estrutura metálica","kg","1.00")],10),
  C("ARQ-09-002","Estrutura de madeira para cobertura","cobertura","m²",[mat("ARQ-MAT-MADCob","Madeira estrutural para cobertura","m³","0.025","Cobertura"),mat("ARQ-MAT-FIXMAD","Fixadores para madeira","cj","0.05","Cobertura"),mo("ARQ-MO-COBMAD","Montagem cobertura madeira","m²","1.00")],20),
  C("ARQ-09-003","Telha termoacústica","cobertura","m²",[mat("ARQ-MAT-TELHATERM","Telha termoacústica","m²","1.08","Cobertura"),mat("ARQ-MAT-FIXTELHA","Fixadores de telha","un","5.00","Cobertura"),mo("ARQ-MO-TELHA","Instalação telhamento","m²","1.00")],30),
  C("ARQ-09-004","Calhas, rufos e condutores","cobertura","m",[mat("ARQ-MAT-CALHARUFO","Calha/rufo","m","1.05","Cobertura"),mo("ARQ-MO-CALHA","Instalação calhas/rufos","m","1.00")],40),

  C("ARQ-10-001","Impermeabilização de área molhada","impermeabilizacao","m²",[mat("ARQ-MAT-IMPERMOL","Impermeabilizante flexível","kg","1.50","Impermeabilização"),mat("ARQ-MAT-TELAIMP","Tela/reforço de impermeabilização","m²","0.25","Impermeabilização"),mo("ARQ-MO-IMPER","Aplicação impermeabilização","m²","1.00")],10),
  C("ARQ-10-002","Impermeabilização de laje","impermeabilizacao","m²",[mat("ARQ-MAT-MANTA","Manta/membrana impermeável","m²","1.10","Impermeabilização"),mat("ARQ-MAT-PRIMER","Primer","l","0.30","Impermeabilização"),mo("ARQ-MO-MANTA","Aplicação manta/membrana","m²","1.00")],20),

  C("ARQ-11-001","Instalação de janela","esquadrias","un",[svc("ARQ-SRV-JANELA","Janela conforme quadro de esquadrias"),mat("ARQ-MAT-VEDESQ","Selante/vedação esquadria","un","1.00","Esquadrias"),mo("ARQ-MO-JANELA","Instalação de janela","un","1.00")],10),
  C("ARQ-11-002","Instalação de porta","esquadrias","un",[svc("ARQ-SRV-PORTA","Porta conforme quadro de esquadrias"),mat("ARQ-MAT-VEDESQ","Selante/vedação esquadria","un","1.00","Esquadrias"),mo("ARQ-MO-PORTA","Instalação de porta","un","1.00")],20),

  C("ARQ-12-001","Ponto de água fria","instalacoes_hidraulicas","un",[mat("ARQ-MAT-TUBAF","Tubulação água fria","m","3.00","Hidráulica"),mat("ARQ-MAT-CONAF","Conexões água fria","un","3.00","Hidráulica"),mo("ARQ-MO-PTAF","Mão de obra ponto água fria","h","0.80")],10),
  C("ARQ-12-002","Ponto de água quente","instalacoes_hidraulicas","un",[mat("ARQ-MAT-TUBAQ","Tubulação água quente","m","3.00","Hidráulica"),mat("ARQ-MAT-CONAQ","Conexões água quente","un","3.00","Hidráulica"),mo("ARQ-MO-PTAQ","Mão de obra ponto água quente","h","0.90")],20),

  C("ARQ-13-001","Ponto de esgoto sanitário","instalacoes_sanitarias","un",[mat("ARQ-MAT-TUBESG","Tubulação esgoto","m","3.00","Sanitária"),mat("ARQ-MAT-CONESG","Conexões esgoto","un","3.00","Sanitária"),mo("ARQ-MO-PTESG","Mão de obra ponto esgoto","h","0.90")],10),
  C("ARQ-13-002","Caixa sifonada/inspeção","instalacoes_sanitarias","un",[mat("ARQ-MAT-CXSAN","Caixa sanitária","un","1.00","Sanitária"),mo("ARQ-MO-CXSAN","Instalação caixa sanitária","un","1.00")],20),

  C("ARQ-14-001","Condutor pluvial","instalacoes_pluviais","m",[mat("ARQ-MAT-CONDPLUV","Tubo/condutor pluvial","m","1.05","Pluvial"),mat("ARQ-MAT-FIXPLUV","Fixadores/conexões pluviais","cj","0.10","Pluvial"),mo("ARQ-MO-CONDPLUV","Instalação condutor","m","1.00")],10),
  C("ARQ-14-002","Cisterna/reaproveitamento pluvial","instalacoes_pluviais","un",[svc("ARQ-SRV-CISTERNA","Reservatório/cisterna e acessórios"),svc("ARQ-SRV-BOMBCIS","Bomba e automação da cisterna"),mo("ARQ-MO-CISTERNA","Instalação sistema pluvial","un","1.00")],20),

  C("ARQ-15-001","Ponto de tomada 10 A","instalacoes_eletricas","un",[mat("ARQ-MAT-ELETRO20","Eletroduto 20 mm","m","3.00","Elétrica"),mat("ARQ-MAT-CAB25","Cabo 2,5 mm²","m","9.00","Elétrica"),mat("ARQ-MAT-CX4X2","Caixa 4x2","un","1.00","Elétrica"),mat("ARQ-MAT-TOM10","Tomada 10 A","un","1.00","Elétrica"),mo("ARQ-MO-PTELE","Mão de obra ponto elétrico","h","0.80")],10),
  C("ARQ-15-002","Ponto de iluminação","instalacoes_eletricas","un",[mat("ARQ-MAT-ELETRO20","Eletroduto 20 mm","m","3.00","Elétrica"),mat("ARQ-MAT-CAB15","Cabo 1,5 mm²","m","6.00","Elétrica"),mat("ARQ-MAT-CXPLAF","Caixa de teto","un","1.00","Elétrica"),mo("ARQ-MO-PTILUM","Mão de obra ponto iluminação","h","0.60")],20),
  C("ARQ-15-003","Quadro elétrico e proteções","instalacoes_eletricas","un",[svc("ARQ-SRV-QDRO","Quadro, disjuntores, DR/DPS conforme projeto"),mo("ARQ-MO-QDRO","Montagem e identificação do quadro","un","1.00")],30),

  C("ARQ-16-001","Ponto de dados/CFTV","dados_automacao_seguranca","un",[mat("ARQ-MAT-ELETRO20","Eletroduto 20 mm","m","3.00","Elétrica"),mat("ARQ-MAT-CABREDE","Cabo de rede/dados","m","5.00","Dados"),mat("ARQ-MAT-CXDADOS","Caixa/keystone dados","un","1.00","Dados"),mo("ARQ-MO-DADOS","Instalação ponto dados","h","0.80")],10),
  C("ARQ-16-002","Ponto de automação/controle","dados_automacao_seguranca","un",[svc("ARQ-SRV-AUTPTO","Módulo/sensor conforme automação"),mo("ARQ-MO-AUT","Instalação e configuração automação","h","1.00")],20),

  C("ARQ-17-001","Infraestrutura para ar-condicionado","climatizacao_ventilacao","un",[mat("ARQ-MAT-COBREAC","Tubulação cobre frigorígena","m","4.00","Climatização"),mat("ARQ-MAT-DRENOAC","Tubulação dreno","m","4.00","Climatização"),mat("ARQ-MAT-ISOLAC","Isolamento frigorígeno","m","4.00","Climatização"),mo("ARQ-MO-INFRAAC","Instalação infraestrutura AC","un","1.00")],10),
  C("ARQ-17-002","Instalação de equipamento de climatização","climatizacao_ventilacao","un",[svc("ARQ-SRV-AC","Equipamento de climatização"),mo("ARQ-MO-AC","Instalação e startup AC","un","1.00")],20),

  C("ARQ-18-001","Sistema fotovoltaico","energia_sistemas_especiais","kWp",[svc("ARQ-SRV-FV","Kit fotovoltaico por potência","kWp","1.00","Energia"),mo("ARQ-MO-FV","Instalação sistema fotovoltaico","kWp","1.00")],10),
  C("ARQ-18-002","Carregador veicular","energia_sistemas_especiais","un",[svc("ARQ-SRV-WALLBOX","Carregador veicular e acessórios"),mo("ARQ-MO-WALLBOX","Instalação carregador veicular","un","1.00")],20),

  C("ARQ-19-001","Chapisco em parede","revestimento_bruto_interno","m²",[mat("ARQ-MAT-CHAP","Argamassa/chapisco","kg","4.00","Argamassas"),mo("ARQ-MO-CHAP","Aplicação chapisco","m²","1.00")],10),
  C("ARQ-19-002","Emboço/reboco interno","revestimento_bruto_interno","m²",[mat("ARQ-MAT-REVARG","Argamassa para emboço/reboco","kg","20.00","Argamassas"),mo("ARQ-MO-REBOCO","Execução emboço/reboco","m²","1.00")],20),

  C("ARQ-20-001","Chapisco em fachada","revestimento_bruto_externo","m²",[mat("ARQ-MAT-CHAP","Argamassa/chapisco","kg","4.00","Argamassas"),mo("ARQ-MO-CHAPEXT","Aplicação chapisco externo","m²","1.00")],10),
  C("ARQ-20-002","Emboço/reboco externo","revestimento_bruto_externo","m²",[mat("ARQ-MAT-REVARG","Argamassa para emboço/reboco","kg","22.00","Argamassas"),mo("ARQ-MO-REBOCOEXT","Execução emboço/reboco externo","m²","1.00")],20),

  C("ARQ-21-001","Contrapiso e regularização","contrapisos_regularizacoes","m²",[mat("ARQ-MAT-ARGCONTRA","Argamassa de contrapiso","kg","45.00","Argamassas"),mo("ARQ-MO-CONTRA","Execução contrapiso","m²","1.00")],10),

  C("ARQ-22-001","Forro de drywall","forros","m²",[mat("ARQ-MAT-DRYCHAPA","Chapa drywall","m²","1.05","Drywall"),mat("ARQ-MAT-FORPERF","Perfis para forro","m","2.50","Drywall"),mat("ARQ-MAT-DRYPAR","Parafusos drywall","un","15.00","Drywall"),mat("ARQ-MAT-DRYFITA","Fita juntas","m","1.50","Drywall"),mat("ARQ-MAT-DRYMASSA","Massa juntas","kg","0.60","Drywall"),mo("ARQ-MO-FORDRY","Montagem forro drywall","m²","1.00")],10),

  C("ARQ-23-001","Porcelanato em piso","revestimentos_pisos","m²",[mat("ARQ-MAT-PORC","Porcelanato","m²","1.10","Revestimentos"),mat("ARQ-MAT-ARGAC3","Argamassa ACIII","kg","5.00","Argamassas"),mat("ARQ-MAT-REJUNTE","Rejunte","kg","0.25","Revestimentos"),mo("ARQ-MO-PORC","Assentamento porcelanato","m²","1.00")],10),

  C("ARQ-24-001","Revestimento cerâmico em parede","revestimentos_paredes","m²",[mat("ARQ-MAT-REVPAR","Revestimento de parede","m²","1.10","Revestimentos"),mat("ARQ-MAT-ARGAC3","Argamassa ACIII","kg","5.00","Argamassas"),mat("ARQ-MAT-REJUNTE","Rejunte","kg","0.30","Revestimentos"),mo("ARQ-MO-REVPAR","Assentamento revestimento parede","m²","1.00")],10),

  C("ARQ-25-001","Massa e pintura interna","pintura_interna","m²",[mat("ARQ-MAT-MASSAC","Massa corrida","kg","1.50","Pintura"),mat("ARQ-MAT-SELADOR","Selador/fundo","l","0.12","Pintura"),mat("ARQ-MAT-TINTINT","Tinta interna","l","0.22","Pintura"),mat("ARQ-MAT-LIXA","Lixa","un","0.10","Pintura"),mo("ARQ-MO-PINTINT","Mão de obra pintura interna","m²","1.00")],10),

  C("ARQ-26-001","Textura/pintura externa","pintura_externa_fachadas","m²",[mat("ARQ-MAT-FUNDOEXT","Fundo preparador externo","l","0.12","Pintura"),mat("ARQ-MAT-TEXTEXT","Textura/revestimento externo","kg","2.00","Pintura"),mat("ARQ-MAT-TINTEXT","Tinta externa","l","0.24","Pintura"),mo("ARQ-MO-PINTEXT","Mão de obra fachada","m²","1.00")],10),

  C("ARQ-27-001","Instalação de louça sanitária","loucas_metais","un",[svc("ARQ-SRV-LOUCA","Louça sanitária conforme especificação"),mat("ARQ-MAT-VEDROSCA","Vedantes e conexões","cj","1.00","Hidráulica"),mo("ARQ-MO-LOUCA","Instalação louça","un","1.00")],10),
  C("ARQ-27-002","Instalação de metal sanitário","loucas_metais","un",[svc("ARQ-SRV-METAL","Metal sanitário conforme especificação"),mat("ARQ-MAT-VEDROSCA","Vedantes e conexões","cj","1.00","Hidráulica"),mo("ARQ-MO-METAL","Instalação metal","un","1.00")],20),

  C("ARQ-28-001","Marcenaria sob medida","marcenaria_mobiliario","m²",[svc("ARQ-SRV-MARC","Marcenaria conforme projeto executivo","m²","1.00","Marcenaria"),mo("ARQ-MO-MARC","Instalação marcenaria","m²","1.00")],10),

  C("ARQ-29-001","Bancada de pedra","marmoraria","m²",[svc("ARQ-SRV-PEDRA","Pedra beneficiada","m²","1.05","Marmoraria"),mo("ARQ-MO-PEDRA","Instalação de pedra","m²","1.00")],10),
  C("ARQ-29-002","Soleira/peitoril","marmoraria","m",[svc("ARQ-SRV-SOLEIRA","Soleira/peitoril beneficiado","m","1.05","Marmoraria"),mo("ARQ-MO-SOLEIRA","Instalação soleira/peitoril","m","1.00")],20),

  C("ARQ-30-001","Guarda-corpo/corrimão","serralheria","m",[svc("ARQ-SRV-GUARDA","Guarda-corpo/corrimão conforme projeto","m","1.00","Serralheria"),mo("ARQ-MO-GUARDA","Instalação guarda-corpo","m","1.00")],10),
  C("ARQ-30-002","Portão metálico","serralheria","m²",[svc("ARQ-SRV-PORTAO","Portão metálico conforme projeto","m²","1.00","Serralheria"),mo("ARQ-MO-PORTAO","Instalação portão","m²","1.00")],20),

  C("ARQ-31-001","Luminária e acabamento elétrico","iluminacao_acabamentos_eletricos","un",[svc("ARQ-SRV-LUMIN","Luminária/acabamento conforme especificação"),mo("ARQ-MO-LUMIN","Instalação luminária/acabamento","un","1.00")],10),

  C("ARQ-32-001","Estrutura de piscina em concreto armado","piscina_lazer","m³",[mat("ARQ-MAT-CONC30","Concreto estrutural C30","m³","1.00","Concreto"),mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","110.00","Aço"),mat("ARQ-MAT-FORMA","Forma para concreto","m²","6.00","Formas"),mo("ARQ-MO-PISC","Execução estrutura piscina","m³","1.00")],10),
  C("ARQ-32-002","Impermeabilização e revestimento de piscina","piscina_lazer","m²",[mat("ARQ-MAT-IMPERPISC","Impermeabilizante piscina","kg","2.00","Impermeabilização"),mat("ARQ-MAT-REVPISC","Revestimento piscina","m²","1.10","Piscina"),mat("ARQ-MAT-ARGPISC","Argamassa/rejunte piscina","kg","6.00","Piscina"),mo("ARQ-MO-REVPISC","Execução revestimento piscina","m²","1.00")],20),

  C("ARQ-33-001","Calçada em concreto","areas_externas","m²",[mat("ARQ-MAT-BRITA","Base britada","m³","0.06","Áreas externas"),mat("ARQ-MAT-CONC25","Concreto","m³","0.08","Concreto"),mat("ARQ-MAT-MALHA","Tela soldada","m²","1.05","Aço"),mo("ARQ-MO-CALCCONC","Execução calçada","m²","1.00")],10),
  C("ARQ-33-002","Pavimento em paver","areas_externas","m²",[mat("ARQ-MAT-BRITA","Base britada","m³","0.08","Áreas externas"),mat("ARQ-MAT-AREIAPAV","Areia de assentamento","m³","0.05","Áreas externas"),mat("ARQ-MAT-PAVER","Paver","m²","1.05","Áreas externas"),eqp("ARQ-EQP-COMPACT","Compactador","h","0.10"),mo("ARQ-MO-PAVER","Assentamento paver","m²","1.00")],20),

  C("ARQ-34-001","Gramado e preparo de solo","paisagismo","m²",[mat("ARQ-MAT-TERRAVEG","Terra vegetal","m³","0.05","Paisagismo"),mat("ARQ-MAT-GRAMA","Grama","m²","1.05","Paisagismo"),mo("ARQ-MO-GRAMA","Implantação gramado","m²","1.00")],10),
  C("ARQ-34-002","Irrigação de paisagismo","paisagismo","m²",[svc("ARQ-SRV-IRRIGA","Sistema de irrigação proporcional","m²","1.00","Paisagismo"),mo("ARQ-MO-IRRIGA","Instalação irrigação","m²","1.00")],20),

  C("ARQ-35-001","Rede externa de infraestrutura","infraestrutura_externa","m",[svc("ARQ-SRV-INFRAEXT","Rede externa conforme disciplina","m","1.00","Infraestrutura externa"),mo("ARQ-MO-INFRAEXT","Execução infraestrutura externa","m","1.00")],10),

  C("ARQ-36-001","Equipamento especial","equipamentos_especiais","un",[svc("ARQ-SRV-EQESP","Equipamento especial conforme projeto"),svc("ARQ-SRV-INSTEQESP","Instalação/startup equipamento especial")],10),

  C("ARQ-37-001","Limpeza final de obra","limpeza_acabamento_final","m²",[mat("ARQ-MAT-LIMPEZA","Materiais de limpeza","m²","1.00","Limpeza"),mo("ARQ-MO-LIMPEZA","Limpeza fina da obra","m²","1.00")],10),
  C("ARQ-37-002","Retoques e acabamento final","limpeza_acabamento_final","serv",[svc("ARQ-SRV-RETOQUE","Retoques e ajustes finais")],20),

  C("ARQ-38-001","Testes e comissionamento de instalações","testes_comissionamento","serv",[svc("ARQ-SRV-COMISS","Testes, registros e comissionamento")],10),

  C("ARQ-39-001","Vistoria, as built e entrega","vistoria_entrega","serv",[svc("ARQ-SRV-ASBUILT","Documentação as built"),svc("ARQ-SRV-VISTORIA","Vistoria/checklist/aceite"),svc("ARQ-SRV-MANUAIS","Manuais e garantias")],10),

  C("ARQ-40-001","Assistência técnica pós-obra","pos_obra_assistencia","chamado",[svc("ARQ-SRV-ASSIST","Atendimento de assistência técnica","chamado","1.00","Pós-obra")],10),
];

const SISTEMAS: StandardConstructionComposition[] = [
  // ICF
  C("SYS-ICF-08-001","Parede ICF estrutural","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-ICF","Forma/bloco ICF","m²","1.05","ICF"),
    mat("ARQ-MAT-CONC30","Concreto estrutural C30","m³","0.11","Concreto"),
    mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","5.50","Aço"),
    mat("SYS-MAT-ICFACC","Acessórios e reforços ICF","cj","0.05","ICF"),
    eqp("SYS-EQP-ICFESC","Escoramento/alinhamento ICF","dia","0.03"),
    mo("SYS-MO-ICF","Montagem e concretagem ICF","m²","1.00")
  ],10,["icf"]),
  C("SYS-ICF-19-001","Interface ICF para reboco interno","revestimento_bruto_interno","m²",[
    mat("SYS-MAT-TELAACO","Tela metálica para revestimento","m²","1.10","Interface ICF"),
    mat("SYS-MAT-FIXTELA","Fixadores para tela","un","6.00","Interface ICF"),
    mat("ARQ-MAT-CHAP","Chapisco/ponte de aderência","kg","4.00","Argamassas"),
    mo("SYS-MO-ICFREV","Preparação de ICF para reboco","m²","1.00")
  ],10,["icf"]),
  C("SYS-ICF-20-001","Basecoat/tela sobre ICF","revestimento_bruto_externo","m²",[
    mat("SYS-MAT-BASECOAT","Basecoat","kg","4.00","ICF / Fachada"),
    mat("SYS-MAT-TELAFV","Tela fibra de vidro AR","m²","1.10","ICF / Fachada"),
    mat("SYS-MAT-CANTPVC","Cantoneira PVC com tela","m","0.20","ICF / Fachada"),
    mo("SYS-MO-BASECOAT","Aplicação basecoat","m²","1.00")
  ],20,["icf"]),

  // Alvenaria convencional
  C("SYS-ALVC-08-001","Parede de alvenaria convencional","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-BLOCOVED","Bloco de vedação","un","12.50","Alvenaria"),
    mat("SYS-MAT-ARGASS","Argamassa de assentamento","kg","8.00","Argamassas"),
    mat("SYS-MAT-VERGA","Verga/contraverga proporcional","m","0.20","Estrutura"),
    mo("SYS-MO-ALVC","Elevação de alvenaria","m²","1.00")
  ],10,["alvenaria_convencional"]),
  C("SYS-ALVC-19-001","Preparação de alvenaria para reboco interno","revestimento_bruto_interno","m²",[
    mat("ARQ-MAT-CHAP","Chapisco","kg","4.00","Argamassas"),
    mo("SYS-MO-CHAPALV","Aplicação chapisco em alvenaria","m²","1.00")
  ],20,["alvenaria_convencional"]),

  // Alvenaria estrutural
  C("SYS-ALVE-08-001","Parede de alvenaria estrutural","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-BLOCOEST","Bloco estrutural","un","12.50","Alvenaria estrutural"),
    mat("SYS-MAT-ARGEST","Argamassa estrutural","kg","8.00","Argamassas"),
    mat("SYS-MAT-GRAUTE","Graute","m³","0.015","Concreto"),
    mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","2.00","Aço"),
    mo("SYS-MO-ALVE","Execução alvenaria estrutural","m²","1.00")
  ],10,["alvenaria_estrutural"]),

  // Concreto armado + vedação
  C("SYS-CAV-08-001","Vedação em bloco sobre estrutura de concreto","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-BLOCOVED","Bloco de vedação","un","12.50","Alvenaria"),
    mat("SYS-MAT-ARGASS","Argamassa de assentamento","kg","8.00","Argamassas"),
    mo("SYS-MO-VEDCA","Elevação de vedação","m²","1.00")
  ],10,["concreto_armado_vedacao"]),

  // Parede de concreto
  C("SYS-PCON-08-001","Parede de concreto moldada in loco","sistema_construtivo_paredes","m²",[
    mat("ARQ-MAT-CONC30","Concreto estrutural C30","m³","0.10","Concreto"),
    mat("ARQ-MAT-ACO","Aço CA-50/CA-60","kg","4.50","Aço"),
    mat("SYS-MAT-FORMAPC","Sistema de formas para parede de concreto","m²","1.00","Formas"),
    mat("SYS-MAT-ESPPC","Espaçadores/acessórios","un","4.00","Estrutura"),
    mo("SYS-MO-PCON","Montagem e concretagem parede","m²","1.00")
  ],10,["parede_concreto"]),

  // Steel Frame
  C("SYS-LSF-08-001","Parede Light Steel Frame externa","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-LSFPERF","Perfis galvanizados LSF","kg","6.50","Steel Frame"),
    mat("SYS-MAT-OSB","OSB estrutural","m²","1.05","Steel Frame"),
    mat("SYS-MAT-CIMENT","Placa cimentícia","m²","1.05","Steel Frame"),
    mat("SYS-MAT-DRYCHAPA","Chapa drywall interna","m²","1.05","Drywall"),
    mat("SYS-MAT-LA","Isolamento termoacústico","m²","1.00","Isolamento"),
    mat("SYS-MAT-MEMB","Membrana hidrófuga","m²","1.10","Steel Frame"),
    mat("SYS-MAT-LSFFIX","Parafusos/fixadores LSF","un","25.00","Steel Frame"),
    mo("SYS-MO-LSF","Montagem parede LSF","m²","1.00")
  ],10,["steel_frame"]),
  C("SYS-LSF-20-001","Tratamento externo sobre placa cimentícia","revestimento_bruto_externo","m²",[
    mat("SYS-MAT-BASECOAT","Basecoat","kg","4.00","Fachada"),
    mat("SYS-MAT-TELAFV","Tela fibra de vidro AR","m²","1.10","Fachada"),
    mo("SYS-MO-LSFFACH","Tratamento fachada LSF","m²","1.00")
  ],20,["steel_frame"]),

  // Wood Frame
  C("SYS-WF-08-001","Parede Wood Frame externa","sistema_construtivo_paredes","m²",[
    mat("SYS-MAT-MADESTR","Madeira estrutural tratada","m³","0.025","Wood Frame"),
    mat("SYS-MAT-OSB","OSB estrutural","m²","1.05","Wood Frame"),
    mat("SYS-MAT-CIMENT","Placa cimentícia","m²","1.05","Wood Frame"),
    mat("SYS-MAT-DRYCHAPA","Chapa drywall interna","m²","1.05","Drywall"),
    mat("SYS-MAT-LA","Isolamento termoacústico","m²","1.00","Isolamento"),
    mat("SYS-MAT-MEMB","Membrana hidrófuga","m²","1.10","Wood Frame"),
    mat("SYS-MAT-WFFIX","Fixadores wood frame","un","25.00","Wood Frame"),
    mo("SYS-MO-WF","Montagem parede Wood Frame","m²","1.00")
  ],10,["wood_frame"]),

  // Pré-moldado
  C("SYS-PRE-07-001","Estrutura pré-moldada de concreto","estrutura_principal","m³",[
    svc("SYS-SRV-PRE","Peças pré-moldadas conforme projeto","m³","1.00","Pré-moldado"),
    svc("SYS-SRV-GUINDASTE","Içamento/montagem pré-moldado","m³","1.00","Equipamentos"),
    mat("SYS-MAT-GRAUTEPRE","Graute/selagem de ligações","kg","3.00","Pré-moldado"),
    mo("SYS-MO-PRE","Equipe de montagem pré-moldado","m³","1.00")
  ],10,["pre_moldado_concreto"]),

  // Estrutura metálica + fechamento
  C("SYS-EMF-07-001","Estrutura metálica principal","estrutura_principal","kg",[
    mat("ARQ-MAT-ACOPERF","Perfis de aço estrutural","kg","1.00","Estrutura metálica"),
    mat("SYS-MAT-CHAPAACO","Chapas de ligação","kg","0.08","Estrutura metálica"),
    mat("SYS-MAT-PARAFEST","Parafusos estruturais","un","0.12","Estrutura metálica"),
    svc("SYS-SRV-SOLDAPINT","Solda/proteção anticorrosiva","kg","1.00","Estrutura metálica"),
    mo("SYS-MO-ESTMET","Fabricação/montagem estrutura metálica","kg","1.00")
  ],10,["estrutura_metalica_fechamento"]),
  C("SYS-EMF-08-001","Fechamento industrializado sobre estrutura metálica","sistema_construtivo_paredes","m²",[
    svc("SYS-SRV-PAINELMET","Painel/fechamento conforme especificação","m²","1.05","Fechamentos"),
    mat("SYS-MAT-FIXPAINEL","Fixadores/vedações","cj","0.10","Fechamentos"),
    mo("SYS-MO-PAINELMET","Montagem fechamento","m²","1.00")
  ],20,["estrutura_metalica_fechamento"]),

  // SIP
  C("SYS-SIP-08-001","Parede em painel SIP","sistema_construtivo_paredes","m²",[
    svc("SYS-SRV-SIP","Painel SIP estrutural","m²","1.05","SIP"),
    mat("SYS-MAT-SIPCON","Conectores/perfis SIP","m","0.50","SIP"),
    mat("SYS-MAT-SIPFIX","Fixadores/selantes SIP","cj","0.10","SIP"),
    mo("SYS-MO-SIP","Montagem painel SIP","m²","1.00")
  ],10,["sip_paineis"]),

  // Interfaces de instalações por base
  C("SYS-ICF-15-001","Adaptação elétrica em parede ICF","instalacoes_eletricas","ponto",[
    mo("SYS-MO-ICFELE","Abertura/acomodação elétrica em EPS","ponto","1.00"),
    mat("SYS-MAT-ICFSEL","Selagem/recomposição em ICF","cj","1.00","Interface ICF")
  ],50,["icf"]),
  C("SYS-ALVC-15-001","Rasgo e recomposição elétrica em alvenaria","instalacoes_eletricas","ponto",[
    mo("SYS-MO-ALVELE","Rasgo/fechamento para elétrica","ponto","1.00"),
    mat("SYS-MAT-RECOMP","Argamassa para recomposição","kg","2.00","Argamassas")
  ],50,["alvenaria_convencional","alvenaria_estrutural","concreto_armado_vedacao"]),
  C("SYS-LSF-15-001","Passagem elétrica em LSF/Wood Frame","instalacoes_eletricas","ponto",[
    mat("SYS-MAT-PROTILHOS","Ilhós/proteção de passagem","un","2.00","Instalações"),
    mo("SYS-MO-SECOELE","Passagem elétrica em sistema seco","ponto","1.00")
  ],50,["steel_frame","wood_frame"]),

  C("SYS-ICF-12-001","Adaptação hidráulica em parede ICF","instalacoes_hidraulicas","ponto",[
    mo("SYS-MO-ICFHID","Abertura/acomodação hidráulica em EPS","ponto","1.00"),
    mat("SYS-MAT-ICFSEL","Selagem/recomposição em ICF","cj","1.00","Interface ICF")
  ],50,["icf"]),
  C("SYS-ALVC-12-001","Rasgo e recomposição hidráulica em alvenaria","instalacoes_hidraulicas","ponto",[
    mo("SYS-MO-ALVHID","Rasgo/fechamento para hidráulica","ponto","1.00"),
    mat("SYS-MAT-RECOMP","Argamassa para recomposição","kg","2.50","Argamassas")
  ],50,["alvenaria_convencional","alvenaria_estrutural","concreto_armado_vedacao"]),

  C("SYS-ICF-11-001","Kit de instalação de esquadria em ICF","esquadrias","un",[
    mat("SYS-MAT-ICFESQFIX","Fixação específica para ICF","cj","1.00","Esquadrias"),
    mat("SYS-MAT-ICFESQVED","Vedação/selagem perímetro ICF","cj","1.00","Esquadrias"),
    mo("SYS-MO-ICFESQ","Adaptação de vão ICF","un","1.00")
  ],50,["icf"]),
  C("SYS-LSF-11-001","Reforço de vão para esquadria em LSF/Wood Frame","esquadrias","un",[
    mat("SYS-MAT-REFVAO","Perfis/reforços de vão","cj","1.00","Esquadrias"),
    mo("SYS-MO-REFVAO","Execução reforço de vão","un","1.00")
  ],50,["steel_frame","wood_frame"]),

  // Coberturas específicas
  C("SYS-LSF-09-001","Estrutura de cobertura em LSF","cobertura","m²",[
    mat("SYS-MAT-LSFPERF","Perfis galvanizados LSF","kg","5.50","Cobertura"),
    mat("SYS-MAT-LSFFIX","Parafusos/fixadores LSF","un","18.00","Cobertura"),
    mo("SYS-MO-LSFCOB","Montagem cobertura LSF","m²","1.00")
  ],60,["steel_frame"]),
  C("SYS-WF-09-001","Estrutura de cobertura em Wood Frame","cobertura","m²",[
    mat("SYS-MAT-MADESTR","Madeira estrutural tratada","m³","0.025","Cobertura"),
    mat("SYS-MAT-WFFIX","Fixadores wood frame","un","18.00","Cobertura"),
    mo("SYS-MO-WFCOB","Montagem cobertura wood frame","m²","1.00")
  ],60,["wood_frame"]),

  // Híbrido: marcador/orquestrador sem duplicar insumos
  C("SYS-HIB-08-001","Coordenação de sistema híbrido","sistema_construtivo_paredes","serv",[
    svc("SYS-SRV-HIBCOMP","Compatibilização de interfaces entre sistemas")
  ],90,["hibrido"],"Composição de coordenação para obras híbridas. Os elementos físicos devem usar as composições dos sistemas efetivamente aplicados.")
];

export const STANDARD_CONSTRUCTION_COMPOSITIONS: StandardConstructionComposition[] = [
  ...UNIVERSAIS,
  ...SISTEMAS,
];
