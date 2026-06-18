import { Shield, Lock, Eye, Database, UserCheck, FileText } from "lucide-react";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 md:py-24">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-violet-100 mb-4">
          <Shield className="h-8 w-8 text-violet-600" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Política de Privacidade</h1>
        <p className="text-muted-foreground">Última atualização: 18 de junho de 2026</p>
      </div>

      <div className="space-y-10">
        <section className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">1. Quem somos</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            A VendorAI é uma plataforma de CRM com Inteligência Artificial para gestão de leads,
            negócios e orçamentos. Nós valorizamos sua privacidade e estamos comprometidos em proteger
            os dados pessoais dos nossos usuários e dos leads de nossos clientes.
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">2. Dados que coletamos</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Coletamos dados necessários para o funcionamento da plataforma:
          </p>
          <ul className="list-disc list-inside text-muted-foreground leading-relaxed space-y-1">
            <li><strong>Dados da conta:</strong> nome, e-mail, telefone, CNPJ da empresa.</li>
            <li><strong>Dados de leads:</strong> nome, e-mail, telefone, WhatsApp, endereço, data de nascimento e outras informações que você insere manualmente ou recebe via integração.</li>
            <li><strong>Dados de uso:</strong> interações com a plataforma, mensagens trocadas com leads, status de negócios e orçamentos.</li>
            <li><strong>Dados técnicos:</strong> logs de acesso, IP, navegador e dispositivo para segurança e melhorias.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">3. Como usamos seus dados</h2>
          </div>
          <ul className="list-disc list-inside text-muted-foreground leading-relaxed space-y-1">
            <li>Operar e melhorar a plataforma VendorAI.</li>
            <li>Processar mensagens e orçamentos via WhatsApp e outros canais.</li>
            <li>Gerar análises de inteligência (churn, perfil de compra, etc.) com IA.</li>
            <li>Enviar notificações e campanhas de marketing com autorização.</li>
            <li>Garantir segurança e prevenir fraudes.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">4. Compartilhamento</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Não vendemos dados. Compartilhamos informações apenas com:
          </p>
          <ul className="list-disc list-inside text-muted-foreground leading-relaxed space-y-1">
            <li><strong>Provedores de infraestrutura:</strong> hospedagem, banco de dados e envio de mensagens (WhatsApp Cloud API, Meta).</li>
            <li><strong>Modelos de IA:</strong> OpenAI para processamento de linguagem natural (mensagens são enviadas de forma anonimizada quando possível).</li>
            <li><strong>Requisitos legais:</strong> quando exigido por lei ou ordem judicial.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">5. Seus direitos</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Você pode solicitar acesso, correção, exclusão ou portabilidade dos seus dados
            a qualquer momento entrando em contato pelo e-mail suporte@vendor.ai.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">6. Contato</h2>
          <p className="text-muted-foreground leading-relaxed">
            Dúvidas sobre privacidade? Entre em contato:
            <br />
            <strong>E-mail:</strong> suporte@vendor.ai
            <br />
            <strong>CNPJ:</strong> 54.236.060/0123-49
          </p>
        </section>
      </div>
    </div>
  );
}
