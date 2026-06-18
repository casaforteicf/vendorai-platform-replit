import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const SEGMENTOS = [
  "Varejo de Roupas & Acessórios",
  "Varejo físico",
  "E-commerce",
  "Serviços B2B",
  "Serviços B2C",
  "SaaS / Tecnologia",
  "Saúde e Bem-estar",
  "Educação",
  "Imóveis",
  "Consultoria",
  "Alimentação / Restaurante",
  "Indústria / Fabricação",
  "Outro",
];

const TICKET_OPTIONS = [
  "Até R$ 500",
  "R$ 500 – R$ 2.000",
  "R$ 2.000 – R$ 10.000",
  "R$ 10.000 – R$ 50.000",
  "Acima de R$ 50.000",
];

const LEADS_OPTIONS = [
  "Menos de 20",
  "20 – 50",
  "50 – 200",
  "200 – 500",
  "Mais de 500",
];

const ORCAMENTO_OPTIONS = [
  "Menos de R$ 1.000/mês",
  "R$ 1.000 – R$ 3.000/mês",
  "R$ 3.000 – R$ 10.000/mês",
  "Acima de R$ 10.000/mês",
  "Ainda não definido",
];

const URGENCIA_OPTIONS = [
  { value: "alta", label: "Alta — preciso começar agora" },
  { value: "media", label: "Média — nos próximos 1–3 meses" },
  { value: "baixa", label: "Baixa — estou em fase de planejamento" },
];

const REDES_SOCIAIS = ["Instagram", "Facebook", "LinkedIn", "YouTube", "TikTok", "X (Twitter)", "Pinterest"];

const CANAIS_VENDA = ["WhatsApp", "Instagram", "E-mail", "Site próprio", "Marketplace (Mercado Livre, Shopee…)", "Loja física", "Indicação / boca a boca", "Representantes comerciais"];

const PRECISA_CRIAR = [
  { value: "site", label: "Site institucional" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "landing", label: "Landing page de captação" },
  { value: "crm", label: "CRM / Funil de vendas" },
  { value: "automacao", label: "Automação de WhatsApp" },
];

type FormData = {
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
  empresa: string;
  segmento: string;
  descricaoNegocio: string;
  produtos: string;
  diferenciais: string;
  publicoAlvo: string;
  concorrentes: string;
  temSite: string;
  urlSite: string;
  precisaCriar: string[];
  redesSociais: string[];
  canaisVenda: string[];
  temCrm: string;
  qualCrm: string;
  tamanhoEquipe: string;
  ticketMedio: string;
  leadsPerMes: string;
  desafioPrincipal: string;
  objetivo6meses: string;
  urgencia: string;
  orcamento: string;
};

const EMPTY: FormData = {
  nome: "", email: "", telefone: "", cargo: "",
  empresa: "", segmento: "", descricaoNegocio: "", produtos: "", diferenciais: "",
  publicoAlvo: "", concorrentes: "", temSite: "", urlSite: "", precisaCriar: [], redesSociais: [],
  canaisVenda: [], temCrm: "", qualCrm: "", tamanhoEquipe: "", ticketMedio: "", leadsPerMes: "",
  desafioPrincipal: "", objetivo6meses: "", urgencia: "", orcamento: "",
};

const STEPS = [
  "Contato",
  "Negócio",
  "Presença digital",
  "Vendas & CRM",
  "Objetivos",
];

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-500 mt-1">{msg}</p>;
}

