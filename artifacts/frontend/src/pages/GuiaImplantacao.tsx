import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronRight, Circle, MessageCircle, Users, FileSpreadsheet, Package, Rocket, HelpCircle } from "lucide-react";

const steps = [
  {
    id: "canais",
    title: "Conecte os canais",
    time: "10 a 20 min",
    icon: MessageCircle,
    description: "Conecte o que sua empresa já usa. Você pode deixar qualquer canal pendente e continuar depois.",
    help: ["Tenha acesso ao Facebook da empresa.", "O Instagram precisa ser profissional e ligado a uma Página.", "Use o número comercial do WhatsApp.", "Escolha a conta Google usada pela empresa."],
    action: "Conectar canais",
    href: "/onboarding/integracoes",
  },
  {
    id: "equipe",
    title: "Adicione sua equipe",
    time: "5 min",
    icon: Users,
    description: "Cadastre somente quem vai começar usando o TAD. Novos usuários podem ser adicionados depois.",
    help: ["Informe nome e e-mail.", "Escolha a função da pessoa.", "O TAD sugere os acessos adequados.", "A pessoa recebe o acesso para entrar."],
    action: "Adicionar usuários",
    href: "/usuarios",
  },
  {
    id: "leads",
    title: "Traga seus clientes e leads",
    time: "10 a 30 min",
    icon: FileSpreadsheet,
    description: "Exporte a relação do sistema atual e envie o arquivo. O TAD ajuda a relacionar as colunas antes de importar.",
    help: ["No sistema atual, procure Exportar, Relatório de clientes ou Lista de contatos.", "Exporte em CSV ou abra no Excel e salve como CSV.", "Priorize: nome, telefone, e-mail, empresa, cidade, origem, responsável, etapa e observações.", "Envie o arquivo, confira a prévia e só então confirme."],
    action: "Preparar e importar leads",
    href: "/leads/import-config",
  },
  {
    id: "catalogo",
    title: "Cadastre produtos ou serviços",
    time: "10 a 30 min",
    icon: Package,
    description: "Comece apenas com o que sua equipe precisa para vender. Estoque, impostos e ERP ficam para uma segunda etapa.",
    help: ["Exporte a lista de produtos ou serviços do sistema atual.", "Priorize: nome, código, categoria, descrição, preço, unidade e imagem.", "Se não houver arquivo, cadastre inicialmente os itens mais vendidos.", "Confira os dados antes de liberar para propostas e agentes."],
    action: "Abrir catálogo",
    href: "/catalogo",
  },
  {
    id: "teste",
    title: "Faça um teste simples",
    time: "5 min",
    icon: Rocket,
    description: "Crie um contato de teste, atribua a alguém da equipe e confirme que a operação básica está pronta.",
    help: ["Cadastre você mesmo como lead de teste.", "Atribua o lead a um usuário.", "Crie uma tarefa de retorno.", "Confira o contato em Leads e Negócios."],
    action: "Criar lead de teste",
    href: "/leads",
  },
];

export default function GuiaImplantacao() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const storageKey = `vendorai_implantacao_${user?.tenantId ?? "local"}`;
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(storageKey) ?? "[]")); } catch { setDone([]); }
  }, [storageKey]);

  function toggle(id: string) {
    const next = done.includes(id) ? done.filter((item) => item !== id) : [...done, id];
    setDone(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  const progress = useMemo(() => Math.round((done.length / steps.length) * 100), [done]);
  const nextStep = steps.find((step) => !done.includes(step.id));

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <section className="rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-8">
        <p className="text-sm font-semibold text-primary">Implantação Assistida</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Vamos colocar o TAD para funcionar</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Faça uma etapa por vez. Não é necessário configurar tudo agora e você pode continuar de onde parou.
        </p>
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-sm"><span>{done.length} de {steps.length} etapas</span><strong>{progress}%</strong></div>
          <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      {nextStep && (
        <section className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Próximo passo</p><h2 className="mt-1 font-semibold">{nextStep.title}</h2></div>
          <Button onClick={() => navigate(nextStep.href)}>Continuar implantação<ChevronRight className="ml-2 h-4 w-4" /></Button>
        </section>
      )}

      <div className="space-y-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const completed = done.includes(step.id);
          return (
            <article key={step.id} className={`rounded-2xl border bg-card p-5 md:p-6 ${completed ? "border-emerald-200 bg-emerald-50/40" : ""}`}>
              <div className="flex gap-4">
                <button onClick={() => toggle(step.id)} className="mt-1 shrink-0" aria-label={completed ? "Marcar como pendente" : "Marcar como concluído"}>
                  {completed ? <CheckCircle2 className="h-7 w-7 text-emerald-600" /> : <Circle className="h-7 w-7 text-muted-foreground/40" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-muted-foreground">ETAPA {index + 1}</span><span className="text-xs text-muted-foreground">• {step.time}</span></div>
                  <div className="mt-2 flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">{step.title}</h2></div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                  <div className="mt-4 rounded-xl bg-muted/45 p-4">
                    <p className="flex items-center gap-2 text-sm font-medium"><HelpCircle className="h-4 w-4" />O que fazer</p>
                    <ol className="mt-3 space-y-2">
                      {step.help.map((item, i) => <li key={item} className="flex gap-2 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{i + 1}.</span>{item}</li>)}
                    </ol>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button onClick={() => navigate(step.href)}>{step.action}<ChevronRight className="ml-2 h-4 w-4" /></Button>
                    <Button variant="outline" onClick={() => toggle(step.id)}>{completed ? "Reabrir etapa" : "Marcar como concluída"}</Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <section className="rounded-2xl border p-5">
        <h2 className="font-semibold">O que fica para depois</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">ERP, estoque avançado, impostos, financeiro completo, automações especiais e configurações avançadas de IA serão implantados quando a operação básica já estiver funcionando.</p>
      </section>
    </div>
  );
}
