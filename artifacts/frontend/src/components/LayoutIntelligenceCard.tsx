import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Image as ImageIcon, Clapperboard, Wand2, Loader2 } from "lucide-react";

type LayoutRecommendation = {
  recommendedType: "feed" | "reels" | null;
  reason: string;
  flaggedDrafts: { id: string; theme: string | null }[];
};

export function LayoutIntelligenceCard({ tenantId }: { tenantId: string }) {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<LayoutRecommendation>({
    queryKey: ["layout-recommendation", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/content/layout-recommendation`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Sugestão da IA
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Motor de regras — olha o padrão dos últimos posts publicados e a Biblioteca, não publica nada sozinho.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="py-4 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/20">
              {data?.recommendedType === "reels" ? (
                <Clapperboard className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              ) : (
                <ImageIcon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              )}
              <p className="text-sm">{data?.reason}</p>
            </div>

            {(data?.flaggedDrafts.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" />
                  {data!.flaggedDrafts.length} rascunho{data!.flaggedDrafts.length > 1 ? "s" : ""} sem moldura de marca — provável print cru:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data!.flaggedDrafts.map((d) => (
                    <Badge key={d.id} variant="outline" className="text-xs">
                      {d.theme || "sem tema"}
                    </Badge>
                  ))}
                </div>
                <Button variant="secondary" size="sm" onClick={() => setLocation("/content")} className="text-xs">
                  Abrir Biblioteca pra aplicar moldura
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
