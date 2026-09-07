import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronUp, Network, ShieldCheck } from "lucide-react";

type SectionPolicy = {
  section: string;
  level: "operacional" | "administrativo" | "critico";
  who: string;
  dependencies: string[];
  impact: string;
};

const POLICIES: SectionPolicy[] = [
  {
    section: "Empresa",
    level: "operacional",
    who: "Admin ou usuário com permissão Configurações",
    dependencies: ["IA e Agentes", "Marketing", "Documentos"],
    impact: "Alterações de identidade, segmento e posicionamento afetam contexto de IA, campanhas e documentos.",
  },
  {
    section: "Comercial",
    level: "administrativo",
    who: "Administradores",
    dependencies: ["CRM", "Propostas", "Comissões"],
    impact: "Mudanças em desconto, margem, comissão e fechamento podem alterar regras comerciais em uso.",
  },
  {
    section: "Agenda e Automações",
    level: "administrativo",
    who: "Administradores",
    dependencies: ["Google Calendar", "Agentes", "Pós-venda"],
    impact: "Mudanças podem afetar disponibilidade, agendamentos e gatilhos automáticos.",
  },
  {
    section: "Integrações",
    level: "critico",
    who: "Administradores",
    dependencies: ["WhatsApp", "Meta", "Google", "Pagamentos", "Webhooks"],
    impact: "Desconectar ou trocar credenciais pode interromper canais, mídia, cobrança ou sincronizações.",
  },
  {
    section: "IA e Agentes",
    level: "administrativo",
    who: "Administradores",
    dependencies: ["Atendimento", "Vendas", "Suporte", "Automação"],
    impact: "Mudanças de autonomia e comportamento podem alterar decisões e respostas automáticas.",
  },
  {
    section: "Documentos",
    level: "critico",
    who: "Administradores",
    dependencies: ["Propostas", "Contratos", "ZapSign"],
    impact: "Modelos e parâmetros podem afetar documentos enviados e assinaturas futuras.",
  },
  {
    section: "Equipe e Acessos",
    level: "critico",
    who: "Administradores",
    dependencies: ["Permissões", "Auditoria", "Segurança"],
    impact: "Alterações podem ampliar ou remover acesso a dados e funções sensíveis.",
  },
  {
    section: "Faturamento",
    level: "critico",
    who: "Administradores",
    dependencies: ["Plano", "Créditos", "Cobrança"],
    impact: "Mudanças podem afetar consumo, cobrança e disponibilidade de recursos contratados.",
  },
];

const LEVEL_LABELS = {
  operacional: "Operacional",
  administrativo: "Administrativo",
  critico: "Crítico",
} as const;

const LEVEL_CLASSES = {
  operacional: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  administrativo: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critico: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

export function ConfigurationGovernancePanel() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const isAdmin = user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin" || user?.userFunction === "administrador";
  const criticalCount = useMemo(() => POLICIES.filter((item) => item.level === "critico").length, []);

  if (!user?.tenantId) return null;

  return (
    <section className="mb-4 rounded-xl border bg-background p-3 sm:p-4" aria-label="Políticas de governança das configurações">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">Governança por seção</strong>
              <Badge variant="secondary" className="text-[10px]">8 áreas</Badge>
              <Badge variant="outline" className={`text-[10px] ${LEVEL_CLASSES.critico}`}>
                <AlertTriangle className="mr-1 h-3 w-3" />{criticalCount} críticas
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Permissões, dependências e impacto esperado antes de mudanças sensíveis.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" />}
          {expanded ? "Ocultar" : "Ver políticas"}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t pt-4">
          {!isAdmin && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
              Seu acesso a Configurações é operacional. Áreas administrativas e críticas exigem um administrador para alteração.
            </div>
          )}

          <div className="grid gap-2 lg:grid-cols-2">
            {POLICIES.map((policy) => (
              <article key={policy.section} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{policy.section}</div>
                  <Badge variant="outline" className={`text-[10px] ${LEVEL_CLASSES[policy.level]}`}>
                    {LEVEL_LABELS[policy.level]}
                  </Badge>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">Pode alterar:</span> {policy.who}
                </div>
                <div className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
                  <Network className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">Dependências:</span> {policy.dependencies.join(" · ")}
                  </div>
                </div>
                <div className="mt-2 rounded-md border bg-background p-2 text-[11px] leading-5 text-muted-foreground">
                  <span className="font-medium text-foreground">Impacto:</span> {policy.impact}
                </div>
              </article>
            ))}
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground">
            Alterações classificadas como críticas devem passar por confirmação explícita, ficam registradas no Histórico e não entram em rollback automático quando envolvem integrações, credenciais, contratos, agentes ou acessos.
          </div>
        </div>
      )}
    </section>
  );
}
