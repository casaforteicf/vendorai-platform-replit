import { useState } from "react";
import { Link } from "wouter";

export default function GeradorConteudo() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  function generateDraft() {
    const subject = title.trim() || "seu produto ou serviço";
    setContent(`Apresente ${subject} destacando o principal benefício, uma prova de valor e uma chamada para ação clara.`);
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">✨ Gerador de Conteúdo</h2>
      <div className="bg-white rounded shadow p-6 space-y-4 border">
        <input
          type="text"
          placeholder="Título..."
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full border rounded p-2"
        />
        <textarea
          rows={5}
          placeholder="Descrição..."
          className="w-full border rounded p-2"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="flex flex-wrap gap-4">
          <button type="button" onClick={generateDraft} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">🤖 Gerar com IA</button>
          {content && (
            <Link href="/ads" className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">🚀 Ir para Anúncios</Link>
          )}
        </div>
      </div>
    </div>
  );
}
