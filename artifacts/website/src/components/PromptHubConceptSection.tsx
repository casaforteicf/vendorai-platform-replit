import { Film, Images, Library, Megaphone, SlidersHorizontal, Sparkles, WandSparkles } from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  eyebrow: "Prompt Hub visual",
  title: "Você escolhe o resultado. A IA monta a complexidade por trás.",
  description:
    "Em vez de escrever prompts técnicos enormes, o VendorAI transforma intenção criativa em controles simples. A Biblioteca de Mídias vira a fonte central de imagens, referências e materiais; a IA combina preservação, iluminação, fundo, estilo e qualidade e gera o prompt técnico automaticamente.",
  steps: [
    ["1", "Escolha da Biblioteca", "Use uma imagem já aprovada no seu banco de mídia, sem reenviar arquivos."],
    ["2", "Ajuste visualmente", "Controle identidade, luz, contraste, sombra, rim light, fundo e estilo sem precisar dominar prompt engineering."],
    ["3", "A IA monta o prompt", "As regras técnicas são compostas nos bastidores, mantendo o usuário focado no resultado visual."],
    ["4", "Gere e reutilize", "Crie uma ou várias versões e leve o resultado direto para site, campanha, conteúdo ou vídeo."],
  ],
  demoTitle: "Retrato cinematográfico",
  demoSubtitle: "Transforme uma foto comum em um retrato com iluminação de cinema, profundidade e acabamento profissional.",
  preserve: "Preservar identidade",
  keyLight: "Luz principal",
  contrast: "Contraste",
  rim: "Rim light",
  background: "Fundo",
  generated: "Prompt técnico gerado automaticamente",
  destinationsTitle: "Uma criação, vários destinos",
  destinations: [
    ["Site", "Use a imagem diretamente nas páginas e landing pages."],
    ["Campanhas", "Leve a mesma identidade visual para anúncios e criativos."],
    ["Vídeo", "Transforme a imagem em cena, avatar ou base para conteúdo em vídeo."],
  ],
};

const ES = {
  eyebrow: "Prompt Hub visual",
  title: "Tú eliges el resultado. La IA construye la complejidad por detrás.",
  description:
    "En lugar de escribir prompts técnicos enormes, VendorAI transforma la intención creativa en controles simples. La Biblioteca de Medios se convierte en la fuente central de imágenes, referencias y materiales; la IA combina preservación, iluminación, fondo, estilo y calidad y genera el prompt técnico automáticamente.",
  steps: [
    ["1", "Elige de la Biblioteca", "Usa una imagen ya aprobada en tu banco de medios, sin volver a cargar archivos."],
    ["2", "Ajusta visualmente", "Controla identidad, luz, contraste, sombra, rim light, fondo y estilo sin dominar prompt engineering."],
    ["3", "La IA crea el prompt", "Las reglas técnicas se componen por detrás para que el usuario se concentre en el resultado visual."],
    ["4", "Genera y reutiliza", "Crea una o varias versiones y lleva el resultado directo al sitio, campaña, contenido o video."],
  ],
  demoTitle: "Retrato cinematográfico",
  demoSubtitle: "Convierte una foto común en un retrato con iluminación cinematográfica, profundidad y acabado profesional.",
  preserve: "Preservar identidad",
  keyLight: "Luz principal",
  contrast: "Contraste",
  rim: "Rim light",
  background: "Fondo",
  generated: "Prompt técnico generado automáticamente",
  destinationsTitle: "Una creación, varios destinos",
  destinations: [
    ["Sitio", "Usa la imagen directamente en páginas y landing pages."],
    ["Campañas", "Lleva la misma identidad visual a anuncios y creativos."],
    ["Video", "Convierte la imagen en escena, avatar o base para contenido en video."],
  ],
};

