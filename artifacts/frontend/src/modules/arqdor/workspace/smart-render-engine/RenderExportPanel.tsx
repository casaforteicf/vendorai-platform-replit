import React from "react";

export function RenderExportPanel() {
  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Exportação</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Entregar render</h3>

      <div className="mt-5 space-y-2">
        {["Baixar imagem", "Enviar ao cliente", "Criar apresentação", "Criar vídeo curto"].map((item) => (
          <button
            key={item}
            type="button"
            className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-700"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
