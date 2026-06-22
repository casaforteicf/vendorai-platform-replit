import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  useProspectorListApprovals,
  useProspectorPatchApproval,
  getProspectorListApprovalsQueryKey,
  type ProspectorApprovalItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  PencilLine,
  XCircle,
  Building2,
  Target,
  Gauge,
  Mail,
  MessageCircle,
  Inbox,
  Sparkles,
} from "lucide-react";

const AUTOMATION_THRESHOLD = 50;

function ApprovalCard({
  item,
  onDecided,
}: {
  item: ProspectorApprovalItem;
  onDecided: (res: { approvedCount: number; automationUnlocked: boolean }) => void;
}) {
  const { toast } = useToast();
  const isEmail = item.messageType === "email";
  const initialText = isEmail ? item.email : item.whatsapp;
  const [text, setText] = useState(initialText ?? "");
  const patch = useProspectorPatchApproval();

  const decide = (action: "approved" | "edited" | "rejected") => {
    patch.mutate(
      {
        id: item.id,
        data: action === "edited" ? { action, approvedText: text } : { action },
      },
      {
        onSuccess: (res) => {
          toast({
            title:
              action === "rejected"
                ? "Rascunho rejeitado"
                : action === "edited"
                  ? "Aprovado com edição"
                  : "Rascunho aprovado",
          });
          onDecided({
            approvedCount: res.approvedCount,
            automationUnlocked: res.automationUnlocked,
          });
        },
        onError: () => {
          toast({ title: "Erro ao processar", variant: "destructive" });
        },
      },
    );
  };

  const edited = text !== (initialText ?? "");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {item.empresa ?? "Empresa desconhecida"}
            </CardTitle>
            {item.dorPrincipal && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" /> {item.dorPrincipal}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {item.score != null && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Gauge className="h-3 w-3" /> {item.score}
              </Badge>
            )}
            <Badge variant="outline" className="flex items-center gap-1">
              {isEmail ? <Mail className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
              {isEmail ? "E-mail" : "WhatsApp"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={isEmail ? 7 : 4}
          className="resize-y"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => decide("approved")}
            disabled={patch.isPending}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Aprovar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => decide("edited")}
            disabled={patch.isPending || !edited}
            title={!edited ? "Edite o texto para habilitar" : undefined}
          >
            <PencilLine className="h-4 w-4 mr-1.5" /> Aprovar com Edição
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => decide("rejected")}
            disabled={patch.isPending}
          >
            <XCircle className="h-4 w-4 mr-1.5" /> Rejeitar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProspectorAprovacoes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useProspectorListApprovals();
  const items = data?.items ?? [];

  const [trainedCount, setTrainedCount] = useState<number | null>(null);

  useEffect(() => {
    if (trainedCount == null) return;
    // no-op placeholder to keep count reactive
  }, [trainedCount]);

  const handleDecided = (res: { approvedCount: number; automationUnlocked: boolean }) => {
    setTrainedCount(res.approvedCount);
    if (res.automationUnlocked) {
      toast({
        title: "Automação liberada! 🎉",
        description: "Seu Agente Prospector já aprendeu com você! Automação liberada.",
      });
    }
    queryClient.invalidateQueries({ queryKey: getProspectorListApprovalsQueryKey() });
  };

  const progress = trainedCount != null ? Math.min((trainedCount / AUTOMATION_THRESHOLD) * 100, 100) : null;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Aprovações Pendentes
        </h1>
        <p className="text-muted-foreground text-sm">
          Revise os rascunhos gerados pela IA. Após {AUTOMATION_THRESHOLD} aprovações, o Agente Prospector
          passa a enviar automaticamente.
        </p>
      </div>

      {progress != null && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Treinamento do Agente</span>
              <span className="text-muted-foreground">
                {trainedCount} / {AUTOMATION_THRESHOLD}
              </span>
            </div>
            <Progress value={progress} />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <Inbox className="h-10 w-10" />
            <p>Nenhum rascunho aguardando aprovação no momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ApprovalCard key={item.id} item={item} onDecided={handleDecided} />
          ))}
        </div>
      )}
    </div>
  );
}
