import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Banknote,
  LogOut,
  Handshake,
} from "lucide-react";

const NAV = [
  { href: "/partner/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/partner/leads", label: "Meus Leads", icon: Users },
  { href: "/partner/commissions", label: "Comissões", icon: Banknote },
];

export function PartnerLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { logout } = useAuth();

  return (
    <>
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Handshake className="h-5 w-5" />
            <span className="hidden sm:inline">Portal do Parceiro</span>
          </div>

          <nav className="flex flex-1 items-center gap-1 ml-4">
            {NAV.map(({ href, label, icon: Icon }) => (
              <button
                key={href}
                onClick={() => setLocation(href)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  location === href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>

          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="gap-1.5 text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
    <SupportChatWidget />
    </>
  );
}
