import { useEffect, useState, type ReactNode } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PublicData = {
  tenant: { name: string; logoUrl?: string | null };
  profile: Record<string, any> | null;
};

export default function PublicDiagnosticoNegocio() {
  const [, params] = useRoute("/diagnostico-negocio/:token");
  const token = params?.token ?? "";
  const { toast } = useToast();
  const [data, setData] = useState<PublicData | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<"loading"|"ready"|"saving"|"saved"|"error">("loading");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/diagnostico-negocio/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Link inválido ou expirado");
        return r.json() as Promise<PublicData>;
      })
      .then((next) => {
        setData(next);
        setForm(next.profile ?? {});
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  async function save() {
    setStatus("saving");
    const payload = {
      ...form,
      ticketMedio: form.ticketMedio === "" || form.ticketMedio == null ? undefined : Number(form.ticketMedio),
      leadsMes: form.leadsMes === "" || form.leadsMes == null ? undefined : Number(form.leadsMes),
      investimentoMarketingMes: form.investimentoMarketingMes === "" || form.investimentoMarketingMes == null ? undefined : Number(form.investimentoMarketingMes),
      canaisVenda: typeof form.canaisVenda === "string"
        ? form.canaisVenda.split(",").map((v: string) => v.trim()).filter(Boolean)
        : form.canaisVenda,
    };
    const response = await fetch(`/api/public/diagnostico-negocio/${encodeURIComponent(token)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      setStatus("error");
      toast({ title: "Não foi possível salvar", description: body.error || "Revise os dados e tente novamente.", variant: "destructive" });
      return;
    }
    setStatus("saved");
    toast({ title: "Informações salvas", description: "O Perfil Mestre foi atualizado com sucesso." });
  }

  if (status === "loading") return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando diagnóstico...</div>;
  if (status === "error" && !data) return <div className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-xl font-semibold">Link indisponível</h1><p className="mt-2 text-sm text-muted-foreground">Este link expirou ou não está mais disponível.</p></div></div>;

  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <main className="min-h-screen bg-muted/20 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-3xl border bg-background p-6">
          <div className="flex items-center gap-4">
            {data?.tenant.logoUrl ? <img src={data.tenant.logoUrl} alt="" className="h-12 w-12 rounded-xl object-contain" /> : null}
            <div>
              <p className="text-sm font-semibold text-primary">Diagnóstico & Planejamento</p>
              <h1 className="text-2xl font-semibold">{data?.tenant.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Preencha o que souber. As informações alimentam o mesmo Perfil Mestre usado no Vendor.ai.</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 rounded-3xl border bg-background p-6 sm:grid-cols-2">
          <Field label="Razão social"><Input value={form.razaoSocial ?? ""} onChange={(e)=>set("razaoSocial", e.target.value)} /></Field>
          <Field label="Nome fantasia"><Input value={form.nomeFantasia ?? ""} onChange={(e)=>set("nomeFantasia", e.target.value)} /></Field>
          <Field label="CNPJ / documento"><Input value={form.cnpj ?? ""} onChange={(e)=>set("cnpj", e.target.value)} /></Field>
          <Field label="Segmento"><Input value={form.vertical ?? ""} onChange={(e)=>set("vertical", e.target.value)} /></Field>
          <Field label="Telefone"><Input value={form.telefone ?? ""} onChange={(e)=>set("telefone", e.target.value)} /></Field>
          <Field label="E-mail"><Input value={form.email ?? ""} onChange={(e)=>set("email", e.target.value)} /></Field>
          <Field label="Ticket médio"><Input type="number" value={form.ticketMedio ?? ""} onChange={(e)=>set("ticketMedio", e.target.value)} /></Field>
          <Field label="Leads por mês"><Input type="number" value={form.leadsMes ?? ""} onChange={(e)=>set("leadsMes", e.target.value)} /></Field>
          <Field label="Investimento mensal em marketing"><Input type="number" value={form.investimentoMarketingMes ?? ""} onChange={(e)=>set("investimentoMarketingMes", e.target.value)} /></Field>
          <Field label="Canais de venda"><Input value={Array.isArray(form.canaisVenda) ? form.canaisVenda.join(", ") : (form.canaisVenda ?? "")} onChange={(e)=>set("canaisVenda", e.target.value)} placeholder="WhatsApp, Instagram, Google..." /></Field>
          <Field label="Descrição do negócio" wide><Textarea rows={4} value={form.descricaoNegocio ?? ""} onChange={(e)=>set("descricaoNegocio", e.target.value)} /></Field>
          <Field label="Público-alvo" wide><Textarea rows={4} value={form.publicoAlvo ?? ""} onChange={(e)=>set("publicoAlvo", e.target.value)} /></Field>
          <Field label="Diferenciais" wide><Textarea rows={4} value={form.diferenciais ?? ""} onChange={(e)=>set("diferenciais", e.target.value)} /></Field>
          <Field label="Como vende hoje" wide><Textarea rows={4} value={form.metodoVendas ?? ""} onChange={(e)=>set("metodoVendas", e.target.value)} /></Field>
          <Field label="Principal objetivo" wide><Textarea rows={3} value={form.objetivoPrincipal ?? ""} onChange={(e)=>set("objetivoPrincipal", e.target.value)} /></Field>
          <Field label="Principal desafio" wide><Textarea rows={3} value={form.desafioPrincipal ?? ""} onChange={(e)=>set("desafioPrincipal", e.target.value)} /></Field>
        </section>

        <div className="flex items-center justify-between gap-4 rounded-2xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">{status === "saved" ? "Informações salvas. Você pode voltar a este link enquanto ele estiver válido." : "Você pode preencher parcialmente e salvar."}</p>
          <Button onClick={save} disabled={status === "saving"}>{status === "saving" ? "Salvando..." : "Salvar informações"}</Button>
        </div>
      </div>
    </main>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}><span className="text-sm font-medium">{label}</span>{children}</label>;
}
