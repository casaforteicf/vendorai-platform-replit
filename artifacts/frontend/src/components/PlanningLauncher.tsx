import { useEffect, useState } from "react";

const items = [
  {
    href: "/pipeline",
    title: "Pipeline",
    description: "Kanban real de negócios do CRM",
    icon: "📋",
  },
  {
    href: "/leads/import-config",
    title: "Importar leads",
    description: "CSV com mapeamento, prévia e deduplicação real",
    icon: "📥",
  },
  {
    href: "/conversations",
    title: "Conversas",
    description: "Inbox real com canais, anexos e handoff IA/humano",
    icon: "💬",
  },
  {
    href: "/marketing",
    title: "Marketing",
    description: "Campanhas, Content Autopilot e Content Studio",
    icon: "📢",
  },
  {
    href: "/contacts-nonleads",
    title: "Contatos não-leads",
    description: "Fornecedores, parceiros, família e colaboradores",
    icon: "👥",
  },
  {
    href: "/erp/captura",
    title: "Captura ERP",
    description: "Foto ou PDF, revisão humana e lançamento real",
    icon: "📷",
  },
  {
    href: "/faq",
    title: "FAQ",
    description: "Ajuda rápida do VendorAI",
    icon: "❓",
  },
] as const;

export function PlanningLauncher() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const syncVisibility = () => {
      const hasSession = Boolean(localStorage.getItem("vendorai_token"));
      const pathname = window.location.pathname;
      const isPublicAuth = pathname === "/login" || pathname.startsWith("/auth/");
      setVisible(hasSession && !isPublicAuth);
    };

    syncVisibility();
    const timer = window.setInterval(syncVisibility, 1000);
    window.addEventListener("storage", syncVisibility);
    window.addEventListener("popstate", syncVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", syncVisibility);
      window.removeEventListener("popstate", syncVisibility);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-2">
      {open && (
        <div className="w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <div className="border-b px-4 py-3">
            <div className="text-sm font-semibold">Novos módulos</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Melhorias do planejamento conectadas aos dados reais do VendorAI.
            </div>
          </div>

          <div className="max-h-[min(70vh,520px)] overflow-y-auto p-2">
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted"
              >
                <span className="mt-0.5 text-lg" aria-hidden="true">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold shadow-lg transition hover:bg-muted"
        aria-expanded={open}
        aria-label="Abrir novos módulos"
      >
        <span aria-hidden="true">✨</span>
        Novos módulos
      </button>
    </div>
  );
}
