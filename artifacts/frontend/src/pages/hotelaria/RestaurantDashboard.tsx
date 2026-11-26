import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { BarChart3, BookOpen, ChevronRight, ClipboardList, PackageCheck, ShoppingCart, Upload, UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import RestaurantModulesNav from "./RestaurantModulesNav";

type Ficha = { id: string; ativo: boolean };
type Cardapio = { id: string };
type Insumo = { id: string };
type Ordem = { id: string; status: string };

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function RestaurantDashboard() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [cardapios, setCardapios] = useState<Cardapio[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [ordens, setOrdens] = useState<Ordem[]>([]);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token ?? ""}` }), [token]);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    const base = `/api/tenants/${encodeURIComponent(tenantId)}`;
    async function load<T>(path: string, fallback: T): Promise<T> {
      try {
        const response = await fetch(`${base}${path}`, { headers, cache: "no-store" });
        return response.ok ? await response.json() as T : fallback;
      } catch {
        return fallback;
      }
    }
    void Promise.all([
      load<{ fichas: Ficha[] }>("/ab/fichas-tecnicas", { fichas: [] }),
      load<{ cardapios: Cardapio[] }>(`/ab/cardapios?data=${today()}`, { cardapios: [] }),
      load<{ insumos: Insumo[] }>("/ab/insumos", { insumos: [] }),
      load<{ ordens: Ordem[] }>("/ab/ordens-compra", { ordens: [] }),
    ]).then(([fichaList, menuList, insumoList, orderList]) => {
      if (cancelled) return;
      setFichas(fichaList.fichas ?? []);
      setCardapios(menuList.cardapios ?? []);
      setInsumos(insumoList.insumos ?? []);
      setOrdens(orderList.ordens ?? []);
    });
    return () => { cancelled = true; };
  }, [headers, tenantId, token]);

  const activeFichas = fichas.filter((ficha) => ficha.ativo).length;
  const openOrders = ordens.filter((ordem) => ["sugerida", "aprovada", "pendente_entrega", "parcialmente_recebida"].includes(ordem.status)).length;

  const cards = [
    { href: "/hotelaria/restaurante/receitas", icon: BookOpen, title: "Receitas", description: "Fichas técnicas, rendimento, insumos e fator de correção.", stats: [`${activeFichas} ficha(s) ativa(s)`] },
    { href: "/hotelaria/restaurante/ingredientes", icon: UtensilsCrossed, title: "Ingredientes", description: "Cadastro de insumos, unidade base, preço e categoria.", stats: [`${insumos.length} ingrediente(s)`] },
    { href: "/hotelaria/restaurante/cardapios", icon: ClipboardList, title: "Cardápios", description: "O que será servido por data e serviço, com porções por hóspede.", stats: [`${cardapios.length} cardápio(s) hoje`] },
    { href: "/hotelaria/restaurante/briffing", icon: BarChart3, title: "Briffing", description: "Ocupação × porções × gramatura: resumo de produção do dia.", stats: ["Usa o cardápio real"] },
    { href: "/hotelaria/restaurante/importar", icon: Upload, title: "Importar", description: "Receitas, ingredientes e cardápios em CSV, TXT, JSON, PDF ou DOCX.", stats: ["Preview e edição antes de salvar"] },
    { href: "/hotelaria/restaurante/compras", icon: ShoppingCart, title: "Compras", description: "Ordens de compra do motor preditivo, aprovação e recebimento.", stats: [`${openOrders} ordem(ns) aberta(s)`] },
    { href: "/hotelaria/restaurante/recebimento", icon: PackageCheck, title: "Estoque", description: "Recebimento com lote/FEFO e requisições de saída.", stats: ["Entrada e saída auditadas"] },
    { href: "/hotelaria/restaurante/cmv", icon: BarChart3, title: "CMV", description: "Compras, desperdício, estoque e custo de mercadoria vendida.", stats: ["Indicadores do período"] },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <RestaurantModulesNav />
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hotelaria · Restaurante</p>
        <h1 className="text-3xl font-semibold tracking-tight">Painel do Restaurante</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tudo de A&amp;B em um só lugar: receitas e ingredientes, cardápios, briffing, compras,
          estoque e CMV. A importação aceita planilhas e documentos e deixa você revisar antes de salvar.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="group rounded-2xl border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              </div>
              <h2 className="mt-3 font-semibold">{card.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
              <p className="mt-2 text-[11px] font-medium text-primary">{card.stats[0]}</p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
