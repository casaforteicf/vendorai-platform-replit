import { Link, useLocation } from "wouter";

const SECTORS = [
  { href: "/hotelaria", name: "Visão geral" },
  { href: "/hotelaria/hospedagem", name: "Hospedagem", aliases: ["/hotelaria/recepcao"] },
  { href: "/hotelaria/diarias", name: "Diárias", aliases: ["/hotelaria/tarifas"] },
  { href: "/hotelaria/restaurante", name: "Restaurante" },
  { href: "/hotelaria/manutencao", name: "Manutenção" },
] as const;

export default function HotelSectorNav() {
  const [location] = useLocation();
  return (
    <nav aria-label="Setores da Hotelaria" className="mb-5 flex flex-wrap gap-2 rounded-xl border p-3">
      {SECTORS.map((sector) => {
        const active = location === sector.href || ("aliases" in sector && sector.aliases.some((alias) => location === alias));
        return (
          <Link
            key={sector.href}
            href={sector.href}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {sector.name}
          </Link>
        );
      })}
    </nav>
  );
}
