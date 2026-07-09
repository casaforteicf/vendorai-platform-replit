import React from "react";
import { MetricCard } from "./MetricCard";
import { assets, maintenanceItems, tickets, warranties } from "./facilityData";

export function FacilityDashboard() {
  const activeWarranties = warranties.filter((warranty) => warranty.status === "active" || warranty.status === "expiring").length;
  const openTickets = tickets.filter((ticket) => ticket.status !== "resolved").length;
  const attentionAssets = assets.filter((asset) => asset.status === "attention" || asset.status === "maintenance").length;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Ativos" value={String(assets.length)} description="Itens entregues e rastreados." />
      <MetricCard label="Garantias ativas" value={String(activeWarranties)} description="Garantias vigentes ou próximas." />
      <MetricCard label="Tickets abertos" value={String(openTickets)} description="Chamados de assistência." />
      <MetricCard label="Atenção" value={String(attentionAssets)} description="Ativos com manutenção/alerta." />
    </section>
  );
}
