import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { RESPONSAVEL_PALETTE, responsavelColor } from "@/lib/responsavelColors";

type UserColorsResponse = { available: boolean; colorsById: Record<string, string> };

export function ResponsavelColorField({ tenantId, userId }: { tenantId: string; userId: string }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const { data } = useQuery<UserColorsResponse>({
    queryKey: ["user-colors", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/user-colors`, { headers });
      if (!r.ok) return { available: false, colorsById: {} };
      return r.json();
    },
  });

  const save = useMutation({
    mutationFn: async (cor: string | null) => {
      const r = await fetch(`/api/tenants/${tenantId}/user-colors/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ cor }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Erro ao salvar a cor.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-colors", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["leads-overview-context", tenantId] });
      toast({ title: "Cor do responsável atualizada." });
    },
    onError: (error: Error) => toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }),
  });

  if (data && !data.available) return null;
  const configured = data?.colorsById[userId];
  const current = responsavelColor(userId, data?.colorsById);

  return (
    <div className="space-y-2 rounded-md border px-3 py-3">
      <Label>Cor no CRM</Label>
      <p className="text-xs text-muted-foreground">Identifica os leads e cards deste usuário na lista e nos pipelines.</p>
      <div className="flex flex-wrap items-center gap-2">
        {RESPONSAVEL_PALETTE.map((color) => (
          <button key={color} type="button" disabled={save.isPending} onClick={() => save.mutate(color)}
            aria-label={`Usar a cor ${color}`} aria-pressed={current.toLowerCase() === color.toLowerCase()}
            className={`h-7 w-7 rounded-full border-2 ${current.toLowerCase() === color.toLowerCase() ? "border-foreground" : "border-transparent"}`}
            style={{ backgroundColor: color }} />
        ))}
        <input type="color" aria-label="Escolher outra cor" value={current} disabled={save.isPending}
          onChange={(event) => save.mutate(event.target.value)} className="h-7 w-10 cursor-pointer rounded border bg-transparent" />
        {configured && (
          <button type="button" className="text-xs text-muted-foreground underline" disabled={save.isPending} onClick={() => save.mutate(null)}>
            Usar cor automática
          </button>
        )}
      </div>
    </div>
  );
}
