import { Link } from "wouter";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  title: "Termos de Uso",
  updated: "Última atualização: 1º de julho de 2026",
  sections: [
    { title: "1. Aceitação dos termos", text: "Ao acessar ou utilizar a plataforma VendorAI (operada por Windoor Serviços de Gerenciamento de Obras Ltda, CNPJ 59.623.589/0001-27, Chapecó, SC, Brasil), você concorda com estes Termos de Uso. Caso não concorde, não utilize a plataforma." },
    { title: "2. Descrição dos serviços", intro: "A VendorAI oferece:", items: ["CRM completo com pipeline Kanban e gestão de leads", "Agentes de IA para prospecção, qualificação e acompanhamento de vendas", "Comunicação omnichannel (WhatsApp, Instagram, e-mail)", "Automação comercial, campanhas e analytics", "Geração de propostas e faturamento integrado"] },
    { title: "3. Elegibilidade e conta", text: "Para utilizar a plataforma você deve ser maior de 18 anos e ter capacidade legal para celebrar contratos. Você é responsável por manter a confidencialidade das suas credenciais de acesso e por todas as atividades realizadas em sua conta." },
    { title: "4. Uso aceitável", intro: "É proibido utilizar a plataforma para:", items: ["Envio de spam ou mensagens não solicitadas em desacordo com a LGPD e o Marco Civil da Internet", "Atividades ilegais, fraudulentas ou que violem direitos de terceiros", "Armazenar ou transmitir conteúdo ofensivo, ilegal ou que infrinja propriedade intelectual", "Tentativas de engenharia reversa, invasão ou comprometimento da plataforma"] },
    { title: "5. Pagamentos e cancelamento", text: "Os planos pagos são cobrados antecipadamente (mensal ou anual) via PIX, boleto ou cartão de crédito. O cancelamento pode ser realizado a qualquer momento pelo painel da conta; o acesso permanece ativo até o fim do período já pago, sem reembolso proporcional, salvo disposição legal em contrário." },
    { title: "6. Propriedade intelectual", text: "Todo o código, design e conteúdo da plataforma VendorAI são de propriedade exclusiva da Windoor Serviços de Gerenciamento de Obras Ltda. Os dados inseridos pelo usuário permanecem de sua propriedade; você concede à VendorAI uma licença limitada para processá-los com a finalidade de prestar os serviços contratados." },
    { title: "7. Limitação de responsabilidade", text: "A VendorAI não se responsabiliza por danos indiretos, lucros cessantes ou perda de dados decorrentes do uso ou impossibilidade de uso da plataforma. Nossa responsabilidade total fica limitada ao valor pago pelo usuário nos últimos 3 meses." },
    { title: "8. Alterações nos termos", text: "Podemos atualizar estes termos a qualquer momento. Alterações relevantes serão comunicadas por e-mail com pelo menos 15 dias de antecedência. O uso continuado da plataforma após esse prazo implica aceitação das novas condições." },
    { title: "9. Foro e legislação aplicável", text: "Estes termos são regidos pelas leis brasileiras. Fica eleito o foro da Comarca de Chapecó, SC, para dirimir quaisquer controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja." },
  ],
  contactTitle: "10. Contato",
  contact: "Dúvidas sobre estes termos:",
} as const;

