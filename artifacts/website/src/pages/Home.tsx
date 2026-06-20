import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Bot, Target, Zap, BarChart3, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 md:pt-32 md:pb-40 overflow-hidden bg-slate-50">
        <div className="absolute inset-0 bg-grid-slate-200 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10" />
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <span className="flex h-2 w-2 rounded-full bg-primary"></span>
              A evolução do CRM para o mercado brasileiro
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 mb-6 leading-tight">
              O poder de 30 vendedores na mão da <span className="text-primary">sua equipe</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
              CRM, automação e inteligência artificial nativa. Feche mais negócios, reative clientes perdidos e nunca deixe um lead esfriar.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="w-full sm:w-auto text-base h-12 px-8" asChild data-testid="hero-btn-primary">
                <Link href="/demo">Experimentar grátis <ArrowRight className="ml-2 w-5 h-5" /></Link>
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-12 px-8 bg-white" asChild data-testid="hero-btn-secondary">
                <Link href="/funcionalidades">Conheça a plataforma</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 border-y border-border bg-white">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-x divide-border">
            <div className="px-4">
              <p className="text-4xl font-bold text-slate-900 mb-2">+1.200</p>
              <p className="text-sm text-slate-500 font-medium">Empresas usando</p>
            </div>
            <div className="px-4">
              <p className="text-4xl font-bold text-slate-900 mb-2">R$ 48M</p>
              <p className="text-sm text-slate-500 font-medium">Em deals fechados</p>
            </div>
            <div className="px-4">
              <p className="text-4xl font-bold text-slate-900 mb-2">94%</p>
              <p className="text-sm text-slate-500 font-medium">Taxa de renovação</p>
            </div>
            <div className="px-4">
              <p className="text-4xl font-bold text-slate-900 mb-2">4.8/5</p>
              <p className="text-sm text-slate-500 font-medium">Satisfação no G2</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Highlights */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Tudo que sua operação precisa, em um só lugar</h2>
            <p className="text-lg text-slate-600">Esqueça a colcha de retalhos de ferramentas gringas. A VendorAI foi feita para a realidade comercial do Brasil.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Bot className="w-8 h-8 text-primary" />,
                title: "7 Agentes de IA Autônomos",
                desc: "Do SDR ao Suporte, conte com agentes que trabalham 24/7 qualificando, agendando e recuperando leads."
              },
              {
                icon: <Target className="w-8 h-8 text-primary" />,
                title: "CRM Visual e Intuitivo",
                desc: "Pipeline Kanban, histórico completo por contato e gestão de propostas. Sem curvas de aprendizado complexas."
              },
              {
                icon: <MessageSquare className="w-8 h-8 text-primary" />,
                title: "Omnichannel de Verdade",
                desc: "WhatsApp, Instagram e Email na mesma tela. Zero alternância de abas para sua equipe."
              },
              {
                icon: <BarChart3 className="w-8 h-8 text-primary" />,
                title: "Customer Intelligence",
                desc: "Antecipe cancelamentos com nossa IA preditiva e saiba exatamente quem contatar hoje."
              },
              {
                icon: <Zap className="w-8 h-8 text-primary" />,
                title: "Cobrança Nativa",
                desc: "Gere links de PIX, boletos e assinaturas direto no CRM. Faturamento totalmente integrado."
              },
              {
                icon: <Target className="w-8 h-8 text-primary" />,
                title: "Feito para o Brasil",
                desc: "Suporte local, faturamento em reais e foco total em como as vendas acontecem por aqui."
              }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-primary/20 hover:shadow-lg transition-all"
              >
                <div className="w-14 h-14 rounded-xl bg-white shadow-sm flex items-center justify-center mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <Button size="lg" variant="outline" asChild data-testid="home-btn-features">
              <Link href="/funcionalidades">Ver todas as funcionalidades</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-slate-900 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-primary/10" />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Pronto para escalar suas vendas?
          </h2>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
            Junte-se a mais de 1.200 empresas que já transformaram seus processos comerciais com a VendorAI.
          </p>
          <Button size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90" asChild data-testid="home-btn-cta">
            <Link href="/contato">Falar com especialista agora</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
