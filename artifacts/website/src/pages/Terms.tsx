import { FileText, Gavel, Ban, CreditCard, RefreshCw, AlertCircle } from "lucide-react";

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 md:py-24">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-blue-100 mb-4">
          <Gavel className="h-8 w-8 text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Termos de Uso</h1>
        <p className="text-muted-foreground">Última atualização: 18 de junho de 2026</p>
      </div>

      <div className="space-y-10">
        <section className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">1. Aceitação</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Ao criar uma conta e usar a VendorAI, você concorda com estes Termos de Uso.
            Se não concordar, não utilize a plataforma.
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">2. Uso permitido</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            A VendorAI é uma ferramenta de CRM para empresas gerenciarem leads e negócios.
            Você se compromete a:
          </p>
          <ul className="list-disc list-inside text-muted-foreground leading-relaxed space-y-1">
            <li>Fornecer informações verdadeiras e atualizadas.</li>
            <li>Não usar a plataforma para atividades ilegais ou spam.</li>
            <li>Respeitar a privacidade dos leads e obter consentimento quando exigido por lei.</li>
            <li>Não tentar acessar dados de outros tenants ou contas.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">3. Planos e pagamento</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            A VendorAI oferece planos pagos com cobrança via integração de pagamento (Asaas).
            Ao assinar, você autoriza a cobrança recorrente. Cancelamentos são feitos via
            configurações da conta ou pelo suporte.
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">4. Limitações e responsabilidade</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            A VendorAI se esforça para manter a plataforma disponível e segura, mas não
            garante funcionamento ininterrupto. Não nos responsabilizamos por:
          </p>
          <ul className="list-disc list-inside text-muted-foreground leading-relaxed space-y-1">
            <li>Decisões de negócio tomadas com base nas análises de IA.</li>
            <li>Indisponibilidade de serviços de terceiros (WhatsApp, Meta, OpenAI).</li>
            <li>Perda de dados por falha do usuário em manter backups.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Ban className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">5. Rescisão</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Podemos suspender ou encerrar sua conta em caso de violação dos termos,
            uso fraudulento ou não pagamento. Você pode cancelar a qualquer momento.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">6. Contato</h2>
          <p className="text-muted-foreground leading-relaxed">
            Dúvidas sobre os termos? Entre em contato:
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
