import { useState } from "react";
import { ClipboardCheck, FileSearch, Megaphone, Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ProspectorClassic from "../ProspectorClassic";

type Section = "empresas" | "oportunidades";
type ClassicTab = "busca" | "cnpj" | "anunciantes" | "fila" | "aprovacoes";

type Props = {
  section: Section;
};

const COMPANY_TABS: Array<{ value: ClassicTab; label: string; icon: typeof Search }> = [
  { value: "busca", label: "Busca local", icon: Search },
  { value: "cnpj", label: "CNPJ / CNAE", icon: FileSearch },
  { value: "anunciantes", label: "Anunciantes", icon: Megaphone },
];

const OPPORTUNITY_TABS: Array<{ value: ClassicTab; label: string; icon: typeof TrendingUp }> = [
  { value: "fila", label: "Fila priorizada", icon: TrendingUp },
  { value: "aprovacoes", label: "Aprovações", icon: ClipboardCheck },
];

function initialTab(section: Section): ClassicTab {
  if (typeof window === "undefined") return section === "empresas" ? "busca" : "fila";
  const requested = new URLSearchParams(window.location.search).get("tab") as ClassicTab | null;
  const allowed = section === "empresas" ? COMPANY_TABS.map((item) => item.value) : OPPORTUNITY_TABS.map((item) => item.value);
  return requested && allowed.includes(requested) ? requested : section === "empresas" ? "busca" : "fila";
}

export default function ProspectorClassicWorkspace({ section }: Props) {
  const [tab, setTab] = useState<ClassicTab>(() => initialTab(section));
  const [classicKey, setClassicKey] = useState(0);
  const options = section === "empresas" ? COMPANY_TABS : OPPORTUNITY_TABS;

  function changeTab(next: ClassicTab) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setTab(next);
    setClassicKey((value) => value + 1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <Card className="border-border/80 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">{section === "empresas" ? "Fontes para encontrar empresas" : "Gestão das oportunidades"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {section === "empresas"
                ? "Escolha uma fonte. A empresa só vira oportunidade depois da qualificação."
                : "Trabalhe a fila priorizada e aprove somente o que deve seguir para a operação comercial."}
            </p>
          </div>
          <div className={`grid gap-1 rounded-lg bg-muted p-1 ${section === "empresas" ? "grid-cols-3" : "grid-cols-2"}`}>
            {options.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={tab === item.value ? "default" : "ghost"}
                  onClick={() => changeTab(item.value)}
                  className="h-8 gap-1.5 px-2 sm:px-3"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="[&_[role=tablist]]:hidden">
        <ProspectorClassic key={`${section}-${tab}-${classicKey}`} />
      </div>
    </div>
  );
}
