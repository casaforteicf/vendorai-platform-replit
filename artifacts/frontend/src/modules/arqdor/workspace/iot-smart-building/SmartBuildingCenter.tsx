import React, { useState } from "react";
import { AISmartBuildingPanel } from "./AISmartBuildingPanel";
import { AutomationRules } from "./AutomationRules";
import { BuildingMap } from "./BuildingMap";
import { DeviceManagement } from "./DeviceManagement";
import { EnergyAnalytics } from "./EnergyAnalytics";
import { EnvironmentMonitor } from "./EnvironmentMonitor";
import { HVACControl } from "./HVACControl";
import { IoTDashboard } from "./IoTDashboard";
import { PredictiveMaintenance } from "./PredictiveMaintenance";
import { RealtimeAlerts } from "./RealtimeAlerts";
import { SensorMonitor } from "./SensorMonitor";
import { WaterManagement } from "./WaterManagement";
import type { IoTView } from "./iotTypes";

type Props = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: IoTView; setView: (view: IoTView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: IoTView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "sensors", label: "Sensores" },
    { id: "energy", label: "Energia" },
    { id: "water", label: "Água" },
    { id: "hvac", label: "HVAC" },
    { id: "environment", label: "Ambiente" },
    { id: "alerts", label: "Alertas" },
    { id: "maintenance", label: "Manutenção" },
    { id: "automation", label: "Automação" },
    { id: "devices", label: "Devices" },
    { id: "map", label: "Mapa" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">IoT & Smart Building</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Smart Building Center</h1>
          <p className="mt-1 text-sm text-slate-500">Sensores, energia, água, HVAC, ambiente, alertas, automações e manutenção preditiva.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                view === item.id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}

          <button type="button" onClick={() => onNavigate?.("digital-twin")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            Digital Twin
          </button>
        </div>
      </div>
    </header>
  );
}

export default function SmartBuildingCenter({ onNavigate }: Props) {
  const [view, setView] = useState<IoTView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />

        {view === "dashboard" ? (
          <>
            <IoTDashboard />
            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <div className="space-y-5">
                <SensorMonitor />
                <EnergyAnalytics />
                <RealtimeAlerts />
              </div>
              <AISmartBuildingPanel />
            </main>
          </>
        ) : null}

        {view === "sensors" ? <SensorMonitor /> : null}
        {view === "energy" ? <EnergyAnalytics /> : null}
        {view === "water" ? <WaterManagement /> : null}
        {view === "hvac" ? <HVACControl /> : null}
        {view === "environment" ? <EnvironmentMonitor /> : null}
        {view === "alerts" ? <RealtimeAlerts /> : null}
        {view === "maintenance" ? <PredictiveMaintenance /> : null}
        {view === "automation" ? <AutomationRules /> : null}
        {view === "devices" ? <DeviceManagement /> : null}
        {view === "map" ? <BuildingMap /> : null}
        {view === "ai" ? <AISmartBuildingPanel /> : null}
      </div>
    </div>
  );
}
