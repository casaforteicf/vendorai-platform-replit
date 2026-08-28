import { lazy, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

const ContactSales = lazy(() => import("@/pages/demo/contact-sales"));
const GoogleAuthSuccess = lazy(() => import("@/pages/GoogleAuthSuccess"));

function PublicExtensionFallback() {
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";

  if (pathname.endsWith("/demo/contact-sales")) {
    return <ContactSales />;
  }

  if (pathname.endsWith("/auth/success")) {
    return <GoogleAuthSuccess />;
  }

  return null;
}

export default function NotFound() {
  const extension = <PublicExtensionFallback />;
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";
  const isKnownPublicExtension =
    pathname.endsWith("/demo/contact-sales") || pathname.endsWith("/auth/success");

  if (isKnownPublicExtension) {
    return (
      <Suspense
        fallback={(
          <div className="min-h-screen w-full flex items-center justify-center bg-background">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      >
        {extension}
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