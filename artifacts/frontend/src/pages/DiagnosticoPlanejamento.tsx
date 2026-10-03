import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  FileText,
  Megaphone,
  RefreshCw,
  Rocket,
  Target,
  UploadCloud,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BusinessPlanPanel from "@/components/business-plan/BusinessPlanPanel";

type DiagnosticItem = {
  id: string;
  titulo: string;
  concluido: boolean;
  peso: number;
  detalhe: string;
  acao?: string;
};

type Diagnostic = {
  percentual: number;
  nivel: string;
  itens: DiagnosticItem[];
  lacunas: Array<{ id: string; titulo: string; acao: string }>;
};

type BusinessPlanSnapshot = {
  plan: { version: number; sections: Record<string, { approved?: unknown[] }> };
  sources: {
    profile?: Record<string, unknown> | null;
    products?: unknown[];
    media?: unknown[];
  };
};

async function apiJson<T>(path: string): Promise<T> {
  const token = localStorage.getItem("vendorai_token");
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("Não foi possível carregar os dados.");
  return response.json() as Promise<T>;
}

function pctTone(value: number) {
  if (value >= 85) return "text-emerald-700";
  if (value >= 65) return "text-blue-700";
  if (value >= 40) return "text-amber-700";
  return "text-muted-foreground";
}

export default function DiagnosticoPlanejamento() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";

  const snapshot = useQuery<BusinessPlanSnapshot>({
    queryKey: ["diagnostico-planejamento", "business-plan", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 30_000,
    queryFn: () => apiJson(`/api/tenants/${tenantId}/business-plan`),
  });

  const diagnostic = useQuery<Diagnostic>({
    queryKey: ["diagnostico-planejamento", "diagnostico", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 30_000,
    queryFn: () => apiJson(`/api/tenants/${tenantId}/business-plan/diagnostico-inteligencia`),
  });

  const profile = snapshot.data?.sources?.profile ?? {};
  const companyName = String(
    profile?.["nome_fantasia"] || profile?.["razao_social"] || "Sua empresa",
  );
  const score = diagnostic.data?.percentual ?? 0;
  const approvedSections = snapshot.data
    ? Object.values(snapshot.data.plan.sections ?? {}).filter((section) => (section.approved?.length ?? 0) > 0).length
    : 0;

  const refresh = () => {
    void snapshot.refetch();
    void diagnostic.refetch();
  };

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border bg-card">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
              <BrainCircuit className="h-4 w-4" />
              Diagnóstico & Planejamento
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{companyName}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Entrada única para conhecer a empresa, importar materiais, consolidar o Perfil Mestre e
              transformar contexto em diagnóstico, metas, análise, campanhas e plano de ação.
            </p>
          </div>
          <div className="grid min-w-[210px] gap-2 rounded-2xl border bg-muted/30 p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prontidão da inteligência</span>
            <strong className={`text-4xl ${pctTone(score)}`}>{diagnostic.isLoading ? "—" : `${score}%`}</strong>
            <span className="text-xs text-muted-foreground">
              {approvedSections} bloco(s) estratégicos aprovados · versão {snapshot.data?.plan.version ?? "—"}
            </span>
            <Button variant="outline" size="sm" className="mt-1 gap-2" onClick={refresh}>
              <RefreshCw className="h-4 w-4" /> Atualizar leitura
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><UploadCloud className="h-4 w-4" /> Coletar & importar</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Wizard, PN, catálogos, apresentações e demais documentos entram na mesma base. O sistema extrai sugestões e exige revisão antes de aprovar.</p>
            <Button variant="outline" size="sm" onClick={() => document.getElementById("perfil-mestre")?.scrollIntoView({ behavior: "smooth" })}>Completar perfil</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" /> Medir no BI</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>O BI existente cruza vendas, canais, campanhas, atividades e metas. Nenhum analytics paralelo é criado aqui.</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/analytics")}>Abrir Analytics</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4" /> Executar marketing</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Público, produto, posicionamento e evidências aprovadas passam a orientar conteúdo e campanhas sem duplicar cadastro.</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/content")}>Abrir Marketing</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Rocket className="h-4 w-4" /> Transformar em ação</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>As lacunas abaixo viram prioridades operacionais. A execução continua na Central de Trabalho, CRM e agentes existentes.</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/trabalho")}>Abrir Central</Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Plano de ação atual</CardTitle>
          </CardHeader>
          <CardContent>
            {diagnostic.isLoading ? (
              <p className="text-sm text-muted-foreground">Analisando a base atual...</p>
            ) : diagnostic.data?.lacunas?.length ? (
              <div className="space-y-3">
                {diagnostic.data.lacunas.slice(0, 8).map((item, index) => (
                  <div key={item.id} className="flex gap-3 rounded-xl border p-3">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</div>
                    <div>
                      <p className="text-sm font-semibold">{item.titulo}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.acao}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border bg-emerald-50/50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
                <div><p className="font-medium">Base essencial consistente</p><p className="text-sm text-muted-foreground">Continue usando o sistema para enriquecer o perfil com execução e resultados reais.</p></div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Como esta base é usada</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              "CRM e vendas: qualificação, contexto, proposta e follow-up.",
              "Agentes: usam apenas contexto aprovado e recortes por função.",
              "Marketing: público, produto, diferenciais, provas e restrições.",
              "BI: compara metas, execução e resultado com fontes oficiais.",
              "Documentos: PN, apresentação e manual viram saídas da mesma base.",
            ].map((text) => <div key={text} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{text}</span></div>)}
          </CardContent>
        </Card>
      </section>

      <section id="perfil-mestre" className="scroll-mt-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Perfil Mestre & Plano do Negócio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta é a única entrada estratégica. Identidade visual continua em Configurações; o plano, documentos e inteligência ficam consolidados aqui.
          </p>
        </div>
        <BusinessPlanPanel />
      </section>
    </div>
  );
}
