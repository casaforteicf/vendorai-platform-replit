import { Link } from "wouter";

export default function Terms() {
  return (
    <div className="pb-24">
      <div className="bg-slate-900 py-16 px-4">
        <div className="container mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold text-white mb-3">Termos de Uso</h1>
          <p className="text-slate-400 text-sm">Última atualização: 1º de julho de 2026</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="prose prose-slate max-w-none space-y-8">

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">1. Aceitação dos termos</h2>
            <p className="text-slate-600 leading-relaxed">
              Ao acessar ou utilizar a plataforma <strong>VendorAI</strong> (operada por Windoor Serviços de Gerenciamento
              de Obras Ltda, CNPJ 59.623.589/0001-27, Chapecó, SC, Brasil), você concorda com estes Termos de Uso.
              Caso não concorde, não utilize a plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">2. Descrição dos serviços</h2>
            <p className="text-slate-600 leading-relaxed mb-3">A VendorAI oferece:</p>
            <ul className="list-disc pl-6 text-slate-600 space-y-1">
              <li>CRM completo com pipeline Kanban e gestão de leads</li>
              <li>Agentes de IA para prospecção, qualificação e acompanhamento de vendas</li>
              <li>Comunicação omnichannel (WhatsApp, Instagram, e-mail)</li>
              <li>Automação comercial, campanhas e analytics</li>
              <li>Geração de propostas e faturamento integrado</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">3. Elegibilidade e conta</h2>
            <p className="text-slate-600 leading-relaxed">
              Para utilizar a plataforma você deve ser maior de 18 anos e ter capacidade legal para celebrar contratos.
              Você é responsável por manter a confidencialidade das suas credenciais de acesso e por todas as atividades
              realizadas em sua conta.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">4. Uso aceitável</h2>
            <p className="text-slate-600 leading-relaxed mb-3">É <strong>proibido</strong> utilizar a plataforma para:</p>
            <ul className="list-disc pl-6 text-slate-600 space-y-1">
              <li>Envio de spam ou mensagens não solicitadas em desacordo com a LGPD e o Marco Civil da Internet</li>
              <li>Atividades ilegais, fraudulentas ou que violem direitos de terceiros</li>
              <li>Armazenar ou transmitir conteúdo ofensivo, ilegal ou que infrinja propriedade intelectual</li>
              <li>Tentativas de engenharia reversa, invasão ou comprometimento da plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">5. Pagamentos e cancelamento</h2>
            <p className="text-slate-600 leading-relaxed">
              Os planos pagos são cobrados antecipadamente (mensal ou anual) via PIX, boleto ou cartão de crédito.
              O cancelamento pode ser realizado a qualquer momento pelo painel da conta; o acesso permanece ativo
              até o fim do período já pago, sem reembolso proporcional, salvo disposição legal em contrário.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">6. Propriedade intelectual</h2>
            <p className="text-slate-600 leading-relaxed">
              Todo o código, design e conteúdo da plataforma VendorAI são de propriedade exclusiva da Windoor Serviços
              de Gerenciamento de Obras Ltda. Os dados inseridos pelo usuário permanecem de sua propriedade; você concede
              à VendorAI uma licença limitada para processá-los com a finalidade de prestar os serviços contratados.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">7. Limitação de responsabilidade</h2>
            <p className="text-slate-600 leading-relaxed">
              A VendorAI não se responsabiliza por danos indiretos, lucros cessantes ou perda de dados decorrentes
              do uso ou impossibilidade de uso da plataforma. Nossa responsabilidade total fica limitada ao valor
              pago pelo usuário nos últimos 3 meses.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">8. Alterações nos termos</h2>
            <p className="text-slate-600 leading-relaxed">
              Podemos atualizar estes termos a qualquer momento. Alterações relevantes serão comunicadas por e-mail
              com pelo menos 15 dias de antecedência. O uso continuado da plataforma após esse prazo implica aceitação
              das novas condições.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">9. Foro e legislação aplicável</h2>
            <p className="text-slate-600 leading-relaxed">
              Estes termos são regidos pelas leis brasileiras. Fica eleito o foro da Comarca de Chapecó, SC, para
              dirimir quaisquer controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">10. Contato</h2>
            <p className="text-slate-600 leading-relaxed">
              Dúvidas sobre estes termos:
            </p>
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
