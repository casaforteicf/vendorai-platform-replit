import React from "react";
import { MetricCard } from "./MetricCard";
import { alerts, devices, energyMetrics, waterMetrics } from "./iotData";
import { currency } from "./iotUtils";

export function IoTDashboard() {
  const online = devices.filter((device) => device.status === "online").length;
  const openAlerts = alerts.filter((alert) => alert.status === "open").length;
  const energyCost = energyMetrics.reduce((sum, item) => sum + item.cost, 0);
  const waterCost = waterMetrics.reduce((sum, item) => sum + item.cost, 0);

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Dispositivos online" value={`${online}/${devices.length}`} description="Sensores e controladores ativos." />
      <MetricCard label="Alertas abertos" value={String(openAlerts)} description="Ocorrências em tempo real." />
      <MetricCard label="Energia" value={currency(energyCost)} description="Custo estimado do período." />
      <MetricCard label="Água" value={currency(waterCost)} description="Custo estimado do período." />
    </section>
  );
}
