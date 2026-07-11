import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MapPin, Mail, MessageCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "/api";

type FormState = "idle" | "loading" | "success";

export default function Contato() {
  const { toast } = useToast();
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      nome: fd.get("nome") as string,
      empresa: fd.get("empresa") as string,
      email: fd.get("email") as string,
      telefone: fd.get("telefone") as string,
      mensagem: fd.get("mensagem") as string,
      origem: "formulario_contato",
    };

    setFormState("loading");

    try {
      const res = await fetch(`${API_BASE}/site/contato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { details?: string[]; error?: string };
        const msg =
          body.details?.join(", ") ||
          body.error ||
          "Erro ao enviar mensagem. Tente novamente.";
        throw new Error(msg);
      }

      setFormState("success");
      formRef.current?.reset();
      toast({
        title: "Mensagem enviada com sucesso!",
        description: "Nossa equipe comercial entrará em contato em breve.",
      });
    } catch (err: unknown) {
      setFormState("idle");
      const msg = err instanceof Error ? err.message : "Tente novamente.";
      setErrorMsg(msg);
    }
  }

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <div className="bg-slate-900 py-16 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Fale com Especialistas
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Descubra como a VendorAI pode transformar os resultados da sua equipe.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-8 relative z-10">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden grid md:grid-cols-5 border border-slate-100">

          {/* Form Side */}
          <div className="p-8 md:p-12 md:col-span-3">
            <h2 className="text-2xl font-bold text-slate-900 mb-8">Envie uma mensagem</h2>

            {formState === "success" ? (
              <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-slate-900">Mensagem enviada!</p>
                <p className="text-sm text-slate-500 max-w-xs">
                  Recebemos seu contato. Nossa equipe retornará em breve pelo e-mail informado.
                </p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => setFormState("idle")}
                >
                  Enviar outra mensagem
                </Button>
              </div>
            ) : (
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
                {errorMsg && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMsg}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome completo</Label>
                    <Input
                      id="nome"
                      name="nome"
                      required
                      placeholder="João Silva"
                      data-testid="input-nome"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="empresa">Empresa</Label>
                    <Input
                      id="empresa"
                      name="empresa"
                      required
                      placeholder="Sua Empresa Ltda"
                      data-testid="input-empresa"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail corporativo</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      placeholder="joao@empresa.com.br"
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone / WhatsApp</Label>
                    <Input
                      id="telefone"
                      name="telefone"
                      required
                      placeholder="(11) 99999-9999"
                      data-testid="input-telefone"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mensagem">Como podemos ajudar?</Label>
                  <Textarea
                    id="mensagem"
                    name="mensagem"
                    required
                    placeholder="Gostaria de agendar uma demonstração..."
                    className="min-h-[120px]"
                    data-testid="input-mensagem"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full text-base h-12"
                  disabled={formState === "loading"}
                  data-testid="btn-enviar-contato"
                >
                  {formState === "loading" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Enviar mensagem"
                  )}
                </Button>
              </form>
            )}
          </div>

          {/* Info Side */}
          <div className="bg-slate-50 p-8 md:p-12 md:col-span-2 border-l border-slate-100">
            <h3 className="text-xl font-bold text-slate-900 mb-8">Outros canais</h3>

            <div className="space-y-8">
              <div>
                <a href="#" className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-200 hover:border-primary/50 transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5 text-[#25D366]" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 group-hover:text-primary transition-colors">WhatsApp Direto</p>
                    <p className="text-sm text-slate-500">Atendimento rápido</p>
                  </div>
                </a>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">E-mail</p>
                  <p className="text-sm text-slate-600">vendorai@appvendorai.com</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Sede</p>
                  <p className="text-sm text-slate-600">Chapecó, SC<br />Brasil</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
