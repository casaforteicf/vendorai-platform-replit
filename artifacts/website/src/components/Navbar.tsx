import { Link, useLocation } from "wouter";
import { ArrowRight, Menu, X } from "lucide-react";
import { useState } from "react";
import {
  PUBLIC_COUNTRIES,
  type PublicCountryCode,
  usePublicCountry,
} from "@/lib/publicCountry";

const PT = {
  features: "Funcionalidades",
  plans: "Planos",
  content: "Conteúdo",
  about: "Sobre",
  trial: "Testar 5 dias grátis",
  login: "Entrar",
  clientLogin: "Já sou cliente — Entrar",
  openMenu: "Abrir menu",
  country: "País",
} as const;

const ES = {
  features: "Funcionalidades",
  plans: "Planes",
  content: "Contenido",
  about: "Nosotros",
  trial: "Probar 5 días gratis",
  login: "Ingresar",
  clientLogin: "Ya soy cliente — Ingresar",
  openMenu: "Abrir menú",
  country: "País",
} as const;

export default function Navbar() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { countryCode, setCountryCode, isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  const links = [
    { href: "/funcionalidades", label: copy.features },
    { href: "/precos", label: copy.plans },
    { href: "/blog", label: copy.content },
    { href: "/sobre", label: copy.about },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#070b14]/88 text-white backdrop-blur-xl">
      <div className="container mx-auto flex h-[72px] items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-[-0.02em]" data-testid="link-home">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-[0_8px_30px_hsl(var(--primary)/0.28)]">V</div>
          <span className="text-lg leading-tight">Vendor.ai</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
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
          <label className="sr-only" htmlFor="public-country">{copy.country}</label>
          <select
            id="public-country"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value as PublicCountryCode)}
            className="h-9 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-xs font-semibold text-slate-200 outline-none transition hover:bg-white/[0.10]"
            aria-label={copy.country}
          >
            {Object.entries(PUBLIC_COUNTRIES).map(([code, country]) => (
              <option key={code} value={code} className="bg-slate-950 text-white">
                {country.short}
              </option>
            ))}
          </select>
          <Link href="/demo" className="group ml-1 inline-flex h-11 items-center rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(249,115,22,0.28)] transition hover:bg-orange-400" data-testid="btn-demo">
            {copy.trial}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a href="https://app.appvendorai.com" className="ml-1 text-sm font-medium text-slate-400 transition-colors hover:text-white" data-testid="link-entrar">
            {copy.login}
          </a>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <label className="sr-only" htmlFor="public-country-mobile">{copy.country}</label>
          <select
            id="public-country-mobile"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value as PublicCountryCode)}
            className="h-9 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-xs font-semibold text-white outline-none"
            aria-label={copy.country}
          >
            {Object.entries(PUBLIC_COUNTRIES).map(([code, country]) => (
              <option key={code} value={code} className="bg-slate-950 text-white">
                {country.short}
              </option>
            ))}
          </select>
          <button
            className="rounded-lg border border-orange-400/20 bg-orange-400/[0.06] p-2 text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="btn-mobile-menu"
            aria-label={copy.openMenu}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="absolute left-0 top-[72px] w-full border-b border-white/10 bg-[#070b14]/98 p-4 shadow-2xl backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-xl px-4 py-3 text-base font-medium ${
                  location === link.href ? "bg-orange-400/[0.10] text-white" : "text-slate-300"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/demo"
              className="mt-2 inline-flex h-12 items-center justify-center rounded-xl bg-orange-500 px-5 font-semibold text-white shadow-[0_12px_34px_rgba(249,115,22,0.24)] hover:bg-orange-400"
              onClick={() => setMobileMenuOpen(false)}
            >
              {copy.trial}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a
              href="https://app.appvendorai.com"
              className="mt-1 inline-flex h-12 items-center justify-center rounded-xl border border-white/10 px-5 font-medium text-slate-300"
            >
              {copy.clientLogin}
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
