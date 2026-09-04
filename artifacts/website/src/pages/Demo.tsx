import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, Clock, Users, Zap } from "lucide-react";
import { Link } from "wouter";
import {
  getAdDataConsentState,
  getLaunchAttribution,
  setAdDataConsent,
} from "@/lib/launchAttribution";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const CRM_BASE = (import.meta.env.VITE_CRM_URL || "https://app.appvendorai.com").replace(/\/$/, "");

type TrialForm = {
  nomeEmpresa: string;
  nomePessoa: string;
  email: string;
  senha: string;
  telefone: string;
  segmento: string;
  nicho: string;
  produtosServicos: string;
  clienteIdeal: string;
  objetivoPrincipal: string;
  dorPrincipal: string;
  canalPrincipal: string;
  regiaoAtuacao: string;
  volumeLeads: string;
  tamanhoEquipe: string;
  adDataConsent: boolean;
};

const initialForm = (): TrialForm => ({
  nomeEmpresa: "",
  nomePessoa: "",
  email: "",
  senha: "",
  telefone: "",
  segmento: "",
  nicho: "",
  produtosServicos: "",
  clienteIdeal: "",
  objetivoPrincipal: "",
  dorPrincipal: "",
  canalPrincipal: "",
  regiaoAtuacao: "",
  volumeLeads: "",
  tamanhoEquipe: "",
  adDataConsent: getAdDataConsentState()?.granted ?? false,
});

