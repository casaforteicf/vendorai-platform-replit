import { Link } from "wouter";
import { ArrowRight, Building2, Car, Factory, HeartPulse, ShoppingBag, Truck, Check } from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  eyebrow: "Aplicado ao seu mercado",
  title: "A mesma inteligência. Uma operação diferente para cada segmento.",
  description:
    "O VendorAI adapta linguagem, jornada, agentes e oportunidades ao modo como cada negócio vende — sem transformar a Home em um catálogo infinito de recursos.",
  segments: [
    ["Varejo", "Lojas, moda, eletrônicos, materiais e consumo.", "/segmentos/retail", ShoppingBag],
    ["Clínicas", "Agenda, atendimento, retorno e relacionamento.", "/segmentos/clinics", HeartPulse],
    ["Automotivo", "Lead, veículo, proposta, test-drive e próxima troca.", "/segmentos/dealerships", Car],
    ["Distribuição", "Carteira, frequência, mix, recompra e expansão.", "/segmentos/distributors", Truck],
    ["Serviços", "Diagnóstico, proposta, follow-up e contrato.", "/segmentos/services", Building2],
    ["Indústria B2B", "Especificação, cotação, negociação e recorrência.", "/segmentos/industries", Factory],
  ],
  explore: "Explorar segmento",
  trialEyebrow: "5 dias para ver valor",
  trialTitle: "O teste começa com contexto, não com uma tela vazia.",
  trialDescription:
    "Conecte os canais principais, importe sua base e veja o VendorAI organizar a operação com seus próprios dados.",
  trialSteps: [
    ["Dia 1", "Conectar", "Canais e usuários essenciais."],
    ["Dia 2", "Importar", "Leads, clientes e catálogo."],
    ["Dia 3", "Operar", "CRM, conversas e agentes trabalhando."],
    ["Dia 4", "Observar", "Follow-up, sinais e oportunidades."],
    ["Dia 5", "Decidir", "Avaliar o que faz sentido manter."],
  ],
  finalEyebrow: "VendorAI",
  finalTitle: "Menos telas para administrar. Mais contexto para agir.",
  finalDescription:
    "Prospecção, CRM, atendimento, marketing e expansão de receita trabalhando sobre a mesma operação.",
  finalPrimary: "Testar 5 dias grátis",
  finalSecondary: "Ver produtos",
};

const ES = {
  eyebrow: "Aplicado a tu mercado",
  title: "La misma inteligencia. Una operación diferente para cada segmento.",
  description:
    "VendorAI adapta lenguaje, recorrido, agentes y oportunidades a la forma en que cada negocio vende, sin convertir la Home en un catálogo infinito.",
  segments: [
    ["Retail", "Tiendas, moda, electrónicos, materiales y consumo.", "/segmentos/retail", ShoppingBag],
    ["Clínicas", "Agenda, atención, retorno y relación.", "/segmentos/clinics", HeartPulse],
    ["Automotriz", "Lead, vehículo, propuesta, test-drive y próxima renovación.", "/segmentos/dealerships", Car],
    ["Distribución", "Cartera, frecuencia, mix, recompra y expansión.", "/segmentos/distributors", Truck],
    ["Servicios", "Diagnóstico, propuesta, seguimiento y contrato.", "/segmentos/services", Building2],
    ["Industria B2B", "Especificación, cotización, negociación y recurrencia.", "/segmentos/industries", Factory],
  ],
  explore: "Explorar segmento",
  trialEyebrow: "5 días para ver valor",
  trialTitle: "La prueba empieza con contexto, no con una pantalla vacía.",
  trialDescription:
    "Conecta los canales principales, importa tu base y mira cómo VendorAI organiza la operación con tus propios datos.",
  trialSteps: [
    ["Día 1", "Conectar", "Canales y usuarios esenciales."],
    ["Día 2", "Importar", "Leads, clientes y catálogo."],
    ["Día 3", "Operar", "CRM, conversaciones y agentes trabajando."],
    ["Día 4", "Observar", "Seguimiento, señales y oportunidades."],
    ["Día 5", "Decidir", "Evaluar qué vale la pena mantener."],
  ],
  finalEyebrow: "VendorAI",
  finalTitle: "Menos pantallas para administrar. Más contexto para actuar.",
  finalDescription:
    "Prospección, CRM, atención, marketing y expansión de ingresos trabajando sobre la misma operación.",
  finalPrimary: "Probar 5 días gratis",
  finalSecondary: "Ver productos",
};

export default function HomeConversionSections() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <>
      <section className="border-t border-white/10 bg-[#0a0f19] text-white">
        <div className="mx-auto max-w-[1480px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">{copy.eyebrow}</p>
              <h2 className="vendor-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl">
                {copy.title}
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">{copy.description}</p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3">
            {copy.segments.map(([title, description, href, Icon]) => {
              const SegmentIcon = Icon as typeof ShoppingBag;
              return (
                <Link
                  key={String(title)}
                  href={String(href)}
                  className="group rounded-[24px] border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-orange-400/25 hover:bg-white/[0.055]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-400/15 bg-orange-400/10 text-orange-300">
                    <SegmentIcon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">{String(title)}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{String(description)}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-orange-300">
                    {copy.explore} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-[#fbfaf7]">
        <div className="mx-auto max-w-[1480px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start lg:gap-16">
            <div className="lg:sticky lg:top-28">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">{copy.trialEyebrow}</p>
              <h2 className="vendor-display mt-4 max-w-2xl text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-slate-950 sm:text-5xl">
                {copy.trialTitle}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">{copy.trialDescription}</p>
              <Link
                href="/demo"
                className="vendor-cta-primary mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-white"
              >
                {copy.finalPrimary} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-3">
              {copy.trialSteps.map(([day, title, description], index) => (
                <div key={String(day)} className="grid gap-4 rounded-[22px] border border-slate-200 bg-white p-5 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                  <div className="flex h-10 w-16 items-center justify-center rounded-xl bg-orange-50 text-xs font-bold text-orange-700">
                    {String(day)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-950">{String(title)}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{String(description)}</p>
                  </div>
                  <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 sm:flex">
                    <Check className="h-4 w-4" />
                  </div>
                  {index < copy.trialSteps.length - 1 ? <div className="hidden" aria-hidden="true" /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1480px] overflow-hidden rounded-[30px] border border-slate-200 bg-slate-950 px-6 py-10 text-white shadow-[0_30px_90px_rgba(15,23,42,0.16)] sm:px-10 sm:py-12 lg:px-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">{copy.finalEyebrow}</p>
              <h2 className="vendor-display mt-4 max-w-4xl text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl">
                {copy.finalTitle}
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">{copy.finalDescription}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href="/demo"
                className="vendor-cta-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-white"
              >
                {copy.finalPrimary} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/produtos"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-6 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                {copy.finalSecondary}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
