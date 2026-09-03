import { Link, useLocation } from "wouter";
import { ArrowRight, Menu, X } from "lucide-react";
import { useState } from "react";

export default function Navbar() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const links = [
    { href: "/funcionalidades", label: "Funcionalidades" },
    { href: "/precos", label: "Planos" },
    { href: "/blog", label: "Conteúdo" },
    { href: "/sobre", label: "Sobre" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#070b14]/88 text-white backdrop-blur-xl">
      <div className="container mx-auto flex h-[72px] items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-[-0.02em]" data-testid="link-home">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-[0_8px_30px_hsl(var(--primary)/0.28)]">V</div>
          <span className="text-lg leading-tight">Vendor.ai</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                location === link.href ? "text-white" : "text-slate-400 hover:text-white"
              }`}
              data-testid={`link-nav-${link.href.replace("/", "")}`}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/demo" className="group ml-2 inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-blue-50" data-testid="btn-demo">
            Testar 5 dias grátis
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a href="https://app.appvendorai.com" className="ml-1 text-sm font-medium text-slate-400 transition-colors hover:text-white" data-testid="link-entrar">
            Entrar
          </a>
        </nav>

        <button
          className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-white md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          data-testid="btn-mobile-menu"
          aria-label="Abrir menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="absolute left-0 top-[72px] w-full border-b border-white/10 bg-[#070b14]/98 p-4 shadow-2xl backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-xl px-4 py-3 text-base font-medium ${
                  location === link.href ? "bg-white/[0.08] text-white" : "text-slate-300"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/demo"
              className="mt-2 inline-flex h-12 items-center justify-center rounded-xl bg-blue-500 px-5 font-semibold text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Testar 5 dias grátis
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a
              href="https://app.appvendorai.com"
              className="mt-1 inline-flex h-12 items-center justify-center rounded-xl border border-white/10 px-5 font-medium text-slate-300"
            >
              Já sou cliente — Entrar
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
