import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Sparkles, Clock, Users, Zap } from "lucide-react";
import { Link } from "wouter";
import {
  getAdDataConsentState,
  getLaunchAttribution,
  setAdDataConsent,
} from "@/lib/launchAttribution";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const CRM_BASE = (import.meta.env.VITE_CRM_URL || "https://app.appvendorai.com").replace(/\/$/, "");

export default function Demo() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(() => ({
    nomeEmpresa: "",
    nomePessoa: "",
    email: "",
    senha: "",
    telefone: "",
    adDataConsent: getAdDataConsentState()?.granted ?? false,
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, value, checked } = e.target;
    if (name === "adDataConsent" && type === "checkbox") {
      setAdDataConsent(checked);
    }
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nomeEmpresa || !form.nomePessoa || !form.email || !form.senha) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (form.senha.length < 8) {
      toast({ title: "A senha deve ter pelo menos 8 caracteres", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const attribution = getLaunchAttribution();
      const res = await fetch(`${API_BASE}/auth/trial-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...attribution, adDataConsent: form.adDataConsent }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Erro ao criar conta", variant: "destructive" });
        return;
      }

      toast({
        title: "Seu teste foi criado!",
        description: "Redirecionando para o VendorAI...",
      });

      const handoff = new URLSearchParams({ vendorai_token: data.token });
      if (data.tenant?.demoExpiresAt) {
        handoff.set("demo_expires_at", data.tenant.demoExpiresAt);
      }

      setTimeout(() => {
        window.location.href = `${CRM_BASE}/dashboard#${handoff.toString()}`;
      }, 900);
    } catch (err) {
      toast({ title: "Erro de conexão", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Sparkles, text: "VendorAI completo" },
    { icon: Users, text: "Até 3 usuários no teste" },
    { icon: Zap, text: "Canais e automações para acompanhar seus leads" },
    { icon: Clock, text: "5 dias de acesso completo" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 py-16 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Pare de deixar lead esfriar.
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Teste o VendorAI completo por 5 dias e veja quantas oportunidades sua operação consegue acompanhar melhor.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-8 relative z-10">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden grid md:grid-cols-5 border border-slate-100">
          <div className="p-8 md:p-12 md:col-span-3">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Começar meus 5 dias grátis</h2>
            <p className="text-slate-500 mb-8">Sem cobrança durante o teste. Leva poucos minutos para começar.</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="nomeEmpresa">Nome da empresa *</Label>
                  <Input id="nomeEmpresa" name="nomeEmpresa" value={form.nomeEmpresa} onChange={handleChange} placeholder="Ex: Construtora Horizonte" required data-testid="input-nome-empresa" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nomePessoa">Seu nome *</Label>
                  <Input id="nomePessoa" name="nomePessoa" value={form.nomePessoa} onChange={handleChange} placeholder="Ex: João Silva" required data-testid="input-nome-pessoa" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="joao@empresa.com" required data-testid="input-email" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha">Senha *</Label>
                <Input id="senha" name="senha" type="password" value={form.senha} onChange={handleChange} placeholder="Mínimo 8 caracteres" required data-testid="input-senha" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone">WhatsApp</Label>
                <Input id="telefone" name="telefone" value={form.telefone} onChange={handleChange} placeholder="(48) 99999-9999" data-testid="input-telefone" />
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  name="adDataConsent"
                  checked={form.adDataConsent}
                  onChange={handleChange}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                  data-testid="input-ad-data-consent"
                />
                <span>
                  <strong className="font-medium text-slate-800">Opcional:</strong> autorizo o VendorAI a usar dados de conversão e identificadores protegidos para medir e otimizar campanhas em plataformas de anúncios, como Meta e Google. A autorização pode ser revogada conforme a{" "}
                  <Link href="/privacy" className="underline hover:text-slate-900">Política de Privacidade</Link>.
                </span>
              </label>

              <Button type="submit" className="w-full h-12 text-base font-bold" disabled={loading} data-testid="btn-criar-demo">
                {loading ? "Criando seu teste..." : "Começar meus 5 dias grátis"}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>

              <p className="text-xs text-slate-400 text-center">
                Ao criar a conta, você concorda com os{" "}
                <Link href="/terms" className="underline hover:text-slate-600">Termos de Uso</Link>{" "}
                e reconhece a{" "}
                <Link href="/privacy" className="underline hover:text-slate-600">Política de Privacidade</Link>.
              </p>
            </form>
          </div>

          <div className="bg-slate-900 p-8 md:p-12 md:col-span-2 text-white flex flex-col justify-center">
            <h3 className="text-xl font-bold mb-6">Durante o teste você recebe:</h3>
            <ul className="space-y-4">
              {features.map((f, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <f.icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-slate-200">{f.text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 pt-8 border-t border-slate-700 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-300">Os 5 dias são gratuitos e não há cobrança durante o teste.</p>
              </div>
              <div className="rounded-xl bg-white/5 p-4 text-sm text-slate-300">
                Se decidir continuar: <strong className="text-white">R$ 497/mês por 60 dias</strong>, depois <strong className="text-white">R$ 990/mês por 6 meses</strong>. Ao final da promoção, segue o preço normal vigente.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}