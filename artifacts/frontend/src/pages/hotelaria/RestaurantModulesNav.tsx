import { Link, useLocation } from "wouter";

const LINKS = [
  { href: "/hotelaria/restaurante", name: "Visão geral" },
  { href: "/hotelaria/restaurante/receitas", name: "Receitas", aliases: ["/hotelaria/ab/fichas-tecnicas"] },
  { href: "/hotelaria/restaurante/ingredientes", name: "Ingredientes" },
  { href: "/hotelaria/restaurante/cardapios", name: "Cardápios", aliases: ["/hotelaria/ab/cardapios"] },
  { href: "/hotelaria/restaurante/briffing", name: "Briffing", aliases: ["/hotelaria/ab/briffing"] },
  { href: "/hotelaria/restaurante/importar", name: "Importar" },
  { href: "/hotelaria/restaurante/planejamento", name: "Planejamento", aliases: ["/hotelaria/planejamento"] },
  { href: "/hotelaria/restaurante/sobras", name: "Sobras", aliases: ["/hotelaria/ab/sobras"] },
  { href: "/hotelaria/restaurante/compras", name: "Compras", aliases: ["/hotelaria/ab/ordens-compra"] },
  { href: "/hotelaria/restaurante/recebimento", name: "Recebimento", aliases: ["/hotelaria/ab/recebimento"] },
  { href: "/hotelaria/restaurante/requisicao", name: "Requisição", aliases: ["/hotelaria/ab/requisicao"] },
  { href: "/hotelaria/restaurante/cmv", name: "CMV", aliases: ["/hotelaria/ab/cmv"] },
  { href: "/hotelaria/restaurante/mapeamento", name: "Mapeamento", aliases: ["/hotelaria/ab/mapeamento"] },
  { href: "/hotelaria/restaurante/cargos", name: "Cargos", aliases: ["/hotelaria/ab/cargos"] },
  { href: "/hotelaria/restaurante/custos", name: "Custos", aliases: ["/hotelaria/receitas"] },
] as const;

export default function RestaurantModulesNav() {
  const [location] = useLocation();
  return (
    <nav aria-label="Módulos do Restaurante" className="mb-5 flex flex-wrap gap-2 rounded-xl border p-3">
      <Link href="/hotelaria" className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">
        ← Hotelaria
      </Link>
      {LINKS.map((link) => {
        const active = location === link.href || ("aliases" in link && link.aliases.some((alias) => location === alias));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {link.name}
          </Link>
        );
      })}
    </nav>
  );
}
