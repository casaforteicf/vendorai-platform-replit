import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Store, Package, ClipboardList, Settings, TrendingUp, Percent } from "lucide-react";
import { Link } from "wouter";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// Cadastro gratuito e PERMANENTE de vendedor pro Praça.ai — chega aqui pelo
// botão "Cadastre sua loja grátis" do próprio Praça.ai. Diferente da página
// /demo (trial de 5 dias): aqui a conta nunca expira, fica no plano Start
// (grátis, ferramentas mínimas — Catálogo, Pedidos, Configurações) até o
// lojista decidir assinar um plano pago pra liberar o resto do sistema.
export default function CadastroPraca() {
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
      const codigoIndicacaoPraca = new URLSearchParams(window.location.search).get("ref") || undefined;
      const res = await fetch(`${API_BASE}/auth/praca-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, codigoIndicacaoPraca }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Erro ao criar conta", variant: "destructive" });
        return;
      }

      localStorage.setItem("vendorai_token", data.token);
      toast({ title: "Loja cadastrada!", description: "Redirecionando pro painel..." });
      setTimeout(() => { window.location.href = "/app"; }, 1500);
    } catch {
      toast({ title: "Erro de conexão", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Package, text: "Catálogo de produtos completo" },
    { icon: ClipboardList, text: "Gestão de pedidos" },
    { icon: Settings, text: "Configurações da sua loja" },
    { icon: TrendingUp, text: "Suba de plano quando quiser, sem pressa" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-[#075aaa] py-16 px-4">
        <div className="container mx-auto text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
            <Store className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Venda no Praça.ai de graça
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            Cadastre sua loja sem custo nenhum. Comece com o essencial e evolua no seu ritmo.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-8 relative z-10">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden grid md:grid-cols-5 border border-slate-100">
          <div className="p-8 md:p-12 md:col-span-3">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Cadastrar minha loja</h2>
            <p className="text-slate-500 mb-6">Gratuito. Sem cartão de crédito. Sem prazo pra expirar.</p>

            {/* Aviso de comissão — em destaque, antes do formulário, sem letra miúda */}
            <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <Percent className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
              <p className="text-sm text-amber-900">
                <strong>Cadastro 100% gratuito.</strong> O Praça.ai cobra <strong>8% de comissão</strong> só sobre
                as vendas feitas pela plataforma — nada de mensalidade, nada de taxa fixa pra manter a loja.
                Esse percentual pode ser renegociado depois, caso a caso.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="nomeEmpresa">Nome da loja *</Label>
                  <Input id="nomeEmpresa" name="nomeEmpresa" value={form.nomeEmpresa} onChange={handleChange} placeholder="Ex: Loja da Maria" required data-testid="input-nome-empresa" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nomePessoa">Seu nome *</Label>
                  <Input id="nomePessoa" name="nomePessoa" value={form.nomePessoa} onChange={handleChange} placeholder="Ex: Maria Silva" required data-testid="input-nome-pessoa" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="maria@loja.com" required data-testid="input-email" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha">Senha *</Label>
                <Input id="senha" name="senha" type="password" value={form.senha} onChange={handleChange} placeholder="Mínimo 8 caracteres" required data-testid="input-senha" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone (opcional)</Label>
                <Input id="telefone" name="telefone" value={form.telefone} onChange={handleChange} placeholder="(48) 99999-9999" data-testid="input-telefone" />
              </div>

              <Button type="submit" className="w-full h-12 text-base font-bold bg-[#075aaa] hover:bg-[#064c90]" disabled={loading} data-testid="btn-criar-conta">
                {loading ? "Criando sua loja..." : "Criar minha loja grátis"}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>

              <p className="text-xs text-slate-400 text-center">
                Ao criar a conta, você concorda com os{" "}
                <Link href="/terms" className="underline hover:text-slate-600">Termos de Uso</Link>{" "}
                e{" "}
                <Link href="/privacy" className="underline hover:text-slate-600">Política de Privacidade</Link>.
              </p>
            </form>
          </div>

          <div className="bg-[#073b75] p-8 md:p-12 md:col-span-2 text-white flex flex-col justify-center">
            <h3 className="text-xl font-bold mb-6">O que já vem incluso:</h3>
            <ul className="space-y-4">
              {features.map((f, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                    <f.icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-blue-50">{f.text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 pt-8 border-t border-white/20">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
                <p className="text-sm text-blue-100">
                  Quando quiser automação de vendas (agentes de IA, follow-up automático, integrações),
                  dá pra migrar pra um plano pago a qualquer momento — sem perder nada do que já cadastrou.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
