import { FormEvent, useState } from "react";
import { ArrowLeft, Building2, Loader2, Save } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { VEP_COMPANY_TYPES } from "./vep-types";

const TYPE_LABELS: Record<string, string> = {
  ARCHITECTURE: "Arquitetura",
  INTERIOR_DESIGN: "Design de Interiores",
  CONSTRUCTION: "Construção",
  DEVELOPER: "Incorporadora",
  CABINETRY: "Marcenaria",
  STONE: "Marmoraria",
  LIGHTING: "Iluminação",
  AUTOMATION: "Automação",
  PAINT: "Pintura",
  FLOORING: "Pisos",
  WINDOWS: "Esquadrias",
  PVC: "PVC",
  SUPPLIER: "Fornecedor",
  MANUFACTURER: "Fabricante",
  DISTRIBUTOR: "Distribuidor",
  SERVICE: "Serviço",
  CONSULTING: "Consultoria",
  RETAIL: "Varejo",
  SUPERMARKET: "Supermercado",
  BEAUTY: "Beleza e bem-estar",
  HEALTHCARE: "Saúde e clínicas",
  RESTAURANT: "Restaurantes",
  REAL_ESTATE: "Imóveis",
  AUTOMOTIVE: "Veículos",
  LOGISTICS: "Logística e fretes",
  TRAVEL: "Viagens e hotelaria",
  PHARMACY: "Farmácia",
  AGRIBUSINESS: "Agronegócio",
  TECHNOLOGY: "Tecnologia",
  OTHER: "Outro",
};

export function EcosystemCompanyCreatePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    legalName: "",
    tradeName: "",
    type: "OTHER",
    description: "",
    cnpj: "",
    phone: "",
    email: "",
    website: "",
    city: "",
    state: "",
  });

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (form.legalName.trim().length < 2) {
      toast({ title: "Informe a razão social ou nome completo", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch("/api/ecosystem-hub/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          legalName: form.legalName.trim(),
          tradeName: form.tradeName.trim() || undefined,
          type: form.type,
          description: form.description.trim() || undefined,
          cnpj: form.cnpj.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          website: form.website.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim().toUpperCase() || undefined,
          country: "BR",
          status: "active",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível cadastrar a empresa.");
      if (!body?.id) throw new Error("Empresa criada sem identificador de retorno.");

      toast({ title: "Empresa cadastrada no Ecosystem Hub" });
      navigate(`/ecosystem-hub/${body.id}`);
    } catch (error) {
      toast({
        title: "Erro ao cadastrar empresa",
        description: error instanceof Error ? error.message : "Revise os dados e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={() => navigate("/ecosystem-hub")} aria-label="Voltar ao Ecosystem Hub">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Building2 className="h-6 w-6" />Cadastrar empresa</h1>
          <p className="text-sm text-muted-foreground">Adicione uma empresa real ao diretório do Ecosystem Hub.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border bg-card p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="vep-legal-name">Razão social / nome completo *</Label>
            <Input id="vep-legal-name" value={form.legalName} onChange={(event) => update("legalName", event.target.value)} required minLength={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vep-trade-name">Nome fantasia</Label>
            <Input id="vep-trade-name" value={form.tradeName} onChange={(event) => update("tradeName", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vep-type">Tipo</Label>
            <select id="vep-type" value={form.type} onChange={(event) => update("type", event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {VEP_COMPANY_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type] ?? type}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vep-cnpj">CNPJ</Label>
            <Input id="vep-cnpj" value={form.cnpj} onChange={(event) => update("cnpj", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vep-phone">Telefone</Label>
            <Input id="vep-phone" value={form.phone} onChange={(event) => update("phone", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vep-email">E-mail</Label>
            <Input id="vep-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vep-website">Site</Label>
            <Input id="vep-website" value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vep-city">Cidade</Label>
            <Input id="vep-city" value={form.city} onChange={(event) => update("city", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vep-state">UF</Label>
            <Input id="vep-state" maxLength={2} value={form.state} onChange={(event) => update("state", event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="vep-description">Descrição</Label>
            <Textarea id="vep-description" rows={4} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Especialidades, atuação e diferenciais da empresa." />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/ecosystem-hub")} disabled={saving}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Cadastrar empresa
          </Button>
        </div>
      </form>
    </div>
  );
}

export default EcosystemCompanyCreatePage;
