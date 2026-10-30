import { Link, useLocation } from "wouter";
import { ArrowRight, Download, Menu, X } from "lucide-react";
import { useState } from "react";
import {
  PUBLIC_COUNTRIES,
  type PublicCountryCode,
  usePublicCountry,
} from "@/lib/publicCountry";
import "@/styles/vendorFonts.css";

const PT = {
  products: "Produtos",
  features: "Funcionalidades",
  plans: "Como contratar",
  content: "Conteúdo",
  about: "Sobre",
  app: "Baixar app",
  trial: "Testar 5 dias grátis",
  login: "Entrar",
  clientLogin: "Já sou cliente — Entrar",
  openMenu: "Abrir menu",
  country: "País",
} as const;

const ES = {
  products: "Productos",
  features: "Funcionalidades",
  plans: "Cómo contratar",
  content: "Contenido",
  about: "Nosotros",
  app: "Descargar app",
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
    { href: "/produtos", label: copy.products },
    { href: "/funcionalidades", label: copy.features },
    { href: "/precos", label: copy.plans },
    { href: "/blog", label: copy.content },
    { href: "/sobre", label: copy.about },
  ];

  const isActive = (href: string) => location === href || (href === "/produtos" && location.startsWith("/produtos/"));
  const activeLink = "text-[var(--vendor-primary)]";

  return (
    <header className="vendor-nav-shell sticky top-0 z-50 w-full text-slate-900">
      <div className="container mx-auto flex h-[72px] items-center justify-between px-4">
        <Link href="/" className="flex items-center" data-testid="link-home" aria-label="Vendor.ai — início">
          <img
            src="/logo-full-light.svg"
            alt="Vendor.ai"
            width={176}
            height={40}
            decoding="async"
            className="h-10 w-[176px] max-w-[176px] object-contain object-left"
          />
        </Link>

        <nav className="hidden items-center gap-5 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                isActive(link.href) ? activeLink : "text-slate-600 hover:text-slate-950"
              }`}
              data-testid={`link-nav-${link.href.replace("/", "")}`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/baixar-app"
            className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${location === "/baixar-app" ? activeLink : "text-slate-600 hover:text-slate-950"}`}
            data-testid="link-nav-baixar-app"
          >
            <Download className="h-4 w-4" />
            {copy.app}
          </Link>
          <label className="sr-only" htmlFor="public-country">{copy.country}</label>
          <select
            id="public-country"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value as PublicCountryCode)}
            className="h-9 rounded-[var(--vendor-radius-sm)] border border-[var(--vendor-border)] bg-white/80 px-2 text-xs font-semibold text-slate-700 outline-none transition hover:bg-[var(--vendor-primary-soft)]"
            aria-label={copy.country}
          >
            {Object.entries(PUBLIC_COUNTRIES).map(([code, country]) => (
              <option key={code} value={code} className="bg-white text-slate-900">
                {country.short}
              </option>
            ))}
          </select>
          <Link
            href="/demo"
            className="group ml-1 inline-flex h-11 items-center rounded-[var(--vendor-radius-md)] bg-[var(--vendor-primary)] px-5 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(37,99,235,0.24)] transition hover:-translate-y-0.5 hover:bg-[var(--vendor-primary-strong)]"
            data-testid="btn-demo"
          >
            {copy.trial}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a href="https://app.appvendorai.com" className="ml-1 text-sm font-medium text-slate-600 transition-colors hover:text-[var(--vendor-primary)]" data-testid="link-entrar">
            {copy.login}
          </a>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <label className="sr-only" htmlFor="public-country-mobile">{copy.country}</label>
          <select
            id="public-country-mobile"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value as PublicCountryCode)}
            className="h-9 rounded-[var(--vendor-radius-sm)] border border-[var(--vendor-border)] bg-white/80 px-2 text-xs font-semibold text-slate-700 outline-none"
            aria-label={copy.country}
          >
            {Object.entries(PUBLIC_COUNTRIES).map(([code, country]) => (
              <option key={code} value={code} className="bg-white text-slate-900">
                {country.short}
              </option>
            ))}
          </select>
          <button
            className="rounded-[var(--vendor-radius-sm)] border border-[var(--vendor-border)] bg-[var(--vendor-primary-soft)] p-2 text-[var(--vendor-primary-strong)]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="btn-mobile-menu"
            aria-label={copy.openMenu}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="absolute left-0 top-[72px] w-full border-b border-[var(--vendor-border)] bg-white/98 p-4 shadow-xl backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-[var(--vendor-radius-md)] px-4 py-3 text-base font-medium ${
                  isActive(link.href) ? "bg-[var(--vendor-primary-soft)] text-[var(--vendor-primary-strong)]" : "text-slate-700"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/baixar-app"
              className={`inline-flex items-center gap-2 rounded-[var(--vendor-radius-md)] px-4 py-3 text-base font-medium ${location === "/baixar-app" ? "bg-[var(--vendor-primary-soft)] text-[var(--vendor-primary-strong)]" : "text-slate-700"}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Download className="h-4 w-4" />
              {copy.app}
            </Link>
            <Link
              href="/demo"
              className="mt-2 inline-flex h-12 items-center justify-center rounded-[var(--vendor-radius-md)] bg-[var(--vendor-primary)] px-5 font-semibold text-white shadow-[0_12px_34px_rgba(37,99,235,0.20)] hover:bg-[var(--vendor-primary-strong)]"
              onClick={() => setMobileMenuOpen(false)}
            >
              {copy.trial}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a
              href="https://app.appvendorai.com"
              className="mt-1 inline-flex h-12 items-center justify-center rounded-[var(--vendor-radius-md)] border border-[var(--vendor-border)] bg-white px-5 font-medium text-slate-700"
            >
              {copy.clientLogin}
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