const ES = {
  title: "Términos de Uso",
  updated: "Última actualización: 1 de julio de 2026",
  sections: [
    { title: "1. Aceptación de los términos", text: "Al acceder o utilizar la plataforma VendorAI (operada por Windoor Serviços de Gerenciamento de Obras Ltda, CNPJ 59.623.589/0001-27, Chapecó, SC, Brasil), aceptas estos Términos de Uso. Si no estás de acuerdo, no utilices la plataforma." },
    { title: "2. Descripción de los servicios", intro: "VendorAI ofrece:", items: ["CRM completo con pipeline Kanban y gestión de leads", "Agentes de IA para prospección, calificación y seguimiento de ventas", "Comunicación omnichannel (WhatsApp, Instagram y correo electrónico)", "Automatización comercial, campañas y analytics", "Generación de propuestas y facturación integrada"] },
    { title: "3. Elegibilidad y cuenta", text: "Para utilizar la plataforma debes tener al menos 18 años y capacidad legal para celebrar contratos. Eres responsable de mantener la confidencialidad de tus credenciales de acceso y de todas las actividades realizadas en tu cuenta." },
    { title: "4. Uso aceptable", intro: "Está prohibido utilizar la plataforma para:", items: ["Enviar spam o mensajes no solicitados en desacuerdo con la LGPD y el Marco Civil da Internet de Brasil", "Realizar actividades ilegales o fraudulentas o violar derechos de terceros", "Almacenar o transmitir contenido ofensivo, ilegal o que infrinja propiedad intelectual", "Intentar ingeniería inversa, intrusión o compromiso de la plataforma"] },
    { title: "5. Pagos y cancelación", text: "Los planes pagos se cobran por adelantado (mensual o anual) mediante PIX, boleto o tarjeta de crédito. La cancelación puede realizarse en cualquier momento desde el panel de la cuenta; el acceso permanece activo hasta finalizar el período ya pagado, sin reembolso proporcional, salvo disposición legal en contrario." },
    { title: "6. Propiedad intelectual", text: "Todo el código, diseño y contenido de la plataforma VendorAI son propiedad exclusiva de Windoor Serviços de Gerenciamento de Obras Ltda. Los datos ingresados por el usuario permanecen bajo su titularidad; el usuario concede a VendorAI una licencia limitada para procesarlos con el fin de prestar los servicios contratados." },
    { title: "7. Limitación de responsabilidad", text: "VendorAI no se responsabiliza por daños indirectos, lucro cesante o pérdida de datos derivados del uso o de la imposibilidad de uso de la plataforma. Nuestra responsabilidad total se limita al importe pagado por el usuario durante los últimos 3 meses." },
    { title: "8. Cambios en los términos", text: "Podemos actualizar estos términos en cualquier momento. Los cambios relevantes serán comunicados por correo electrónico con al menos 15 días de anticipación. El uso continuado de la plataforma después de ese plazo implica la aceptación de las nuevas condiciones." },
    { title: "9. Jurisdicción y legislación aplicable", text: "Estos términos se rigen por las leyes brasileñas. Se elige el foro de la Comarca de Chapecó, SC, Brasil, para resolver cualquier controversia, con renuncia a cualquier otro foro, por más privilegiado que sea." },
  ],
  contactTitle: "10. Contacto",
  contact: "Si tienes dudas sobre estos términos:",
} as const;

export default function Terms() {
  const { isSpanish } = usePublicCountry();
  const c = isSpanish ? ES : PT;

  return (
    <div className="pb-24">
      <div className="bg-slate-900 py-16 px-4"><div className="container mx-auto max-w-3xl"><h1 className="text-4xl font-bold text-white mb-3">{c.title}</h1><p className="text-slate-400 text-sm">{c.updated}</p></div></div>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="prose prose-slate max-w-none space-y-8">
          {c.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">{section.title}</h2>
              {"text" in section && section.text ? <p className="text-slate-600 leading-relaxed">{section.text}</p> : null}
              {"intro" in section && section.intro ? <p className="text-slate-600 leading-relaxed mb-3">{section.intro}</p> : null}
              {"items" in section && section.items ? <ul className="list-disc pl-6 text-slate-600 space-y-1">{section.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            </section>
          ))}
          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">{c.contactTitle}</h2>
            <p className="text-slate-600 leading-relaxed">{c.contact}</p>
            <ul className="list-none mt-2 text-slate-600 space-y-1">
              <li>📧 <a href="mailto:vendorai@appvendorai.com" className="text-primary hover:underline">vendorai@appvendorai.com</a></li>
              <li>🌐 <Link href="/contato" className="text-primary hover:underline">appvendorai.com/contato</Link></li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
