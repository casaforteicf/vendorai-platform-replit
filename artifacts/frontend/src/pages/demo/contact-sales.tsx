import { useState, type ChangeEvent, type FormEvent } from "react";

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  message: string;
}

const EMPTY_FORM: ContactFormData = {
  name: "",
  email: "",
  phone: "",
  message: "",
};

export default function ContactSales() {
  const [formData, setFormData] = useState<ContactFormData>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    // Mantém o comportamento definido no planejamento original. A integração
    // com CRM/e-mail pode ser conectada depois sem alterar a interface pública.
    await new Promise((resolve) => window.setTimeout(resolve, 1500));

    setIsSuccess(true);
    setFormData(EMPTY_FORM);
    setIsSubmitting(false);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg bg-white p-8 rounded-lg shadow-lg text-center">
          <div className="text-6xl mb-4" aria-hidden="true">✅</div>
          <h2 className="text-2xl font-bold">Mensagem enviada!</h2>
          <p className="text-gray-600 mt-2">Nosso time comercial entrará em contato em breve.</p>
          <button
            type="button"
            onClick={() => setIsSuccess(false)}
            className="mt-4 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Nova mensagem
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-4xl font-bold text-center mb-2">Falar com Vendas</h1>
        <p className="text-center text-gray-600 mb-8">Entre em contato com nosso time comercial.</p>

        <div className="bg-white shadow-xl rounded-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                name="name"
                placeholder="Nome completo *"
                value={formData.name}
                onChange={handleChange}
                required
                className="border rounded p-2.5 w-full"
              />
              <input
                type="email"
                name="email"
                placeholder="E-mail *"
                value={formData.email}
                onChange={handleChange}
                required
                className="border rounded p-2.5 w-full"
              />
            </div>

            <input
              type="tel"
              name="phone"
              placeholder="Telefone"
              value={formData.phone}
              onChange={handleChange}
              className="border rounded p-2.5 w-full"
            />

            <textarea
              name="message"
              rows={5}
              placeholder="Mensagem *"
              value={formData.message}
              onChange={handleChange}
              required
              className="border rounded p-2.5 w-full"
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Enviando..." : "Enviar mensagem"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t text-center text-sm text-gray-500">
            📞 (49) 8816-5795 • ✉️ vendas@appvendorai.com
          </div>
        </div>
      </div>
    </div>
  );
}
