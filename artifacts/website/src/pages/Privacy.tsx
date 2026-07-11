import { Link } from "wouter";

export default function Privacy() {
  return (
    <div className="pb-24">
      <div className="bg-slate-900 py-16 px-4">
        <div className="container mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold text-white mb-3">Política de Privacidade</h1>
          <p className="text-slate-400 text-sm">Última atualização: 1º de julho de 2026</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="prose prose-slate max-w-none space-y-8">

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">1. Introdução</h2>
            <p className="text-slate-600 leading-relaxed">
              A <strong>VendorAI</strong> (operada por Windoor Serviços de Gerenciamento de Obras Ltda, CNPJ 59.623.589/0001-27,
              com sede em Chapecó, SC, Brasil) respeita sua privacidade e está comprometida com a proteção dos dados pessoais
              dos seus usuários, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">2. Dados coletados</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              Coletamos os seguintes tipos de dados para a operação da plataforma:
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-1">
              <li>Dados de cadastro: nome, e-mail, telefone e empresa</li>
              <li>Dados de uso: conversas, leads, negócios e atividades registradas no CRM</li>
              <li>Dados de comunicação: mensagens via WhatsApp, Instagram DM e e-mail processadas pela plataforma</li>
              <li>Dados técnicos: endereço IP, tipo de dispositivo, navegador e logs de acesso</li>
              <li>Dados de pagamento: processados por terceiros (Asaas) — não armazenamos dados de cartão</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">3. Finalidade do uso</h2>
            <p className="text-slate-600 leading-relaxed mb-3">Utilizamos os dados coletados para:</p>
            <ul className="list-disc pl-6 text-slate-600 space-y-1">
              <li>Operar e melhorar a plataforma de CRM e automação comercial</li>
              <li>Executar os agentes de IA e automações configuradas pelo usuário</li>
              <li>Enviar comunicações relevantes sobre a conta (sem spam)</li>
              <li>Suporte técnico e atendimento ao cliente</li>
              <li>Cumprimento de obrigações legais e regulatórias</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">4. Compartilhamento de dados</h2>
            <p className="text-slate-600 leading-relaxed">
              Não vendemos dados pessoais a terceiros. Compartilhamos dados apenas com provedores de serviço essenciais
              para a operação da plataforma (infraestrutura em nuvem, processamento de pagamentos, envio de mensagens),
              sempre sob acordos de confidencialidade e em conformidade com a LGPD.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">5. Seus direitos (LGPD)</h2>
            <p className="text-slate-600 leading-relaxed mb-3">Você tem direito a:</p>
            <ul className="list-disc pl-6 text-slate-600 space-y-1">
              <li>Confirmar a existência e acessar seus dados</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
              <li>Solicitar anonimização, bloqueio ou eliminação de dados desnecessários</li>
              <li>Portabilidade dos dados a outro fornecedor</li>
              <li>Revogar o consentimento a qualquer momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">6. Segurança</h2>
            <p className="text-slate-600 leading-relaxed">
              Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados contra acesso não autorizado,
              perda acidental ou destruição — incluindo criptografia em trânsito (HTTPS/TLS) e em repouso.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">7. Contato</h2>
            <p className="text-slate-600 leading-relaxed">
              Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato:
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
