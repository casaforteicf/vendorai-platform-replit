import React, { useState } from "react";
import { comments as initialComments } from "./clientExperienceData";
import type { CommentItem } from "./clientExperienceTypes";

export function CommentThread() {
  const [comments, setComments] = useState<CommentItem[]>(initialComments);
  const [message, setMessage] = useState("");

  const addComment = () => {
    const text = message.trim();
    if (!text) return;

    setComments((current) => [
      {
        id: `local-${Date.now()}`,
        author: "Você",
        role: "architect",
        message: text,
        date: new Date().toISOString().slice(0, 10),
        linkedTo: "Portal",
      },
      ...current,
    ]);
    setMessage("");
  };

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Comentários</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Comunicação centralizada</h2>

      <div className="mt-5 flex gap-3">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Escrever comentário para o cliente..."
          className="h-11 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
        />
        <button type="button" onClick={addComment} className="rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-violet-700">
          Enviar
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {comments.map((comment) => (
          <article key={comment.id} className="rounded-3xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{comment.author}</p>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700">{comment.role}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{comment.message}</p>
            <p className="mt-2 text-xs text-slate-400">{comment.date} • {comment.linkedTo}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
