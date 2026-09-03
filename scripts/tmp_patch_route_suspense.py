from pathlib import Path

path = Path("artifacts/frontend/src/App.tsx")
text = path.read_text()

old_import = 'import { lazy, Suspense, useEffect } from "react";'
new_import = 'import { lazy, Suspense, useEffect, useState } from "react";'
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit("React import not found")

spinner_marker = '''function RedirectPage({ to }: { to: string }) {'''
route_boundary = '''function RouteContentFallback() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8_000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!slow) {
    return (
      <div className="min-h-[50vh] w-full flex items-center justify-center">
        <div className="animate-spin h-7 w-7 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
        <h2 className="text-base font-semibold">Esta tela demorou mais que o esperado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O menu continua disponível. Se houve uma atualização do VendorAI enquanto esta aba estava aberta, carregue a versão atual do sistema.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Carregar versão atual
          </button>
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm font-medium"
            onClick={() => { window.location.href = "/dashboard"; }}
          >
            Voltar ao painel
          </button>
        </div>
      </div>
    </div>
  );
}

function RouteContentBoundary({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteContentFallback />}>{children}</Suspense>;
}

function RedirectPage({ to }: { to: string }) {'''

if "function RouteContentFallback()" not in text:
    if spinner_marker not in text:
        raise SystemExit("RedirectPage marker not found")
    text = text.replace(spinner_marker, route_boundary, 1)

old_protected = '''    <SidebarLayout>
      <DemoBanner />
      <Component {...rest} />
    </SidebarLayout>'''
new_protected = '''    <SidebarLayout>
      <DemoBanner />
      <RouteContentBoundary>
        <Component {...rest} />
      </RouteContentBoundary>
    </SidebarLayout>'''
if old_protected in text:
    text = text.replace(old_protected, new_protected, 1)

old_sidebar_component = '''    <SidebarLayout>
      <Component {...rest} />
    </SidebarLayout>'''
new_sidebar_component = '''    <SidebarLayout>
      <RouteContentBoundary>
        <Component {...rest} />
      </RouteContentBoundary>
    </SidebarLayout>'''
# Apply to all role/vertical wrappers that mount the shared Sidebar.
text = text.replace(old_sidebar_component, new_sidebar_component)

old_fullscreen = '''  return <Component {...rest} />;
}'''
new_fullscreen = '''  return (
    <RouteContentBoundary>
      <Component {...rest} />
    </RouteContentBoundary>
  );
}'''
# First matching plain protected component is FullscreenProtectedRoute.
if old_fullscreen in text:
    text = text.replace(old_fullscreen, new_fullscreen, 1)

old_partner = '''  return <Component />;
}

function OnboardingRoute()'''
new_partner = '''  return (
    <RouteContentBoundary>
      <Component />
    </RouteContentBoundary>
  );
}

function OnboardingRoute()'''
if old_partner in text:
    text = text.replace(old_partner, new_partner, 1)

path.write_text(text)
print("App.tsx patched")
