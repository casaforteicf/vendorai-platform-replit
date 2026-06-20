import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";

export default function Navbar() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const links = [
    { href: "/funcionalidades", label: "Funcionalidades" },
    { href: "/precos", label: "Preços" },
    { href: "/sobre", label: "Sobre nós" },
    { href: "/contato", label: "Contato" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="font-bold text-xl tracking-tight text-primary flex items-center gap-2" data-testid="link-home">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
              V
            </div>
            VendorAI
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location === link.href ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid={`link-nav-${link.href.replace("/", "")}`}
            >
              {link.label}
            </Link>
          ))}
          <div className="ml-4 flex items-center gap-4">
            <Button variant="ghost" asChild data-testid="btn-login">
              <a href="/app">Entrar</a>
            </Button>
            <Button asChild data-testid="btn-demo">
              <a href="/demo">Experimentar grátis</a>
            </Button>
          </div>
        </nav>

        <button
          className="md:hidden p-2 text-foreground"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          data-testid="btn-mobile-menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background p-4 absolute w-full left-0 top-16 shadow-lg">
          <nav className="flex flex-col gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-base font-medium p-2 rounded-md ${
                  location === link.href ? "bg-primary/10 text-primary" : "text-foreground"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border">
              <Button variant="outline" className="w-full" asChild>
                <a href="/app">Entrar</a>
              </Button>
              <Button className="w-full" asChild>
                <Link href="/demo" onClick={() => setMobileMenuOpen(false)}>
                  Experimentar grátis
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
