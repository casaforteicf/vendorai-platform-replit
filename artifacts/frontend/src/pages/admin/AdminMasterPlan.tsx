import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import registry from "./master-improvements-registry.json";

type Requirement = { id: string; module: string; title: string; status: string; tracking_url?: string; homologation: string; production: string };
const requirements = registry.items as Requirement[];
const extensions: Requirement[] = [
  { id: "MOV-01", module: "MOVEIS", title: "Modelagem paramétrica de móveis e componentes", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "MOV-02", module: "MOVEIS", title: "Peças, chapas, fitas e plano de corte preliminar", status: "code_in_pr", tracking_url: "https://github.com/casaforteicf/vendorai-platform-replit/pull/3450", homologation: "not_verified", production: "not_verified" },
  { id: "MOV-03", module: "MOVEIS", title: "Ferragens, portas e gavetas", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "MOV-04", module: "MOVEIS", title: "Plano CNC e nesting industrial", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "MOV-05", module: "MOVEIS", title: "Orçamento automático de móveis", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "MOV-06", module: "MOVEIS", title: "Produção e lista de compras", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "MOV-07", module: "MOVEIS", title: "Visualização 3D de móveis", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "TER-01", module: "TERRENOS", title: "Importação de terreno por mapas", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "TER-02", module: "TERRENOS", title: "Polígono e medidas reais do terreno", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "TER-03", module: "TERRENOS", title: "Portal de lotes de imobiliárias", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "TER-04", module: "TERRENOS", title: "Projete sua casa com lote predefinido", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "TER-05", module: "TERRENOS", title: "Recuos e regras do condomínio", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "TER-06", module: "TERRENOS", title: "Implantação automática no terreno", status: "verification_required", homologation: "not_verified", production: "not_verified" },
  { id: "TER-07", module: "TERRENOS", title: "Vínculo do interessado ao CRM", status: "verification_required", homologation: "not_verified", production: "not_verified" },
];
const all = [...requirements, ...extensions];
const phases = [
  ["P0", "Infraestrutura e segurança", "Operador Vendi, GitHub Actions, autenticação, isolamento e rollback"],
  ["P1", "CRM, Orçamento e Execução", "Cliente → negócio → proposta → contrato → execução parcial"],
  ["P1", "Agentes e Central", "Scheduler, Jarvis, suporte e trilhas de evidência"],
  ["P1", "Arqdor BIM", "Persistência, precisão 2D/3D, validação e importadores"],
  ["P2", "Móveis e terrenos", "Editor de móveis, fabricação, loteadoras e projetos vinculados"],
  ["P2", "Canais e marketing", "Omnichannel e geração de lead até receita"],
  ["P3", "Parceiros e marketplace", "Cotações, comissões e pedidos multiempresa"],
];
const label: Record<string, string> = { verification_required: "Verificar implementação", code_in_pr: "Código em PR", blocked: "Bloqueado" };
export default function AdminMasterPlan() {
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("all");
  const [status, setStatus] = useState("all");
  const modules = useMemo(() => [...new Set(all.map(item => item.module))], []);
  const rows = useMemo(() => all.filter(item => (module === "all" || item.module === module) && (status === "all" || item.status === status) && (item.title + " " + item.id).toLowerCase().includes(search.toLowerCase())), [module, status, search]);
  const coded = all.filter(item => item.status === "code_in_pr").length;
  const blocked = all.filter(item => item.status === "blocked").length;
  return (
    <section className="space-y-5" data-testid="admin-master-plan">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-semibold">Plano Mestre de Ação — Vendor.ai + Arqdor</h2><p className="mt-1 text-sm text-muted-foreground">Inventário de referência. Nenhuma funcionalidade é declarada publicada sem evidência de produção.</p></div>
          <Button variant="outline" asChild><a href="https://github.com/casaforteicf/vendorai-platform-replit/pull/3444" target="_blank" rel="noreferrer">Registro Mestre ↗</a></Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[[String(all.length), "Funções inventariadas"], [String(coded), "Código em PR"], [String(all.length-coded-blocked), "A verificar"], [String(blocked), "Bloqueios registrados"]].map(([value, title]) => <div key={title} className="rounded-lg border p-3"><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{title}</div></div>)}
        </div>
        <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Os estados deste painel são um retrato documental de 10/10/2026. GitHub mesclado ≠ homologação ou produção verificada. Para atualizações operacionais reais, utilize a aba Melhorias, integrada ao backend da Central.</p>
      </div>
      <div className="rounded-xl border bg-card p-5"><h3 className="mb-3 font-semibold">Prioridades e entregas</h3><div className="space-y-2">{phases.map(([priority,title,description]) => <div key={title} className="flex items-start gap-3 rounded-lg border p-3"><span className="rounded-md bg-muted px-2 py-1 text-xs font-bold">{priority}</span><div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{description}</p></div></div>)}</div></div>
      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-3 font-semibold">Inventário completo ({rows.length} de {all.length})</h3>
        <div className="mb-4 flex flex-wrap gap-2"><Input aria-label="Buscar requisito" placeholder="Buscar por ID ou função…" className="min-w-[220px] flex-1" value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="Filtrar módulo" className="rounded-md border bg-background px-3 py-2 text-sm" value={module} onChange={event => setModule(event.target.value)}><option value="all">Todos os módulos</option>{modules.map(m => <option value={m} key={m}>{m}</option>)}</select>
          <select aria-label="Filtrar situação" className="rounded-md border bg-background px-3 py-2 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todas as situações</option>{Object.keys(label).map(key => <option key={key} value={key}>{label[key]}</option>)}</select>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2">ID</th><th className="p-2">Módulo</th><th className="p-2">Função</th><th className="p-2">Situação</th><th className="p-2">Evidência</th></tr></thead><tbody>{rows.map(item => <tr key={item.id} className="border-b"><td className="p-2 font-mono text-xs">{item.id}</td><td className="p-2">{item.module}</td><td className="p-2">{item.title}</td><td className="p-2">{label[item.status] || item.status}</td><td className="p-2">{item.tracking_url ? <a className="text-primary underline" href={item.tracking_url} target="_blank" rel="noreferrer">GitHub ↗</a> : <span className="text-muted-foreground">Não vinculada</span>}</td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}
