import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import MediaCenter from "@/pages/MediaCenter";
import Conversations from "@/pages/Conversations";

export default function NotFound() {
  const { token, isLoading } = useAuth();
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const isMediaCenter = normalizedPath === "/midias";
  const isConversations = normalizedPath === "/conversas";
  const isProtectedAlias = isMediaCenter || isConversations;

  useEffect(() => {
    if (isProtectedAlias && !isLoading && !token) {
      window.location.assign("/login");
    }
  }, [isProtectedAlias, isLoading, token]);

  if (isProtectedAlias) {
    if (isLoading || !token) return null;
    return (
      <SidebarLayout>
        {isMediaCenter ? <MediaCenter /> : <Conversations />}
      </SidebarLayout>
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
