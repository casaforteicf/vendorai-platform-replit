import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Eye, Sparkles } from "lucide-react";

type GuideBlock = {
  title: string;
  cue: string;
  text: string;
};

const PT_BR: GuideBlock[] = [
  {
    title: "Expressão natural",
    cue: "Olhar: centro · Expressão: natural",
    text: "Olá, meu nome é [NOME]. Estou gravando este vídeo para criar minha identidade digital. Vou falar de forma natural, como converso no dia a dia. Quero que esta gravação registre meu jeito real de olhar, sorrir, explicar, fazer pausas e me comunicar com outras pessoas.",
  },
  {
    title: "Explicação",
    cue: "Fale com clareza e use seus gestos habituais",
    text: "Quando preciso explicar alguma coisa, procuro organizar as ideias com calma, apresentar as informações de maneira simples e destacar os pontos mais importantes. Também observo a reação da outra pessoa, faço pequenas pausas e ajusto a explicação até ter certeza de que tudo ficou realmente claro.",
  },
  {
    title: "Pergunta e curiosidade",
    cue: "Use sua expressão interrogativa normal",
    text: "Agora vou fazer algumas perguntas como faria em uma conversa. O que você acha dessa ideia? Qual opção faria mais sentido para você? Existe algum detalhe que ainda precisa ser esclarecido? Se pudéssemos melhorar uma parte desse processo agora, qual seria a primeira mudança que você escolheria?",
  },
  {
    title: "Entusiasmo",
    cue: "Olhar: centro · Sorriso e energia naturais",
    text: "Essa é uma parte muito interessante, porque quando tecnologia, conhecimento e uma boa comunicação trabalham juntos, conseguimos transformar processos complicados em experiências muito mais simples. É muito bom perceber uma oportunidade, encontrar uma solução adequada e ver que o resultado realmente fez diferença para a pessoa.",
  },
  {
    title: "Confiança e seriedade",
    cue: "Reduza o sorriso e transmita calma e segurança",
    text: "Também existem momentos em que precisamos falar com mais seriedade. Nesses casos, eu prefiro analisar cada detalhe com atenção, confirmar as informações importantes e tomar decisões com tranquilidade. Segurança, clareza e confiança são fundamentais quando queremos construir uma relação profissional e chegar a uma solução responsável.",
  },
  {
    title: "Movimentos e finalização",
    cue: "Centro → esquerda leve → centro → direita leve → centro → sorriso → neutro",
    text: "Para finalizar, vou continuar falando enquanto faço alguns movimentos naturais. Primeiro olho para a câmera, depois viro levemente para a esquerda e volto ao centro. Agora olho um pouco para a direita e retorno novamente. Vou sorrir, voltar para uma expressão neutra e encerrar falando normalmente. Perfeito. Esta é minha maneira habitual de me comunicar.",
  },
];

const ES: GuideBlock[] = [
  {
    title: "Expresión natural",
    cue: "Mirada: centro · Expresión: natural",
    text: "Hola, mi nombre es [NOME]. Estoy grabando este video para crear mi identidad digital. Voy a hablar de forma natural, como converso todos los días. Quiero que esta grabación registre mi manera real de mirar, sonreír, explicar, hacer pausas y comunicarme con otras personas.",
  },
  {
    title: "Explicación",
    cue: "Hable con claridad y use sus gestos habituales",
    text: "Cuando necesito explicar algo, trato de ordenar las ideas con calma, presentar la información de manera simple y destacar los puntos más importantes. También observo la reacción de la otra persona, hago pequeñas pausas y ajusto la explicación hasta estar seguro de que todo quedó realmente claro.",
  },
  {
    title: "Pregunta y curiosidad",
    cue: "Use su expresión interrogativa habitual",
    text: "Ahora voy a hacer algunas preguntas como lo haría en una conversación. ¿Qué le parece esta idea? ¿Qué opción tendría más sentido? ¿Hay algún detalle que todavía deba aclararse? Si pudiéramos mejorar una parte de este proceso ahora, ¿cuál sería el primer cambio que elegiría?",
  },
  {
    title: "Entusiasmo",
    cue: "Mirada: centro · Sonrisa y energía naturales",
    text: "Esta es una parte muy interesante, porque cuando la tecnología, el conocimiento y una buena comunicación trabajan juntos, podemos transformar procesos complicados en experiencias mucho más simples. Es muy bueno encontrar una oportunidad, elegir una solución adecuada y ver que el resultado realmente ayudó a la persona.",
  },
  {
    title: "Confianza y seriedad",
    cue: "Reduzca la sonrisa y transmita calma y seguridad",
    text: "También hay momentos en los que necesitamos hablar con más seriedad. En esos casos prefiero analizar cada detalle con atención, confirmar la información importante y tomar decisiones con tranquilidad. Seguridad, claridad y confianza son fundamentales cuando queremos construir una relación profesional y llegar a una solución responsable.",
  },
  {
    title: "Movimientos y cierre",
    cue: "Centro → izquierda leve → centro → derecha leve → centro → sonrisa → neutro",
    text: "Para terminar, voy a seguir hablando mientras hago algunos movimientos naturales. Primero miro a la cámara, después giro levemente hacia la izquierda y vuelvo al centro. Ahora miro un poco hacia la derecha y regreso nuevamente. Voy a sonreír, volver a una expresión neutra y cerrar hablando normalmente. Perfecto. Esta es mi forma habitual de comunicarme.",
  },
];

