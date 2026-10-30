import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ImageIcon, Loader2, Palette } from "lucide-react";

type JsonObject = Record<string, unknown>;
type AppLike = { id: string; name: string; status: string; tenantId: string | null };
type BrandingResponse = {
  stored: { theme: JsonObject; whiteLabel: JsonObject };
  resolved: { theme: JsonObject; whiteLabel: JsonObject };
};
type Props = { app: AppLike | null; token?: string | null; open: boolean; onOpenChange: (open: boolean) => void; onAppChanged?: () => void | Promise<void> };

function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }

export default function AppBrandingDialog({ app, token, open, onOpenChange, onAppChanged }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inheritTheme, setInheritTheme] = useState(true);
  const [inheritBrand, setInheritBrand] = useState(true);
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [logoUrl, setLogoUrl] = useState("");
  const [tenantColor, setTenantColor] = useState("#2563eb");
  const [tenantLogo, setTenantLogo] = useState("");

  useEffect(() => {
    if (!open || !app?.tenantId || !token) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/app-builder/apps/${encodeURIComponent(app.id)}/branding`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => { if (!response.ok) throw new Error("Não foi possível carregar a identidade visual"); return response.json() as Promise<BrandingResponse>; })
      .then((data) => {
        if (!alive) return;
        const storedTheme = data.stored.theme ?? {};
        const storedBrand = data.stored.whiteLabel ?? {};
        const resolvedTheme = data.resolved.theme ?? {};
        const resolvedBrand = data.resolved.whiteLabel ?? {};
        setInheritTheme(storedTheme.inheritFromTenant !== false);
        setInheritBrand(storedBrand.inheritFromTenant !== false);
        setTenantColor(text(resolvedTheme.primaryColor, "#2563eb"));
        setTenantLogo(text(resolvedBrand.logoUrl));
        setPrimaryColor(text(storedTheme.primaryColor, text(resolvedTheme.primaryColor, "#2563eb")));
        setLogoUrl(text(storedBrand.logoUrl, text(resolvedBrand.logoUrl)));
      })
      .catch((error) => toast({ title: "Erro ao carregar marca", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [app, open, toast, token]);

  async function save() {
    if (!app || !token) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/app-builder/apps/${encodeURIComponent(app.id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: inheritTheme ? { inheritFromTenant: true } : { inheritFromTenant: false, primaryColor },
          whiteLabel: inheritBrand ? { inheritFromTenant: true } : { inheritFromTenant: false, logoUrl, appName: app.name },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível salvar a identidade visual");
      await onAppChanged?.();
      toast({
        title: "Identidade visual salva",
        description: app.status === "published" ? "O working draft foi atualizado. Crie e publique um novo snapshot para aplicar overrides no app publicado." : "A próxima prévia já usará esta configuração.",
      });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Erro ao salvar marca", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" />Identidade visual · {app?.name ?? "App"}</DialogTitle><DialogDescription>O app usa primeiro a marca do tenant e mantém o Design System VendorAI como fallback.</DialogDescription></DialogHeader>
        {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : <div className="space-y-5">
          <section className="rounded-xl border p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Cores do tenant</p><p className="mt-1 text-xs text-muted-foreground">Atualiza automaticamente quando a empresa mudar sua cor principal.</p></div><Switch checked={inheritTheme} onCheckedChange={setInheritTheme} /></div><div className="mt-4 flex items-center gap-3"><input aria-label="Cor principal" type="color" value={inheritTheme ? tenantColor : primaryColor} disabled={inheritTheme} onChange={(event) => setPrimaryColor(event.target.value)} className="h-10 w-14 cursor-pointer rounded border bg-transparent p-1 disabled:cursor-not-allowed" /><div className="flex-1"><Label>Cor principal</Label><Input value={inheritTheme ? tenantColor : primaryColor} disabled={inheritTheme} onChange={(event) => setPrimaryColor(event.target.value)} className="mt-1 font-mono" /></div></div></section>
          <section className="rounded-xl border p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Logo do tenant</p><p className="mt-1 text-xs text-muted-foreground">Usa primeiro a logo do perfil da empresa e depois a logo cadastrada no tenant.</p></div><Switch checked={inheritBrand} onCheckedChange={setInheritBrand} /></div><div className="mt-4 flex items-center gap-3">{(inheritBrand ? tenantLogo : logoUrl) ? <img src={inheritBrand ? tenantLogo : logoUrl} alt="Prévia da logo" className="h-14 w-20 rounded-lg border object-contain p-1" /> : <div className="flex h-14 w-20 items-center justify-center rounded-lg border bg-muted/30"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}<div className="flex-1"><Label>URL da logo</Label><Input value={inheritBrand ? tenantLogo : logoUrl} disabled={inheritBrand} onChange={(event) => setLogoUrl(event.target.value)} className="mt-1" placeholder="https://..." /></div></div></section>
          <div className="rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Prioridade:</strong> configuração do app → marca do tenant → padrão global do VendorAI.</div>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button><Button onClick={() => void save()} disabled={loading || saving || !app?.tenantId}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar identidade</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}