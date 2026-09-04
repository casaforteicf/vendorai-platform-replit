import { Link } from "wouter";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  title: "Política de Privacidade",
  updated: "Última atualização: 1º de julho de 2026",
  introTitle: "1. Introdução",
  intro: "A VendorAI (operada por Windoor Serviços de Gerenciamento de Obras Ltda, CNPJ 59.623.589/0001-27, com sede em Chapecó, SC, Brasil) respeita sua privacidade e está comprometida com a proteção dos dados pessoais dos seus usuários, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).",
  dataTitle: "2. Dados coletados",
  dataIntro: "Coletamos os seguintes tipos de dados para a operação da plataforma:",
  dataItems: ["Dados de cadastro: nome, e-mail, telefone e empresa", "Dados de uso: conversas, leads, negócios e atividades registradas no CRM", "Dados de comunicação: mensagens via WhatsApp, Instagram DM e e-mail processadas pela plataforma", "Dados técnicos: endereço IP, tipo de dispositivo, navegador e logs de acesso", "Dados de pagamento: processados por terceiros (Asaas) — não armazenamos dados de cartão"],
  purposeTitle: "3. Finalidade do uso",
  purposeIntro: "Utilizamos os dados coletados para:",
  purposeItems: ["Operar e melhorar a plataforma de CRM e automação comercial", "Executar os agentes de IA e automações configuradas pelo usuário", "Enviar comunicações relevantes sobre a conta (sem spam)", "Suporte técnico e atendimento ao cliente", "Cumprimento de obrigações legais e regulatórias"],
  sharingTitle: "4. Compartilhamento de dados",
  sharing: "Não vendemos dados pessoais a terceiros. Compartilhamos dados apenas com provedores de serviço essenciais para a operação da plataforma (infraestrutura em nuvem, processamento de pagamentos, envio de mensagens), sempre sob acordos de confidencialidade e em conformidade com a LGPD.",
  rightsTitle: "5. Seus direitos (LGPD)",
  rightsIntro: "Você tem direito a:",
  rightsItems: ["Confirmar a existência e acessar seus dados", "Corrigir dados incompletos, inexatos ou desatualizados", "Solicitar anonimização, bloqueio ou eliminação de dados desnecessários", "Portabilidade dos dados a outro fornecedor", "Revogar o consentimento a qualquer momento"],
  securityTitle: "6. Segurança",
  security: "Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados contra acesso não autorizado, perda acidental ou destruição — incluindo criptografia em trânsito (HTTPS/TLS) e em repouso.",
  googleTitle: "7. Uso de dados do Google",
  googleIntro: "Quando você conecta uma conta Google à VendorAI, acessamos apenas os dados estritamente necessários para a funcionalidade que você ativou, sempre com sua autorização explícita via OAuth 2.0, e você pode revogar o acesso a qualquer momento em",
  calendarLabel: "Google Agenda (Calendar):",
  calendar: "lemos e criamos eventos na agenda conectada exclusivamente para sincronizar compromissos e agendamentos criados dentro do CRM da VendorAI. Não lemos agendas não conectadas, não compartilhamos esses eventos com terceiros e não usamos esse conteúdo para publicidade.",
  adsLabel: "Google Ads / Data Manager:",
  ads: "usamos o acesso apenas para criar, ler e gerenciar campanhas publicitárias em nome do próprio usuário (ou do tenant que ele administra) dentro do módulo de Anúncios da VendorAI. Não usamos esse acesso para acessar dados de campanhas de terceiros nem para fins alheios à gestão de anúncios solicitada pelo usuário.",
  youtubeLabel: "YouTube:",
  youtube: "usamos o acesso para publicar vídeos e ler métricas básicas (analytics) somente do canal explicitamente conectado pelo usuário, como parte do módulo de conteúdo/marketing da VendorAI. Não baixamos, redistribuímos nem usamos esse conteúdo para treinar modelos de IA.",
  googleOutroBefore: "O uso e a transferência de informações recebidas das APIs do Google pela VendorAI aderem à",
  googlePolicy: "Política de Dados do Usuário dos Serviços de API do Google",
  googleOutroMiddle: "incluindo os requisitos de Uso Limitado (Limited Use). O uso dos dados obtidos via YouTube API Services está sujeito adicionalmente aos",
  youtubeTerms: "Termos de Serviço da API do YouTube",
  contactTitle: "8. Contato",
  contact: "Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato:",
} as const;

