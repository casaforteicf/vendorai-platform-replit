import { VendorBackButton } from "@/components/ui/back-button";
import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, FileText, Paperclip, X, Stethoscope } from "lucide-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

export default function Prontuario() {
  const [, params] = useRoute("/clinic/prontuario/:consultaId");
  const consultaId = params?.consultaId ?? "";
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    queixaPrincipal: "",
    anamnese:        "",
    exame:           "",
    diagnostico:     "",
    cid10:           "",
    prescricao:      "",
    retorno:         "",
  });
  const [arquivos, setArquivos] = useState<string[]>([]);
  const [prontuarioId, setProntuarioId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Busca consulta
  const { data: consulta, isLoading: loadingConsulta } = useQuery<any>({
    queryKey: ["clinic-consulta", tenantId, consultaId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/clinic/consultas/${consultaId}`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
    enabled: !!tenantId && !!consultaId,
  });

  // Busca prontuário existente
  const { data: prontuario, isLoading: loadingPron } = useQuery<any>({
    queryKey: ["clinic-prontuario", tenantId, consultaId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/clinic/prontuarios/consulta/${consultaId}`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
    enabled: !!tenantId && !!consultaId,
  });

  // Popula form quando prontuário carrega
  useEffect(() => {
    if (prontuario && prontuario.id) {
      setProntuarioId(prontuario.id);
      setForm({
        queixaPrincipal: prontuario.queixaPrincipal ?? "",
        anamnese:        prontuario.anamnese        ?? "",
        exame:           prontuario.exame           ?? "",
        diagnostico:     prontuario.diagnostico     ?? "",
        cid10:           prontuario.cid10           ?? "",
        prescricao:      prontuario.prescricao      ?? "",
        retorno:         prontuario.retorno         ?? "",
      });
      setArquivos(Array.isArray(prontuario.arquivos) ? prontuario.arquivos : []);
      setDirty(false);
    }
  }, [prontuario]);

  function handleChange(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  function handleFileAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const nomes = files.map((f) => f.name);
    setArquivos((prev) => [...prev, ...nomes]);
    setDirty(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeArquivo(idx: number) {
    setArquivos((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        retorno: form.retorno || null,
        queixaPrincipal: form.queixaPrincipal || null,
        anamnese:        form.anamnese        || null,
        exame:           form.exame           || null,
        diagnostico:     form.diagnostico     || null,
        cid10:           form.cid10           || null,
        prescricao:      form.prescricao      || null,
        arquivos: arquivos.length ? arquivos : null,
      };

      if (prontuarioId) {
        const r = await fetch(`/api/tenants/${tenantId}/clinic/prontuarios/${prontuarioId}`, {
          method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      } else {
        const r = await fetch(`/api/tenants/${tenantId}/clinic/prontuarios`, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({
            ...payload,
            pacienteId: consulta?.pacienteId ?? consulta?.paciente?.id,
            consultaId,
          }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }
    },
    onSuccess: (row) => {
      if (row?.id) setProntuarioId(row.id);
      setDirty(false);
      toast({ title: "Prontuário salvo!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const isLoading = loadingConsulta || loadingPron;

  if (!consultaId) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>Consulta não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <VendorBackButton to="/clinic/agenda" label="Voltar para agenda" className="mt-0.5 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-5 w-5" /> Prontuário
            </h1>
            {isLoading ? (
              <Skeleton className="h-4 w-48 mt-1" />
            ) : consulta ? (
              <p className="text-sm text-muted-foreground mt-1">
                {consulta.paciente?.nome ?? "Paciente"} ·{" "}
                Dr(a). {consulta.medico?.nome ?? "—"} ·{" "}
                {consulta.dataHora
                  ? format(new Date(consulta.dataHora), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                  : "—"}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Consulta não encontrada</p>
            )}
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || (!dirty && !!prontuarioId)}>
          {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Queixa principal */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Queixa Principal</CardTitle></CardHeader>
            <CardContent>
              <Textarea rows={2} placeholder="Descreva a queixa principal do paciente..."
                value={form.queixaPrincipal}
                onChange={(e) => handleChange("queixaPrincipal", e.target.value)} />
            </CardContent>
          </Card>

          {/* Anamnese */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Anamnese</CardTitle></CardHeader>
            <CardContent>
              <Textarea rows={4} placeholder="História da doença atual, antecedentes, medicamentos em uso..."
                value={form.anamnese}
                onChange={(e) => handleChange("anamnese", e.target.value)} />
            </CardContent>
          </Card>

          {/* Exame físico */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Exame Físico</CardTitle></CardHeader>
            <CardContent>
              <Textarea rows={4} placeholder="PA, FC, FR, Temperatura, Saturação, achados do exame..."
                value={form.exame}
                onChange={(e) => handleChange("exame", e.target.value)} />
            </CardContent>
          </Card>

          {/* Diagnóstico + CID-10 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Diagnóstico</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={3} placeholder="Hipótese diagnóstica..."
                value={form.diagnostico}
                onChange={(e) => handleChange("diagnostico", e.target.value)} />
              <div className="space-y-1.5">
                <Label>CID-10</Label>
                <Input placeholder="ex: J00, K21.0" maxLength={10}
                  value={form.cid10}
                  onChange={(e) => handleChange("cid10", e.target.value.toUpperCase())} />
              </div>
            </CardContent>
          </Card>

          {/* Prescrição */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Prescrição</CardTitle></CardHeader>
            <CardContent>
              <Textarea rows={5} placeholder="Medicamentos, doses, posologia, orientações..."
                value={form.prescricao}
                onChange={(e) => handleChange("prescricao", e.target.value)} />
            </CardContent>
          </Card>

          {/* Retorno + Arquivos */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Retorno e Exames</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Data de Retorno</Label>
                <Input type="date" value={form.retorno}
                  onChange={(e) => handleChange("retorno", e.target.value)} />
              </div>

              {/* Arquivos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Arquivos / Exames</Label>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5"
                    onClick={() => fileRef.current?.click()}>
                    <Paperclip className="h-3.5 w-3.5" /> Anexar
                  </Button>
                  <input ref={fileRef} type="file" multiple className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.dcm,.doc,.docx"
                    onChange={handleFileAdd} />
                </div>
                {arquivos.length > 0 ? (
                  <div className="space-y-1.5">
                    {arquivos.map((arq, idx) => (
                      <div key={idx}
                        className="flex items-center gap-2 px-3 py-2 rounded border bg-muted/30 text-sm">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{arq}</span>
                        <button type="button" onClick={() => removeArquivo(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nenhum arquivo anexado. Clique em "Anexar" para adicionar exames.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status prontuário */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pb-2">
            <span>
              {prontuarioId ? "Prontuário salvo." : "Prontuário ainda não salvo."}
              {dirty ? " Há alterações não salvas." : ""}
            </span>
            {dirty && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                Não salvo
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
