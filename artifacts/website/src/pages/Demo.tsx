import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Sparkles, Clock, Users, Zap, ArrowLeft } from "lucide-react";
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
  const [step, setStep] = useState<1 | 2>(1);
  const [warmLeadId, setWarmLeadId] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    nomeEmpresa: "",
    nomePessoa: "",
    email: "",
    senha: "",
    telefone: "",
    instagram: "",
    segmento: "",
    cidadeRegiao: "",
    produtos: "",
    leadsPerMes: "",
    canaisVenda: "",
    desafioPrincipal: "",
    objetivo6meses: "",
    adDataConsent: getAdDataConsentState()?.granted ?? false,
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const input = e.target as HTMLInputElement;
    if (name === "adDataConsent" && input.type === "checkbox") {
      setAdDataConsent(input.checked);
      setForm((f) => ({ ...f, adDataConsent: input.checked }));
      return;
    }
    setForm((f) => ({ ...f, [name]: value }));
  };

  const captureWarmLead = async () => {
    if (!form.nomeEmpresa || !form.nomePessoa || !form.email || !form.telefone || !form.segmento || !form.objetivo6meses) {
      toast({ title: "Preencha os campos principais para personalizarmos seu teste", variant: "destructive" });
      return false;
    }

    setLoading(true);
    try {
      const attribution = getLaunchAttribution();
      const canaisVenda = form.canaisVenda
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const redesSociais = form.instagram.trim() ? [form.instagram.trim()] : [];
      const res = await fetch(`${API_BASE}/public/vendorai/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nomePessoa,
          email: form.email,
          telefone: form.telefone,
          empresa: form.nomeEmpresa,
          segmento: form.segmento,
          descricaoNegocio: form.cidadeRegiao ? `Cidade/região: ${form.cidadeRegiao}` : undefined,
          produtos: form.produtos,
          redesSociais,
          canaisVenda,
          leadsPerMes: form.leadsPerMes,
          desafioPrincipal: form.desafioPrincipal,
          objetivo6meses: form.objetivo6meses,
          ...attribution,
          adDataConsent: form.adDataConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Não foi possível salvar seus dados", variant: "destructive" });
        return false;
      }
      setWarmLeadId(data.leadId || null);
      setStep(2);
      return true;
    } catch {
      toast({ title: "Erro de conexão", description: "Tente novamente.", variant: "destructive" });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      await captureWarmLead();
      return;
    }
    if (!form.senha) {
      toast({ title: "Defina sua senha para iniciar o teste", variant: "destructive" });
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
        body: JSON.stringify({
          nomeEmpresa: form.nomeEmpresa,
          nomePessoa: form.nomePessoa,
          email: form.email,
          senha: form.senha,
          telefone: form.telefone,
          warmLeadId,
          segmento: form.segmento,
          cidadeRegiao: form.cidadeRegiao,
          produtos: form.produtos,
          leadsPerMes: form.leadsPerMes,
          canaisVenda: form.canaisVenda,
          desafioPrincipal: form.desafioPrincipal,
          objetivo6meses: form.objetivo6meses,
          instagram: form.instagram,
          ...attribution,
          adDataConsent: form.adDataConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Erro ao criar conta", variant: "destructive" });
        return;
      }

      toast({
        title: "Seu teste foi criado!",
        description: "Abrindo um VendorAI já preparado para o seu negócio...",
      });

      const handoff = new URLSearchParams({ vendorai_token: data.token });
      if (data.tenant?.demoExpiresAt) handoff.set("demo_expires_at", data.tenant.demoExpiresAt);
      if (data.salesLeadId) handoff.set("sales_lead_id", data.salesLeadId);

      setTimeout(() => {
        window.location.href = `${CRM_BASE}/dashboard#${handoff.toString()}`;
      }, 900);
    } catch {
      toast({ title: "Erro de conexão", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Sparkles, text: "VendorAI completo e pré-configurado para seu segmento" },
    { icon: Users, text: "Até 3 usuários no teste" },
    { icon: Zap, text: "Canais e automações para acompanhar seus leads" },
    { icon: Clock, text: "5 dias de acesso completo" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 py-16 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Pare de deixar lead esfriar.</h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Conte rapidamente como sua empresa vende e abra uma demonstração preparada para a sua realidade.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-8 relative z-10">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden grid md:grid-cols-5 border border-slate-100">
          <div className="p-8 md:p-12 md:col-span-3">
            <div className="flex items-center justify-between gap-4 mb-2">
              <h2 className="text-2xl font-bold text-slate-900">
                {step === 1 ? "Personalizar meu teste" : "Criar meu acesso"}
              </h2>
              <span className="text-xs font-semibold text-slate-500">Etapa {step} de 2</span>
            </div>
            <p className="text-slate-500 mb-8">
              {step === 1
                ? "Essas respostas já entram no CRM e ajudam o VendorAI a entender seu negócio antes da demo."
                : "Seus dados já foram salvos. Agora basta definir a senha para iniciar os 5 dias."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {step === 1 ? (
                <>
                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label htmlFor="nomeEmpresa">Nome da empresa *</Label>
                      <Input id="nomeEmpresa" name="nomeEmpresa" value={form.nomeEmpresa} onChange={handleChange} placeholder="Ex: Construtora Horizonte" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nomePessoa">Seu nome *</Label>
                      <Input id="nomePessoa" name="nomePessoa" value={form.nomePessoa} onChange={handleChange} placeholder="Ex: João Silva" required />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail *</Label>
                      <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="joao@empresa.com" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefone">WhatsApp *</Label>
                      <Input id="telefone" name="telefone" value={form.telefone} onChange={handleChange} placeholder="(48) 99999-9999" required />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label htmlFor="instagram">Instagram</Label>
                      <Input id="instagram" name="instagram" value={form.instagram} onChange={handleChange} placeholder="@suaempresa" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cidadeRegiao">Cidade / região</Label>
                      <Input id="cidadeRegiao" name="cidadeRegiao" value={form.cidadeRegiao} onChange={handleChange} placeholder="Ex: Chapecó e região" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="segmento">Segmento / nicho *</Label>
                    <Input id="segmento" name="segmento" value={form.segmento} onChange={handleChange} placeholder="Ex: materiais de construção, seguros, autopeças..." required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="produtos">Principais produtos ou serviços</Label>
                    <Input id="produtos" name="produtos" value={form.produtos} onChange={handleChange} placeholder="O que sua empresa mais vende?" />
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label htmlFor="leadsPerMes">Leads por mês</Label>
                      <Input id="leadsPerMes" name="leadsPerMes" value={form.leadsPerMes} onChange={handleChange} placeholder="Ex: 50, 200, 1000+" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="canaisVenda">Canais usados</Label>
                      <Input id="canaisVenda" name="canaisVenda" value={form.canaisVenda} onChange={handleChange} placeholder="WhatsApp, Instagram, site..." />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="desafioPrincipal">Principal dificuldade comercial</Label>
                    <Input id="desafioPrincipal" name="desafioPrincipal" value={form.desafioPrincipal} onChange={handleChange} placeholder="Ex: demora no atendimento, follow-up, propostas..." />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="objetivo6meses">Principal objetivo *</Label>
                    <Input id="objetivo6meses" name="objetivo6meses" value={form.objetivo6meses} onChange={handleChange} placeholder="Ex: aumentar conversão e não perder oportunidades" required />
                  </div>

                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" name="adDataConsent" checked={form.adDataConsent} onChange={handleChange} className="mt-1 h-4 w-4 rounded border-slate-300" />
                    <span>
                      <strong className="font-medium text-slate-800">Opcional:</strong> autorizo o VendorAI a usar dados de conversão e identificadores protegidos para medir e otimizar campanhas em plataformas de anúncios. A autorização pode ser revogada conforme a{" "}
                      <Link href="/privacy" className="underline hover:text-slate-900">Política de Privacidade</Link>.
                    </span>
                  </label>

                  <Button type="submit" className="w-full h-12 text-base font-bold" disabled={loading}>
                    {loading ? "Salvando e personalizando..." : "Continuar para criar meu acesso"}
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <strong>{form.nomeEmpresa}</strong> já está em Aquecimento no CRM. Ao iniciar o teste, o mesmo lead seguirá para Demo/Trial sem perder o histórico.
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="senha">Crie sua senha *</Label>
                    <Input id="senha" name="senha" type="password" value={form.senha} onChange={handleChange} placeholder="Mínimo 8 caracteres" required autoFocus />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button type="button" variant="outline" className="h-12" onClick={() => setStep(1)} disabled={loading}>
                      <ArrowLeft className="mr-2 w-4 h-4" /> Ajustar respostas
                    </Button>
                    <Button type="submit" className="h-12 flex-1 text-base font-bold" disabled={loading} data-testid="btn-criar-demo">
                      {loading ? "Criando seu teste..." : "Começar meus 5 dias grátis"}
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                  </div>
                </>
              )}

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