const ES = {
  title: "Política de Privacidad",
  updated: "Última actualización: 1 de julio de 2026",
  introTitle: "1. Introducción",
  intro: "VendorAI (operada por Windoor Serviços de Gerenciamento de Obras Ltda, CNPJ 59.623.589/0001-27, con sede en Chapecó, SC, Brasil) respeta tu privacidad y está comprometida con la protección de los datos personales de sus usuarios, de conformidad con la Ley General de Protección de Datos de Brasil (LGPD — Ley nº 13.709/2018).",
  dataTitle: "2. Datos recopilados",
  dataIntro: "Recopilamos los siguientes tipos de datos para operar la plataforma:",
  dataItems: ["Datos de registro: nombre, correo electrónico, teléfono y empresa", "Datos de uso: conversaciones, leads, negocios y actividades registradas en el CRM", "Datos de comunicación: mensajes de WhatsApp, Instagram DM y correo electrónico procesados por la plataforma", "Datos técnicos: dirección IP, tipo de dispositivo, navegador y registros de acceso", "Datos de pago: procesados por terceros (Asaas); no almacenamos datos de tarjetas"],
  purposeTitle: "3. Finalidad del uso",
  purposeIntro: "Utilizamos los datos recopilados para:",
  purposeItems: ["Operar y mejorar la plataforma de CRM y automatización comercial", "Ejecutar los agentes de IA y automatizaciones configuradas por el usuario", "Enviar comunicaciones relevantes sobre la cuenta, sin spam", "Soporte técnico y atención al cliente", "Cumplimiento de obligaciones legales y regulatorias"],
  sharingTitle: "4. Compartición de datos",
  sharing: "No vendemos datos personales a terceros. Compartimos datos únicamente con proveedores de servicios esenciales para operar la plataforma, como infraestructura en la nube, procesamiento de pagos y envío de mensajes, bajo acuerdos de confidencialidad y de conformidad con la LGPD.",
  rightsTitle: "5. Tus derechos (LGPD)",
  rightsIntro: "Tienes derecho a:",
  rightsItems: ["Confirmar la existencia y acceder a tus datos", "Corregir datos incompletos, inexactos o desactualizados", "Solicitar anonimización, bloqueo o eliminación de datos innecesarios", "Portabilidad de los datos a otro proveedor", "Revocar el consentimiento en cualquier momento"],
  securityTitle: "6. Seguridad",
  security: "Adoptamos medidas técnicas y organizativas adecuadas para proteger tus datos contra acceso no autorizado, pérdida accidental o destrucción, incluyendo cifrado en tránsito (HTTPS/TLS) y en reposo.",
  googleTitle: "7. Uso de datos de Google",
  googleIntro: "Cuando conectas una cuenta de Google a VendorAI, accedemos solamente a los datos estrictamente necesarios para la funcionalidad activada, siempre con autorización explícita mediante OAuth 2.0. Puedes revocar el acceso en cualquier momento en",
  calendarLabel: "Google Calendar:",
  calendar: "leemos y creamos eventos en el calendario conectado exclusivamente para sincronizar compromisos y citas creados dentro del CRM de VendorAI. No leemos calendarios no conectados, no compartimos estos eventos con terceros y no utilizamos este contenido para publicidad.",
  adsLabel: "Google Ads / Data Manager:",
  ads: "utilizamos el acceso únicamente para crear, leer y gestionar campañas publicitarias en nombre del propio usuario o del tenant que administra dentro del módulo de Anuncios de VendorAI. No utilizamos este acceso para consultar campañas de terceros ni para fines ajenos a la gestión solicitada por el usuario.",
  youtubeLabel: "YouTube:",
  youtube: "utilizamos el acceso para publicar videos y leer métricas básicas (analytics) solamente del canal conectado explícitamente por el usuario como parte del módulo de contenido y marketing de VendorAI. No descargamos, redistribuimos ni utilizamos este contenido para entrenar modelos de IA.",
  googleOutroBefore: "El uso y la transferencia de información recibida de las APIs de Google por VendorAI cumplen con la",
  googlePolicy: "Política de Datos del Usuario de los Servicios de API de Google",
  googleOutroMiddle: "incluyendo los requisitos de Uso Limitado (Limited Use). El uso de datos obtenidos mediante YouTube API Services está sujeto además a los",
  youtubeTerms: "Términos de Servicio de la API de YouTube",
  contactTitle: "8. Contacto",
  contact: "Para ejercer tus derechos o aclarar dudas sobre esta política, contáctanos:",
} as const;

