import { useState } from "react";
import { Building2, HardHat, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ProspectorClassic from "./ProspectorClassic";
import ConstructionRadar from "./prospector/ConstructionRadar";

type ProspectorMode = "empresas" | "obras";

function initialMode(): ProspectorMode {
  if (typeof window === "undefined") return "empresas";
  return new URLSearchParams(window.location.search).get("mode") === "obras" ? "obras" : "empresas";
}

export default function Prospector() {
  const [mode, setMode] = useState<ProspectorMode>(initialMode);

  function changeMode(next: ProspectorMode) {
    setMode(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "obras") url.searchParams.set("mode", "obras");
    else url.searchParams.delete("mode");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div className="space-y-4">
      <div className="max-w-5xl mx-auto">
        <Card className="border-primary/15 bg-gradient-to-r from-background to-muted/30">
          <CardContent className="py-3 px-3 sm:px-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
                <Radar className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Central de Prospecção</p>
                <p className="text-xs text-muted-foreground">
                  Encontre empresas ou antecipe oportunidades a partir de obras e eventos reais.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 shrink-0">
              <Button
                type="button"
                size="sm"
                variant={mode === "empresas" ? "default" : "ghost"}
                onClick={() => changeMode("empresas")}
                className="h-8 gap-1.5"
              >
                <Building2 className="h-3.5 w-3.5" /> Empresas
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "obras" ? "default" : "ghost"}
                onClick={() => changeMode("obras")}
                className="h-8 gap-1.5"
              >
                <HardHat className="h-3.5 w-3.5" /> Radar de Obras
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {mode === "obras" ? <ConstructionRadar /> : <ProspectorClassic />}
    </div>
  );
}
