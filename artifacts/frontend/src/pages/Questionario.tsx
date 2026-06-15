import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";

const schema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido").or(z.literal("")).optional(),
  telefone: z.string().optional(),
  empresa: z.string().optional(),
  cargo: z.string().optional(),
  objetivo: z.string().optional(),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function Questionario() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug;

  const [tenantName, setTenantName] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => {
    if (!tenantSlug) return;
    fetch(`${base}/api/public/${tenantSlug}/intake`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setTenantName(data.name);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingTenant(false));
  }, [tenantSlug, base]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", email: "", telefone: "", empresa: "", cargo: "", objetivo: "", observacoes: "" },
  });

  async function onSubmit(values: FormData) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(`${base}/api/public/${tenantSlug}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Erro ao enviar");
      }
      setSubmitted(true);
    } catch (e: any) {
      setSubmitError(e.message ?? "Erro ao enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-muted-foreground">Link inválido ou expirado.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border p-10 max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
          <h2 className="text-xl font-semibold">Tudo certo!</h2>
          <p className="text-muted-foreground text-sm">
            Recebemos suas informações. Em breve entraremos em contato.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center py-12 px-4">
      <div className="bg-white rounded-2xl shadow-sm border w-full max-w-lg">
        <div className="p-8 border-b">
          <p className="text-xs font-medium text-primary uppercase tracking-wider mb-1">{tenantName}</p>
          <h1 className="text-2xl font-bold text-gray-900">Bem-vindo(a)! 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Preencha os dados abaixo para começarmos a trabalhar juntos.
          </p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome completo <span className="text-destructive">*</span></Label>
            <Input id="nome" placeholder="Seu nome" {...form.register("nome")} />
            {form.formState.errors.nome && (
              <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" placeholder="seu@email.com" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefone">WhatsApp / Telefone</Label>
              <Input id="telefone" placeholder="(11) 99999-0000" {...form.register("telefone")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="empresa">Empresa</Label>
              <Input id="empresa" placeholder="Nome da empresa" {...form.register("empresa")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cargo">Cargo / Função</Label>
              <Input id="cargo" placeholder="Ex: Diretor, Gerente..." {...form.register("cargo")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="objetivo">O que você espera alcançar?</Label>
            <Textarea
              id="objetivo"
              placeholder="Descreva seu principal objetivo ou desafio..."
              rows={3}
              {...form.register("objetivo")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações adicionais</Label>
            <Textarea
              id="observacoes"
              placeholder="Informações extras que queira compartilhar..."
              rows={2}
              {...form.register("observacoes")}
            />
          </div>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</> : "Enviar informações"}
          </Button>
        </form>
      </div>
    </div>
  );
}
