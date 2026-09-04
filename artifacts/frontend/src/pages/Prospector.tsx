import { useState } from "react";
import { Building2, HardHat, LayoutDashboard, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ProspectorClassic from "./ProspectorClassic";
import ConstructionRadar from "./prospector/ConstructionRadar";
import ProspectorOverview, { type ProspectorNavigationTarget } from "./prospector/ProspectorOverview";

type ProspectorMode = "painel" | "empresas" | "obras";

function initialMode(): ProspectorMode {
  if (typeof window === "undefined") return "painel";
  const value = new URLSearchParams(window.location.search).get("mode");
  if (value === "obras") return "obras";
  if (value === "empresas") return "empresas";
  return "painel";
}

export default function Prospector() {
  const [mode, setMode] = useState<ProspectorMode>(initialMode);
  const [classicKey, setClassicKey] = useState(0);

  function writeLocation(next: ProspectorMode, tab?: ProspectorNavigationTarget["tab"]) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "painel") url.searchParams.delete("mode");
    else url.searchParams.set("mode", next);

    if (next === "empresas" && tab) url.searchParams.set("tab", tab);
    else if (next !== "empresas") url.searchParams.delete("tab");

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function changeMode(next: ProspectorMode) {
    setMode(next);
    writeLocation(next);
  }

  function navigate(target: ProspectorNavigationTarget) {
    writeLocation(target.mode, target.tab);
    setMode(target.mode);
    if (target.mode === "empresas") setClassicKey((value) => value + 1);
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-6xl">
        <Card className="border-primary/15 bg-gradient-to-r from-background to-muted/30">
          <CardContent className="flex flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                <Radar className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Central de Prospecção</p>
                <p className="text-xs text-muted-foreground">
                  Descoberta, sinais de mercado, priorização e ação comercial em um único fluxo.
                </p>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              <Button
                type="button"
                size="sm"
                variant={mode === "painel" ? "default" : "ghost"}
                onClick={() => changeMode("painel")}
                className="h-8 gap-1.5 px-2 sm:px-3"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Painel</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "empresas" ? "default" : "ghost"}
                onClick={() => changeMode("empresas")}
                className="h-8 gap-1.5 px-2 sm:px-3"
              >
                <Building2 className="h-3.5 w-3.5" /> Empresas
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "obras" ? "default" : "ghost"}
                onClick={() => changeMode("obras")}
                className="h-8 gap-1.5 px-2 sm:px-3"
              >
                <HardHat className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Radar de </span>Obras
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {mode === "painel" && <ProspectorOverview onNavigate={navigate} />}
      {mode === "empresas" && <ProspectorClassic key={classicKey} />}
      {mode === "obras" && <ConstructionRadar />}
    </div>
  );
}