export default function Demo() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<TrialForm>(initialForm);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, type, value } = e.target;
    const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : false;
    if (name === "adDataConsent" && type === "checkbox") setAdDataConsent(checked);
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };

  const captureWarmLead = async () => {
    if (!form.nomePessoa || !form.email || !form.nomeEmpresa) return;
    const attribution = getLaunchAttribution();
    const details = [
      form.segmento && `Segmento: ${form.segmento}`,
      form.nicho && `Nicho: ${form.nicho}`,
      form.produtosServicos && `Produtos/serviços: ${form.produtosServicos}`,
      form.clienteIdeal && `Cliente ideal: ${form.clienteIdeal}`,
      form.objetivoPrincipal && `Objetivo: ${form.objetivoPrincipal}`,
      form.dorPrincipal && `Principal dificuldade: ${form.dorPrincipal}`,
      form.canalPrincipal && `Canal principal: ${form.canalPrincipal}`,
      form.regiaoAtuacao && `Região: ${form.regiaoAtuacao}`,
      form.volumeLeads && `Volume aproximado de leads/mês: ${form.volumeLeads}`,
      form.tamanhoEquipe && `Equipe comercial/atendimento: ${form.tamanhoEquipe}`,
    ].filter(Boolean).join("\n");

    try {
      await fetch(`${API_BASE}/site/contato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nomePessoa,
          email: form.email,
          telefone: form.telefone || undefined,
          empresa: form.nomeEmpresa,
          mensagem: details || "Iniciou o cadastro para o trial de 5 dias do VendorAI.",
          origem: "trial_progressivo",
          ...attribution,
          adDataConsent: form.adDataConsent,
        }),
      });
    } catch {
      // A captura comercial nunca deve bloquear o cadastro do trial.
    }
  };

  const goNext = async () => {
    if (step === 1) {
      if (!form.nomeEmpresa || !form.nomePessoa || !form.email || !form.telefone || !form.segmento) {
        toast({ title: "Preencha os campos obrigatórios para continuar", variant: "destructive" });
        return;
      }
      await captureWarmLead();
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!form.produtosServicos || !form.objetivoPrincipal || !form.dorPrincipal) {
        toast({ title: "Conte um pouco mais sobre seu negócio", variant: "destructive" });
        return;
      }
      await captureWarmLead();
      setStep(3);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) return;
    if (!form.senha) {
      toast({ title: "Crie uma senha para ativar seu teste", variant: "destructive" });
      return;
    }
    if (form.senha.length < 8) {
      toast({ title: "A senha deve ter pelo menos 8 caracteres", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await captureWarmLead();
      const attribution = getLaunchAttribution();
      const res = await fetch(`${API_BASE}/auth/demo-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeEmpresa: form.nomeEmpresa,
          nomePessoa: form.nomePessoa,
          email: form.email,
          senha: form.senha,
          telefone: form.telefone,
          segmento: form.segmento,
          nicho: form.nicho,
          produtosServicos: form.produtosServicos,
          clienteIdeal: form.clienteIdeal,
          objetivoPrincipal: form.objetivoPrincipal,
          dorPrincipal: form.dorPrincipal,
          canalPrincipal: form.canalPrincipal,
          regiaoAtuacao: form.regiaoAtuacao,
          volumeLeads: form.volumeLeads,
          tamanhoEquipe: form.tamanhoEquipe,
          ...attribution,
          adDataConsent: form.adDataConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Erro ao criar conta", variant: "destructive" });
        return;
      }

      toast({ title: "Seu teste foi criado!", description: "Redirecionando para o VendorAI..." });
      const handoff = new URLSearchParams({ vendorai_token: data.token });
      if (data.tenant?.demoExpiresAt) handoff.set("demo_expires_at", data.tenant.demoExpiresAt);
      handoff.set("onboarding_segmento", form.segmento);
      if (form.nicho) handoff.set("onboarding_nicho", form.nicho);
      if (form.produtosServicos) handoff.set("onboarding_oferta", form.produtosServicos);
      if (form.objetivoPrincipal) handoff.set("onboarding_objetivo", form.objetivoPrincipal);
      if (form.dorPrincipal) handoff.set("onboarding_dor", form.dorPrincipal);
      if (form.canalPrincipal) handoff.set("onboarding_canal", form.canalPrincipal);

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
    { icon: Sparkles, text: "VendorAI preparado para o seu segmento" },
    { icon: Users, text: "Até 3 usuários no teste" },
    { icon: Zap, text: "Canais e automações para acompanhar seus leads" },
    { icon: Clock, text: "5 dias de acesso completo" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-24 sm:pb-0">
      <div className="bg-slate-900 px-4 py-12 md:py-16">
        <div className="container mx-auto text-center">
          <h1 className="mb-4 text-3xl font-bold text-white md:mb-6 md:text-5xl">Prepare o VendorAI para o seu negócio.</h1>
          <p className="mx-auto max-w-2xl text-base text-slate-300 md:text-xl">Em poucos passos entendemos sua operação para que você não entre em um sistema vazio.</p>
        </div>
      </div>

      <div className="container relative z-10 mx-auto -mt-6 px-3 md:-mt-8 md:px-4">
        <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl md:grid-cols-5">
          <div className="p-5 sm:p-8 md:col-span-3 md:p-12">
            <div className="mb-6 flex items-center gap-2" aria-label={`Etapa ${step} de 3`}>
              {[1, 2, 3].map((n) => (
                <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-slate-200"}`} />
              ))}
            </div>

            <h2 className="mb-2 text-2xl font-bold text-slate-900">
              {step === 1 ? "Vamos conhecer você" : step === 2 ? "Personalize sua demonstração" : "Ative seus 5 dias grátis"}
            </h2>
            <p className="mb-7 text-slate-500">
              {step === 1
                ? "Só o essencial agora. O restante será enriquecido conforme você avançar."
                : step === 2
                  ? "Essas respostas ajudam a IA a preparar uma experiência relevante para sua empresa."
                  : "Sem cobrança durante o teste. Sua configuração seguirá com você se decidir continuar."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {step === 1 && (
                <>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nomeEmpresa">Nome da empresa *</Label>
                      <Input id="nomeEmpresa" name="nomeEmpresa" value={form.nomeEmpresa} onChange={handleChange} placeholder="Ex: Construtora Horizonte" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nomePessoa">Seu nome *</Label>
                      <Input id="nomePessoa" name="nomePessoa" value={form.nomePessoa} onChange={handleChange} placeholder="Ex: João Silva" required />
                    </div>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="telefone">WhatsApp *</Label>
                      <Input id="telefone" name="telefone" value={form.telefone} onChange={handleChange} placeholder="(48) 99999-9999" required inputMode="tel" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail *</Label>
                      <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="joao@empresa.com" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="segmento">Segmento *</Label>
                    <Input id="segmento" name="segmento" value={form.segmento} onChange={handleChange} placeholder="Ex: materiais de construção, seguros, piscinas" required />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nicho">Nicho / especialidade</Label>
                      <Input id="nicho" name="nicho" value={form.nicho} onChange={handleChange} placeholder="Ex: pisos e revestimentos" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="regiaoAtuacao">Cidade / região de atuação</Label>
                      <Input id="regiaoAtuacao" name="regiaoAtuacao" value={form.regiaoAtuacao} onChange={handleChange} placeholder="Ex: Chapecó e região" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="produtosServicos">O que sua empresa vende ou oferece? *</Label>
                    <Input id="produtosServicos" name="produtosServicos" value={form.produtosServicos} onChange={handleChange} placeholder="Principais produtos ou serviços" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clienteIdeal">Quem é seu principal cliente?</Label>
                    <Input id="clienteIdeal" name="clienteIdeal" value={form.clienteIdeal} onChange={handleChange} placeholder="Ex: construtoras, consumidor final, indústrias" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="objetivoPrincipal">O que você quer melhorar primeiro? *</Label>
                    <Input id="objetivoPrincipal" name="objetivoPrincipal" value={form.objetivoPrincipal} onChange={handleChange} placeholder="Ex: responder mais rápido e converter mais" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dorPrincipal">Qual a maior dificuldade hoje? *</Label>
                    <Input id="dorPrincipal" name="dorPrincipal" value={form.dorPrincipal} onChange={handleChange} placeholder="Ex: leads esfriam antes do vendedor responder" required />
                  </div>
                  <div className="grid gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="canalPrincipal">Canal principal</Label>
                      <select id="canalPrincipal" name="canalPrincipal" value={form.canalPrincipal} onChange={handleChange} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">Selecione</option>
                        <option>WhatsApp</option>
                        <option>Instagram</option>
                        <option>Site</option>
                        <option>Telefone</option>
                        <option>Presencial</option>
                        <option>Outros</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="volumeLeads">Leads / mês</Label>
                      <select id="volumeLeads" name="volumeLeads" value={form.volumeLeads} onChange={handleChange} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">Selecione</option>
                        <option>Até 50</option>
                        <option>51 a 200</option>
                        <option>201 a 500</option>
                        <option>501 a 1.000</option>
                        <option>Mais de 1.000</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tamanhoEquipe">Equipe</Label>
                      <select id="tamanhoEquipe" name="tamanhoEquipe" value={form.tamanhoEquipe} onChange={handleChange} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">Selecione</option>
                        <option>1 pessoa</option>
                        <option>2 a 5</option>
                        <option>6 a 15</option>
                        <option>16 a 50</option>
                        <option>Mais de 50</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <strong>Pré-personalização pronta.</strong> Vamos usar seu segmento, oferta, objetivo e dificuldade para orientar seu primeiro acesso.
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="senha">Crie sua senha *</Label>
                    <Input id="senha" name="senha" type="password" value={form.senha} onChange={handleChange} placeholder="Mínimo 8 caracteres" required data-testid="input-senha" />
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <input type="checkbox" name="adDataConsent" checked={form.adDataConsent} onChange={handleChange} className="mt-1 h-4 w-4 rounded border-slate-300" />
                    <span>
                      <strong className="font-medium text-slate-800">Opcional:</strong> autorizo o VendorAI a usar dados de conversão e identificadores protegidos para medir e otimizar campanhas.{" "}
                      <Link href="/privacy" className="underline hover:text-slate-900">Política de Privacidade</Link>.
                    </span>
                  </label>
                </>
              )}

              <div className="flex gap-3 pt-1">
                {step > 1 && (
                  <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setStep((current) => (current === 3 ? 2 : 1))} disabled={loading}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                  </Button>
                )}
                {step < 3 ? (
                  <Button type="button" className="h-12 flex-1 font-bold" onClick={goNext}>
                    Continuar <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                ) : (
                  <Button type="submit" className="h-12 flex-1 font-bold" disabled={loading} data-testid="btn-criar-demo">
                    {loading ? "Criando seu teste..." : "Começar meus 5 dias grátis"}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                )}
              </div>

              <p className="text-center text-xs text-slate-400">
                Ao criar a conta, você concorda com os <Link href="/terms" className="underline hover:text-slate-600">Termos de Uso</Link> e reconhece a <Link href="/privacy" className="underline hover:text-slate-600">Política de Privacidade</Link>.
              </p>
            </form>
          </div>

          <div className="flex flex-col justify-center bg-slate-900 p-8 text-white md:col-span-2 md:p-12">
            <h3 className="mb-6 text-xl font-bold">Durante o teste você recebe:</h3>
            <ul className="space-y-4">
              {features.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                    <feature.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-slate-200">{feature.text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 space-y-4 border-t border-slate-700 pt-8">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <p className="text-sm text-slate-300">Os 5 dias são gratuitos e não há cobrança durante o teste.</p>
              </div>
              <div className="rounded-xl bg-white/5 p-4 text-sm text-slate-300">
                As respostas desta etapa servem para pré-configurar a experiência e também ajudam nossa equipe a entender o contexto da sua empresa.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