function CheckGroup({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[] | string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const normalized = (options as (string | { value: string; label: string })[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="flex flex-wrap gap-2">
      {normalized.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => toggle(o.value)}
          className={cn(
            "px-3 py-1.5 rounded-full border text-sm transition-colors",
            selected.includes(o.value)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-white text-gray-700 border-gray-200 hover:border-primary/50"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RadioGroup({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm text-left transition-colors",
            selected === o.value
              ? "bg-primary/5 border-primary text-primary font-medium"
              : "bg-white border-gray-200 text-gray-700 hover:border-primary/40"
          )}
        >
          <span className={cn("w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors",
            selected === o.value ? "border-primary bg-primary" : "border-gray-300"
          )} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Questionario() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug;

  const [tenantName, setTenantName] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => {
    if (!tenantSlug) return;
    fetch(`${base}/api/public/${tenantSlug}/intake`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => { if (data) setTenantName(data.name); })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingTenant(false));
  }, [tenantSlug, base]);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validateStep(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (step === 0) {
      if (!form.nome.trim()) e.nome = "Nome é obrigatório";
      if (!form.email.trim()) e.email = "E-mail é obrigatório";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "E-mail inválido";
    }
    if (step === 1) {
      if (!form.empresa.trim()) e.empresa = "Nome da empresa é obrigatório";
      if (!form.segmento) e.segmento = "Selecione um segmento";
    }
    if (step === 4) {
      if (!form.urgencia) e.urgencia = "Selecione a urgência";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function prev() {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!validateStep()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(`${base}/api/public/${tenantSlug}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Erro ao enviar");
      }
      setSubmitted(true);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Erro ao enviar. Tente novamente.");
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
          <h2 className="text-xl font-semibold">Perfeito, obrigado!</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Recebemos todas as informações do seu negócio.<br />
            Nossa equipe vai analisar tudo e entrar em contato em breve para apresentar as soluções ideais para você.
          </p>
        </div>
      </div>
    );
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-6">

        <div className="text-center space-y-1">
          {tenantName && (
            <p className="text-xs font-semibold text-primary uppercase tracking-widest">{tenantName}</p>
          )}
          <h1 className="text-2xl font-bold text-gray-900">Conte-nos sobre seu negócio</h1>
          <p className="text-sm text-muted-foreground">
            Etapa {step + 1} de {STEPS.length} — {STEPS[step]}
          </p>
        </div>

        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6 md:p-8 space-y-5">

          {step === 0 && (
            <>
              <h2 className="text-base font-semibold text-gray-800">Informações de contato</h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nome completo <span className="text-red-500">*</span></Label>
                  <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Seu nome completo" />
                  <FieldError msg={errors.nome} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail <span className="text-red-500">*</span></Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="seu@email.com" />
                  <FieldError msg={errors.email} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>WhatsApp / Telefone</Label>
                    <Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(11) 99999-0000" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cargo / Função</Label>
                    <Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} placeholder="Ex: Diretor, Sócio…" />
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-base font-semibold text-gray-800">Sobre seu negócio</h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nome da empresa <span className="text-red-500">*</span></Label>
                  <Input value={form.empresa} onChange={(e) => set("empresa", e.target.value)} placeholder="Nome da empresa ou marca" />
                  <FieldError msg={errors.empresa} />
                </div>
                <div className="space-y-1.5">
                  <Label>Segmento de atuação <span className="text-red-500">*</span></Label>
                  <select
                    value={form.segmento}
                    onChange={(e) => set("segmento", e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Selecione o segmento…</option>
                    {SEGMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <FieldError msg={errors.segmento} />
                </div>
                <div className="space-y-1.5">
                  <Label>O que sua empresa faz? Descreva brevemente</Label>
                  <Textarea
                    value={form.descricaoNegocio}
                    onChange={(e) => set("descricaoNegocio", e.target.value)}
                    rows={3}
                    placeholder="Ex: Vendemos cursos de design online para profissionais que querem migrar de carreira…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Principais produtos / serviços</Label>
                  <Textarea
                    value={form.produtos}
                    onChange={(e) => set("produtos", e.target.value)}
                    rows={2}
                    placeholder="Liste os 2–3 principais produtos ou serviços que você oferece e seus preços médios"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Diferenciais competitivos</Label>
                  <Textarea
                    value={form.diferenciais}
                    onChange={(e) => set("diferenciais", e.target.value)}
                    rows={2}
                    placeholder="O que te diferencia da concorrência? Por que um cliente escolhe você?"
                  />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-base font-semibold text-gray-800">Mercado & presença digital</h2>
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Quem é seu cliente ideal?</Label>
                  <Textarea
                    value={form.publicoAlvo}
                    onChange={(e) => set("publicoAlvo", e.target.value)}
                    rows={2}
                    placeholder="Descreva: idade, perfil, cargo, onde mora, dores e desejos do seu cliente ideal"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Quem são seus principais concorrentes?</Label>
                  <Input
                    value={form.concorrentes}
                    onChange={(e) => set("concorrentes", e.target.value)}
                    placeholder="Ex: Empresa X, Empresa Y, produto Z…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Você já tem site?</Label>
                  <div className="flex gap-3">
                    {["Sim", "Não"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => set("temSite", v)}
                        className={cn(
                          "flex-1 py-2 rounded-xl border text-sm font-medium transition-colors",
                          form.temSite === v
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-white border-gray-200 text-gray-700 hover:border-primary/50"
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                {form.temSite === "Sim" && (
                  <div className="space-y-1.5">
                    <Label>URL do site atual</Label>
                    <Input value={form.urlSite} onChange={(e) => set("urlSite", e.target.value)} placeholder="https://seusite.com.br" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>O que você precisa criar ou melhorar? <span className="text-xs text-muted-foreground">(selecione todos que se aplicam)</span></Label>
                  <CheckGroup options={PRECISA_CRIAR} selected={form.precisaCriar} onChange={(v) => set("precisaCriar", v)} />
                </div>
                <div className="space-y-2">
                  <Label>Redes sociais que você usa atualmente</Label>
                  <CheckGroup options={REDES_SOCIAIS} selected={form.redesSociais} onChange={(v) => set("redesSociais", v)} />
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-base font-semibold text-gray-800">Vendas & CRM</h2>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Como você vende hoje? <span className="text-xs text-muted-foreground">(selecione todos que se aplicam)</span></Label>
                  <CheckGroup options={CANAIS_VENDA} selected={form.canaisVenda} onChange={(v) => set("canaisVenda", v)} />
                </div>
                <div className="space-y-2">
                  <Label>Usa algum CRM ou sistema de vendas?</Label>
                  <div className="flex gap-3">
                    {["Sim", "Não"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => set("temCrm", v)}
                        className={cn(
                          "flex-1 py-2 rounded-xl border text-sm font-medium transition-colors",
                          form.temCrm === v
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-white border-gray-200 text-gray-700 hover:border-primary/50"
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                {form.temCrm === "Sim" && (
                  <div className="space-y-1.5">
                    <Label>Qual CRM / sistema você usa?</Label>
                    <Input value={form.qualCrm} onChange={(e) => set("qualCrm", e.target.value)} placeholder="Ex: RD Station, HubSpot, Pipedrive, planilha…" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Tamanho da equipe de vendas</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.tamanhoEquipe}
                      onChange={(e) => set("tamanhoEquipe", e.target.value)}
                      placeholder="Nº de vendedores"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Leads / contatos por mês</Label>
                    <select
                      value={form.leadsPerMes}
                      onChange={(e) => set("leadsPerMes", e.target.value)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Selecione…</option>
                      {LEADS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Ticket médio de venda</Label>
                  <select
                    value={form.ticketMedio}
                    onChange={(e) => set("ticketMedio", e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Selecione…</option>
                    {TICKET_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-base font-semibold text-gray-800">Objetivos e próximos passos</h2>
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Qual é seu principal desafio hoje?</Label>
                  <Textarea
                    value={form.desafioPrincipal}
                    onChange={(e) => set("desafioPrincipal", e.target.value)}
                    rows={3}
                    placeholder="Ex: Não consigo converter os leads que chegam, minha equipe perde muito tempo em tarefas manuais, não tenho visibilidade do funil…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>O que você quer alcançar nos próximos 6 meses?</Label>
                  <Textarea
                    value={form.objetivo6meses}
                    onChange={(e) => set("objetivo6meses", e.target.value)}
                    rows={3}
                    placeholder="Ex: Aumentar as vendas em 40%, lançar meu e-commerce, automatizar o atendimento via WhatsApp…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Urgência <span className="text-red-500">*</span></Label>
                  <RadioGroup
                    options={URGENCIA_OPTIONS}
                    selected={form.urgencia}
                    onChange={(v) => set("urgencia", v)}
                  />
                  <FieldError msg={errors.urgencia} />
                </div>
                <div className="space-y-1.5">
                  <Label>Investimento disponível para o projeto</Label>
                  <select
                    value={form.orcamento}
                    onChange={(e) => set("orcamento", e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Prefiro não dizer / ainda não sei</option>
                    {ORCAMENTO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

        </div>

        {submitError && (
          <p className="text-sm text-red-500 text-center">{submitError}</p>
        )}

        <div className="flex gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={prev} className="flex-1" disabled={submitting}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} className="flex-1">
              Continuar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={submit} className="flex-1" disabled={submitting}>
              {submitting
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</>
                : "Enviar informações ✓"}
            </Button>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Seus dados são usados exclusivamente para preparar a proposta personalizada.
        </p>
      </div>
    </div>
  );
}
