import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type TrialPlanMode = "subscription" | "periods";

type Props = {
  submitting: boolean;
  onBack: () => void;
  onSelect: (mode: TrialPlanMode) => void;
};

const MONTHLY_FEATURES = [
  "Os dias grátis atuais continuam ativos",
  "A condição comercial segue a oferta que trouxe você ao VendorAI",
  "Todos os módulos Growth aplicáveis ao seu segmento",
  "Usuários ilimitados durante o Growth",
  "Acesso contínuo, sem renovar blocos manualmente",
  "Sem alterar a origem comercial registrada no cadastro",
];

const PERIOD_FEATURES = [
  "Os dias grátis atuais continuam ativos",
  "Depois, use blocos adicionais quando precisar",
  "A condição de cada bloco segue a oferta comercial válida",
  "Mesma experiência Growth durante o período ativo",
  "Seus dados continuam disponíveis entre os períodos",
];

export default function OnboardingPlanStep({ submitting, onBack, onSelect }: Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
          Seu período de experiência está ativo
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">Escolha como continuar com o VendorAI</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Nenhuma tabela pública de preços é aplicada nesta etapa. A condição comercial registrada na landing page ou campanha de origem acompanha sua conta.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="relative border-primary/60 shadow-sm ring-2 ring-primary/10">
          <CardContent className="flex h-full flex-col p-6">
            <span className="absolute right-5 top-5 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              Acesso contínuo
            </span>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assinatura contínua</p>
            <h3 className="mt-2 text-2xl font-bold">Growth mensal</h3>
            <p className="mt-2 text-sm text-muted-foreground">Continuidade completa do ecossistema conforme a condição comercial vinculada à sua oferta.</p>
            <div className="mt-4 rounded-xl border bg-muted/30 px-4 py-3">
              <div className="text-sm font-semibold">Condição da sua oferta preservada</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">O valor aplicável é confirmado no momento comercial/checkout da oferta, não em uma tabela genérica da plataforma.</p>
            </div>
            <ul className="mt-5 flex-1 space-y-3 border-t pt-5">
              {MONTHLY_FEATURES.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-6 w-full" disabled={submitting} onClick={() => onSelect("subscription")}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continuar com Growth mensal
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardContent className="flex h-full flex-col p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uso por períodos</p>
            <h3 className="mt-2 text-2xl font-bold">Growth por blocos</h3>
            <p className="mt-2 text-sm text-muted-foreground">Use o Growth quando sua empresa precisar, preservando a mesma conta e os mesmos dados.</p>
            <div className="mt-4 rounded-xl border bg-muted/30 px-4 py-3">
              <div className="text-sm font-semibold">Condição por período conforme a oferta</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">A quantidade de dias e o valor aplicável vêm da condição comercial registrada para sua origem.</p>
            </div>
            <ul className="mt-5 flex-1 space-y-3 border-t pt-5">
              {PERIOD_FEATURES.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="mt-6 w-full" disabled={submitting} onClick={() => onSelect("periods")}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Usar por períodos
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border bg-muted/30 px-4 py-3 text-center text-xs leading-5 text-muted-foreground">
        O histórico da oferta deve permanecer associado ao cadastro para que proposta, aceite, checkout e cobrança usem a mesma condição comercial.
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" disabled={submitting} onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" /> Voltar para o agente
        </Button>
      </div>
    </div>
  );
}
