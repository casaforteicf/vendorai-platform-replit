import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarLayout } from "@/components/layout/SidebarLayout";

const ContactSales = lazy(() => import("@/pages/demo/contact-sales"));
const GoogleAuthSuccess = lazy(() => import("@/pages/GoogleAuthSuccess"));
const Pipeline = lazy(() => import("@/pages/pipeline"));
const ImportConfig = lazy(() => import("@/pages/leads/import-config"));
const Marketing = lazy(() => import("@/pages/marketing"));
const MarketingCampanhas = lazy(() => import("@/pages/marketing/campanhas"));
const GeradorConteudo = lazy(() => import("@/pages/marketing/gerador-conteudo"));
const NonLeadContacts = lazy(() => import("@/pages/contacts-nonleads"));
const ERPCapture = lazy(() => import("@/pages/erp"));
const FAQ = lazy(() => import("@/pages/faq"));

function Spinner() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function PublicExtensionFallback() {
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";

  if (pathname.endsWith("/demo/contact-sales")) return <ContactSales />;
  if (pathname.endsWith("/auth/success")) return <GoogleAuthSuccess />;
  return null;
}

function ProtectedExtension({ component: Component }: { component: ComponentType }) {
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && (!token || !user)) setLocation("/login");
  }, [isLoading, token, user, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;

  return (
    <SidebarLayout>
      <Component />
    </SidebarLayout>
  );
}

function ProtectedExtensionFallback() {
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";

  if (pathname.endsWith("/pipeline")) return <ProtectedExtension component={Pipeline} />;
  if (pathname.endsWith("/leads/import-config")) return <ProtectedExtension component={ImportConfig} />;
  if (pathname.endsWith("/marketing/campanhas")) return <ProtectedExtension component={MarketingCampanhas} />;
  if (pathname.endsWith("/marketing/conteudo")) return <ProtectedExtension component={GeradorConteudo} />;
  if (pathname.endsWith("/marketing")) return <ProtectedExtension component={Marketing} />;
  if (pathname.endsWith("/contacts-nonleads")) return <ProtectedExtension component={NonLeadContacts} />;
  if (pathname.endsWith("/erp/captura")) return <ProtectedExtension component={ERPCapture} />;
  if (pathname.endsWith("/faq")) return <ProtectedExtension component={FAQ} />;
  return null;
}

export default function NotFound() {
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";
  const isKnownPublicExtension =
    pathname.endsWith("/demo/contact-sales") || pathname.endsWith("/auth/success");
  const isKnownProtectedExtension = [
    "/pipeline",
    "/leads/import-config",
    "/marketing",
    "/marketing/campanhas",
    "/marketing/conteudo",
    "/contacts-nonleads",
    "/erp/captura",
    "/faq",
  ].some((route) => pathname.endsWith(route));

  if (isKnownPublicExtension || isKnownProtectedExtension) {
    return (
      <Suspense fallback={<Spinner />}>
        {isKnownPublicExtension ? <PublicExtensionFallback /> : <ProtectedExtensionFallback />}
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Did you forget to add the page to the router?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
