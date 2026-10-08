import { useState } from "react";
import { Bot, Building2, HardHat, LayoutDashboard, Radar, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ConstructionRadarWorkspace from "./prospector/ConstructionRadarWorkspace";
import JarvisProspectingSignals from "./prospector/JarvisProspectingSignals";
import ProspectorClassicWorkspace from "./prospector/ProspectorClassicWorkspace";
import ProspectorOverview, { type ProspectorNavigationTarget } from "./prospector/ProspectorOverview";
import ColdProspectingWorkspace from "./prospector/ColdProspectingWorkspace";

type ProspectorMode = "painel" | "empresas" | "oportunidades" | "jornada" | "obras";

function initialMode(): ProspectorMode {
  if (typeof window === "undefined") return "painel";
  const params = new URLSearchParams(window.location.search);
  const value = params.get("mode");
  const tab = params.get("tab");

  if (value === "obras") return "obras";
  if (value === "jornada") return "jornada";
  if (value === "oportunidades" || (value === "empresas" && (tab === "fila" || tab === "aprovacoes"))) {
    return "oportunidades";
  }
  if (value === "empresas") return "empresas";
  return "painel";
}

export default function Prospector() {
  const [mode, setMode] = useState<ProspectorMode>(initialMode);
  const [classicKey, setClassicKey] = useState(0);

  function writeLocation(next: ProspectorMode, tab?: ProspectorNavigationTarget["tab"]) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);

    if (next === "painel") {
      url.searchParams.delete("mode");
      url.searchParams.delete("tab");
    } else if (next === "obras" || next === "jornada") {
      url.searchParams.set("mode", next);
      url.searchParams.delete("tab");
    } else if (next === "oportunidades") {
      url.searchParams.set("mode", "oportunidades");
      url.searchParams.set("tab", tab === "aprovacoes" ? "aprovacoes" : "fila");
    } else {
      url.searchParams.set("mode", "empresas");
      url.searchParams.set("tab", tab && !["fila", "aprovacoes"].includes(tab) ? tab : "busca");
    }

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function changeMode(next: ProspectorMode) {
    const tab: ProspectorNavigationTarget["tab"] | undefined = next === "oportunidades" ? "fila" : next === "empresas" ? "busca" : undefined;
    writeLocation(next, tab);
    setMode(next);
    if (next === "empresas" || next === "oportunidades") setClassicKey((value) => value + 1);
  }

  function navigate(target: ProspectorNavigationTarget) {
    if (target.mode === "obras") {
      writeLocation("obras");
      setMode("obras");
      return;
    }

    const isOpportunity = target.tab === "fila" || target.tab === "aprovacoes";
    const nextMode: ProspectorMode = isOpportunity ? "oportunidades" : "empresas";
    writeLocation(nextMode, target.tab);
    setMode(nextMode);
    setClassicKey((value) => value + 1);
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-6xl">
        <Card className="border-primary/15 bg-gradient-to-r from-background to-muted/30 shadow-sm">
          <CardContent className="flex flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                <Radar className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Prospector</p>
                <p className="text-xs text-muted-foreground">
                  Encontre, qualifique e transforme sinais de mercado em oportunidades comerciais.
                </p>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-5 gap-1 rounded-lg bg-muted p-1">
              <Button
                type="button"
                size="sm"
                variant={mode === "painel" ? "default" : "ghost"}
                onClick={() => changeMode("painel")}
                className="h-8 gap-1.5 px-2 sm:px-3"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Visão geral</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "empresas" ? "default" : "ghost"}
                onClick={() => changeMode("empresas")}
                className="h-8 gap-1.5 px-2 sm:px-3"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Empresas</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "oportunidades" ? "default" : "ghost"}
                onClick={() => changeMode("oportunidades")}
                className="h-8 gap-1.5 px-2 sm:px-3"
              >
                <Target className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Oportunidades</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "jornada" ? "default" : "ghost"}
                onClick={() => changeMode("jornada")}
                className="h-8 gap-1.5 px-2 sm:px-3"
              >
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Prospecção IA</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "obras" ? "default" : "ghost"}
                onClick={() => changeMode("obras")}
                className="h-8 gap-1.5 px-2 sm:px-3"
              >
                <HardHat className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Radar de </span>Obras
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <JarvisProspectingSignals onNavigate={navigate} compact={mode !== "painel"} />

      {mode === "painel" && <ProspectorOverview onNavigate={navigate} />}
      {mode === "empresas" && <ProspectorClassicWorkspace key={`empresas-${classicKey}`} section="empresas" />}
      {mode === "oportunidades" && <ProspectorClassicWorkspace key={`oportunidades-${classicKey}`} section="oportunidades" />}
      {mode === "jornada" && <ColdProspectingWorkspace />}
      {mode === "obras" && <ConstructionRadarWorkspace />}
    </div>
  );
}
