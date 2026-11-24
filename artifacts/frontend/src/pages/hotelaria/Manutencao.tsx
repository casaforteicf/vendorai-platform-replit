import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CalendarCheck, ClipboardList, DoorOpen, FileText, Gauge, LayoutDashboard, ListChecks, Wrench } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import HotelSectorNav from "./HotelSectorNav";
import { createMaintenanceApi } from "./manutencao/api";
import Chamados from "./manutencao/Chamados";
import Checklist from "./manutencao/Checklist";
import Documentos from "./manutencao/Documentos";
import Equipamentos from "./manutencao/Equipamentos";
import Medidores from "./manutencao/Medidores";
import Preventiva from "./manutencao/Preventiva";
import Quartos from "./manutencao/Quartos";
import VisaoGeral from "./manutencao/VisaoGeral";

type Tab = "visao" | "quartos" | "chamados" | "preventiva" | "checklist" | "equipamentos" | "medidores" | "documentos";

const TABS: Array<{ key: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { key: "visao", label: "Visão geral", icon: LayoutDashboard },
  { key: "quartos", label: "Quartos e limpeza", icon: DoorOpen },
  { key: "chamados", label: "Chamados", icon: ClipboardList },
  { key: "preventiva", label: "Preventiva", icon: CalendarCheck },
  { key: "checklist", label: "Checklist", icon: ListChecks },
  { key: "equipamentos", label: "Equipamentos", icon: Wrench },
  { key: "medidores", label: "Medidores", icon: Gauge },
  { key: "documentos", label: "Documentos", icon: FileText },
];

export default function Manutencao() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const api = useMemo(() => createMaintenanceApi(token, tenantId), [token, tenantId]);
  const [tab, setTab] = useState<Tab>("visao");

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
      <HotelSectorNav />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/hotelaria" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Hotelaria</Link>
          <h1 className="mt-2 text-2xl font-semibold">Central de Manutenção</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Chamados, preventiva, checklists, equipamentos, medidores e documentação do hotel em um só lugar.</p>
        </div>
        <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">Operação · {user?.name ?? "equipe"}</span>
      </header>

      <nav aria-label="Áreas da manutenção" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex flex-shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {tab === "visao" && <VisaoGeral api={api} onNavigate={setTab} />}
      {tab === "quartos" && <Quartos />}
      {tab === "chamados" && <Chamados api={api} />}
      {tab === "preventiva" && <Preventiva api={api} onGoEquipments={() => setTab("equipamentos")} />}
      {tab === "checklist" && <Checklist api={api} />}
      {tab === "equipamentos" && <Equipamentos api={api} />}
      {tab === "medidores" && <Medidores api={api} />}
      {tab === "documentos" && <Documentos api={api} />}
    </main>
  );
}