export default function Privacy() {
  const { isSpanish } = usePublicCountry();
  const c = isSpanish ? ES : PT;

  return (
    <div className="pb-24">
      <div className="bg-slate-900 py-16 px-4"><div className="container mx-auto max-w-3xl"><h1 className="text-4xl font-bold text-white mb-3">{c.title}</h1><p className="text-slate-400 text-sm">{c.updated}</p></div></div>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="prose prose-slate max-w-none space-y-8">
          <section><h2 className="text-2xl font-bold text-slate-900 mb-3">{c.introTitle}</h2><p className="text-slate-600 leading-relaxed">{c.intro}</p></section>
          <section><h2 className="text-2xl font-bold text-slate-900 mb-3">{c.dataTitle}</h2><p className="text-slate-600 leading-relaxed mb-3">{c.dataIntro}</p><ul className="list-disc pl-6 text-slate-600 space-y-1">{c.dataItems.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section><h2 className="text-2xl font-bold text-slate-900 mb-3">{c.purposeTitle}</h2><p className="text-slate-600 leading-relaxed mb-3">{c.purposeIntro}</p><ul className="list-disc pl-6 text-slate-600 space-y-1">{c.purposeItems.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section><h2 className="text-2xl font-bold text-slate-900 mb-3">{c.sharingTitle}</h2><p className="text-slate-600 leading-relaxed">{c.sharing}</p></section>
          <section><h2 className="text-2xl font-bold text-slate-900 mb-3">{c.rightsTitle}</h2><p className="text-slate-600 leading-relaxed mb-3">{c.rightsIntro}</p><ul className="list-disc pl-6 text-slate-600 space-y-1">{c.rightsItems.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section><h2 className="text-2xl font-bold text-slate-900 mb-3">{c.securityTitle}</h2><p className="text-slate-600 leading-relaxed">{c.security}</p></section>
          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">{c.googleTitle}</h2>
            <p className="text-slate-600 leading-relaxed mb-3">{c.googleIntro} <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">myaccount.google.com/permissions</a>.</p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>{c.calendarLabel}</strong> {c.calendar}</li>
              <li><strong>{c.adsLabel}</strong> {c.ads}</li>
              <li><strong>{c.youtubeLabel}</strong> {c.youtube}</li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-3">{c.googleOutroBefore} <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{c.googlePolicy}</a>, {c.googleOutroMiddle} <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{c.youtubeTerms}</a>.</p>
          </section>
          <section><h2 className="text-2xl font-bold text-slate-900 mb-3">{c.contactTitle}</h2><p className="text-slate-600 leading-relaxed">{c.contact}</p><ul className="list-none mt-2 text-slate-600 space-y-1"><li>📧 <a href="mailto:vendorai@appvendorai.com" className="text-primary hover:underline">vendorai@appvendorai.com</a></li><li>🌐 <Link href="/contato" className="text-primary hover:underline">appvendorai.com/contato</Link></li></ul></section>
        </div>
      </div>
    </div>
  );
}
