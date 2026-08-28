import { Clock, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";

function getDemoDaysLeft(): number | null {
  const raw = localStorage.getItem("vendorai_demo_expires_at");
  if (!raw) return null;
  const expires = new Date(raw).getTime();
  const now = Date.now();
  if (now >= expires) return 0;
  return Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
}

export function DemoBanner() {
  const daysLeft = useMemo(() => getDemoDaysLeft(), []);
  if (daysLeft === null) return null;

  const isUrgent = daysLeft !== null && daysLeft <= 2;

  return (
    <div className={`px-4 py-2.5 flex items-center justify-between gap-4 border-b ${
      isUrgent
        ? "bg-red-50 border-red-200"
        : "bg-amber-50 border-amber-200"
    }`}>
      <div className={`flex items-center gap-2 text-sm ${isUrgent ? "text-red-800" : "text-amber-800"}`}>
        {isUrgent ? (
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
        ) : (
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
        )}
        <span className="font-medium">
          {daysLeft === 0
            ? "Sua demo expira hoje."
            : daysLeft === 1
              ? "Sua demo expira em 1 dia."
              : `Sua demo expira em ${daysLeft} dias.`}
        </span>
        <span className="hidden sm:inline opacity-80">
          Entre em contato para continuar usando o Vendor.ai.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className={`shrink-0 h-8 text-xs ${
          isUrgent
            ? "text-red-800 border-red-300 hover:bg-red-100"
            : "text-amber-800 border-amber-300 hover:bg-amber-100"
        }`}
        asChild
      >
        <a href="/demo/contact-sales">
          Falar com vendas
          <ArrowRight className="w-3 h-3 ml-1" />
        </a>
      </Button>
    </div>
  );
}
