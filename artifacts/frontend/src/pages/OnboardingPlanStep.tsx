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
  "5 dias iniciais grátis — seu período atual continua normalmente",
  "R$ 497 pelos primeiros 30 dias pagos",
  "R$ 990/mês nos 5 meses seguintes",
  "R$ 1.490/mês depois disso",
  "Todos os módulos Growth e usuários ilimitados",
  "Sem fidelidade: cancele quando quiser",
];

const PERIOD_FEATURES = [
  "Os 5 dias grátis atuais continuam ativos",
  "Depois, compre somente quando precisar",
  "Blocos adicionais de 5 dias por R$ 399,00",
  "Mesma experiência completa do Growth durante o período ativo",
  "Seus dados continuam disponíveis entre os períodos",
];

export default function OnboardingPlanStep({ submitting, onBack, onSelect }: Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
          Seus 5 dias grátis já estão ativos
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">Escolha como continuar com o VendorAI</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Você não paga nada agora pelos dias de teste. Escolha a modalidade que deve ficar preparada para sua conta quando o período gratuito terminar.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="relative border-primary/60 shadow-sm ring-2 ring-primary/10">
          <CardContent className="flex h-full flex-col p-6">
            <span className="absolute right-5 top-5 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              Recomendado
            </span>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assinatura contínua</p>
            <h3 className="mt-2 text-2xl font-bold">Growth mensal</h3>
            <p className="mt-2 text-sm text-muted-foreground">Acesso completo sem precisar renovar blocos manualmente.</p>
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
              Escolher Growth mensal
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardContent className="flex h-full flex-col p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uso por períodos</p>
            <h3 className="mt-2 text-2xl font-bold">Growth por 5 dias</h3>
            <p className="mt-2 text-sm text-muted-foreground">Use por blocos quando sua empresa precisar.</p>
            <div className="mt-4 text-3xl font-bold">R$ 399 <span className="text-sm font-medium text-muted-foreground">/ +5 dias</span></div>
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
              Escolher uso por períodos
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border bg-muted/30 px-4 py-3 text-center text-xs leading-5 text-muted-foreground">
        Seus dados permanecem na conta mesmo quando não houver um período pago ativo. Novas automações ficam pausadas até a próxima ativação.
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" disabled={submitting} onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" /> Voltar para o agente
        </Button>
      </div>
    </div>
  );
}
