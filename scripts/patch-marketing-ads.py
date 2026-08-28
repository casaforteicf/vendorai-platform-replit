from pathlib import Path

p = Path("artifacts/frontend/src/components/layout/SidebarLayout.tsx")
s = p.read_text()

if "Anúncios Patrocinados" in s:
    print("already present")
    raise SystemExit(0)

needle = '''                <Megaphone className="h-3.5 w-3.5" /> Campanhas
              </Link>'''

replacement = needle + '''
              <Link
                href="/ads"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location === "/ads"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Target className="h-3.5 w-3.5" /> Anúncios Patrocinados
              </Link>'''

if needle not in s:
    raise SystemExit("Campaigns menu anchor not found")

p.write_text(s.replace(needle, replacement, 1))
print("patched")
