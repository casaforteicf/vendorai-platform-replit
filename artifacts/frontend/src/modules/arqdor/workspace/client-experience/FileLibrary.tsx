import React from "react";
import { files } from "./clientExperienceData";
import { fileClass } from "./clientExperienceUtils";

export function FileLibrary() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Arquivos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Downloads e documentos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {files.map((file) => (
          <article key={file.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{file.name}</p>
                <p className="mt-1 text-sm text-slate-500">{file.type} • {file.size}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${fileClass(file.status)}`}>{file.status}</span>
            </div>
            <p className="mt-5 text-xs text-slate-400">Versão {file.version}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
