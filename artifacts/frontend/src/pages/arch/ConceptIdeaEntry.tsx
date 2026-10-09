import { useState } from "react";

type Props = {
  initialIdea: string;
  initialScope: "house" | "room" | null;
  onStart: (idea: string, scope: "house" | "room") => void;
};

/** A single optional introduction. All design decisions happen in the editor. */
export function ConceptIdeaEntry({ initialIdea, initialScope, onStart }: Props) {
  const [idea, setIdea] = useState(initialIdea);
  const [scope, setScope] = useState<"house" | "room">(initialScope ?? "house");
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-slate-950/55 p-4">
      <form className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
        aria-labelledby="concept-idea-title"
        onSubmit={(event) => { event.preventDefault(); onStart(idea.trim(), scope); }}>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Novo pré-projeto</p>
        <h2 id="concept-idea-title" className="mt-2 text-2xl font-bold text-slate-950">Conte sua ideia</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">O que você quer construir ou transformar? Depois, você já começa a projetar.</p>
        <fieldset className="mt-5 flex gap-4 text-sm text-slate-700">
          <legend className="mb-2 font-semibold">Quero projetar</legend>
          <label className="flex items-center gap-2"><input type="radio" name="scope" value="house" checked={scope === "house"} onChange={() => setScope("house")} />Uma casa</label>
          <label className="flex items-center gap-2"><input type="radio" name="scope" value="room" checked={scope === "room"} onChange={() => setScope("room")} />Um ambiente</label>
        </fieldset>
        <label htmlFor="concept-initial-idea" className="mt-5 block text-sm font-semibold text-slate-700">Sua ideia <span className="font-normal text-slate-500">(opcional)</span></label>
        <textarea id="concept-initial-idea" rows={4} maxLength={700} value={idea} onChange={(event) => setIdea(event.target.value)}
          placeholder="Ex.: casa térrea com três quartos, suíte, cozinha integrada e garagem dupla."
          className="mt-2 w-full resize-y rounded-xl border border-slate-300 p-3 text-sm text-slate-950 focus:outline-emerald-600" />
        <p className="mt-2 text-xs leading-5 text-slate-500">Você pode adicionar terreno, arquivos e modelos dentro do editor.</p>
        <button type="submit" className="mt-5 min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">Abrir tela de projetar</button>
      </form>
    </div>
  );
}
