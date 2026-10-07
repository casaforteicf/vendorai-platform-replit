import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type AdminDeleteLeadButtonProps = {
  leadId?: string | null;
  leadName?: string | null;
  redirectTo?: string;
  compact?: boolean;
  className?: string;
  onDeleted?: () => void;
};

export function AdminDeleteLeadButton({
  leadId,
  leadName,
  redirectTo,
  compact = true,
  className = "",
  onDeleted,
}: AdminDeleteLeadButtonProps) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [deleting, setDeleting] = useState(false);

  const isAdmin = user?.platformRole === "super_admin"
    || user?.platformRole === "tenant_admin"
    || user?.userFunction === "administrador";

  if (!isAdmin || !leadId) return null;

  async function confirmDelete() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ motivo: motivo.trim() || null }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Não foi possível excluir o lead.");
      }

      // Remove o lead e todos os cards/processos ligados a ele do cache imediatamente.
      // O refetch continua abaixo como reconciliação com o backend.
      queryClient.setQueriesData({ predicate: () => true }, (cached: unknown) => {
        if (!Array.isArray(cached)) return cached;
        return cached.filter((item: unknown) => {
          if (!item || typeof item !== "object") return true;
          const record = item as Record<string, unknown>;
          if (record.leadId === leadId) return false;
          const looksLikeLead = record.id === leadId
            && ("nome" in record || "empresa" in record || "excluidoEm" in record || "motivoExclusao" in record);
          return !looksLikeLead;
        });
      });
      await queryClient.invalidateQueries();
      setOpen(false);
      setMotivo("");
      onDeleted?.();
      toast({
        title: "Lead excluído",
        description: "O lead foi removido das visões ativas e enviado para Excluídos. O histórico foi preservado.",
      });
      if (redirectTo) navigate(redirectTo);
    } catch (error) {
      toast({
        title: "Não foi possível excluir o lead",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "icon" : "sm"}
        className={`${compact ? "h-8 w-8" : "gap-2"} text-destructive hover:bg-destructive/10 hover:text-destructive ${className}`}
        title="Excluir lead"
        aria-label={`Excluir lead ${leadName || ""}`.trim()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
        {!compact && <span>Excluir lead</span>}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !deleting && setOpen(next)}>
        <DialogContent
          className="max-w-md"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="text-destructive">Excluir lead?</DialogTitle>
            <DialogDescription>
              {leadName ? `${leadName} será enviado para Excluídos.` : "O lead será enviado para Excluídos."}
              {" "}Nenhum histórico, documento, conversa ou relacionamento será apagado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivo da exclusão</label>
            <Input
              autoFocus
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="Ex.: duplicado, cadastro inválido, solicitação administrativa..."
              onKeyDown={(event) => {
                if (event.key === "Enter" && !deleting) void confirmDelete();
              }}
            />
            <p className="text-xs text-muted-foreground">
              A data, o usuário responsável e o motivo ficam registrados para auditoria.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? "Excluindo..." : "Excluir lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
