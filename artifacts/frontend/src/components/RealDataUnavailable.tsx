import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

type Props = {
  title: string;
  description: string;
  backHref?: string;
};

export function RealDataUnavailable({ title, description, backHref = "/" }: Props) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-amber-500/10 p-3 text-amber-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              Esta área foi temporariamente protegida para impedir a exibição de dados simulados como se fossem dados reais.
            </p>
            <button
              type="button"
              onClick={() => setLocation(backHref)}
              className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
