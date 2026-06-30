import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, MapPin, Check } from "lucide-react";
import { ContactModal } from "@/components/site/ContactModal";

export default function ParceirosPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <ContactModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        origem="parceiro_interesse"
        titulo="Quero ser parceiro Vendor.ai"
        mensagemPreenchida="Tenho interesse no Programa de Parceiros Vendor.ai."
      />

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-white/8 bg-[#050714]/85 px-6 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 text-sm font-extrabold text-white shadow-lg shadow-violet-500/25">
            V
          </div>
          <span className="font-bold tracking-tight text-[#f0eeff]">
            Vendor<span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">.ai</span>
          </span>
        </Link>
        <Link href="/" className="flex items-center gap-1.5 rounded-full border border-white/12 px-4 py-1.5 text-sm font-medium text-[#8880a8] transition hover:border-white/20 hover:bg-white/4 hover:text-[#f0eeff]">
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar ao site
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-[400px] w-[400px] rounded-full bg-cyan-500/7 blur-[90px]" />
        <div className="relative z-10 mx-auto max-w-4xl">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/12 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-violet-300">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            Programa de Parceiros
          </div>
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-[#f0eeff] md:text-6xl">
            Seja o dono da{" "}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Vendor.ai
            </span>{" "}
            na sua cidade
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-[#8880a8]">
            Adquira uma licença territorial exclusiva, revenda a plataforma para
            PMEs da sua região e ganhe comissões recorrentes de até 40% — todo
            mês, sem limite.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => setModalOpen(true)}
              className="gap-2 rounded-full bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500 px-8 py-6 text-base font-bold text-white hover:opacity-90"
            >
              Quero ser parceiro
              <ArrowRight className="h-4 w-4" />
            </Button>
            <a
              href="#como-funciona"
              className="rounded-full border border-white/12 px-8 py-[14px] text-base font-semibold text-[#f0eeff] transition hover:bg-white/4"
            >
              Como funciona
            </a>
          </div>
        </div>
      </section>

      {/* Licença */}
      <section className="border-b border-t border-white/8 bg-[#0c0f24] px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-400 before:block before:h-0.5 before:w-5 before:bg-gradient-to-r before:from-violet-600 before:to-cyan-500">
                Licença territorial
              </p>
              <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-[#f0eeff] md:text-4xl">
                Exclusividade no seu{" "}
                <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  território
                </span>
              </h2>
              <p className="mb-4 leading-relaxed text-[#8880a8]">
                Ao adquirir a licença, você recebe o direito exclusivo de
                representar a Vendor.ai na sua cidade ou região. Nenhum outro
                parceiro pode atuar no mesmo território.
              </p>
              <p className="mb-6 leading-relaxed text-[#8880a8]">
                Você cuida da venda e relacionamento com os clientes. Nós
                cuidamos de toda a tecnologia, suporte técnico e evolução da
                plataforma.
              </p>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400">
                <MapPin className="h-4 w-4" />
                Exclusividade territorial garantida em contrato
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/12 to-cyan-500/6 p-8">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-600 to-cyan-500" />
              <div className="mb-6">
                <p className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-5xl font-extrabold text-transparent">
                  R$ 9.900
                </p>
                <p className="mt-1 text-sm text-[#8880a8]">Investimento único · Licença vitalícia</p>
              </div>
              <ul className="space-y-3">
                {[
                  "Exclusividade territorial na cidade/região escolhida",
                  "Treinamento completo: produto, vendas e onboarding",
                  "Acesso ao portal do parceiro com métricas em tempo real",
                  "Material de vendas, proposta e pitch deck personalizados",
                  "Suporte direto com a equipe Vendor.ai (canal prioritário)",
                  "Comissões recorrentes enquanto o cliente estiver ativo",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm font-medium text-[#f0eeff]">
                    <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                      <Check className="h-3 w-3 text-emerald-400" strokeWidth={3} />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Comissões */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-14 text-center">
            <p className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-400 before:block before:h-0.5 before:w-5 before:bg-gradient-to-r before:from-violet-600 before:to-cyan-500 after:block after:h-0.5 after:w-5 after:bg-gradient-to-r after:from-violet-600 after:to-cyan-500">
              Comissões
            </p>
            <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-[#f0eeff] md:text-4xl">
              Quanto você pode{" "}
              <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                ganhar
              </span>
            </h2>
            <p className="mx-auto max-w-xl text-[#8880a8]">
              Quanto mais clientes você gerencia, maior o seu percentual. Os
              valores são calculados sobre a mensalidade de cada cliente ativo.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                badge: "🥉 Bronze",
                pct: "30%",
                range: "1 – 9 clientes",
                ex: "5 × R$597 × 30%",
                result: "= R$ 895 / mês",
                featured: false,
                pctClass: "text-[#cd853f]",
              },
              {
                badge: "🥈 Prata",
                pct: "35%",
                range: "10 – 29 clientes",
                ex: "15 × R$597 × 35%",
                result: "= R$ 3.133 / mês",
                featured: true,
                pctClass: "bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent",
              },
              {
                badge: "🥇 Ouro",
                pct: "40%",
                range: "30+ clientes",
                ex: "40 × R$597 × 40%",
                result: "= R$ 9.552 / mês",
                featured: false,
                pctClass: "text-[#f59e0b]",
              },
            ].map((t) => (
              <div
                key={t.badge}
                className={`relative overflow-hidden rounded-2xl border p-7 transition hover:-translate-y-1 ${
                  t.featured
                    ? "border-violet-500/35 bg-gradient-to-br from-violet-500/12 to-cyan-500/6"
                    : "border-white/8 bg-white/4 hover:bg-white/7"
                }`}
              >
                {t.featured && (
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-600 to-cyan-500" />
                )}
                <p className="mb-4 text-xs font-bold">{t.badge}</p>
                <p className={`mb-1 font-['Plus_Jakarta_Sans'] text-5xl font-extrabold ${t.pctClass}`}>
                  {t.pct}
                </p>
                <p className="mb-5 text-sm text-[#8880a8]">de comissão mensal</p>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#8880a8]">
                  Clientes ativos
                </p>
                <p className="mb-5 font-semibold text-[#f0eeff]">{t.range}</p>
                <div className="rounded-xl bg-white/4 p-3.5">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#4e4870]">
                    Exemplo
                  </p>
                  <p className="text-sm text-[#8880a8]">{t.ex}</p>
                  <p className="mt-1 font-bold text-emerald-400">{t.result}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section
        id="como-funciona"
        className="border-b border-t border-white/8 bg-[#0c0f24] px-6 py-20"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mb-14 text-center">
            <p className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-400 before:block before:h-0.5 before:w-5 before:bg-gradient-to-r before:from-violet-600 before:to-cyan-500 after:block after:h-0.5 after:w-5 after:bg-gradient-to-r after:from-violet-600 after:to-cyan-500">
              Como funciona
            </p>
            <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-[#f0eeff] md:text-4xl">
              4 passos para começar a{" "}
              <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                receber
              </span>
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-4">
            {[
              { n: "01", icon: "📋", title: "Adquirir a licença", desc: "Escolha sua cidade, assine o contrato de exclusividade e faça o investimento de R$ 9.900." },
              { n: "02", icon: "🎓", title: "Treinamento", desc: "Imersão completa: entenda a plataforma, aprenda o pitch de vendas e receba o material de apoio." },
              { n: "03", icon: "🤝", title: "Vender e onboarding", desc: "Prospecte PMEs da sua região e conduza o onboarding com suporte da equipe Vendor.ai." },
              { n: "04", icon: "💰", title: "Receber todo mês", desc: "Comissões depositadas mensalmente enquanto o cliente estiver ativo. Sem teto." },
            ].map((p) => (
              <div
                key={p.n}
                className="rounded-2xl border border-white/8 bg-white/4 p-6 transition hover:-translate-y-1 hover:border-violet-500/25 hover:bg-white/7"
              >
                <p className="mb-4 bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text font-['Plus_Jakarta_Sans'] text-4xl font-extrabold text-transparent leading-none">
                  {p.n}
                </p>
                <p className="mb-3 text-2xl">{p.icon}</p>
                <h4 className="mb-2 font-bold text-[#f0eeff]">{p.title}</h4>
                <p className="text-sm leading-relaxed text-[#8880a8]">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA / Formulário */}
      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.1)_0%,transparent_70%)]" />
        <div className="relative z-10 mx-auto max-w-xl">
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-[#f0eeff] md:text-4xl">
            Pronto para abrir sua{" "}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              franquia de IA
            </span>
            ?
          </h2>
          <p className="mb-10 leading-relaxed text-[#8880a8]">
            Nossa equipe de parcerias entrará em contato em até 24h com todos
            os detalhes da licença na sua cidade.
          </p>
          <Button
            onClick={() => setModalOpen(true)}
            className="gap-2 rounded-full bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500 px-10 py-6 text-base font-bold text-white hover:opacity-90"
          >
            Enviar cadastro de interesse
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/8 bg-[#0c0f24] px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-extrabold text-white">
              V
            </div>
            <span className="font-bold text-[#f0eeff]">
              Vendor<span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">.ai</span>
            </span>
          </div>
          <p className="text-sm text-[#4e4870]">© 2025 Vendor.ai · Programa de Parceiros</p>
          <div className="flex gap-6 text-sm text-[#8880a8]">
            <Link href="/" className="hover:text-[#f0eeff] transition">Site principal</Link>
            <Link href="/#planos" className="hover:text-[#f0eeff] transition">Planos</Link>
            <a href="https://wa.me/554931913565" target="_blank" rel="noopener" className="hover:text-[#f0eeff] transition">WhatsApp</a>
          </div>
        </div>
      </footer>
    </>
  );
}
