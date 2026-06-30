import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface Beneficio {
  icone: string;
  texto: string;
}

interface Vertical {
  id: string;
  slug: string;
  nome: string;
  tagCategoria: string | null;
  titulo: string | null;
  descricao: string | null;
  resultadoTitulo: string | null;
  resultadoDescricao: string | null;
  beneficiosEsquerda: Beneficio[] | null;
  beneficiosDireita: Beneficio[] | null;
  ativo: boolean;
  ordem: number;
}

type LoadState = "loading" | "found" | "not_found" | "error";

export default function VerticalPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [state, setState] = useState<LoadState>("loading");
  const [vertical, setVertical] = useState<Vertical | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!slug) { setState("not_found"); return; }
    setState("loading");
    fetch(`${API_BASE}/site/verticais/${slug}`)
      .then(async (res) => {
        if (res.status === 404) { setState("not_found"); return; }
        if (!res.ok) throw new Error("Erro ao carregar");
        const data: Vertical = await res.json();
        setVertical(data);
        setState("found");
      })
      .catch(() => setState("error"));
  }, [slug]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <VerticalNav nome={vertical?.nome} />

      {state === "loading" && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando...
        </div>
      )}

      {(state === "not_found" || state === "error") && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 text-center">
          <p className="text-6xl">🔍</p>
          <h1 className="text-3xl font-bold text-slate-900">Vertical não encontrada</h1>
          <p className="text-slate-500 max-w-md">
            {state === "error"
              ? "Não foi possível carregar esta página. Tente novamente em breve."
              : "O endereço acessado não corresponde a nenhuma vertical da VendorAI."}
          </p>
          <Button asChild>
            <Link href="/">← Voltar ao site</Link>
          </Button>
        </div>
      )}

      {state === "found" && vertical && (
        <>
          {/* Hero */}
          <section className="relative bg-slate-900 pt-20 pb-28 px-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent pointer-events-none" />
            <div className="container mx-auto max-w-4xl relative z-10 text-center">
              {vertical.tagCategoria && (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium mb-6">
                  <span className="flex h-2 w-2 rounded-full bg-primary" />
                  {vertical.tagCategoria}
                </div>
              )}
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight font-serif">
                {vertical.titulo || vertical.nome}
              </h1>
              {vertical.descricao && (
                <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
                  {vertical.descricao}
                </p>
              )}
              <Button
                size="lg"
                className="h-13 px-8 text-base"
                onClick={() => setModalOpen(true)}
              >
                Falar sobre {vertical.nome}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </section>

          {/* Resultado */}
          {(vertical.resultadoTitulo || vertical.resultadoDescricao) && (
            <section className="py-20 bg-white px-4">
              <div className="container mx-auto max-w-5xl">
                <div className="text-center mb-14">
                  <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">
                    Resultado esperado
                  </p>
                  {vertical.resultadoTitulo && (
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                      {vertical.resultadoTitulo}
                    </h2>
                  )}
                  {vertical.resultadoDescricao && (
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                      {vertical.resultadoDescricao}
                    </p>
                  )}
                </div>

                {/* Benefícios em 2 colunas */}
                {((vertical.beneficiosEsquerda?.length ?? 0) > 0 ||
                  (vertical.beneficiosDireita?.length ?? 0) > 0) && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Coluna esquerda */}
                    <div className="space-y-4">
                      {(vertical.beneficiosEsquerda ?? []).map((b, i) => (
                        <BeneficioRow key={i} beneficio={b} />
                      ))}
                    </div>
                    {/* Coluna direita */}
                    <div className="space-y-4">
                      {(vertical.beneficiosDireita ?? []).map((b, i) => (
                        <BeneficioRow key={i} beneficio={b} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* CTA Final */}
          <section className="py-20 bg-slate-900 px-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
            <div className="container mx-auto max-w-3xl text-center relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-5">
                Pronto para transformar seu negócio de {vertical.nome.toLowerCase()}?
              </h2>
              <p className="text-slate-300 text-lg mb-10">
                Veja nossos planos e escolha o que melhor se encaixa na sua operação.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  size="lg"
                  className="h-13 px-8 text-base"
                  onClick={() => setModalOpen(true)}
                >
                  Falar com especialista
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-13 px-8 text-base bg-transparent text-white border-white/30 hover:bg-white/10"
                  asChild
                >
                  <Link href="/precos">Ver planos →</Link>
                </Button>
              </div>
            </div>
          </section>

          <ContactModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            verticalNome={vertical.nome}
            verticalSlug={vertical.slug}
          />
        </>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function VerticalNav({ nome }: { nome?: string | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl tracking-tight text-primary flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
            V
          </div>
          VendorAI
          {nome && (
            <span className="text-sm font-normal text-muted-foreground ml-2 hidden sm:inline">
              / {nome}
            </span>
          )}
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar ao site
          </Link>
        </Button>
      </div>
    </header>
  );
}

function BeneficioRow({ beneficio }: { beneficio: Beneficio }) {
  return (
    <div className="flex items-start gap-4 p-5 rounded-xl border border-slate-100 bg-slate-50 hover:border-primary/20 hover:shadow-sm transition-all">
      <span className="text-2xl leading-none mt-0.5">{beneficio.icone}</span>
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
        <p className="text-slate-700 font-medium">{beneficio.texto}</p>
      </div>
    </div>
  );
}

interface ContactModalProps {
  open: boolean;
  onClose: () => void;
  verticalNome: string;
  verticalSlug: string;
}

function ContactModal({ open, onClose, verticalNome, verticalSlug }: ContactModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: "",
    mensagem: `Tenho interesse na vertical ${verticalNome}`,
  });

  // Reset when opened
  useEffect(() => {
    if (open) {
      setSent(false);
      setForm((f) => ({ ...f, mensagem: `Tenho interesse na vertical ${verticalNome}` }));
    }
  }, [open, verticalNome]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/site/contato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          origem: `vertical_${verticalSlug}` as string,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Erro ao enviar",
          description: data.details?.join(", ") ?? data.error ?? "Tente novamente.",
          variant: "destructive",
        });
        return;
      }
      setSent(true);
    } catch {
      toast({
        title: "Erro de conexão",
        description: "Verifique sua internet e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {sent ? "Mensagem enviada!" : `Falar sobre ${verticalNome}`}
          </DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-slate-700 font-medium text-lg">Recebemos seu contato!</p>
            <p className="text-slate-500">Nossa equipe especializada em {verticalNome} retornará em breve.</p>
            <Button onClick={onClose} className="mt-2">Fechar</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="modal-nome">Nome *</Label>
                <Input
                  id="modal-nome"
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  placeholder="João Silva"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modal-empresa">Empresa</Label>
                <Input
                  id="modal-empresa"
                  name="empresa"
                  value={form.empresa}
                  onChange={handleChange}
                  placeholder="Sua Empresa"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="modal-email">E-mail *</Label>
                <Input
                  id="modal-email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="joao@empresa.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modal-telefone">Telefone</Label>
                <Input
                  id="modal-telefone"
                  name="telefone"
                  value={form.telefone}
                  onChange={handleChange}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="modal-mensagem">Mensagem *</Label>
              <Textarea
                id="modal-mensagem"
                name="mensagem"
                value={form.mensagem}
                onChange={handleChange}
                className="min-h-[96px]"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar mensagem"
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
