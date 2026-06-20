import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Sparkles, Clock, Users, Zap } from "lucide-react";
import { Link } from "wouter";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export default function Demo() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nomeEmpresa: "",
    nomePessoa: "",
    email: "",
    senha: "",
    telefone: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
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
      const res = await fetch(`${API_BASE}/auth/demo-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Erro ao criar conta", variant: "destructive" });
        return;
      }

      // Store token and redirect to CRM
      localStorage.setItem("vendorai_token", data.token);
      if (data.tenant?.demoExpiresAt) {
        localStorage.setItem("vendorai_demo_expires_at", data.tenant.demoExpiresAt);
      }
      toast({
        title: "Conta demo criada com sucesso!",
        description: "Redirecionando para o CRM...",
      });
      setTimeout(() => {
        window.location.href = `/app`;
      }, 1500);
    } catch (err) {
      toast({ title: "Erro de conexão", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Sparkles, text: "Todos os 7 agentes de IA" },
    { icon: Users, text: "Até 3 usuários" },
    { icon: Zap, text: "WhatsApp + Email + Instagram" },
    { icon: Clock, text: "5 dias de acesso completo" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 py-16 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Experimente grátis por 5 dias
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Crie sua conta demo em segundos e veja como a VendorAI transforma seus resultados comerciais.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-8 relative z-10">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden grid md:grid-cols-5 border border-slate-100">
          {/* Form Side */}
          <div className="p-8 md:p-12 md:col-span-3">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Criar conta demo</h2>
            <p className="text-slate-500 mb-8">
              Sem cartão de crédito. Sem compromisso. Acesso completo por 5 dias.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="nomeEmpresa">Nome da empresa *</Label>
                  <Input
                    id="nomeEmpresa"
                    name="nomeEmpresa"
                    value={form.nomeEmpresa}
                    onChange={handleChange}
                    placeholder="Ex: Construtora Horizonte"
                    required
                    data-testid="input-nome-empresa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nomePessoa">Seu nome *</Label>
                  <Input
                    id="nomePessoa"
                    name="nomePessoa"
                    value={form.nomePessoa}
                    onChange={handleChange}
                    placeholder="Ex: João Silva"
                    required
                    data-testid="input-nome-pessoa"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="joao@empresa.com"
                  required
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha">Senha *</Label>
                <Input
                  id="senha"
                  name="senha"
                  type="password"
                  value={form.senha}
                  onChange={handleChange}
                  placeholder="Mínimo 8 caracteres"
                  required
                  data-testid="input-senha"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone (opcional)</Label>
                <Input
                  id="telefone"
                  name="telefone"
                  value={form.telefone}
                  onChange={handleChange}
                  placeholder="(48) 99999-9999"
                  data-testid="input-telefone"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-bold"
                disabled={loading}
                data-testid="btn-criar-demo"
              >
                {loading ? "Criando conta..." : "Criar minha conta demo"}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>

              <p className="text-xs text-slate-400 text-center">
                Ao criar a conta, você concorda com os{" "}
                <Link href="/terms" className="underline hover:text-slate-600">
                  Termos de Uso
                </Link>{" "}
                e{" "}
                <Link href="/privacy" className="underline hover:text-slate-600">
                  Política de Privacidade
                </Link>
                .
              </p>
            </form>
          </div>

          {/* Info Side */}
          <div className="bg-slate-900 p-8 md:p-12 md:col-span-2 text-white flex flex-col justify-center">
            <h3 className="text-xl font-bold mb-6">O que você terá acesso:</h3>
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

            <div className="mt-8 pt-8 border-t border-slate-700">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-300">
                  Após 5 dias, sua conta demo expira automaticamente. Nossa equipe pode ajudar a migrar
                  para um plano pago caso deseje continuar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
