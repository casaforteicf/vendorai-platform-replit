import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MapPin, Mail, MessageCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getLaunchAttribution } from "@/lib/launchAttribution";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
const WHATSAPP_NUMBER = "5549988164436";
const WHATSAPP_MESSAGE = "Olá! Vim pelo site do VendorAI e quero falar com a equipe comercial.";

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
    const attribution = getLaunchAttribution();
    const mensagem = String(fd.get("mensagem") || "").trim();
    const objetivo = String(fd.get("objetivo") || "").trim();
    const desafio = String(fd.get("desafio") || "").trim();
    const canal = String(fd.get("canal") || "").trim();
    const produtos = String(fd.get("produtos") || "").trim();

    const payload = {
      nome: String(fd.get("nome") || "").trim(),
      empresa: String(fd.get("empresa") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      telefone: String(fd.get("telefone") || "").trim(),
      segmento: String(fd.get("segmento") || "").trim(),
      descricaoNegocio: mensagem || undefined,
      produtos: produtos || undefined,
      canaisVenda: canal ? [canal] : undefined,
      leadsPerMes: String(fd.get("leadsPerMes") || "").trim() || undefined,
      desafioPrincipal: desafio || mensagem || undefined,
      objetivo6meses: objetivo || "Conhecer o VendorAI e avaliar implantação",
      urgencia: String(fd.get("urgencia") || "").trim() || undefined,
      ...attribution,
    };

    setFormState("loading");

    try {
      const res = await fetch(`${API_BASE}/public/vendorai/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { details?: Array<{ message?: string }> | string[]; error?: string };
        const details = Array.isArray(body.details)
          ? body.details.map((item) => typeof item === "string" ? item : item.message).filter(Boolean).join(", ")
          : "";
        throw new Error(details || body.error || "Erro ao enviar mensagem. Tente novamente.");
      }

      setFormState("success");
      formRef.current?.reset();
      toast({
        title: "Contato recebido!",
        description: "Sua empresa já entrou em aquecimento e nossa equipe dará continuidade pelo canal informado.",
      });
    } catch (err: unknown) {
      setFormState("idle");
      setErrorMsg(err instanceof Error ? err.message : "Tente novamente.");
    }
  }

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-slate-900 px-4 py-12 md:py-16">
        <div className="container mx-auto text-center">
          <h1 className="mb-5 text-3xl font-bold text-white md:text-5xl">Fale com Especialistas</h1>
          <p className="mx-auto max-w-2xl text-base text-slate-300 md:text-xl">
            Conte um pouco sobre sua operação para que o primeiro contato já seja direcionado ao seu cenário.
          </p>
        </div>
      </div>

      <div className="container relative z-10 mx-auto -mt-8 px-3 md:px-4">
        <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl md:grid-cols-5">
          <div className="p-5 sm:p-8 md:col-span-3 md:p-12">
            <h2 className="mb-2 text-2xl font-bold text-slate-900">Vamos entender sua empresa</h2>
            <p className="mb-7 text-sm text-slate-500">Os dados abaixo entram no mesmo CRM comercial usado na demonstração e no trial, sem criar cadastros paralelos.</p>

            {formState === "success" ? (
              <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-slate-900">Recebemos seu contato.</p>
                <p className="max-w-sm text-sm text-slate-500">Seu lead já está em aquecimento com o contexto informado. Se depois iniciar a demonstração ou o trial, o mesmo histórico poderá ser reaproveitado.</p>
                <Button variant="outline" className="mt-2" onClick={() => setFormState("idle")}>Enviar outro contato</Button>
              </div>
            ) : (
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" data-testid="form-contato-comercial">
                {errorMsg && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>}

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome completo *</Label>
                    <Input id="nome" name="nome" required placeholder="João Silva" data-testid="input-nome" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="empresa">Empresa *</Label>
                    <Input id="empresa" name="empresa" required placeholder="Sua Empresa Ltda" data-testid="input-empresa" />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail *</Label>
                    <Input id="email" name="email" type="email" required placeholder="joao@empresa.com.br" data-testid="input-email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefone">WhatsApp *</Label>
                    <Input id="telefone" name="telefone" required inputMode="tel" placeholder="(49) 99999-9999" data-testid="input-telefone" />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="segmento">Segmento / nicho *</Label>
                    <Input id="segmento" name="segmento" required placeholder="Ex: materiais de construção" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="produtos">Principais produtos ou serviços</Label>
                    <Input id="produtos" name="produtos" placeholder="O que sua empresa mais vende?" />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="canal">Principal canal de atendimento</Label>
                    <select id="canal" name="canal" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Selecione</option>
                      <option>WhatsApp</option><option>Instagram</option><option>Site</option><option>Telefone</option><option>Presencial</option><option>Outros</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="leadsPerMes">Leads / oportunidades por mês</Label>
                    <select id="leadsPerMes" name="leadsPerMes" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Selecione</option>
                      <option>Até 50</option><option>51 a 200</option><option>201 a 500</option><option>501 a 1.000</option><option>Mais de 1.000</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="objetivo">O que você quer melhorar primeiro? *</Label>
                  <Input id="objetivo" name="objetivo" required placeholder="Ex: responder mais rápido, converter mais, automatizar follow-up" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="desafio">Principal dificuldade hoje</Label>
                  <Input id="desafio" name="desafio" placeholder="Ex: leads esfriam antes do retorno do vendedor" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="urgencia">Quando pretende resolver isso?</Label>
                  <select id="urgencia" name="urgencia" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecione</option><option>Agora</option><option>Nos próximos 30 dias</option><option>Em 2 a 3 meses</option><option>Apenas pesquisando</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mensagem">Algo mais que precisamos saber?</Label>
                  <Textarea id="mensagem" name="mensagem" placeholder="Conte um pouco mais sobre seu processo comercial..." className="min-h-[100px]" data-testid="input-mensagem" />
                </div>

                <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={formState === "loading"} data-testid="btn-enviar-contato">
                  {formState === "loading" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : "Quero falar com a VendorAI"}
                </Button>
              </form>
            )}
          </div>

          <div className="border-l border-slate-100 bg-slate-50 p-8 md:col-span-2 md:p-12">
            <h3 className="mb-8 text-xl font-bold text-slate-900">Outros canais</h3>
            <div className="space-y-8">
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary/50">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10"><MessageCircle className="h-5 w-5 text-[#25D366]" /></div>
                <div><p className="font-bold text-slate-900">WhatsApp Direto</p><p className="text-sm text-slate-500">Atendimento rápido</p></div>
              </a>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200"><Mail className="h-5 w-5 text-slate-600" /></div>
                <div><p className="font-bold text-slate-900">E-mail</p><p className="text-sm text-slate-600">vendorai@appvendorai.com</p></div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200"><MapPin className="h-5 w-5 text-slate-600" /></div>
                <div><p className="font-bold text-slate-900">Sede</p><p className="text-sm text-slate-600">Chapecó, SC<br />Brasil</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