const MOBILE_BREAKPOINT = 820;

function readName() {
  const text = document.body.textContent ?? "";
  const match = text.match(/Olá, meu nome é\s+([^\.]+)\./i) ?? text.match(/Hola, mi nombre es\s+([^\.]+)\./i);
  return match?.[1]?.trim() || "[NOME]";
}

function isPortuguese() {
  return (document.body.textContent ?? "").includes("pt-BR");
}

function findVideoSection() {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video[playsinline]"));
  const video = videos.find((item) => item.closest("section"));
  return video?.closest("section") ?? null;
}

function findOriginalScriptCard(section: Element) {
  const headings = Array.from(section.querySelectorAll<HTMLElement>("h2"));
  const heading = headings.find((item) => item.textContent?.trim() === "Trecho do roteiro atual");
  return heading?.closest("div.rounded-3xl") as HTMLElement | null;
}

function hideTopCue(section: Element) {
  const camera = section.querySelector<HTMLVideoElement>("video[playsinline]")?.parentElement;
  if (!camera) return () => undefined;
  const candidate = Array.from(camera.children).find((child) => child.textContent?.includes("Agora:")) as HTMLElement | undefined;
  if (!candidate) return () => undefined;
  const previous = candidate.style.display;
  candidate.style.display = "none";
  return () => { candidate.style.display = previous; };
}

export default function VideoAvatarVideoScriptGuide() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("[NOME]");
  const [portuguese, setPortuguese] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth > MOBILE_BREAKPOINT) return;

    let originalCard: HTMLElement | null = null;
    let cleanupCue: () => void = () => {};
    let inserted: HTMLElement | null = null;

    const sync = () => {
      const bodyText = document.body.textContent ?? "";
      if (!bodyText.includes("Etapa 4 de 6")) {
        setMount(null);
        return;
      }

      const section = findVideoSection();
      if (!section) return;
      const camera = section.querySelector<HTMLVideoElement>("video[playsinline]")?.parentElement;
      if (!camera) return;

      originalCard = findOriginalScriptCard(section);
      if (originalCard) originalCard.style.display = "none";
      cleanupCue();
      cleanupCue = hideTopCue(section);

      if (!inserted || !inserted.isConnected) {
        inserted = document.createElement("div");
        inserted.dataset.dubleVideoGuide = "true";
        camera.insertAdjacentElement("afterend", inserted);
      }

      setName(readName());
      setPortuguese(isPortuguese());
      setMount(inserted);
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    const timer = window.setTimeout(sync, 200);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      if (originalCard) originalCard.style.display = "";
      cleanupCue();
      inserted?.remove();
    };
  }, []);

  const blocks = portuguese ? PT_BR : ES;
  const block = blocks[index];
  const displayText = useMemo(() => block.text.replaceAll("[NOME]", name), [block.text, name]);

  if (!mount) return null;

  return createPortal(
    <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#ff4b12]">Roteiro guiado · cerca de 2 min</p>
          <h2 className="mt-1 text-lg font-bold">{block.title}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-bold text-[#ff4b12]">{index + 1} de {blocks.length}</span>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <p className="text-[clamp(1.05rem,4.8vw,1.35rem)] font-medium leading-[1.55] text-slate-950">{displayText}</p>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-orange-50 px-3 py-3 text-sm font-medium text-orange-800">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{block.cue}</span>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs leading-5 text-slate-500">
        <Eye className="h-4 w-4 shrink-0 text-[#ff4b12]" />
        <span>Terminou este trecho? Avance na hora. Você não precisa esperar o cronômetro mudar o texto.</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-35">
          <ArrowLeft className="h-4 w-4" /> Trecho anterior
        </button>
        <button type="button" disabled={index === blocks.length - 1} onClick={() => setIndex((value) => Math.min(blocks.length - 1, value + 1))} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#ff4b12] px-3 text-sm font-bold text-white disabled:bg-emerald-600 disabled:opacity-100">
          {index === blocks.length - 1 ? "Roteiro concluído" : <>Próximo trecho <ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">Fale no seu ritmo. O objetivo é uma gravação natural entre aproximadamente 1:30 e 2:15.</p>
    </div>,
    mount,
  );
}