export default function PromptHubConceptSection() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <section className="relative overflow-hidden border-y border-slate-200 bg-white py-14 sm:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(249,115,22,0.10),transparent_32%),radial-gradient(circle_at_10%_70%,rgba(99,102,241,0.08),transparent_28%)]" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
            <WandSparkles className="h-4 w-4" />
            {copy.eyebrow}
          </div>
          <h2 className="text-balance text-3xl font-black tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
            {copy.title}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            {copy.description}
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {copy.steps.map(([number, title, desc], index) => {
            const icons = [Library, SlidersHorizontal, Sparkles, Images];
            const Icon = icons[index] ?? Sparkles;
            return (
              <div key={title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-black text-orange-500">{number.padStart(2, "0")}</span>
                </div>
                <h3 className="mt-5 text-base font-bold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 p-4 shadow-2xl sm:rounded-[32px] sm:p-7">
            <div className="border-b border-white/10 pb-4 sm:flex sm:items-start sm:justify-between sm:gap-3 sm:pb-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-400">Prompt Hub</p>
                <h3 className="mt-1 text-xl font-black leading-tight text-white sm:text-2xl">{copy.demoTitle}</h3>
                <p className="mt-2 max-w-xl text-sm leading-5 text-slate-400">{copy.demoSubtitle}</p>
              </div>
              <div className="mt-3 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-300 sm:mt-0">
                Visual editor
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:rounded-3xl sm:p-4">
                <div className="relative overflow-hidden rounded-2xl border border-white/10">
                  <img
                    src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1100&q=92"
                    alt={isSpanish ? "Retrato cinematográfico con iluminación profesional" : "Retrato cinematográfico com iluminação profissional"}
                    className="h-[250px] w-full object-cover object-top contrast-125 saturate-110 brightness-90 sm:h-[360px]"
                    loading="lazy"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,rgba(251,146,60,.28),transparent_27%),linear-gradient(115deg,rgba(2,6,23,.72),transparent_48%,rgba(79,70,229,.30))]" />
                  <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white backdrop-blur">
                    {isSpanish ? "Resultado generado" : "Resultado gerado"}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-4 pt-16">
                    <p className="text-sm font-bold text-white">
                      {isSpanish ? "Luz de cine, profundidad y atmósfera — sin perder la identidad." : "Luz de cinema, profundidade e atmosfera — sem perder a identidade."}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
                  {[copy.preserve, copy.keyLight, copy.contrast, copy.background].map((label) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-slate-300">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="mt-4 hidden items-center gap-2 text-xs font-medium text-slate-300 sm:flex">
                  <Library className="h-4 w-4 text-orange-400" />
                  {isSpanish ? "Biblioteca de Medios" : "Biblioteca de Mídias"}
                </div>
              </div>              <div className="hidden space-y-3 md:block">
                {[
                  [copy.preserve, "ON", "100%"],
                  [copy.keyLight, isSpanish ? "Derecha" : "Direita", "88%"],
                  [copy.contrast, isSpanish ? "Alto" : "Alto", "82%"],
                  [copy.rim, isSpanish ? "Sutil" : "Sutil", "34%"],
                  [copy.background, "Purple Indigo", "#3B176D"],
                ].map(([label, value, detail]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-slate-400">{label}</span>
                      <span className="text-xs font-black text-white">{value}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-orange-500 to-violet-500" />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">{detail}</p>
                  </div>
                ))}
                <div className="rounded-2xl border border-orange-400/30 bg-orange-400/10 p-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-orange-300">
                    <Sparkles className="h-4 w-4" />
                    {copy.generated}
                  </div>
                  <p className="mt-3 line-clamp-3 font-mono text-[11px] leading-5 text-slate-300">
                    Preserve exact facial identity and proportions. Reconstruct lighting from scratch. Strong key light camera right, darker camera left, subtle rim light, deep purple-indigo matte background...
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button className="rounded-xl bg-orange-500 px-3 py-3 text-xs font-black text-white transition hover:bg-orange-400">
                    {isSpanish ? "Usar este prompt" : "Usar este prompt"}
                  </button>
                  <button className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-3 text-xs font-bold text-white transition hover:bg-white/[0.08]">
                    {isSpanish ? "Editar prompt" : "Editar prompt"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:hidden">
              <button className="rounded-xl bg-orange-500 px-3 py-3 text-xs font-black text-white transition hover:bg-orange-400">
                {isSpanish ? "Usar prompt" : "Usar prompt"}
              </button>
              <button className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-3 text-xs font-bold text-white transition hover:bg-white/[0.08]">
                {isSpanish ? "Editar" : "Editar"}
              </button>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-slate-50 p-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">Workflow conectado</p>
            <h3 className="mt-3 text-2xl font-black text-slate-950">{copy.destinationsTitle}</h3>
            <div className="mt-7 space-y-4">
              {copy.destinations.map(([title, desc], index) => {
                const icons = [Images, Megaphone, Film];
                const Icon = icons[index] ?? Images;
                return (
                  <div key={title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-950">{title}</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-bold text-slate-950">Media Library → Prompt Hub → geração → distribuição</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {isSpanish
                  ? "La misma imagen y el mismo contexto siguen disponibles dentro del sistema, sin subir archivos de nuevo ni perder la identidad visual."
                  : "A mesma imagem e o mesmo contexto continuam disponíveis dentro do sistema, sem novo upload e sem perder a identidade visual."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
