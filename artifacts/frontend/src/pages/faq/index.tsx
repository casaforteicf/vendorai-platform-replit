import { useState } from "react";

const faqs = [
  {
    q: "Como integrar o WhatsApp?",
    a: 'Acesse Configurações > Integrações e clique em "Conectar WhatsApp".',
  },
];

export default function FAQ() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">❓ FAQ</h1>
      <div className="space-y-4 mt-6">
        {faqs.map((faq) => (
          <div key={faq.q} className="border rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(expanded === faq.q ? null : faq.q)}
              className="w-full text-left p-4 bg-white hover:bg-gray-50 flex justify-between"
            >
              <span className="font-medium">{faq.q}</span>
              <span>{expanded === faq.q ? "▲" : "▼"}</span>
            </button>
            {expanded === faq.q && <div className="p-4 bg-gray-50 border-t">{faq.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
