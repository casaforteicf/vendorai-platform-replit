import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, Users, Briefcase, MessageSquare, Calendar, Settings, LogOut, Megaphone, FileText, Receipt, BrainCircuit, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import logoFull from "/logo-full.svg";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const navigation = [
    { name: "Dashboard",    href: "/",               icon: LayoutDashboard },
    { name: "Leads",        href: "/leads",           icon: Users },
    { name: "Negócios",     href: "/deals",           icon: Briefcase },
    { name: "Conversas",    href: "/conversations",   icon: MessageSquare },
    { name: "Agenda",       href: "/agenda",          icon: Calendar },
    { name: "Propostas",    href: "/propostas",       icon: FileText },
    { name: "Campanhas",    href: "/campanhas",       icon: Megaphone },
    { name: "Faturamento",  href: "/faturamento",     icon: Receipt },
    { name: "Marketplace",   href: "/marketplace",    icon: Store },
    { name: "Configurações", href: "/configuracoes",  icon: Settings },
  ];

  const adminNavigation = user?.platformRole === "super_admin"
    ? [{ name: "AI Usage", href: "/admin/ai-usage", icon: BrainCircuit }]
    : [];

  return (
    <div className="flex h-screen bg-muted/20">
      {/* Sidebar */}
      <div className="w-64 bg-card border-r flex flex-col">
        <div className="p-5 border-b">
          <img src={logoFull} alt="Vendor.ai" className="h-10 w-auto" />
        </div>
        
        <div className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
          {adminNavigation.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Super Admin
              </p>
              {adminNavigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
