import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export const CRM_PIPELINES = [
  { label: "Aquecimento", href: "/pipeline-relacionamento/aquecimento" },
  { label: "Comercial", href: "/deals" },
  { label: "Execução / Pedidos", href: "/pipeline-operacional/execucao" },
  { label: "Suporte / Assistência", href: "/pipeline-operacional/suporte" },
  { label: "Parceiros", href: "/pipeline-relacionamento/parceiros" },
  { label: "Scout", href: "/scout/pipeline" },
] as const;

function isActive(location: string, href: string) {
  if (href === "/deals") return location === "/deals" || location === "/negocios" || location.startsWith("/pipeline-operacional/comercial");
  return location === href || location.startsWith(`${href}/`);
}

export function CrmPipelineTabs({ className }: { className?: string }) {
  const [location] = useLocation();
  return (
    <nav
      aria-label="Pipelines do CRM"
      className={cn("flex items-center gap-1 overflow-x-auto rounded-xl border bg-card px-2 shadow-sm", className)}
    >
      {CRM_PIPELINES.map((pipeline) => {
        const active = isActive(location, pipeline.href);
        return (
          <Link
            key={pipeline.href}
            href={pipeline.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md",
              active ? "text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary" : "text-foreground/80 hover:text-foreground",
            )}
          >
            {pipeline.label}
          </Link>
        );
      })}
    </nav>
  );
}
