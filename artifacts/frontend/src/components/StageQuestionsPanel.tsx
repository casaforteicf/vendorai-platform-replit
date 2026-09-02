import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdatePipelineStage, getListPipelineStagesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Settings2, Plus, X, Loader2, AlertTriangle } from "lucide-react";

type Pergunta = { id: string; texto: string };
type Stage = { id: string; key: string; label: string; perguntas?: Pergunta[] | null };

function slug(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").slice(0, 30) || "pergunta";
}

export function StageQuestionsPanel({
  tenantId,
  stage,
  answers,
  onSaveAnswers,
  saving,
}: {
  tenantId: string;
  stage: Stage | undefined;
  answers: Record<string, string>;
  onSaveAnswers: (next: Record<string, string>) => void;
  saving?: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateStage = useUpdatePipelineStage();

  const [draft, setDraft] = useState<Record<string, string>>(answers);
  useEffect(() => { setDraft(answers); }, [stage?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = useState(false);
  const [editList, setEditList] = useState<Pergunta[]>(stage?.perguntas ?? []);
  useEffect(() => { setEditList(stage?.perguntas ?? []); }, [stage?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [newQuestion, setNewQuestion] = useState("");

  if (!stage) return null;
  const perguntas = stage.perguntas ?? [];
  const answeredCount = perguntas.filter((p) => draft[p.id]?.trim()).length;

  function saveQuestionSet() {
    updateStage.mutate(
      { tenantId, id: stage!.id, data: { perguntas: editList } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListPipelineStagesQueryKey(tenantId) });
          toast({ title: "Perguntas da etapa atualizadas." });
          setEditing(false);
        },
        onError: () => toast({ title: "Erro ao salvar perguntas", variant: "destructive" }),
      },
    );
  }

  return (
    <Card data-testid="card-stage-questions" className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Perguntas desta etapa — {stage.label}
            {perguntas.length > 0 && (
              <Badge variant={answeredCount === perguntas.length ? "outline" : "secondary"} className="text-xs ml-1">
                {answeredCount}/{perguntas.length}
              </Badge>
            )}
          </span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => setEditing((v) => !v)}>
            <Settings2 className="h-3.5 w-3.5" />
            Editar perguntas
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <div className="space-y-2">
            {editList.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <Input
                  value={p.texto}
                  onChange={(e) => setEditList((prev) => prev.map((q, idx) => idx === i ? { ...q, texto: e.target.value } : q))}
                  className="h-8 text-sm"
                />
                <button type="button" onClick={() => setEditList((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Nova pergunta desta etapa"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newQuestion.trim()) {
                    setEditList((prev) => [...prev, { id: slug(newQuestion) + "_" + prev.length, texto: newQuestion.trim() }]);
                    setNewQuestion("");
                  }
                }}
              />
              <Button
                type="button" size="sm" variant="outline" className="h-8 gap-1 shrink-0"
                disabled={!newQuestion.trim()}
                onClick={() => { setEditList((prev) => [...prev, { id: slug(newQuestion) + "_" + prev.length, texto: newQuestion.trim() }]); setNewQuestion(""); }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" disabled={updateStage.isPending} onClick={saveQuestionSet}>
                {updateStage.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Salvar perguntas
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditList(stage.perguntas ?? []); }}>Cancelar</Button>
            </div>
          </div>
        ) : perguntas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma pergunta configurada pra esta etapa ainda. Use "Editar perguntas" pra adicionar.</p>
        ) : (
          <>
            <div className="space-y-3">
              {perguntas.map((p) => (
                <div key={p.id} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{p.texto}</label>
                  <Textarea
                    value={draft[p.id] ?? ""}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    onBlur={() => onSaveAnswers(draft)}
                    rows={2}
                    className="text-sm resize-none"
                    placeholder="Registrar aqui…"
                  />
                </div>
              ))}
            </div>
            {saving && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Salvando…</p>}
            {answeredCount < perguntas.length && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {perguntas.length - answeredCount} pergunta(s) desta etapa ainda sem resposta.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
