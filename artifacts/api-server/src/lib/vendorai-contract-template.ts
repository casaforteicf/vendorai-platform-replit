/**
 * CONTRATO DE LICENÇA E PRESTAÇÃO DE SERVIÇOS DE SOFTWARE COMO SERVIÇO (SAAS) — VENDOR.AI
 * HTML template com placeholders {{variavel}} para interpolação automática.
 */
export const VENDORAI_SAAS_CONTRACT_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contrato SaaS — Vendor.AI</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.7;
    color: #111;
    max-width: 760px;
    margin: 0 auto;
    padding: 40px 50px;
  }
  h1 {
    text-align: center;
    font-size: 13pt;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .subtitulo {
    text-align: center;
    font-size: 11pt;
    font-weight: bold;
    margin-bottom: 28px;
  }
  .partes-bloco {
    margin: 20px 0 24px;
    padding: 14px 18px;
    border: 1px solid #aaa;
    background: #fafafa;
    font-size: 11.5pt;
    line-height: 1.75;
  }
  .partes-bloco p { margin: 6px 0; }
  h2 {
    font-size: 12pt;
    font-weight: bold;
    text-transform: uppercase;
    margin-top: 32px;
    margin-bottom: 4px;
    border-bottom: 1px solid #aaa;
    padding-bottom: 3px;
  }
  p { margin: 8px 0; text-align: justify; }
  ol { margin: 8px 0 8px 20px; padding: 0; }
  ol li { margin-bottom: 6px; text-align: justify; }
  ul { margin: 8px 0 8px 24px; padding: 0; }
  ul li { margin-bottom: 5px; text-align: justify; }
  .assinaturas {
    margin-top: 60px;
    display: flex;
    justify-content: space-between;
    gap: 30px;
    page-break-inside: avoid;
  }
  .assinatura-bloco {
    flex: 1;
    text-align: center;
    padding-top: 12px;
    border-top: 1px solid #333;
    font-size: 11pt;
    line-height: 1.5;
  }
  .testemunhas {
    margin-top: 40px;
    display: flex;
    gap: 40px;
    page-break-inside: avoid;
  }
  .testemunha-bloco {
    flex: 1;
    border-top: 1px solid #666;
    padding-top: 10px;
    font-size: 10.5pt;
  }
  .local-data {
    text-align: center;
    margin-top: 48px;
    margin-bottom: 8px;
    font-size: 11.5pt;
  }
  .page-break { page-break-before: always; }
  .dpa-titulo {
    text-align: center;
    font-size: 12pt;
    font-weight: bold;
    text-transform: uppercase;
    margin: 30px 0 10px;
  }
  .dpa-subtitulo {
    text-align: center;
    font-size: 11pt;
    margin-bottom: 24px;
  }
</style>
</head>
<body>

<h1>CONTRATO DE LICENÇA E PRESTAÇÃO DE SERVIÇOS DE<br/>SOFTWARE COMO SERVIÇO (SAAS) – VENDOR.AI</h1>

<div class="partes-bloco">
  <p><strong>CONTRATANTE (FORNECEDORA):</strong> WINDOOR SERVICOS DE GERENCIAMENTO DE OBRAS LTDA,
  pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 59.623.589/0001-27, com sede na rua
  PREFEITO OSMAR CUNHA, 416, SALA 1108, CENTRO, FLORIANOPOLIS - SC, CEP 88015100, neste
  ato representada por seu representante legal MARCOS PAULO REISDORFER, brasileiro, {{marcos_estado_civil}},
  EMPRESARIO, RG 5.008.572, CPF 009.763.579-09, doravante denominada simplesmente <strong>VENDOR.AI</strong>.</p>

  <p style="margin-top:14px;"><strong>CONTRATADA (CLIENTE):</strong> {{cliente_razao_social}},
  pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {{cliente_cnpj}},
  com sede na {{cliente_endereco}},
  neste ato representada por seu representante legal {{representante_legal_completo}},
  doravante denominada simplesmente <strong>CLIENTE</strong>.</p>
</div>

<p>As partes acima identificadas, na melhor forma de direito, celebram o presente <strong>CONTRATO DE
LICENÇA DE USO DE SOFTWARE E PRESTAÇÃO DE SERVIÇOS DE SOFTWARE COMO SERVIÇO (SAAS)</strong>,
que se regerá pelas cláusulas e condições a seguir expostas:</p>

<h2>CLÁUSULA 1 – DO OBJETO</h2>

<p>1.1. O presente contrato tem por objeto a licença não exclusiva, intransferível e temporária de uso do
sistema proprietário denominado Vendor.AI, uma plataforma de inteligência artificial para SISTEMA
DE ADMINISTRAÇÃO DE NEGOCIOS, disponibilizado no modelo "Software as a Service" (SaaS),
incluindo a prestação de serviços de suporte técnico, hospedagem em nuvem e manutenção
evolutiva e corretiva, conforme condições descritas neste instrumento e em seus anexos.</p>

<p>1.2. O software é acessado remotamente via internet, em ambiente web, através de login e senha
fornecidos ao CLIENTE, mediante a disponibilização do ambiente de produção pela VENDOR.AI.</p>

<p>1.3. Em hipótese alguma o CLIENTE terá acesso ao código-fonte, à estrutura de banco de dados, aos
algoritmos proprietários ou a qualquer documentação técnica interna do sistema, que pertencem
exclusivamente à VENDOR.AI, sendo o presente contrato mera licença de uso.</p>

<h2>CLÁUSULA 2 – DA PROPRIEDADE INTELECTUAL E PROTEÇÃO CONTRA CÓPIAS</h2>

<p>2.1. <strong>Titularidade Exclusiva.</strong> A VENDOR.AI é a legítima titular de todos os direitos de propriedade
intelectual sobre o Sistema Vendor.AI, incluindo, mas não se limitando a: código-fonte, código-objeto,
algoritmos, estruturas de dados, design de interface gráfica, manuais de uso, documentação técnica,
fluxogramas, metodologias, funcionalidades, módulos, APIs, bem como quaisquer melhorias,
atualizações, correções e novas versões desenvolvidas durante a vigência deste contrato.</p>

<p>2.2. <strong>Licença Limitada.</strong> O presente contrato não transfere ao CLIENTE nenhum direito de propriedade
sobre o Sistema, mas tão somente o direito limitado de uso, nas condições aqui estabelecidas.</p>

<p>2.3. <strong>Vedações Expressas (Cláusula Anti-Cópia).</strong> É expressamente vedado ao CLIENTE, seus
prepostos, funcionários, colaboradores ou terceiros por ele contratados, direta ou indiretamente:</p>
<ol type="a">
  <li>Copiar, reproduzir, adaptar, modificar, traduzir, descompilar, fazer engenharia reversa, desmontar
  ou de qualquer forma tentar obter acesso ao código-fonte, código-objeto ou estrutura do Sistema Vendor.AI;</li>
  <li>Criar obras derivadas, cópias ou ambientes que repliquem as funcionalidades do Sistema;</li>
  <li>Remover, ocultar, alterar ou modificar quaisquer avisos de direitos autorais, marcas registradas,
  logotipos ou qualquer outra identificação de propriedade intelectual da VENDOR.AI;</li>
  <li>Licenciar, sublicenciar, alugar, arrendar, ceder, doar, alienar, vender, distribuir, compartilhar ou
  transferir o acesso ao Sistema a terceiros não autorizados previamente e por escrito pela VENDOR.AI;</li>
  <li>Utilizar o Sistema para desenvolver um produto concorrente ou realizar engenharia de benchmark
  competitivo sem autorização expressa;</li>
  <li>Contornar, desativar ou violar qualquer mecanismo de segurança, controle de acesso ou proteção
  implementado no Sistema.</li>
</ol>

<p>2.4. <strong>Auditoria Técnica de Uso.</strong> A VENDOR.AI reserva-se o direito de implementar mecanismos
tecnológicos de verificação de integridade e rastreamento de acessos para prevenir cópias não
autorizadas. Constatado qualquer indício de violação desta cláusula, a VENDOR.AI poderá rescindir
o contrato por justa causa, sem prejuízo da apuração de perdas e danos, e da adoção das medidas
judiciais criminais cabíveis, nos termos da Lei nº 9.609/98 e da Lei nº 9.610/98.</p>

<p>2.5. <strong>Violação e Penalidades.</strong> Em caso de violação comprovada de qualquer das vedações descritas
no item 2.3, o CLIENTE estará sujeito ao pagamento de multa penal não compensatória no valor de
R$ 100.000,00 (cem mil reais) por evento de violação, sem prejuízo da rescisão contratual imediata
e da comunicação às autoridades competentes.</p>

<h2>CLÁUSULA 3 – DO ACESSO E CADASTRO DE USUÁRIOS</h2>

<p>3.1. O CLIENTE receberá da VENDOR.AI credenciais de acesso (login e senha) para utilização do
Sistema, sendo de sua exclusiva responsabilidade:</p>
<ol type="a">
  <li>Manter o sigilo e a confidencialidade das credenciais de acesso;</li>
  <li>Não compartilhar as credenciais com terceiros não autorizados;</li>
  <li>Comunicar imediatamente à VENDOR.AI qualquer uso não autorizado ou suspeita de violação de segurança;</li>
  <li>Responsabilizar-se integralmente por todas as atividades realizadas através de suas credenciais.</li>
</ol>

<p>3.2. A VENDOR.AI reserva-se o direito de limitar o número de usuários simultâneos de acordo com o
plano contratado, conforme Anexo Comercial.</p>

<h2>CLÁUSULA 4 – DA CONTRAPRESTAÇÃO E DO REAJUSTE (MENSALIDADE)</h2>

<p>4.1. Pela licença de uso e prestação dos serviços de suporte e manutenção, o CLIENTE pagará à
VENDOR.AI o valor mensal fixo de <strong>{{valor_mensal}}</strong> ({{valor_extenso}}),
com vencimento todo dia <strong>{{dia_vencimento}}</strong> de cada mês.</p>

<p>4.2. A contraprestação é devida independentemente da efetiva utilização do Sistema pelo CLIENTE,
sendo a disponibilização do ambiente 24 horas por dia, 7 dias por semana, a obrigação principal da VENDOR.AI.</p>

<p>4.3. O valor será reajustado anualmente, a partir da data de assinatura do contrato, com base na
variação acumulada do <strong>{{indice_reajuste}}</strong> nos últimos 12 meses. Na ausência ou extinção do índice,
será utilizado o que o substituir legalmente.</p>

<p>4.4. Em caso de atraso no pagamento, o valor será acrescido de multa moratória de 2% (dois por
cento), juros de mora de 1% (um por cento) ao mês e correção monetária pelo índice contratado.</p>

<h2>CLÁUSULA 5 – DA MANUTENÇÃO DO SISTEMA (ACORDO DE NÍVEL DE SERVIÇO - SLA)</h2>

<p>5.1. <strong>Disponibilidade do Ambiente.</strong> A VENDOR.AI se compromete a manter o Sistema disponível para
acesso 24 horas por dia, 7 dias por semana, com garantia de uptime de 99,5% ao mês, excetuados
os períodos de manutenção programada.</p>

<p>5.2. <strong>Manutenção Corretiva.</strong> A VENDOR.AI se compromete a:</p>
<ol type="a">
  <li>Iniciar o tratamento do chamado em até <strong>{{sla_inicio_horas}} horas úteis</strong> a partir da abertura do ticket pelo CLIENTE;</li>
  <li>Solucionar o problema em até <strong>{{sla_critico_horas}} horas úteis</strong> para chamados críticos (sistema indisponível),
  <strong>{{sla_alto_horas}} horas úteis</strong> para chamados altos (funcionalidade principal inoperante),
  e <strong>{{sla_medio_horas}} horas úteis</strong> para chamados médios e baixos.</li>
</ol>

<p>5.3. <strong>Manutenção Evolutiva (Upgrades).</strong> A VENDOR.AI realizará, a seu exclusivo critério, melhorias e
novas funcionalidades na plataforma, visando sua evolução tecnológica. Tais upgrades são incluídos
na mensalidade e não geram qualquer direito a desconto, crédito ou compensação ao CLIENTE.</p>

<p>5.4. <strong>Manutenção Preventiva.</strong> A VENDOR.AI poderá suspender temporariamente o acesso ao Sistema
para manutenções programadas, preferencialmente em horários de menor tráfego, mediante aviso prévio
ao CLIENTE com, no mínimo, 48 (quarenta e oito) horas de antecedência, por e-mail cadastrado.</p>

<p>5.5. <strong>Exclusões de Responsabilidade.</strong> A VENDOR.AI não será responsável por indisponibilidade
decorrente de: (a) falhas nos serviços de internet do CLIENTE; (b) ataques cibernéticos de terceiros
que excedam medidas razoáveis de proteção; (c) caso fortuito ou força maior; (d) suspensão por
inadimplência, conforme Cláusula 6; (e) manutenção corretiva de emergência, devidamente comunicada.</p>

<h2>CLÁUSULA 6 – DA SUSPENSÃO POR INADIMPLÊNCIA (CLÁUSULA DE BLOQUEIO AUTOMÁTICO)</h2>

<p>6.1. Esta cláusula reflete a essência do modelo SaaS. A disponibilização do serviço é condicionada ao
pagamento pontual da contraprestação mensal.</p>

<p>6.2. <strong>Vencimento e Bloqueio Automático.</strong> Caso o pagamento da mensalidade não seja identificado
pela VENDOR.AI até o <strong>{{dia_limite_bloqueio}}</strong> após o vencimento, o acesso ao Sistema Vendor.AI
será automaticamente suspenso, independentemente de qualquer notificação prévia, judicial ou extrajudicial.</p>

<p>6.3. <strong>Suspensão Total.</strong> Durante a suspensão, nenhum usuário vinculado à conta do CLIENTE
conseguirá acessar o painel de controle, extrair dados, gerar relatórios ou utilizar quaisquer
funcionalidades do Sistema. Os dados do CLIENTE permanecerão armazenados nos servidores, mas
totalmente inacessíveis (em estado de quarentena).</p>

<p>6.4. <strong>Prazo de Quarentena.</strong> Os dados do CLIENTE serão mantidos em quarentena pelo prazo de
{{prazo_quarentena}} dias contados da data da suspensão.</p>

<p>6.5. <strong>Reativação do Acesso.</strong> Para reativar o acesso, o CLIENTE deverá:</p>
<ol type="a">
  <li>Quitar integralmente o(s) débito(s) pendente(s), acrescido(s) das penalidades previstas no item 4.4;</li>
  <li>Pagar a taxa de reativação de serviço no valor de <strong>{{taxa_reativacao}}</strong>.</li>
</ol>

<p>6.6. <strong>Rescisão por Abandono e Exclusão de Dados.</strong> Transcorrido o prazo de quarentena sem a
regularização integral dos pagamentos, o contrato será considerado rescindido de pleno direito, por
justa causa imputável ao CLIENTE. A VENDOR.AI ficará autorizada a excluir definitiva e
irreversivelmente todos os dados e backups do ambiente do CLIENTE, sem qualquer ônus.</p>

<h2>CLÁUSULA 7 – DO PRAZO E DA RESCISÃO</h2>

<p>7.1. <strong>Vigência.</strong> O presente contrato vigorará pelo período de <strong>{{vigencia_contrato}}</strong>, contados da data de
assinatura, com renovação automática por períodos iguais e sucessivos, salvo manifestação expressa
e por escrito de qualquer das partes, com antecedência mínima de 30 (trinta) dias.</p>

<p>7.2. <strong>Multa por Cancelamento Antecipado (Fidelidade).</strong> Caso o CLIENTE solicite o cancelamento antes
do término do período de vigência contratado, incorrerá em multa compensatória equivalente a
<strong>{{multa_cancelamento}}</strong> sobre o valor total das parcelas remanescentes até o fim do período contratado.</p>

<p>7.3. <strong>Rescisão por Justa Causa.</strong> Constituem motivos para rescisão por justa causa:</p>
<ol type="a">
  <li>Pela VENDOR.AI: inadimplência do CLIENTE (após o prazo de quarentena); violação de propriedade
  intelectual (Cláusula 2); uso indevido do Sistema para fins ilícitos; falência ou recuperação judicial do CLIENTE;</li>
  <li>Pelo CLIENTE: descumprimento reiterado do SLA pela VENDOR.AI; falência ou recuperação judicial da VENDOR.AI.</li>
</ol>

<p>7.4. <strong>Rescisão sem Justa Causa.</strong> Qualquer das partes poderá rescindir o contrato sem justa causa,
mediante aviso prévio de 30 dias, observada a multa por cancelamento antecipado prevista no item
7.2, se aplicável.</p>

<h2>CLÁUSULA 8 – DA PROTEÇÃO DE DADOS PESSOAIS (LGPD)</h2>

<p>8.1. <strong>Definições e Papéis.</strong> Para os fins desta cláusula, aplicam-se as definições da Lei Geral de
Proteção de Dados Pessoais (Lei nº 13.709/2018 – LGPD). Neste contrato, o CLIENTE é qualificado
como CONTROLADOR e a VENDOR.AI como OPERADORA dos dados pessoais inseridos e tratados
através do Sistema Vendor.AI.</p>

<p>8.2. <strong>Finalidade do Tratamento.</strong> A VENDOR.AI tratará os dados pessoais sob as estritas instruções do
CLIENTE, única e exclusivamente para viabilizar a prestação dos serviços contratados (hospedagem,
processamento de IA e suporte técnico).</p>

<p>8.3. <strong>Obrigações do Controlador (CLIENTE).</strong> Cabe exclusivamente ao CLIENTE: (a) garantir que possui
base legal legítima para coletar e tratar os dados pessoais inseridos no Sistema; (b) responder
integralmente perante os titulares dos dados; (c) zelar pela veracidade e correção dos dados inseridos.</p>

<p>8.4. <strong>Obrigações da Operadora (VENDOR.AI).</strong> A VENDOR.AI se obriga a: (a) tratar os dados
exclusivamente para a execução do objeto contratual; (b) notificar o CLIENTE em até 48 horas sobre
solicitações judiciais ou de titulares de dados; (c) implementar medidas técnicas de segurança,
incluindo criptografia, controle de acesso e backups; (d) comunicar incidentes de segurança em até
24 horas do conhecimento do fato.</p>

<p>8.5. <strong>Transferência Internacional.</strong> A VENDOR.AI não transferirá dados pessoais para fora do território
brasileiro sem autorização prévia e expressa do CLIENTE, exceto se a localização dos servidores
estiver previamente informada no Anexo Técnico (DPA).</p>

<p>8.6. <strong>Eliminação dos Dados ao Término.</strong> Ao término do contrato, a VENDOR.AI se compromete a
eliminar de forma segura todos os dados pessoais do CLIENTE em até 15 (quinze) dias, ressalvados
os dados mantidos para cumprimento de obrigação legal.</p>

<p>8.7. <strong>Auditoria e Fiscalização.</strong> O CLIENTE poderá, mediante aviso prévio de 15 (quinze) dias,
realizar auditorias ou solicitar relatórios de conformidade para verificar o cumprimento das
obrigações de segurança.</p>

<p>8.8. <strong>Responsabilidade e Penalidades.</strong> A parte que der causa a descumprimento da LGPD responderá
pelos danos materiais e morais decorrentes, inclusive perante a ANPD.</p>

<p>8.9. <strong>Anexo Técnico (DPA).</strong> As partes declaram que as informações detalhadas sobre as operações
de tratamento de dados pessoais estão descritas no Anexo Técnico – Acordo de Tratamento de
Dados Pessoais (DPA), que é parte integrante e indissociável deste contrato.</p>

<h2>CLÁUSULA 9 – DA CONFIDENCIALIDADE</h2>

<p>9.1. O CLIENTE se obriga a manter o mais absoluto sigilo e confidencialidade sobre todas as
informações técnicas, comerciais, estratégicas, financeiras e operacionais relacionadas à VENDOR.AI
e ao Sistema Vendor.AI que venha a ter conhecimento em razão deste contrato.</p>

<p>9.2. A obrigação de confidencialidade permanecerá em vigor durante a vigência contratual e por 2
(dois) anos após seu término, independentemente do motivo.</p>

<p>9.3. A violação desta cláusula sujeitará o infrator ao pagamento de perdas e danos, sem prejuízo das
medidas judiciais cabíveis.</p>

<h2>CLÁUSULA 10 – DAS DISPOSIÇÕES GERAIS</h2>

<p>10.1. <strong>Comunicações.</strong> Todas as comunicações entre as partes serão realizadas preferencialmente
por e-mail, considerando-se válidos os endereços eletrônicos informados no preâmbulo deste
contrato e no Anexo Técnico.</p>

<p>10.2. <strong>Cessão.</strong> O CLIENTE não poderá ceder ou transferir, total ou parcialmente, os direitos e
obrigações decorrentes deste contrato sem a prévia e expressa autorização por escrito da VENDOR.AI.</p>

<p>10.3. <strong>Tolerância.</strong> A tolerância de qualquer das partes quanto ao descumprimento de qualquer cláusula
não constituirá novação ou renúncia a direitos.</p>

<p>10.4. <strong>Nulidade Parcial.</strong> A declaração de nulidade ou invalidade de qualquer cláusula deste contrato
não afetará as demais, que permanecerão em pleno vigor.</p>

<p>10.5. <strong>Registro Eletrônico.</strong> O presente contrato celebrado por meio eletrônico, com a utilização de
assinatura eletrônica válida (ICP-Brasil ou plataforma de assinatura digital reconhecida), será
considerado título executivo extrajudicial para todos os fins de direito.</p>

<h2>CLÁUSULA 11 – DO FORO</h2>

<p>11.1. As partes elegem o Foro da Comarca de FLORIANÓPOLIS/SC para dirimir quaisquer dúvidas ou
litígios oriundos deste contrato, renunciando a qualquer outro, por mais privilegiado que seja.</p>

<p>E por estarem assim justas e contratadas, as partes firmam o presente instrumento em 2 (duas) vias
de igual teor e forma, na presença de 2 (duas) testemunhas, para todos os fins de direito.</p>

<div class="local-data">{{local_assinatura}}, {{data_extenso}}</div>

<div class="assinaturas">
  <div class="assinatura-bloco">
    <p><strong>WINDOOR SERVICOS DE GERENCIAMENTO DE OBRAS LTDA</strong></p>
    <p>CNPJ: 59.623.589/0001-27</p>
    <p>MARCOS PAULO REISDORFER</p>
    <p>Sócio-Administrador</p>
  </div>
  <div class="assinatura-bloco">
    <p><strong>{{cliente_razao_social}}</strong></p>
    <p>CNPJ: {{cliente_cnpj}}</p>
    <p>{{representante_nome}}</p>
    <p>{{representante_cargo}}</p>
  </div>
</div>

<div class="testemunhas" style="margin-top:50px;">
  <div class="testemunha-bloco">
    <p>TESTEMUNHA 1</p>
    <p>Nome: ____________________________</p>
    <p>CPF: ______________________________</p>
  </div>
  <div class="testemunha-bloco">
    <p>TESTEMUNHA 2</p>
    <p>Nome: ____________________________</p>
    <p>CPF: ______________________________</p>
  </div>
</div>

<!-- ════════════════════════════════════════════════════════════════════ -->
<!-- ANEXO TÉCNICO – DPA                                                   -->
<!-- ════════════════════════════════════════════════════════════════════ -->
<div class="page-break"></div>

<div class="dpa-titulo">ANEXO TÉCNICO – ACORDO DE TRATAMENTO DE DADOS PESSOAIS (DPA)</div>
<div class="dpa-subtitulo">
  Contrato celebrado entre WINDOOR SERVICOS DE GERENCIAMENTO DE OBRAS LTDA (OPERADORA)
  e {{cliente_razao_social}} (CONTROLADORA)
</div>

<h2>1. DEFINIÇÕES E PAPÉIS DOS AGENTES DE TRATAMENTO</h2>

<p>1.1. <strong>Controlador (CLIENTE):</strong> {{cliente_razao_social}}, inscrita no CNPJ sob o nº {{cliente_cnpj}},
a quem competem as decisões referentes ao tratamento de dados pessoais.</p>

<p>1.2. <strong>Operadora (VENDOR.AI):</strong> WINDOOR SERVICOS DE GERENCIAMENTO DE OBRAS LTDA, inscrita
no CNPJ sob o nº 59.623.589/0001-27, responsável por realizar o tratamento de dados pessoais em
nome e sob as ordens lícitas e documentadas do CLIENTE.</p>

<h2>2. ESCOPO, NATUREZA E FINALIDADE DO TRATAMENTO</h2>

<p>2.1. <strong>Contexto do Tratamento:</strong> {{finalidade_sistema}}.</p>

<p>2.2. <strong>Finalidade Específica da IA – Operações Realizadas:</strong></p>
<ul>
  <li>Processamento de linguagem natural (NLP) para interação com o usuário;</li>
  <li>Análise de sentimento e emoções em textos;</li>
  <li>Reconhecimento de padrões e recomendação de produtos/serviços;</li>
  <li>Transcrição de áudio/voz para texto;</li>
  <li>Geração de conteúdo textual automatizado;</li>
  <li>Classificação e categorização automática de dados.</li>
</ul>

<h2>3. CATEGORIAS DE TITULARES DE DADOS AFETADOS</h2>
<ul>
  <li>Clientes/prospects finais do CLIENTE;</li>
  <li>Funcionários/Colaboradores do CLIENTE;</li>
  <li>Leads e prospects comerciais.</li>
</ul>

<h2>4. TIPOS E CATEGORIAS DE DADOS PESSOAIS TRATADOS</h2>

<p>4.1. <strong>Dados Pessoais Comuns (Art. 5º, I, LGPD):</strong></p>
<ul>
  <li>Nome completo / Razão social;</li>
  <li>CPF / CNPJ / RG;</li>
  <li>Endereço residencial/comercial;</li>
  <li>Endereço de e-mail;</li>
  <li>Número de telefone fixo/celular;</li>
  <li>Profissão / Cargo;</li>
  <li>Dados de navegação (logs de acesso, endereço IP, data e hora da ação);</li>
  <li>Dados financeiros/transacionais (valor de compras, histórico de pagamento);</li>
  <li>Gravações de chamadas (voz);</li>
  <li>Conteúdo de mensagens de texto, e-mails ou chats processados pela IA.</li>
</ul>

<p>4.2. <strong>Dados Pessoais Sensíveis:</strong> NENHUM DADO SENSÍVEL É DELIBERADAMENTE TRATADO.
O CLIENTE se obriga a não inserir tais dados no Sistema sem autorização expressa e específica da VENDOR.AI.</p>

<h2>5. MEDIDAS TÉCNICAS E ADMINISTRATIVAS DE SEGURANÇA (Art. 46, LGPD)</h2>

<p>5.1. <strong>Controle de Acesso Lógico:</strong> segmentação de ambientes (produção, homologação, desenvolvimento);
privilégio mínimo; autenticação multifator para acessos administrativos.</p>

<p>5.2. <strong>Criptografia e Dados em Trânsito:</strong> TLS 1.3 na transmissão de dados.</p>

<p>5.3. <strong>Proteção dos Dados Armazenados:</strong> criptografia AES-256 em repouso; backup incremental diário
com retenção de {{backup_retencao_dias}} (trinta) dias; replicação geográfica para Disaster Recovery.</p>

<p>5.4. <strong>Monitoramento e Resposta:</strong> monitoramento contínuo de logs de segurança; plano de resposta a
incidentes formalizado.</p>

<h2>6. SUBCONTRATAÇÃO E TRANSFERÊNCIA DE DADOS</h2>

<p>6.1. <strong>Suboperadores Autorizados:</strong></p>
<ul>
  <li>Provedor de Infraestrutura de Nuvem (IaaS): <strong>{{provedor_infra}}</strong>;</li>
  <li>Região do Datacenter: <strong>{{regiao_datacenter}}</strong>;</li>
  <li>Serviço de e-mail transacional: <strong>{{servico_email}}</strong>.</li>
</ul>

<p>6.2. A VENDOR.AI notificará o CLIENTE sobre a adição ou substituição de qualquer suboperador com
30 (trinta) dias de antecedência.</p>

<h2>7. PRAZO E RETENÇÃO</h2>
<p>Os dados pessoais serão tratados durante toda a vigência do Contrato. Extinto o contrato, a
VENDOR.AI procederá à exclusão definitiva e segura dos dados em até 15 (quinze) dias, conforme
Cláusula 8.6 do Contrato.</p>

<h2>9. CONTATO DOS ENCARREGADOS DE DADOS (DPO)</h2>

<p><strong>ENCARREGADO DA VENDOR.AI (Operadora):</strong><br/>
Nome: {{dpo_nome}}<br/>
E-mail: {{dpo_email}}<br/>
Telefone: {{dpo_telefone}}</p>

<p><strong>ENCARREGADO DO CLIENTE (Controlador):</strong><br/>
Nome: {{cliente_dpo_nome}}<br/>
E-mail: {{cliente_email}}</p>

<div class="local-data" style="margin-top:40px;">{{local_assinatura}}, {{data_extenso}}</div>

<div class="assinaturas" style="margin-top:30px;">
  <div class="assinatura-bloco">
    <p><strong>VENDOR.AI</strong></p>
    <p>MARCOS PAULO REISDORFER</p>
  </div>
  <div class="assinatura-bloco">
    <p><strong>{{cliente_razao_social}}</strong></p>
    <p>{{representante_nome}}</p>
  </div>
</div>

</body>
</html>`;
