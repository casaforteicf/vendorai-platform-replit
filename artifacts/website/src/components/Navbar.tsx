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
  plans: "Planos",
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
  plans: "Planes",
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

  return (
    <header className="vendor-nav-shell sticky top-0 z-50 w-full text-slate-900">
      <div className="container mx-auto flex h-[72px] items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5" data-testid="link-home" aria-label="Vendor.ai — início">
          <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-[11px] bg-slate-950 text-base font-bold text-white shadow-[0_8px_28px_rgba(15,23,42,0.16)]">
            V
            <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-orange-500" />
          </div>
          <span className="vendor-brand-wordmark text-[20px] leading-none text-slate-950">
            Vendor<span className="vendor-brand-dot">.</span>ai
          </span>
        </Link>

        <nav className="hidden items-center gap-5 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                isActive(link.href) ? "text-orange-600" : "text-slate-600 hover:text-slate-950"
              }`}
              data-testid={`link-nav-${link.href.replace("/", "")}`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/baixar-app"
            className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${location === "/baixar-app" ? "text-orange-600" : "text-slate-600 hover:text-slate-950"}`}
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
            className="h-9 rounded-lg border border-slate-200 bg-white/80 px-2 text-xs font-semibold text-slate-700 outline-none transition hover:border-orange-200 hover:bg-orange-50"
            aria-label={copy.country}
          >
            {Object.entries(PUBLIC_COUNTRIES).map(([code, country]) => (
              <option key={code} value={code} className="bg-white text-slate-900">
                {country.short}
              </option>
            ))}
          </select>
          <Link href="/demo" className="group ml-1 inline-flex h-11 items-center rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(249,115,22,0.24)] transition hover:-translate-y-0.5 hover:bg-orange-600" data-testid="btn-demo">
            {copy.trial}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a href="https://app.appvendorai.com" className="ml-1 text-sm font-medium text-slate-600 transition-colors hover:text-orange-600" data-testid="link-entrar">
            {copy.login}
          </a>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <label className="sr-only" htmlFor="public-country-mobile">{copy.country}</label>
          <select
            id="public-country-mobile"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value as PublicCountryCode)}
            className="h-9 rounded-lg border border-slate-200 bg-white/80 px-2 text-xs font-semibold text-slate-700 outline-none"
            aria-label={copy.country}
          >
            {Object.entries(PUBLIC_COUNTRIES).map(([code, country]) => (
              <option key={code} value={code} className="bg-white text-slate-900">
                {country.short}
              </option>
            ))}
          </select>
          <button
            className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-orange-700"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="btn-mobile-menu"
            aria-label={copy.openMenu}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="absolute left-0 top-[72px] w-full border-b border-slate-200 bg-white/98 p-4 shadow-xl backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-xl px-4 py-3 text-base font-medium ${
                  isActive(link.href) ? "bg-orange-50 text-orange-700" : "text-slate-700"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/baixar-app"
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-base font-medium ${location === "/baixar-app" ? "bg-orange-50 text-orange-700" : "text-slate-700"}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Download className="h-4 w-4" />
              {copy.app}
            </Link>
            <Link
              href="/demo"
              className="mt-2 inline-flex h-12 items-center justify-center rounded-xl bg-orange-500 px-5 font-semibold text-white shadow-[0_12px_34px_rgba(249,115,22,0.20)] hover:bg-orange-600"
              onClick={() => setMobileMenuOpen(false)}
            >
              {copy.trial}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a
              href="https://app.appvendorai.com"
              className="mt-1 inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 font-medium text-slate-700"
            >
              {copy.clientLogin}
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
